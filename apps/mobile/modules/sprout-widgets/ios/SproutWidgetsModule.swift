// 36 모바일 위젯 §7.1 (iOS): 앱 JS → App Group 저장 칸(group.app.sprout.mobile/widget/) 쓰기·읽기 + WidgetKit 새로 고침.
// 위젯 확장(plugins/widgets/ios)은 같은 칸의 snapshot.json·art/*.png를 읽고, 체크는 actions/*.json으로 남긴다(25 §8.5와 같은 파일).
import ExpoModulesCore
import Foundation
import WidgetKit

public class SproutWidgetsModule: Module {
  private var group = "group.app.sprout.mobile"

  private var root: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("widget", isDirectory: true)
  }

  /// tmp에 쓰고 바꿔치기 — 위젯이 반쯤 쓴 파일을 읽지 않게
  private func atomicWrite(_ data: Data, to url: URL) throws {
    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
  }

  private func safe(_ rel: String) -> URL? {
    guard !rel.contains(".."), !rel.hasPrefix("/"), let root else { return nil }
    return root.appendingPathComponent(rel)
  }

  public func definition() -> ModuleDefinition {
    Name("SproutWidgets")

    /// App Group 이름(app.json extra.share.appGroup — 공유 확장과 같은 칸)
    Function("configure") { (appGroup: String) in
      if !appGroup.isEmpty { self.group = appGroup }
    }

    /// 저장 칸을 쓸 수 있나(App Group 권한이 서명에 들어갔나)
    Function("isAvailable") { () -> Bool in
      self.root != nil
    }

    /// snapshot.json 쓰기 → reload가 참이면 모든 위젯 시간표 새로 고침
    AsyncFunction("setSnapshot") { (json: String, reload: Bool) -> Bool in
      guard let root = self.root else { return false }
      try self.atomicWrite(Data(json.utf8), to: root.appendingPathComponent("snapshot.json"))
      if reload { WidgetCenter.shared.reloadAllTimelines() }
      return true
    }

    AsyncFunction("reload") {
      WidgetCenter.shared.reloadAllTimelines()
    }

    /// 캐릭터 그림(PNG base64) — art/<이름>.png
    AsyncFunction("writeArt") { (rel: String, base64: String) -> Bool in
      guard let url = self.safe(rel), let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else { return false }
      try self.atomicWrite(data, to: url)
      return true
    }

    Function("hasArt") { (rel: String) -> Bool in
      guard let url = self.safe(rel) else { return false }
      return FileManager.default.fileExists(atPath: url.path)
    }

    /// 대기열 파일 내용(위젯 체크). 지우기는 반영 뒤 removeActions
    AsyncFunction("readActions") { () -> [[String: String]] in
      guard let dir = self.root?.appendingPathComponent("actions", isDirectory: true),
            let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return [] }
      return files.filter { $0.pathExtension == "json" }.compactMap { f in
        guard let text = try? String(contentsOf: f, encoding: .utf8) else { return nil }
        return ["name": f.lastPathComponent, "raw": text]
      }
    }

    AsyncFunction("removeActions") { (names: [String]) in
      guard let dir = self.root?.appendingPathComponent("actions", isDirectory: true) else { return }
      for n in names where !n.contains("/") && !n.contains("..") {
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(n))
      }
    }

    /// 로그아웃(25 §8.8): 그림·대기열·달 넘김 지움(snapshot.json은 JS가 로그아웃 형태로 다시 쓴다)
    AsyncFunction("clearData") {
      guard let root = self.root else { return }
      for sub in ["art", "actions", "nav.json"] { try? FileManager.default.removeItem(at: root.appendingPathComponent(sub)) }
      WidgetCenter.shared.reloadAllTimelines()
    }

    // Android 위젯 체크 신호와 같은 이름(iOS는 앱이 앞으로 올 때 readActions로 읽는다 — 확장이 앱을 깨울 수 없다)
    Events("onAction")
  }
}
