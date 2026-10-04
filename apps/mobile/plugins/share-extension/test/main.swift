// Swift 쪽 링크 판정이 TS(link.ts)와 같은지 — apps/mobile/src/share/vectors.json 예시로 확인
import Foundation

struct Case: Decodable { let text: String; let url: String?; let bare: Bool }
struct Vectors: Decodable { let cases: [Case] }
let path = CommandLine.arguments[1]
let v = try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: URL(fileURLWithPath: path)))
var fails = 0
for c in v.cases {
  let u = ShareLink.firstUrl(c.text), b = ShareLink.isBareLink(c.text)
  if u != c.url || b != c.bare { fails += 1; print("FAIL", c.text.debugDescription, "url:", u ?? "nil", "bare:", b) }
}
// 행 모양
let row = ShareRow.row("https://youtu.be/x", capturedAt: "2026-10-05T01:02:03.000Z")
precondition(row["kind"] as? String == "link" && row["ai_state"] as? String == "done" && row["source"] as? String == "app")
precondition(ShareRow.row("내일 3시 치과", capturedAt: "t")["ai_state"] as? String == "pending")
precondition(ShareRow.row("내일 3시 치과", capturedAt: "t")["url"] is NSNull)
precondition(ShareRow.compose(memo: " 금요일까지 보기 ", shared: "\nhttps://a.com\n") == "금요일까지 보기\nhttps://a.com")
let body = try! JSONSerialization.data(withJSONObject: ShareRow.uploadBody(ShareItem(id: "a", content: "x", captured_at: "t", user_id: nil)))
precondition(String(data: body, encoding: .utf8)!.contains("\"op\":\"PUT\""))
// JWT exp
let payload = Data("{\"sub\":\"u\",\"exp\":\(Int(Date().timeIntervalSince1970) + 600)}".utf8).base64EncodedString().replacingOccurrences(of: "=", with: "")
precondition(ShareAccess(access_token: "h.\(payload).s", user_id: "u", api_url: "x").usable)
print(fails == 0 ? "swift vectors: ok (\(v.cases.count))" : "swift vectors: \(fails) FAIL")
exit(fails == 0 ? 0 : 1)
