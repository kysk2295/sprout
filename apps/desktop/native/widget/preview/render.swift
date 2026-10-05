// 25 위젯 미리보기 PNG — 위젯 확장의 화면 코드를 그대로 묶어 SwiftUI ImageRenderer로 그린다(바탕화면에 설치하지 않고 확인).
// 사용: sh native/widget/preview/render.sh [예시 JSON] [출력 폴더]
//
// 렌더링 모드(§16):
//   full      = .fullColor, 위젯 바탕 있음(바탕화면을 만지는 중)
//   vibrant   = .vibrant 흉내 — 바탕을 걷어내고(containerBackground 제거), 그림을 흑백으로 바꾼 뒤 밝기×알파를 불투명도로 써서
//               흰색으로 바탕화면 위에 얹는다(Apple: "desaturates … into monochrome")
//   accented  = .accented 흉내 — 바탕을 걷어내고, 색은 버리고 알파만 남겨(템플릿 이미지처럼) 한 색으로 칠한다
//               (Apple: "treats the widget's views as if they were template images … preserving the view's alpha channel").
//               실제로는 widgetAccentable 묶음만 강조색이지만, 여기서는 두 묶음을 구분하지 않고 한 색으로 칠한다
//   before-*  = 고치기 전 팔레트(색 그대로)를 같은 흉내에 넣은 것 — 사용자 스크린숏(빈 막대·흰 덩어리)과 비교용
// 진짜 시스템 효과(배경 흐림·vibrancy 합성)는 재현하지 못한다. 최종 확인은 실제 바탕화면에서.
import AppKit
import SwiftUI
import WidgetKit

enum Sim: String { case full, vibrant, accented }

