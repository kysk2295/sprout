// 36 §3.1 월 캘린더(크게) — 머리 ‹ 10월 › + 요일 줄 + 5~6주 칸. 칸 = 날짜 숫자(오늘 = 강조색 원) · 공휴일 이름 · 막대 2~3개 · +N
// 누르면: 칸 → 앱 캘린더 그날, 막대 → 상세·일정 시트, + → 빠른 추가, ‹ › → 위젯 안에서 달 넘김(ShiftMonthIntent)
import SwiftUI
import WidgetKit

struct MonthWidgetView: View {
    let snap: Snapshot
    let cal: Snapshot.Calendar
    let entry: SproutEntry
    let pal: Palette

    /// 위젯의 진짜 오늘 기준 이번 달(앱이 자정을 못 넘겨도 맞게) + 사용자가 넘긴 만큼
    private var index: Int {
        let todayMonth = String(Store.localDay(entry.date).prefix(7))
        let base = cal.months.firstIndex { $0.month == todayMonth } ?? cal.current
        return min(cal.months.count - 1, max(0, base + entry.monthOffset))
    }

    var body: some View {
        let i = index
        let month = cal.months[i]
        let todayKey = Store.localDay(entry.date)
        VStack(spacing: 0) {
            header(month: month, canBack: i > 0, canNext: i < cal.months.count - 1, shifted: entry.monthOffset != 0, today: todayKey)
            weekHead
            GeometryReader { geo in
                let weeks = month.weeks.count
                let rowH = geo.size.height / CGFloat(max(1, weeks))
                let colW = geo.size.width / 7
                let bars = max(1, min(4, Int((rowH - 17) / 13)))
                VStack(spacing: 0) {
                    ForEach(Array(month.weeks.enumerated()), id: \.offset) { _, week in
                        VStack(spacing: 0) {
                            Rectangle().fill(pal.divider).frame(height: 0.5)
                            HStack(spacing: 0) {
                                ForEach(week, id: \.date) { day in
                                    DayCell(day: day, today: day.date == todayKey, bars: bars, pal: pal)
                                        .frame(width: colW, height: rowH - 0.5, alignment: .topLeading)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func header(month: Snapshot.Month, canBack: Bool, canNext: Bool, shifted: Bool, today: String) -> some View {
        ZStack {
            HStack(spacing: 14) {
                Button(intent: ShiftMonthIntent(delta: -1)) {
                    Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold)).frame(width: 26, height: 24).contentShape(Rectangle())
                }
                .buttonStyle(.plain).foregroundStyle(pal.accent.opacity(canBack ? 1 : 0.3)).disabled(!canBack)
                Button(intent: ShiftMonthIntent(delta: 0)) {
                    Text(month.title).font(.system(size: 16, weight: .semibold)).foregroundStyle(pal.accent).widgetAccentable()
                        .contentTransition(.numericText())
                }
                .buttonStyle(.plain)
                Button(intent: ShiftMonthIntent(delta: 1)) {
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).frame(width: 26, height: 24).contentShape(Rectangle())
                }
                .buttonStyle(.plain).foregroundStyle(pal.accent.opacity(canNext ? 1 : 0.3)).disabled(!canNext)
            }
            HStack {
                Spacer()
                Link(destination: Links.quickAdd(date: today)) {
                    ZStack {
                        Circle().fill(pal.accent).widgetAccentable()
                        Image(systemName: "plus").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                    }
                    .frame(width: 22, height: 22)
                }
            }
        }
        .frame(height: 26)
        .padding(.bottom, 2)
    }

    private var weekHead: some View {
        HStack(spacing: 0) {
            ForEach(Array(cal.weekHead.enumerated()), id: \.offset) { i, w in
                Text(w).font(.system(size: 10, weight: .medium))
                    .foregroundStyle(i == 6 ? pal.holiday : i == 5 ? pal.saturday : pal.tertiary)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 16)
    }
}

struct DayCell: View {
    let day: Snapshot.CalDay
    let today: Bool
    let bars: Int
    let pal: Palette

    private var numberColor: Color {
        let c: Color = day.tone == "holiday" || day.tone == "sun" ? pal.holiday : day.tone == "sat" ? pal.saturday : pal.primary
        return day.inMonth ? c : (day.tone == nil ? pal.quaternary : c.opacity(0.45))
    }

    var body: some View {
        let overflow = day.total > bars
        let shown = Array(day.items.prefix(overflow ? max(0, bars - 1) : bars))
        let more = day.total - shown.count
        Link(destination: Links.calendar(day.date)) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 2) {
                    ZStack {
                        if today { Circle().fill(pal.accent).frame(width: 17, height: 17).widgetAccentable() }
                        Text("\(day.n)").font(.system(size: 11, weight: today ? .bold : .medium)).foregroundStyle(today ? .white : numberColor)
                    }
                    .frame(minWidth: 17, minHeight: 16)
                    if let h = day.holiday {
                        Text(h).font(.system(size: 7.5)).foregroundStyle(pal.holiday.opacity(day.inMonth ? 1 : 0.45)).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                ForEach(Array(shown.enumerated()), id: \.offset) { _, it in
                    Link(destination: it.kind == "event" ? Links.event(it.id) : Links.task(it.id)) {
                        Bar(item: it, pal: pal)
                    }
                }
                if overflow && more > 0 {
                    Text("+\(more)").font(.system(size: 9)).foregroundStyle(pal.tertiary).padding(.leading, 3).frame(height: 12)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 1.5)
            .padding(.top, 2)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .contentShape(Rectangle()) // 칸 빈 곳을 눌러도 그날로(36 §6)
            .opacity(day.inMonth ? 1 : 0.6)
        }
    }
}

/// 막대: 리스트·일정 색 18% 채움(완료·지난 것 8%) + 왼쪽 2pt 줄 + 9pt 제목(20 §7 앱 월 칸 + 틱틱 iOS 왼쪽 줄)
struct Bar: View {
    let item: Snapshot.CalItem
    let pal: Palette
    var body: some View {
        let c = item.color.map { Color(hex: $0) } ?? pal.accent
        // 칸 폭을 채우는 면 위에 줄·제목을 얹고 칸 끝에서 자른다(틱틱처럼 … 없이)
        Rectangle().fill(c.opacity(item.faded ? 0.08 : 0.18))
            .frame(height: 12)
            .overlay(alignment: .leading) {
                HStack(spacing: 2) {
                    Rectangle().fill(c.opacity(item.faded ? 0.4 : 1)).frame(width: 2)
                    Text(item.title).font(.system(size: 9)).foregroundStyle(item.faded ? pal.tertiary : pal.primary).lineLimit(1).fixedSize()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 2))
    }
}
