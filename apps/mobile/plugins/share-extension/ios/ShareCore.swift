// 24 §5 공유 확장의 데이터 쪽 — UI 없이 시험할 수 있게 따로 둔다(check-vectors.sh가 이 파일만 컴파일).
// 규칙은 apps/mobile/src/share/link.ts·row.ts(= 데스크톱 collect.ts firstUrl·isBareLink·itemRow)와 같다.
// - 확장은 PowerSync를 열지 않는다. 대기열 파일을 먼저 쓰고, 토큰이 살아 있으면 POST /sync/upload로 바로 올린 뒤 파일을 지운다.
// - 리프레시 토큰은 쓰지 않는다(본 앱만). 토큰이 없거나 만료면 대기열에 남겨 본 앱이 다음에 넣는다.
import Foundation
import Security

enum ShareConfig {
  // 플러그인이 Info.plist에 넣는 값(SproutAppGroup·SproutKeychainGroup). 없으면 기본값
  static var appGroup: String { Bundle.main.object(forInfoDictionaryKey: "SproutAppGroup") as? String ?? "group.app.sprout.mobile" }
  static var keychainGroup: String { Bundle.main.object(forInfoDictionaryKey: "SproutKeychainGroup") as? String ?? "BU697KN34B.app.sprout.mobile.shared" }
  static let tokenKey = "sprout.share.access"
  static let queueDir = "share-queue"
}

// ── 링크 판정(link.ts와 같은 정규식 — JS \d는 ASCII뿐이라 [0-9]) ──
enum ShareLink {
  private static let urlRe = try! NSRegularExpression(pattern: "https?://[^\\s<>\"'）)\\]]+", options: [.caseInsensitive])
  private static let trailRe = try! NSRegularExpression(pattern: "[.,!?。]+$")
  private static let taskHint = try! NSRegularExpression(
    pattern: "(까지|해야|내일|오늘|모레|[월화수목금토일]요일|[0-9]{1,2}\\s*시|[0-9]{1,2}/[0-9]{1,2}|[0-9]{1,2}월\\s*[0-9]{1,2}일|요약|제출|예약|신청)")

  static func firstUrl(_ text: String) -> String? {
    let ns = text as NSString
    guard let m = urlRe.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else { return nil }
    let raw = ns.substring(with: m.range)
    return trailRe.stringByReplacingMatches(in: raw, range: NSRange(location: 0, length: (raw as NSString).length), withTemplate: "")
  }

  static func isBareLink(_ text: String) -> Bool {
    guard let url = firstUrl(text) else { return false }
    var rest = text
    if let r = rest.range(of: url) { rest.replaceSubrange(r, with: "") }
    rest = jsTrim(rest)
    let n = (rest as NSString).length
    return n <= 40 && taskHint.firstMatch(in: rest, range: NSRange(location: 0, length: n)) == nil
  }

  static func isYoutube(_ url: String) -> Bool {
    guard let host = URL(string: url)?.host?.lowercased() else { return false }
    return host == "youtube.com" || host.hasSuffix(".youtube.com") || host == "youtu.be" || host.hasSuffix(".youtu.be")
  }
  static func domainOf(_ url: String) -> String {
    guard let host = URL(string: url)?.host else { return url }
    return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
  }
  static func jsTrim(_ s: String) -> String { s.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}"))) }
}

// ── 항목·행 ──
struct ShareItem: Codable {
  var v = 1
  let id: String
  let content: String
  let captured_at: String
  let user_id: String?
}

