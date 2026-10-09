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
    /// §16 바탕화면 흐림(vibrant)·강조(accented) 렌더링: 시스템이 색을 지우고 단색으로 다시 칠한다.
    /// 이때는 색(hue) 대신 흰색 + 불투명도 단계로만 그린다(색에 뜻을 싣지 않는다).
    let mono: Bool
    init(_ scheme: ColorScheme, _ theme: Snapshot.Theme?, _ mode: WidgetRenderingMode = .fullColor) {
        dark = scheme == .dark; self.theme = theme; mono = mode != .fullColor
    }
    /// 단색 단계(§16.2): 1 · 0.62 · 0.4 / 막대 면 0.2 · 지난 막대 0.08 · 구분선 0.16
    static func white(_ a: Double) -> Color { Color.white.opacity(a) }
    /// §5.2: 밝게 = 내 테마 강조색, 어둡게 = 다크일 때 테마 강조색(앱이 계산해 넘긴다)
    var accent: Color { mono ? .white : Color(hex: dark ? (theme?.accentDark ?? "#19856B") : (theme?.accentLight ?? "#12715E")) }
    var bg: Color { Color(hex: dark ? "#1A1A1A" : "#FFFFFF") }
    var primary: Color { mono ? .white : Color(hex: dark ? "#F2F2F2" : "#191919") }
    var secondary: Color { mono ? Self.white(0.62) : Color(hex: dark ? "#CDCDCD" : "#7D7D7D") }
    var tertiary: Color { mono ? Self.white(0.4) : Color(hex: dark ? "#606060" : "#A3A4A7") }
    var danger: Color { mono ? .white : Color(hex: "#D44343") }
    // §15 월 캘린더(00 토큰 · 06 §16): 공휴일·일요일 빨강, 토요일 파랑, 다른 달 날짜, 칸 구분선
    var holiday: Color { mono ? primary : Color(hex: dark ? "#F2555A" : "#E5484D") }
    var saturday: Color { mono ? primary : Color(hex: dark ? "#6B9CFF" : "#3D74E0") }
    var calOther: Color { mono ? Self.white(0.32) : Color(hex: dark ? "#666666" : "#B5B6B8") }
    var grid: Color { mono ? Self.white(0.16) : Color(hex: dark ? "#2A2A2A" : "#EBEBEC") }
    func priority(_ p: Int) -> Color {
        if mono { return .white }
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
    /// §15.4 월 캘린더 위젯: 날짜 칸 → 앱 캘린더 그 날, 내 일정 막대 → 일정 팝오버
    static func calendar(_ day: String) -> URL { URL(string: "sprout://calendar/\(day)") ?? today }
    static func event(_ id: String) -> URL { URL(string: "sprout://event/\(id)") ?? today }
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
            WLink(Links.today) {
                HStack(spacing: 6) {
                    Text("오늘").font(.system(size: 15, weight: .bold)).foregroundStyle(pal.accent).widgetAccentable()
                    Text("\(count)").font(.system(size: 15)).foregroundStyle(pal.accent.opacity(0.55)).contentTransition(.numericText())
                }
            }
            Spacer(minLength: 4)
            if plus {
                WLink(Links.quickAdd) {
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
    var mono = false
    var body: some View {
        ZStack {
            if done && mono {
                // §16: 단색에서는 면을 칠하면 체크 표시가 면에 묻힌다 → 테두리 + 체크
                RoundedRectangle(cornerRadius: 3).strokeBorder(color.opacity(0.5), lineWidth: 1.5)
                Image(systemName: "checkmark").font(.system(size: 8, weight: .heavy)).foregroundStyle(color)
            } else if done {
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
                CheckBox(color: pal.priority(task.priority), done: pending, mono: pal.mono).frame(width: 18, height: 20).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            WLink(Links.task(task.id)) {
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
        WLink(Links.today) {
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
                MessageView(text: "꿈틀을 열면 오늘 목록으로 바뀌어요", pal: pal)
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
                if footer { Text("꿈틀을 열면 반영돼요").font(.system(size: 11)).foregroundStyle(pal.tertiary) }
            }
        }
    }
}

// MARK: 캐릭터(§3.3 · §3.5)
struct CharacterArtView: View {
    let growth: Snapshot.Growth
    let size: CGFloat
    var mono = false
    var body: some View {
        if let url = Store.imageURL(growth.art), let img = NSImage(contentsOf: url) {
            if mono, let line = LineArt.make(img) {
                // §16.3 흐림·강조: 원본은 시스템이 알파만 남겨 흰 덩어리가 된다 → 윤곽·이목구비를 알파로 옮긴 선화
                Image(nsImage: line).resizable().interpolation(.high).frame(width: size, height: size)
            } else {
                Image(nsImage: img).resizable().interpolation(.high).frame(width: size, height: size)
            }
        } else {
            // 그림을 아직 못 구웠거나 갤러리 미리보기: 단색 실루엣(단색 모드는 선)
            ZStack {
                if growth.hasCharacter {
                    if mono {
                        Circle().fill(Palette.white(0.18)).overlay(Circle().strokeBorder(Color.white, lineWidth: 1.5))
                            .frame(width: size * 0.62, height: size * 0.58).offset(y: size * 0.08)
                        Capsule().fill(Color.white).frame(width: size * 0.05, height: size * 0.16).offset(y: -size * 0.28)
                    } else {
                        Circle().fill(Color(hex: "#F2C9A0")).frame(width: size * 0.62, height: size * 0.58).offset(y: size * 0.08)
                        Capsule().fill(Color(hex: "#5DBB63")).frame(width: size * 0.05, height: size * 0.16).offset(y: -size * 0.28)
                    }
                } else if mono {
                    EggShape().fill(Palette.white(0.18)).overlay(EggShape().stroke(Color.white, lineWidth: 1.5))
                        .frame(width: size * 0.5, height: size * 0.66)
                } else {
                    EggShape().fill(Color(hex: "#F3EBDD")).frame(width: size * 0.5, height: size * 0.66)
                }
            }
            .frame(width: size, height: size)
        }
    }
}

/// §16.3 캐릭터 선화: 흐림(vibrant)·강조(accented)에서 시스템은 색을 지우고 알파(또는 밝기)만 남긴다.
/// 그래서 그림의 정보를 "흰색 + 알파"로 옮긴다 — 윤곽선(알파·밝기 경계)과 어두운 이목구비는 불투명, 몸 면은 옅게.
enum LineArt {
    static func make(_ src: NSImage) -> NSImage? {
        guard let cg = src.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let w = cg.width, h = cg.height
        guard w > 2, h > 2, w * h <= 1024 * 1024 else { return nil }
        let cs = CGColorSpaceCreateDeviceRGB()
        var px = [UInt8](repeating: 0, count: w * h * 4)
        let info = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: info) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        var alpha = [Float](repeating: 0, count: w * h)
        var lum = [Float](repeating: 1, count: w * h)  // 알파를 곱한 밝기 + 투명은 1(흰 바탕처럼) — 경계 검출용
        var rawLum = [Float](repeating: 1, count: w * h)
        for i in 0..<(w * h) {
            let a = Float(px[i * 4 + 3]) / 255
            alpha[i] = a
            if a > 0.01 {
                let r = Float(px[i * 4]) / 255 / a, g = Float(px[i * 4 + 1]) / 255 / a, b = Float(px[i * 4 + 2]) / 255 / a
                let l = min(1, 0.299 * r + 0.587 * g + 0.114 * b)
                rawLum[i] = l
                lum[i] = l * a + (1 - a)
            }
        }
        func sobel(_ f: [Float], _ x: Int, _ y: Int) -> Float {
            func v(_ dx: Int, _ dy: Int) -> Float { f[min(h - 1, max(0, y + dy)) * w + min(w - 1, max(0, x + dx))] }
            let gx = (v(1, -1) + 2 * v(1, 0) + v(1, 1)) - (v(-1, -1) + 2 * v(-1, 0) + v(-1, 1))
            let gy = (v(-1, 1) + 2 * v(0, 1) + v(1, 1)) - (v(-1, -1) + 2 * v(0, -1) + v(1, -1))
            return (gx * gx + gy * gy).squareRoot()
        }
        var edge = [Float](repeating: 0, count: w * h)
        for y in 0..<h { for x in 0..<w {
            let e = max(sobel(alpha, x, y) * 0.9, sobel(lum, x, y) * 2.2)
            edge[y * w + x] = min(1, max(0, (e - 0.12) * 1.6))
        } }
        // 선을 1px 두껍게(작게 줄여 그려도 보이게)
        var out = [UInt8](repeating: 0, count: w * h * 4)
        for y in 0..<h { for x in 0..<w {
            var e: Float = 0
            for dy in -1...1 { for dx in -1...1 {
                let xx = min(w - 1, max(0, x + dx)), yy = min(h - 1, max(0, y + dy))
                e = max(e, edge[yy * w + xx])
            } }
            let i = y * w + x
            let dark = min(1, max(0, (0.5 - rawLum[i]) / 0.25)) * alpha[i] // 눈·입 같은 어두운 부분
            let a = min(1, max(e, dark, alpha[i] * 0.2))
            let v = UInt8(a * 255)
            out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = v // 흰색(미리 곱한 알파)
        } }
        guard let octx = CGContext(data: &out, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: info),
              let line = octx.makeImage() else { return nil }
        return NSImage(cgImage: line, size: src.size)
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
            HStack { Spacer(); CharacterArtView(growth: growth, size: artSize, mono: pal.mono); Spacer() }
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
