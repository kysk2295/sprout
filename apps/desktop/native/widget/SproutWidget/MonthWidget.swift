// 25 §15 월 캘린더 위젯(틱틱 "Monthly Calendar View"): 중간 = 오늘이 있는 주 한 줄, 크게 = 이번 달 5~6주.
// 앱이 계산한 격자(snapshot.calendar)를 그대로 그린다. 체크 없음(M8) — 누르면 앱 캘린더로.
import SwiftUI
import WidgetKit

struct MonthWidget: Widget {
    let kind = "SproutMonth"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SproutProvider()) { entry in
            MonthWidgetView(entry: entry)
        }
        .configurationDisplayName("월 캘린더")
        .description("이번 달 일정을 한눈에 봐요")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct MonthWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: SproutEntry

    var body: some View {
        let pal = Palette(scheme, theme)
        MonthContent(data: entry.data, today: Store.localDay(entry.date), weekOnly: family == .systemMedium, pal: pal)
            .redacted(reason: entry.placeholder ? .placeholder : [])
            .containerBackground(for: .widget) { pal.bg }
    }
    private var theme: Snapshot.Theme? { if case .ready(let s) = entry.data { return s.theme } else { return nil } }
}

/// 위젯 크기와 상관없이 그리는 본문(미리보기 렌더러도 이것을 그린다)
struct MonthContent: View {
    let data: WidgetData
    let today: String
    let weekOnly: Bool
    let pal: Palette

    var body: some View {
        switch data {
        case .first: MessageView(text: "꿈틀을 한 번 열어 주세요", pal: pal).widgetURL(Links.calendar(today))
        case .signedOut: MessageView(text: "로그인이 필요해요", action: "꿈틀 열기", pal: pal).widgetURL(Links.today)
        case .failed: MessageView(text: "위젯을 불러오지 못했어요", action: "꿈틀 열기", pal: pal).widgetURL(Links.today)
        case .ready(let snap):
            if let cal = snap.calendar, !cal.days.isEmpty {
                if cal.month != String(today.prefix(7)) {
                    // §15.3 달이 바뀌었는데 앱이 새로 쓰지 않음 — 지난달을 이번 달처럼 보이지 않게
                    VStack(alignment: .leading, spacing: 0) {
                        MonthHeader(title: monthTitle(today), today: today, pal: pal)
                        MessageView(text: "꿈틀을 열면 이번 달로 바뀌어요", pal: pal)
                    }
                    .widgetURL(Links.calendar(today))
                } else {
                    MonthGrid(cal: cal, today: today, weekOnly: weekOnly, pal: pal).widgetURL(Links.calendar(today))
                }
            } else {
                MessageView(text: "꿈틀을 열면 이번 달 일정이 보여요", action: "꿈틀 열기", pal: pal).widgetURL(Links.calendar(today))
            }
        }
    }
    private func monthTitle(_ day: String) -> String { "\(Int(day.dropFirst(5).prefix(2)) ?? 0)월" }
}

struct MonthHeader: View {
    let title: String
    let today: String
    let pal: Palette
    var body: some View {
        WLink(Links.calendar(today)) {
            Text(title).font(.system(size: 15, weight: .bold)).foregroundStyle(pal.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 20, alignment: .top)
    }
}

/// §15.2 격자: 머리 · 요일(월~일) · 주 줄(구분선 0.5) · 칸
struct MonthGrid: View {
    let cal: Snapshot.CalMonth
    let today: String
    let weekOnly: Bool
    let pal: Palette
    static let weekdays = ["월", "화", "수", "목", "금", "토", "일"] // 주 시작 = 월요일(06 v1.3.1, M2)