enum ShareRow {
  static func compose(memo: String, shared: String) -> String {
    [ShareLink.jsTrim(memo), ShareLink.jsTrim(shared)].filter { !$0.isEmpty }.joined(separator: "\n")
  }
  static func nowIso() -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date())
  }
  /** row.ts shareRow와 같은 칸 */
  static func row(_ content: String, capturedAt: String) -> [String: Any] {
    let text = ShareLink.jsTrim(content)
    let bare = ShareLink.isBareLink(text)
    let null = NSNull()
    return [
      "content": text,
      "task_id": null,
      "url": ShareLink.firstUrl(text).map { $0 as Any } ?? null,
      "kind": bare ? "link" : null,
      "kind_source": bare ? "ai" : null,
      "ai_state": bare ? "done" : "pending",
      "source": "app",
      "captured_at": capturedAt,
      "fingerprint": null,
      "created_at": capturedAt,
      "modified_at": capturedAt
    ]
  }
  static func uploadBody(_ item: ShareItem) -> [String: Any] {
    ["batch": [["op": "PUT", "table": "notes", "id": item.id, "data": row(item.content, capturedAt: item.captured_at)]]]
  }
}

// ── 본 앱이 키체인 공유 그룹에 둔 접근 토큰(expo-secure-store 형식: account = 키, service는 "app:no-auth" 등 — 서비스로 거르지 않는다) ──
struct ShareAccess: Decodable {
  let access_token: String
  let user_id: String
  let api_url: String

  static func load() -> ShareAccess? {
    let key = Data(ShareConfig.tokenKey.utf8)
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrGeneric as String: key,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: ShareConfig.keychainGroup,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true
    ]
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return try? JSONDecoder().decode(ShareAccess.self, from: data)
  }

  /** JWT exp(초). 1분 넘게 남았을 때만 쓴다 — 새로 고침은 본 앱만 */
  var usable: Bool {
    guard let exp = ShareAccess.jwtClaim(access_token, "exp") as? Double else { return false }
    return exp - Date().timeIntervalSince1970 > 60
  }
  static func jwtClaim(_ jwt: String, _ name: String) -> Any? {
    let parts = jwt.split(separator: ".")
    guard parts.count == 3 else { return nil }
    var b64 = parts[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while b64.count % 4 != 0 { b64 += "=" }
    guard let data = Data(base64Encoded: b64), let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    return obj[name]
  }
}

// ── 대기열(App Group 폴더 share-queue/<id>.json) ──
enum ShareQueue {
  static func dir() -> URL? {
    guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: ShareConfig.appGroup) else { return nil }
    let d = root.appendingPathComponent(ShareConfig.queueDir, isDirectory: true)
    try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
    return d
  }
  static func write(_ item: ShareItem) throws {
    guard let d = dir() else { throw NSError(domain: "sprout.share", code: 1, userInfo: [NSLocalizedDescriptionKey: "no app group"]) }
    try JSONEncoder().encode(item).write(to: d.appendingPathComponent("\(item.id).json"), options: .atomic)
  }
  static func remove(_ id: String) {
    guard let d = dir() else { return }
    try? FileManager.default.removeItem(at: d.appendingPathComponent("\(id).json"))
  }
}

// ── 저장: 대기열에 먼저 쓰고 → 올릴 수 있으면 올리고 파일 지움 ──
enum ShareSave {
  enum Outcome { case uploaded, queued }

  static func save(content: String, access: ShareAccess?, completion: @escaping (Result<Outcome, Error>) -> Void) {
    let item = ShareItem(id: UUID().uuidString.lowercased(), content: content, captured_at: ShareRow.nowIso(), user_id: access?.user_id)
    var queued = true
    do { try ShareQueue.write(item) } catch { queued = false }
    guard let access, access.usable, let url = URL(string: access.api_url + "/sync/upload"),
          let body = try? JSONSerialization.data(withJSONObject: ShareRow.uploadBody(item)) else {
      return completion(queued ? .success(.queued) : .failure(NSError(domain: "sprout.share", code: 2)))
    }
    var req = URLRequest(url: url, timeoutInterval: 6)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.setValue("Bearer \(access.access_token)", forHTTPHeaderField: "authorization")
    req.httpBody = body
    URLSession.shared.dataTask(with: req) { _, res, _ in
      let ok = (res as? HTTPURLResponse)?.statusCode == 200
      if ok { ShareQueue.remove(item.id) }
      DispatchQueue.main.async {
        if ok { completion(.success(.uploaded)) }
        else { completion(queued ? .success(.queued) : .failure(NSError(domain: "sprout.share", code: 3))) }
      }
    }.resume()
  }
}
