// 36 §3 레이아웃 · §4 상태 · §5 색 — 위젯 화면 조각(맥 위젯 Views.swift의 iOS판)
import SwiftUI
import UIKit
import WidgetKit

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count > 6 { s = String(s.prefix(6)) }
        let v = UInt64(s, radix: 16) ?? 0x4E75F2
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

/// 00 토큰 Default·Dark + 앱이 계산한 강조색(25 §5.2)
struct Palette {
    let dark: Bool
    let theme: Snapshot.Theme?
    init(_ scheme: ColorScheme, _ theme: Snapshot.Theme?) { dark = scheme == .dark; self.theme = theme }
    var accent: Color { Color(hex: dark ? (theme?.accentDark ?? "#19856B") : (theme?.accentLight ?? "#12715E")) }
    var bg: Color { Color(hex: dark ? "#1A1A1A" : "#FFFFFF") }
    var primary: Color { Color(hex: dark ? "#F2F2F2" : "#191919") }
    var secondary: Color { Color(hex: dark ? "#CDCDCD" : "#7D7D7D") }
    var tertiary: Color { Color(hex: dark ? "#606060" : "#A3A4A7") }
    var quaternary: Color { Color(hex: dark ? "#4A4A4A" : "#B5B6B8") }
    var divider: Color { Color(hex: dark ? "#2A2A2A" : "#F0F0F2") }
    var danger: Color { Color(hex: "#D44343") }
    /// 06 §16: 공휴일·일요일 빨강, 토요일 파랑
    var holiday: Color { Color(hex: dark ? "#F2555A" : "#E5484D") }
    var saturday: Color { Color(hex: dark ? "#6B9CFF" : "#3D74E0") }
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
    static let quickAddToday = URL(string: "sprout://quick-add?view=smart:today")!
    static let growth = URL(string: "sprout://growth")!
    static func quickAdd(date: String) -> URL { URL(string: "sprout://quick-add?view=date:\(date)") ?? quickAddToday }
    static func task(_ id: String) -> URL { URL(string: "sprout://task/\(id)") ?? today }
    static func event(_ id: String) -> URL { URL(string: "sprout://event/\(id)") ?? today }
    static func calendar(_ date: String) -> URL { URL(string: "sprout://calendar?date=\(date)") ?? today }
}

func moodLine(_ date: Date) -> String {
    let h = Calendar.current.component(.hour, from: date)
    if h < 11 { return "좋은 하루 시작해요" }
    if h < 18 { return "잠깐 쉬어가요" }
    return "오늘도 수고했어요"
}

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

