// 36 모바일 위젯(iOS 17+): ① 월 캘린더(크게) ② 오늘 할 일(작게·중간) ③ 캐릭터(작게). 설정 없음(StaticConfiguration).
// 위젯은 앱이 App Group에 쓴 저장 파일만 읽어 그리고, 체크·달 넘김은 같은 칸의 작은 파일로 남긴다(36 §7).
import SwiftUI
import WidgetKit

@main
struct SproutWidgetBundle: WidgetBundle {
    var body: some Widget {
        MonthWidget()
        TodayWidget()
        CharacterWidget()
    }
}

private func states(_ entry: SproutEntry, _ pal: Palette, egg: Bool = false) -> (any View)? {
    switch entry.data {
    case .first: return MessageView(text: "꿈틀을 한 번 열어 주세요", egg: egg, pal: pal).widgetURL(Links.today)
    case .signedOut: return MessageView(text: "로그인이 필요해요", action: "꿈틀 열기", pal: pal).widgetURL(Links.today)
    case .failed: return MessageView(text: "위젯을 불러오지 못했어요", action: "꿈틀 열기", pal: pal).widgetURL(Links.today)
    case .ready: return nil
    }
}

private func theme(_ entry: SproutEntry) -> Snapshot.Theme? { if case .ready(let s) = entry.data { return s.theme } else { return nil } }

// MARK: ① 월 캘린더
struct MonthWidget: Widget {
    let kind = "SproutMonth"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SproutProvider()) { entry in MonthEntryView(entry: entry) }
            .configurationDisplayName("월 캘린더")
            .description("이번 달 일정을 한눈에 봐요")
            .supportedFamilies([.systemLarge])
            .contentMarginsDisabled()
    }
}

struct MonthEntryView: View {
    @Environment(\.colorScheme) private var scheme
    let entry: SproutEntry
    var body: some View {
        let pal = Palette(scheme, theme(entry))
        Group {
            if let s = states(entry, pal) {
                AnyView(s)
            } else if case .ready(let snap) = entry.data, let cal = snap.calendar, !cal.months.isEmpty {
                MonthWidgetView(snap: snap, cal: cal, entry: entry, pal: pal)
            } else {
                MessageView(text: "꿈틀을 열면 달력이 채워져요", pal: pal).widgetURL(Links.today)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .redacted(reason: entry.placeholder ? .placeholder : [])
        .containerBackground(for: .widget) { pal.bg }
    }
}

// MARK: ② 오늘 할 일
struct TodayWidget: Widget {
    let kind = "SproutToday"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SproutProvider()) { entry in TodayEntryView(entry: entry) }
            .configurationDisplayName("오늘 할 일")
            .description("오늘 할 일을 보고 바로 체크해요")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TodayEntryView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: SproutEntry
    var body: some View {
        let pal = Palette(scheme, theme(entry))
        Group {
            if let s = states(entry, pal) {
                AnyView(s)
            } else if case .ready(let snap) = entry.data {
                if family == .systemSmall {
                    SmallToday(snap: snap, entry: entry, pal: pal).widgetURL(Links.today)
                } else {
                    TaskListBlock(snap: snap, entry: entry, rows: 5, plus: true, pal: pal)
                }
            }
        }
        .redacted(reason: entry.placeholder ? .placeholder : [])
        .containerBackground(for: .widget) { pal.bg }
    }
}

// MARK: ③ 캐릭터
struct CharacterWidget: Widget {
    let kind = "SproutCharacter"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SproutProvider()) { entry in CharacterEntryView(entry: entry) }
            .configurationDisplayName("캐릭터")
            .description("내 캐릭터의 레벨과 XP를 봐요")
            .supportedFamilies([.systemSmall])
    }
}

struct CharacterEntryView: View {
    @Environment(\.colorScheme) private var scheme
    let entry: SproutEntry
    var body: some View {
        let pal = Palette(scheme, theme(entry))
        Group {
            if let s = states(entry, pal, egg: true) {
                AnyView(s)
            } else if case .ready(let snap) = entry.data, let growth = snap.growth {
                CharacterCard(growth: growth, artSize: 80, pal: pal).widgetURL(Links.growth)
            } else {
                MessageView(text: "위젯을 불러오지 못했어요", action: "꿈틀 열기", pal: pal).widgetURL(Links.today)
            }
        }
        .redacted(reason: entry.placeholder ? .placeholder : [])
        .containerBackground(for: .widget) { pal.bg }
    }
}