    var body: some View {
        let weeks = stride(from: 0, to: cal.days.count, by: 7).map { Array(cal.days[$0..<min($0 + 7, cal.days.count)]) }
        let rows = weekOnly ? weeks.filter { $0.contains { $0.d == today } } : weeks
        VStack(alignment: .leading, spacing: 0) {
            MonthHeader(title: cal.title, today: today, pal: pal)
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    Text(Self.weekdays[i]).font(.system(size: 10, weight: .medium))
                        .foregroundStyle(i == 5 ? pal.saturday : i == 6 ? pal.holiday : pal.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 16)
            GeometryReader { geo in
                let rowH = geo.size.height / CGFloat(max(1, rows.count))
                let colW = geo.size.width / 7
                let lanes = max(1, Int((rowH - DayCell.head - 1) / DayCell.lane))
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        VStack(spacing: 0) {
                            Rectangle().fill(pal.grid).frame(height: 0.5)
                            HStack(spacing: 0) {
                                ForEach(Array(row.enumerated()), id: \.element.d) { i, day in
                                    if i > 0 { Rectangle().fill(pal.grid).frame(width: 0.5) }
                                    DayCell(day: day, col: i, today: today, lanes: lanes, pal: pal)
                                        .frame(width: colW - (i > 0 ? 0.5 : 0), height: rowH - 0.5, alignment: .top)
                                }
                            }
                        }
                        .frame(height: rowH)
                    }
                }
            }
        }
    }
}

/// 칸 하나: 날짜(오늘 = 강조색 원) · "+N" · 막대(공휴일 → 항목)
struct DayCell: View {
    let day: Snapshot.CalDay
    let col: Int // 0 = 월 … 5 = 토, 6 = 일
    let today: String
    let lanes: Int
    let pal: Palette
    static let head: CGFloat = 17 // 날짜 줄
    static let bar: CGFloat = 12
    static let gap: CGFloat = 1.5
    static var lane: CGFloat { bar + gap }

