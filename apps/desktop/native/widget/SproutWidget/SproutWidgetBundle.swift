// 25 맥 위젯(macOS 14+): ① 오늘 할 일(작게·중간·크게) ② 캐릭터(작게·중간). 설정 없음(StaticConfiguration, D2).
// 위젯은 앱이 쓴 저장 파일만 읽어 그리고, 체크는 대기열 파일로 앱에 넘긴다(§8.1).
import SwiftUI
import WidgetKit

@main
struct SproutWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        CharacterWidget()
    }
}

// MARK: ① 오늘 할 일
struct TodayWidget: Widget {
    let kind = "SproutToday"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SproutProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("오늘 할 일")
        .description("오늘 할 일을 보고 바로 체크해요")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: SproutEntry

    var body: some View {
        let pal = Palette(scheme, theme)
        content(pal)
            .redacted(reason: entry.placeholder ? .placeholder : [])
            .containerBackground(for: .widget) { pal.bg }
    }

    private var theme: Snapshot.Theme? { if case .ready(let s) = entry.data { return s.theme } else { return nil } }

    @ViewBuilder private func content(_ pal: Palette) -> some View {
        switch entry.data {
        case .first: MessageView(text: "sprout을 한 번 열어 주세요", pal: pal).widgetURL(Links.today)
        case .signedOut: MessageView(text: "로그인이 필요해요", action: "sprout 열기", pal: pal).widgetURL(Links.today)
        case .failed: MessageView(text: "위젯을 불러오지 못했어요", action: "sprout 열기", pal: pal).widgetURL(Links.today)
        case .ready(let snap):
            switch family {
            case .systemSmall: SmallToday(snap: snap, entry: entry, pal: pal).widgetURL(Links.today)
            case .systemLarge: TaskListBlock(snap: snap, entry: entry, rows: 13, plus: true, pal: pal)
            default: TaskListBlock(snap: snap, entry: entry, rows: 5, plus: true, pal: pal)
            }
        }
    }
}

/// §3.1 작게: 제목만 5줄, 체크박스·시각 없음, 넘침 표시 없음(위젯 전체가 한 덩어리로 눌림)
struct SmallToday: View {
    let snap: Snapshot
    let entry: SproutEntry
    let pal: Palette
    var body: some View {
        let tasks = snap.today?.tasks ?? []
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("오늘").font(.system(size: 15, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
                Text("\(snap.today?.count ?? 0)").font(.system(size: 15)).foregroundStyle(pal.accent.opacity(0.55)).contentTransition(.numericText())
            }
            .padding(.bottom, 2)
            if entry.stale {
                Text("sprout을 열면 오늘 목록으로 바뀌어요").font(.system(size: 12)).foregroundStyle(pal.secondary)
            } else if tasks.isEmpty {
                Spacer()
                Text("오늘 할 일이 없어요").font(.system(size: 12)).foregroundStyle(pal.secondary).frame(maxWidth: .infinity)
                Text(moodLine(entry.date)).font(.system(size: 11)).foregroundStyle(pal.tertiary).frame(maxWidth: .infinity)
            } else {
                ForEach(tasks.prefix(5)) { t in
                    Text(t.title).font(.system(size: 13)).lineLimit(1)
                        .foregroundStyle(entry.pending[t.id] != nil ? pal.tertiary : pal.primary)
                        .padding(.leading, t.depth > 0 ? 12 : 0)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: ② 캐릭터
struct CharacterWidget: Widget {
    let kind = "SproutCharacter"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SproutProvider()) { entry in
            CharacterWidgetView(entry: entry)
        }
        .configurationDisplayName("캐릭터")
        .description("내 캐릭터의 레벨과 XP를 봐요")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct CharacterWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    let entry: SproutEntry

    var body: some View {
        let pal = Palette(scheme, theme)
        content(pal)
            .redacted(reason: entry.placeholder ? .placeholder : [])
            .containerBackground(for: .widget) { pal.bg }
    }

    private var theme: Snapshot.Theme? { if case .ready(let s) = entry.data { return s.theme } else { return nil } }

    @ViewBuilder private func content(_ pal: Palette) -> some View {
        switch entry.data {
        case .first: MessageView(text: "sprout을 한 번 열어 주세요", egg: true, pal: pal).widgetURL(Links.today)
        case .signedOut: MessageView(text: "로그인이 필요해요", action: "sprout 열기", pal: pal).widgetURL(Links.today)
        case .failed: MessageView(text: "위젯을 불러오지 못했어요", action: "sprout 열기", pal: pal).widgetURL(Links.today)
        case .ready(let snap):
            if let growth = snap.growth {
                if family == .systemMedium {
                    GeometryReader { geo in
                        HStack(alignment: .top, spacing: 12) {
                            Link(destination: Links.growth) {
                                CharacterCard(growth: growth, artSize: 84, showTodayXp: !entry.stale, pal: pal)
                            }
                            .frame(width: geo.size.width * 0.4 - 6)
                            TaskListBlock(snap: snap, entry: entry, rows: 4, plus: false, pal: pal)
                        }
                    }
                } else {
                    CharacterCard(growth: growth, artSize: 72, showTodayXp: false, pal: pal).widgetURL(Links.growth)
                }
            } else {
                MessageView(text: "위젯을 불러오지 못했어요", action: "sprout 열기", pal: pal).widgetURL(Links.today)
            }
        }
    }
}

#Preview("오늘 중간", as: .systemMedium) {
    TodayWidget()
} timeline: {
    SproutEntry(date: .now, data: .ready(Sample.snapshot), pending: [:])
}

#Preview("캐릭터 중간", as: .systemMedium) {
    CharacterWidget()
} timeline: {
    SproutEntry(date: .now, data: .ready(Sample.snapshot), pending: [:])
}
