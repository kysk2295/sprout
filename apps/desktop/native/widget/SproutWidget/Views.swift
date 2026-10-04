// 25 §3 레이아웃 · §4 상태 · §5 색 — 위젯 화면 조각
import SwiftUI
import WidgetKit
import AppKit

// MARK: 색 (00 토큰 · §5)
extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt64(s, radix: 16) ?? 0x4E75F2
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

struct Palette {
    let dark: Bool
    let theme: Snapshot.Theme?
    init(_ scheme: ColorScheme, _ theme: Snapshot.Theme?) { dark = scheme == .dark; self.theme = theme }
    /// §5.2: 밝게 = 내 테마 강조색, 어둡게 = 다크일 때 테마 강조색(앱이 계산해 넘긴다)
    var accent: Color { Color(hex: dark ? (theme?.accentDark ?? "#545DFA") : (theme?.accentLight ?? "#4E75F2")) }
    var bg: Color { Color(hex: dark ? "#1A1A1A" : "#FFFFFF") }
    var primary: Color { Color(hex: dark ? "#F2F2F2" : "#191919") }
    var secondary: Color { Color(hex: dark ? "#CDCDCD" : "#7D7D7D") }
    var tertiary: Color { Color(hex: dark ? "#606060" : "#A3A4A7") }
    var danger: Color { Color(hex: "#D44343") }
    func priority(_ p: Int) -> Color {
        switch p {
        case 3: return Color(hex: "#C53C31")
        case 2: return Color(hex: "#EFAB3E")
        case 1: return Color(hex: "#4E75F2")
        default: return Color(hex: dark ? "#474747" : "#8B8B8B")
        }
    }
}

enum Links {
    static let today = URL(string: "sprout://today")!
    static let quickAdd = URL(string: "sprout://quick-add")!
    static let growth = URL(string: "sprout://growth")!
    static func task(_ id: String) -> URL { URL(string: "sprout://task/\(id)") ?? today }
}

/// 09 §2 빈 상태 한 줄 [임시]: 시간대별 — 앱 미니 창과 같은 문구
func moodLine(_ date: Date) -> String {
    let h = Calendar.current.component(.hour, from: date)
    if h < 11 { return "좋은 하루 시작해요" }
    if h < 18 { return "잠깐 쉬어가요" }
    return "오늘도 수고했어요"
}

// MARK: 상태 화면(§4: 처음 · 로그아웃 · 오류 · 오래된 데이터)
struct MessageView: View {
    let text: String
    var action: String? = nil
    var egg = false
    let pal: Palette
    var body: some View {
        VStack(spacing: 6) {
            if egg { EggShape().fill(pal.tertiary.opacity(0.5)).frame(width: 34, height: 42) }
            Text(text).font(.system(size: 12)).foregroundStyle(pal.secondary).multilineTextAlignment(.center)
            if let action { Text(action).font(.system(size: 12, weight: .semibold)).foregroundStyle(pal.accent).widgetAccentable() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// 알 실루엣(위젯 안에 넣은 단색 그림, §4 "처음")
struct EggShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY))
        p.addCurve(to: CGPoint(x: r.maxX, y: r.minY + r.height * 0.62), control1: CGPoint(x: r.minX + r.width * 0.86, y: r.minY), control2: CGPoint(x: r.maxX, y: r.minY + r.height * 0.36))
        p.addCurve(to: CGPoint(x: r.midX, y: r.maxY), control1: CGPoint(x: r.maxX, y: r.minY + r.height * 0.86), control2: CGPoint(x: r.minX + r.width * 0.78, y: r.maxY))
        p.addCurve(to: CGPoint(x: r.minX, y: r.minY + r.height * 0.62), control1: CGPoint(x: r.minX + r.width * 0.22, y: r.maxY), control2: CGPoint(x: r.minX, y: r.minY + r.height * 0.86))
        p.addCurve(to: CGPoint(x: r.midX, y: r.minY), control1: CGPoint(x: r.minX, y: r.minY + r.height * 0.36), control2: CGPoint(x: r.minX + r.width * 0.14, y: r.minY))
        return p
    }
}

