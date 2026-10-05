// 25 §15 위젯 미리보기 PNG — 위젯 확장의 화면 코드를 그대로 묶어 SwiftUI ImageRenderer로 그린다(바탕화면에 설치하지 않고 확인).
// 사용: sh native/widget/preview/render.sh [예시 JSON] [출력 폴더]
import AppKit
import SwiftUI

@main
struct RenderPreviews {
    @MainActor static func main() {
        let args = CommandLine.arguments
        let input = args.count > 1 ? args[1] : "fixtures/snapshot.calendar.json"
        let outDir = URL(fileURLWithPath: args.count > 2 ? args[2] : "preview/out", isDirectory: true)
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        guard let data = FileManager.default.contents(atPath: input), let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else {
            FileHandle.standardError.write("예시 파일을 읽지 못함: \(input)\n".data(using: .utf8)!); exit(1)
        }
        let today = snap.day ?? Store.localDay(Date())
        // macOS 14 위젯 크기(§3 [임시]) · 기본 여백
        let sizes: [(String, CGSize, Bool)] = [("large", CGSize(width: 364, height: 382), false), ("medium", CGSize(width: 364, height: 170), true)]
        for (name, size, weekOnly) in sizes {
            for scheme in [ColorScheme.light, .dark] {
                let pal = Palette(scheme, snap.theme)
                let view = MonthContent(data: .ready(snap), today: today, weekOnly: weekOnly, pal: pal)
                    .padding(14)
                    .frame(width: size.width, height: size.height)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(pal.bg))
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .padding(12)
                    .background(Color(white: scheme == .dark ? 0.32 : 0.78))
                    .environment(\.colorScheme, scheme)
                let r = ImageRenderer(content: view)
                r.scale = 2
                guard let img = r.nsImage, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { continue }
                let file = outDir.appendingPathComponent("month-\(name)-\(scheme == .dark ? "dark" : "light").png")
                try? png.write(to: file)
                print(file.path)
            }
        }
    }
}
