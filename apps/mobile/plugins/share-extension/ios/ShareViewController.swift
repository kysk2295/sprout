// 24 공유 확장 입구 — 다른 앱이 넘긴 글·링크를 꺼내 SwiftUI 카드(ShareView)를 띄운다.
// 메모리 한도(약 120MB) 때문에 RN이 아니라 작은 네이티브 화면이다(M-S2).
import SwiftUI
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private let model = ShareModel()

  // 시스템 시트 대신 원래 앱 위에 반투명 덮개 + 아래 카드(시안 C1)
  override init(nibName: String?, bundle: Bundle?) {
    super.init(nibName: nibName, bundle: bundle)
    modalPresentationStyle = .overFullScreen
  }
  required init?(coder: NSCoder) {
    super.init(coder: coder)
    modalPresentationStyle = .overFullScreen
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    model.close = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
    model.cancel = { [weak self] in
      self?.extensionContext?.cancelRequest(withError: NSError(domain: "sprout.share", code: NSUserCancelledError))
    }
    model.openApp = { [weak self] in self?.openContainingApp() }
    model.access = ShareAccess.load()

    let host = UIHostingController(rootView: ShareView(model: model))
    host.view.backgroundColor = .clear
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)

    loadShared()
  }

  /** 글(public.plain-text)·링크(public.url)를 모은다. 사파리처럼 링크만 주면 제목(있으면) + 주소 */
  private func loadShared() {
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    var texts: [String] = []
    var urls: [String] = []
    var title: String?
    let group = DispatchGroup()
    let lock = NSLock()
    for item in items {
      if let t = item.attributedTitle?.string, !t.isEmpty { title = title ?? t }
      if let t = item.attributedContentText?.string, !t.isEmpty { title = title ?? t }
      for p in item.attachments ?? [] {
        if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          group.enter()
          p.loadItem(forTypeIdentifier: UTType.url.identifier) { obj, _ in
            if let u = obj as? URL, !u.isFileURL { lock.lock(); urls.append(u.absoluteString); lock.unlock() }
            else if let s = obj as? String, s.hasPrefix("http") { lock.lock(); urls.append(s); lock.unlock() }
            group.leave()
          }
        } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          group.enter()
          p.loadItem(forTypeIdentifier: UTType.plainText.identifier) { obj, _ in
            var s: String?
            if let str = obj as? String { s = str } else if let d = obj as? Data { s = String(data: d, encoding: .utf8) }
            if let s, !s.isEmpty { lock.lock(); texts.append(s); lock.unlock() }
            group.leave()
          }
        }
      }
    }
    group.notify(queue: .main) { [weak self] in
      guard let self else { return }
      var parts = texts.map { ShareLink.jsTrim($0) }.filter { !$0.isEmpty }
      let joined = parts.joined(separator: "\n")
      for u in urls where !joined.contains(u) { parts.append(u) }
      // 링크만 왔고 제목이 따로 있으면 `<제목>\n<주소>`(24 §3)
      if texts.isEmpty, let t = title, !urls.isEmpty, !urls.contains(t) { parts.insert(ShareLink.jsTrim(t), at: 0) }
      self.model.linkTitle = texts.isEmpty ? title : nil
      self.model.shared = parts.joined(separator: "\n")
    }
  }

  /** [sprout 열기]: 확장에서 본 앱을 여는 공식 길이 없어 응답자 사슬에서 UIApplication을 찾아 연다(안 되면 그냥 닫힘) */
  private func openContainingApp() {
    guard let url = URL(string: "sprout://") else { return }
    var r: UIResponder? = self
    let sel = NSSelectorFromString("openURL:options:completionHandler:")
    while let cur = r {
      if cur.isKind(of: UIApplication.self), cur.responds(to: sel), let m = cur.method(for: sel) {
        typealias Fn = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
        unsafeBitCast(m, to: Fn.self)(cur, sel, url as NSURL, NSDictionary(), nil)
        break
      }
      r = cur.next
    }
    extensionContext?.completeRequest(returningItems: nil)
  }
}