    var body: some View {
        let isToday = day.d == today
        let other = day.other == true
        let holidayBar = day.holiday != nil ? 1 : 0
        let room = max(0, lanes - holidayBar)
        let shown = Array(day.items.prefix(room))
        let more = day.count - shown.count
        VStack(alignment: .leading, spacing: Self.gap) {
            HStack(spacing: 0) {
                Text("\(Int(day.d.suffix(2)) ?? 0)")
                    .font(.system(size: 11, weight: isToday ? .semibold : .regular))
                    .monospacedDigit()
                    .foregroundStyle(isToday ? Color.white : numberColor(other: other))
                    .frame(minWidth: 16, minHeight: 16)
                    .background { if isToday { Circle().fill(pal.accent).widgetAccentable() } }
                Spacer(minLength: 0)
                if more > 0 {
                    Text("+\(more)").font(.system(size: 9, weight: .medium)).foregroundStyle(pal.accent).widgetAccentable()
                        .lineLimit(1).padding(.trailing, 2)
                }
            }
            .frame(height: Self.head - Self.gap)
            .padding(.leading, 2)
            if let h = day.holiday, lanes > 0 {
                BarView(title: h, fill: holidayFill, text: holidayText, repeat: false).opacity(other ? 0.5 : 1)
            }
            ForEach(Array(shown.enumerated()), id: \.offset) { _, it in
                let bar = BarView(title: it.title, fill: fill(it), text: textColor(it), repeat: it.repeat).opacity(other ? 0.6 : 1)
                if let url = link(it) { WLink(url) { bar } } else { bar }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 1.5)
        .padding(.top, 2)
        .contentShape(Rectangle())
        // 막대 밖 = 그 날(§15.4). 칸 전체를 Link로 감싸면 안쪽 막대 Link가 먹지 않아 뒤에 까는 Link로 둔다
        .background { WLink(Links.calendar(day.d)) { Color.clear.contentShape(Rectangle()) } }
    }

    // M3: 일요일·공휴일 빨강, 토요일 파랑, 다른 달 흐림
    private func numberColor(other: Bool) -> Color {
        let base: Color = (day.holiday != nil || col == 6) ? pal.holiday : col == 5 ? pal.saturday : pal.primary
        return other ? (day.holiday != nil || col >= 5 ? base.opacity(0.45) : pal.calOther) : base
    }
    private var holidayFill: Color { Color.mix(pal.holidayHex, pal.bgHex, pal.dark ? 0.62 : 0.6) }
    private var holidayText: Color { pal.dark ? .white : Color.mix(pal.holidayHex, pal.primaryHex, 0.45) }

    /// 막대 색(00 토큰 --cal-fill · --cal-text, 06 §14.1): 라이트 = 색 60% 면 + 색 45% 글자, 다크 = 색 62% 면 + 흰 글자.
    /// 완료·지난 날 일정 = 면 20% + 3단계 회색 글자(M6, 취소선 없음)
    private func dim(_ it: Snapshot.CalItem) -> Bool { it.done || (it.kind != "task" && day.d < today) }
    private func colorHex(_ it: Snapshot.CalItem) -> String { it.color ?? pal.accentHex }
    private func fill(_ it: Snapshot.CalItem) -> Color {
        Color.mix(colorHex(it), pal.bgHex, dim(it) ? 0.2 : pal.dark ? 0.62 : 0.6)
    }
    private func textColor(_ it: Snapshot.CalItem) -> Color {
        if dim(it) { return pal.tertiary }
        return pal.dark ? .white : Color.mix(colorHex(it), pal.primaryHex, 0.45)
    }
    private func link(_ it: Snapshot.CalItem) -> URL? {
        guard let id = it.id else { return nil }
        if it.kind == "task" { return Links.task(id) }
        if it.kind == "event" { return Links.event(id) }
        return nil
    }
}

struct BarView: View {
    let title: String
    let fill: Color
    let text: Color
    let `repeat`: Bool
    var body: some View {
        // 막대 크기는 칸 폭이 정하고(바탕 모양), 글자는 그 위에 얹어 넘치면 잘린다(틱틱처럼 … 없이)
        RoundedRectangle(cornerRadius: 3, style: .continuous).fill(fill)
            .frame(maxWidth: .infinity, minHeight: DayCell.bar, maxHeight: DayCell.bar)
            .overlay(alignment: .leading) {
                HStack(spacing: 1.5) {
                    if `repeat` { Image(systemName: "repeat").font(.system(size: 6.5, weight: .semibold)) }
                    Text(title).font(.system(size: 9, weight: .medium)).lineLimit(1).fixedSize().privacySensitive()
                }
                .foregroundStyle(text)
                .padding(.horizontal, 3)
            }
            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
    }
}

/// 위젯 Link. 미리보기 렌더러(preview/render.sh, -D WIDGET_RENDER)에서는 ImageRenderer가 Link를 그리지 못해 내용만 그린다
struct WLink<Content: View>: View {
    let url: URL
    @ViewBuilder let content: () -> Content
    init(_ url: URL, @ViewBuilder content: @escaping () -> Content) { self.url = url; self.content = content }
    var body: some View {
        #if WIDGET_RENDER
        content()
        #else
        Link(destination: url, label: content)
        #endif
    }
}

// MARK: 색 섞기(CSS color-mix in srgb와 같은 계산)
extension Color {
    /// a를 t 비율로, 나머지를 b로 섞는다
    static func mix(_ a: String, _ b: String, _ t: Double) -> Color {
        func rgb(_ hex: String) -> (Double, Double, Double) {
            var s = hex.trimmingCharacters(in: .whitespaces)
            if s.hasPrefix("#") { s.removeFirst() }
            let v = UInt64(s, radix: 16) ?? 0x4E75F2
            return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
        }
        let x = rgb(a), y = rgb(b)
        return Color(red: x.0 * t + y.0 * (1 - t), green: x.1 * t + y.1 * (1 - t), blue: x.2 * t + y.2 * (1 - t))
    }
}

extension Palette {
    var accentHex: String { dark ? (theme?.accentDark ?? "#545DFA") : (theme?.accentLight ?? "#4E75F2") }
    var bgHex: String { dark ? "#1A1A1A" : "#FFFFFF" }
    var primaryHex: String { dark ? "#F2F2F2" : "#191919" }
    var holidayHex: String { dark ? "#F2555A" : "#E5484D" }
}

#Preview("월 캘린더 크게", as: .systemLarge) {
    MonthWidget()
} timeline: {
    SproutEntry(date: .now, data: .ready(Sample.snapshot), pending: [:])
}

#Preview("월 캘린더 중간", as: .systemMedium) {
    MonthWidget()
} timeline: {
    SproutEntry(date: .now, data: .ready(Sample.snapshot), pending: [:])
}