// MARK: 머리 "오늘 N" (+)
struct TodayHeader: View {
    let count: Int
    let plus: Bool
    let pal: Palette
    var body: some View {
        HStack(spacing: 6) {
            Link(destination: Links.today) {
                HStack(spacing: 6) {
                    Text("오늘").font(.system(size: 15, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
                    Text("\(count)").font(.system(size: 15)).foregroundStyle(pal.accent.opacity(0.55)).contentTransition(.numericText())
                }
            }
            Spacer(minLength: 4)
            if plus {
                Link(destination: Links.quickAdd) {
                    Image(systemName: "plus").font(.system(size: 14, weight: .semibold)).foregroundStyle(pal.accent).widgetAccentable()
                        .frame(width: 20, height: 20)
                }
            }
        }
        .frame(height: 24)
    }
}

// MARK: 행(체크박스 · 제목 · 오른쪽 날짜)
struct CheckBox: View {
    let color: Color
    let done: Bool
    var body: some View {
        ZStack {
            if done {
                RoundedRectangle(cornerRadius: 3).fill(color)
                Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(.white)
            } else {
                RoundedRectangle(cornerRadius: 3).strokeBorder(color, lineWidth: 1.5)
            }
        }
        .frame(width: 13, height: 13)
        .widgetAccentable()
    }
}

struct TaskRowView: View {
    let task: Snapshot.Task
    let pending: Bool
    let pal: Palette
    var body: some View {
        HStack(spacing: 7) {
            Button(intent: ToggleTaskIntent(taskId: task.id)) {
                CheckBox(color: pal.priority(task.priority), done: pending).frame(width: 18, height: 20).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Link(destination: Links.task(task.id)) {
                HStack(spacing: 4) {
                    Text(task.title).font(.system(size: 13)).foregroundStyle(pending ? pal.tertiary : pal.primary).lineLimit(1)
                    Spacer(minLength: 4)
                    if let label = task.label {
                        HStack(spacing: 2) {
                            if task.repeat { Image(systemName: "repeat").font(.system(size: 9)) }
                            Text(label).font(.system(size: 11))
                        }
                        .foregroundStyle(task.labelTone == "danger" ? pal.danger : pal.accent)
                        .lineLimit(1)
                    }
                }
            }
        }
        .padding(.leading, task.depth > 0 ? 16 : 0)
        .frame(height: 22)
    }
}

struct OverflowView: View {
    let more: Int
    let pal: Palette
    var body: some View {
        Link(destination: Links.today) {
            HStack { Spacer(); Text("+\(more)개 더").font(.system(size: 12)).foregroundStyle(pal.accent).contentTransition(.numericText()) }
        }
        .frame(height: 20)
    }
}

/// 머리 + 행 n개 + 넘침 (§3.2 · §3.4 오른쪽)
struct TaskListBlock: View {
    let snap: Snapshot
    let entry: SproutEntry
    let rows: Int
    let plus: Bool
    let pal: Palette
    var body: some View {
        let tasks = snap.today?.tasks ?? []
        let count = snap.today?.count ?? tasks.count
        let footer = entry.pendingTooLong
        let room = max(1, rows - (footer ? 1 : 0))
        let overflow = count > room
        let shown = Array(tasks.prefix(overflow ? room - 1 : room))
        VStack(alignment: .leading, spacing: 0) {
            TodayHeader(count: count, plus: plus, pal: pal)
            if entry.stale {
                MessageView(text: "sprout을 열면 오늘 목록으로 바뀌어요", pal: pal)
            } else if tasks.isEmpty {
                VStack(spacing: 3) {
                    Text("오늘 할 일이 없어요").font(.system(size: 12)).foregroundStyle(pal.secondary)
                    Text(moodLine(entry.date)).font(.system(size: 11)).foregroundStyle(pal.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ForEach(shown) { t in TaskRowView(task: t, pending: entry.pending[t.id] != nil, pal: pal) }
                if overflow { OverflowView(more: count - shown.count, pal: pal) }
                Spacer(minLength: 0)
                if footer { Text("sprout을 열면 반영돼요").font(.system(size: 11)).foregroundStyle(pal.tertiary) }
            }
        }
    }
}

// MARK: 캐릭터(§3.3 · §3.5)
struct CharacterArtView: View {
    let growth: Snapshot.Growth
    let size: CGFloat
    var body: some View {
        if let url = Store.imageURL(growth.art), let img = NSImage(contentsOf: url) {
            Image(nsImage: img).resizable().interpolation(.high).frame(width: size, height: size)
        } else {
            // 그림을 아직 못 구웠거나 갤러리 미리보기: 단색 실루엣
            ZStack {
                if growth.hasCharacter {
                    Circle().fill(Color(hex: "#F2C9A0")).frame(width: size * 0.62, height: size * 0.58).offset(y: size * 0.08)
                    Capsule().fill(Color(hex: "#5DBB63")).frame(width: size * 0.05, height: size * 0.16).offset(y: -size * 0.28)
                } else {
                    EggShape().fill(Color(hex: "#F3EBDD")).frame(width: size * 0.5, height: size * 0.66)
                }
            }
            .frame(width: size, height: size)
        }
    }
}

struct XPBar: View {
    let into: Int
    let toNext: Int
    let pal: Palette
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3).fill(pal.tertiary.opacity(0.35))
                RoundedRectangle(cornerRadius: 3).fill(pal.accent)
                    .frame(width: geo.size.width * CGFloat(min(1, max(0, Double(into) / Double(max(1, toNext))))))
                    .widgetAccentable()
            }
        }
        .frame(height: 6)
    }
}

struct CharacterCard: View {
    let growth: Snapshot.Growth
    let artSize: CGFloat
    let showTodayXp: Bool
    let pal: Palette
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack { Spacer(); CharacterArtView(growth: growth, size: artSize); Spacer() }
            HStack(spacing: 5) {
                Text(growth.name ?? "알").font(.system(size: 13, weight: .bold)).foregroundStyle(pal.primary).lineLimit(1)
                Text("Lv \(growth.level) · \(growth.stageName)").font(.system(size: 11)).foregroundStyle(pal.secondary).lineLimit(1)
                    .contentTransition(.numericText())
            }
            XPBar(into: growth.xpInto, toNext: growth.xpToNext, pal: pal)
            Group {
                if showTodayXp {
                    if growth.todayTaskXp >= growth.todayTaskXpCap {
                        Text("오늘 할 일 XP 다 받았어요")
                    } else {
                        Text("오늘 XP \(growth.todayTaskXp)/\(growth.todayTaskXpCap)").contentTransition(.numericText())
                    }
                } else {
                    Text("다음 레벨까지 \(max(0, growth.xpToNext - growth.xpInto)) XP").contentTransition(.numericText())
                }
            }
            .font(.system(size: 11)).foregroundStyle(pal.secondary).lineLimit(1)
        }
    }
}