@main
struct RenderPreviews {
    @MainActor static func main() {
        let args = CommandLine.arguments
        let input = args.count > 1 ? args[1] : "fixtures/snapshot.calendar.json"
        let outDir = URL(fileURLWithPath: args.count > 2 ? args[2] : "preview/out", isDirectory: true)
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        guard var json = FileManager.default.contents(atPath: input) else {
            FileHandle.standardError.write("예시 파일을 읽지 못함: \(input)\n".data(using: .utf8)!); exit(1)
        }
        // 캐릭터 그림: SPROUT_PREVIEW_ART(임시 폴더 안 상대 경로)가 있으면 그것으로 바꿔 그린다
        if let art = ProcessInfo.processInfo.environment["SPROUT_PREVIEW_ART"],
           var obj = try? JSONSerialization.jsonObject(with: json) as? [String: Any], var g = obj["growth"] as? [String: Any] {
            g["art"] = art; obj["growth"] = g
            json = (try? JSONSerialization.data(withJSONObject: obj)) ?? json
        }
        guard let snap = try? JSONDecoder().decode(Snapshot.self, from: json) else {
            FileHandle.standardError.write("예시 파일을 해석하지 못함: \(input)\n".data(using: .utf8)!); exit(1)
        }
        let today = snap.day ?? Store.localDay(Date())
        let entry = SproutEntry(date: Date(), data: .ready(snap), pending: [:])
        // macOS 14 위젯 크기(§3 [임시])
        let S = CGSize(width: 170, height: 170), M = CGSize(width: 364, height: 170), L = CGSize(width: 364, height: 382)
        let widgets: [(String, CGSize, (Palette) -> AnyView)] = [
            ("month-large", L, { AnyView(MonthContent(data: .ready(snap), today: today, weekOnly: false, pal: $0)) }),
            ("month-medium", M, { AnyView(MonthContent(data: .ready(snap), today: today, weekOnly: true, pal: $0)) }),
            ("character-small", S, { AnyView(CharacterContent(entry: entry, family: .systemSmall, pal: $0)) }),
            ("character-medium", M, { AnyView(CharacterContent(entry: entry, family: .systemMedium, pal: $0)) }),
            ("today-small", S, { AnyView(TodayContent(entry: entry, family: .systemSmall, pal: $0)) }),
            ("today-medium", M, { AnyView(TodayContent(entry: entry, family: .systemMedium, pal: $0)) }),
            ("today-large", L, { AnyView(TodayContent(entry: entry, family: .systemLarge, pal: $0)) }),
        ]
        // (파일 이름 접미사, 흉내, 그릴 때 쓰는 렌더링 모드)
        let variants: [(String, Sim, WidgetRenderingMode)] = [
            ("", .full, .fullColor),
            ("-vibrant", .vibrant, .vibrant),
            ("-accented", .accented, .accented),
            ("-before-vibrant", .vibrant, .fullColor), // 고치기 전: 모드를 무시하고 색 팔레트로 그림
        ]
        let accentTint = NSColor(red: 0.62, green: 0.74, blue: 1, alpha: 1)
        for (name, size, make) in widgets {
            for scheme in [ColorScheme.light, .dark] {
                for (suffix, sim, mode) in variants {
                    if suffix == "-before-vibrant" && !(name == "month-large" || name == "character-small") { continue }
                    let pal = Palette(scheme, snap.theme, mode)
                    let body = make(pal)
                        .padding(14)
                        .frame(width: size.width, height: size.height)
                        .environment(\.colorScheme, scheme)
                        .environment(\.widgetRenderingMode, mode)
                    // 위젯 판(바탕 포함 또는 걷어냄)만 먼저 그린다
                    let card = Group {
                        if sim == .full {
                            body.background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(pal.bg))
                                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        } else {
                            body
                        }
                    }
                    let r = ImageRenderer(content: card)
                    r.scale = 2
                    guard let cg = r.cgImage else { continue }
                    let fg: CGImage? = sim == .full ? cg : simulate(cg, sim: sim, tint: sim == .accented ? accentTint : .white)
                    guard let fg else { continue }
                    let file = outDir.appendingPathComponent("\(name)-\(scheme == .dark ? "dark" : "light")\(suffix).png")
                    writeOnDesktop(fg, dark: scheme == .dark, to: file)
                    print(file.path)
                }
            }
        }
    }

    /// 흉내: vibrant = 흑백 밝기×알파 → 불투명도, accented = 알파만(템플릿). 결과는 tint 색 + 알파.
    static func simulate(_ src: CGImage, sim: Sim, tint: NSColor) -> CGImage? {
        let w = src.width, h = src.height
        var px = [UInt8](repeating: 0, count: w * h * 4)
        let cs = CGColorSpaceCreateDeviceRGB(), info = CGImageAlphaInfo.premultipliedLast.rawValue
        guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: cs, bitmapInfo: info) else { return nil }
        ctx.draw(src, in: CGRect(x: 0, y: 0, width: w, height: h))
        let t = tint.usingColorSpace(.deviceRGB) ?? .white
        for i in 0..<(w * h) {
            let a = Double(px[i * 4 + 3]) / 255
            var o = a
            if sim == .vibrant, a > 0 {
                let r = Double(px[i * 4]) / 255 / a, g = Double(px[i * 4 + 1]) / 255 / a, b = Double(px[i * 4 + 2]) / 255 / a
                o = a * min(1, 0.299 * r + 0.587 * g + 0.114 * b)
            }
            o *= 0.92
            px[i * 4] = UInt8(t.redComponent * o * 255); px[i * 4 + 1] = UInt8(t.greenComponent * o * 255)
            px[i * 4 + 2] = UInt8(t.blueComponent * o * 255); px[i * 4 + 3] = UInt8(o * 255)
        }
        return ctx.makeImage()
    }

    /// 바탕화면(그라데이션) 위에 얹어 PNG로 저장
    static func writeOnDesktop(_ fg: CGImage, dark: Bool, to file: URL) {
        let pad = 24, w = fg.width + pad * 2, h = fg.height + pad * 2
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
        let top = dark ? NSColor(red: 0.16, green: 0.20, blue: 0.30, alpha: 1) : NSColor(red: 0.55, green: 0.66, blue: 0.80, alpha: 1)
        let bottom = dark ? NSColor(red: 0.10, green: 0.11, blue: 0.16, alpha: 1) : NSColor(red: 0.42, green: 0.52, blue: 0.62, alpha: 1)
        if let grad = CGGradient(colorsSpace: cs, colors: [top.cgColor, bottom.cgColor] as CFArray, locations: [0, 1]) {
            ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: h), end: CGPoint(x: w, y: 0), options: [])
        }
        ctx.draw(fg, in: CGRect(x: pad, y: pad, width: fg.width, height: fg.height))
        guard let out = ctx.makeImage() else { return }
        let rep = NSBitmapImageRep(cgImage: out)
        try? rep.representation(using: .png, properties: [:])?.write(to: file)
    }
}