// MARK: 오늘 할 일(25 §3.1·§3.2)
struct TodayHeader: View {
    let count: Int
    let plus: Bool
    let pal: Palette
    var body: some View {
        HStack(spacing: 6) {
            Link(destination: Links.today) {
                HStack(spacing: 6) {
                    Text("오늘").font(.system(size: 16, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
                    Text("\(count)").font(.system(size: 16)).foregroundStyle(pal.accent.opacity(0.55)).contentTransition(.numericText())
                }
            }
            Spacer(minLength: 4)
            if plus {
                Link(destination: Links.quickAddToday) {
                    Image(systemName: "plus").font(.system(size: 16, weight: .semibold)).foregroundStyle(pal.accent).widgetAccentable()
                        .frame(width: 24, height: 24)
                }
            }
        }
        .frame(height: 24)
    }
}

struct CheckBox: View {
    let color: Color
    let done: Bool
    var body: some View {
        ZStack {
            if done {
                RoundedRectangle(cornerRadius: 3.5).fill(color)
                Image(systemName: "checkmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(.white)
            } else {
                RoundedRectangle(cornerRadius: 3.5).strokeBorder(color, lineWidth: 1.5)
            }
        }
        .frame(width: 15, height: 15)
        .widgetAccentable()
    }
}

struct TaskRowView: View {
    let task: Snapshot.Task
    let pending: Bool
    let pal: Palette
    var body: some View {
        HStack(spacing: 8) {
            Button(intent: ToggleTaskIntent(taskId: task.id)) {
                CheckBox(color: pal.priority(task.priority), done: pending).frame(width: 22, height: 22).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Link(destination: Links.task(task.id)) {
                HStack(spacing: 4) {
                    Text(task.title).font(.system(size: 14)).foregroundStyle(pending ? pal.tertiary : pal.primary).lineLimit(1)
                    Spacer(minLength: 4)
                    if let label = task.label {
                        HStack(spacing: 2) {
                            if task.repeat { Image(systemName: "repeat").font(.system(size: 9)) }
                            Text(label).font(.system(size: 12))
                        }
                        .foregroundStyle(task.labelTone == "danger" ? pal.danger : pal.accent)
                        .lineLimit(1)
                    }
                }
            }
        }
        .padding(.leading, task.depth > 0 ? 18 : 0)
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
                MessageView(text: "꿈틀을 열면 오늘 목록으로 바뀌어요", pal: pal)
            } else if tasks.isEmpty {
                VStack(spacing: 3) {
                    Text("오늘 할 일이 없어요").font(.system(size: 13)).foregroundStyle(pal.secondary)
                    Text(moodLine(entry.date)).font(.system(size: 11)).foregroundStyle(pal.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ForEach(shown) { t in TaskRowView(task: t, pending: entry.pending[t.id] != nil, pal: pal) }
                if overflow { OverflowView(more: count - shown.count, pal: pal) }
                Spacer(minLength: 0)
                if footer { Text("꿈틀을 열면 반영돼요").font(.system(size: 11)).foregroundStyle(pal.tertiary) }
            }
        }
    }
}

/// 작게: 제목만 5줄(체크박스 없음, 통째로 눌림)
struct SmallToday: View {
    let snap: Snapshot
    let entry: SproutEntry
    let pal: Palette
    var body: some View {
        let tasks = snap.today?.tasks ?? []
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text("오늘").font(.system(size: 16, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
                Text("\(snap.today?.count ?? 0)").font(.system(size: 16)).foregroundStyle(pal.accent.opacity(0.55)).contentTransition(.numericText())
            }
            .padding(.bottom, 1)
            if entry.stale {
                Text("꿈틀을 열면 오늘 목록으로 바뀌어요").font(.system(size: 12)).foregroundStyle(pal.secondary)
            } else if tasks.isEmpty {
                Spacer()
                Text("오늘 할 일이 없어요").font(.system(size: 12)).foregroundStyle(pal.secondary).frame(maxWidth: .infinity)
                Text(moodLine(entry.date)).font(.system(size: 11)).foregroundStyle(pal.tertiary).frame(maxWidth: .infinity)
            } else {
                ForEach(tasks.prefix(5)) { t in
                    Text(t.title).font(.system(size: 14)).lineLimit(1)
                        .foregroundStyle(entry.pending[t.id] != nil ? pal.tertiary : pal.primary)
                        .padding(.leading, t.depth > 0 ? 12 : 0)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: 캐릭터(25 §3.3)
struct CharacterArtView: View {
    let growth: Snapshot.Growth
    let size: CGFloat
    var body: some View {
        if let url = Store.imageURL(growth.art), let img = UIImage(contentsOfFile: url.path) {
            Image(uiImage: img).resizable().interpolation(.high).frame(width: size, height: size)
        } else {
            ZStack {
                if growth.hasCharacter {
                    Ellipse().fill(Color(hex: "#F2C9A0")).frame(width: size * 0.6, height: size * 0.54).offset(y: size * 0.1)
                    Capsule().fill(Color(hex: "#5DBB63")).frame(width: size * 0.05, height: size * 0.16).offset(y: -size * 0.24)
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
            Text("다음 레벨까지 \(max(0, growth.xpToNext - growth.xpInto)) XP").contentTransition(.numericText())
                .font(.system(size: 11)).foregroundStyle(pal.secondary).lineLimit(1)
        }
    }
}
