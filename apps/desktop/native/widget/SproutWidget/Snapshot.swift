// 25 §8.3 데이터 계약 v1 (앱 → 위젯). TS 쪽: apps/desktop/src/main/widgetSnapshot.ts
// 두 쪽이 같은 예시 파일 fixtures/snapshot.v1.json을 읽는다.
import Foundation

struct Snapshot: Codable {
    struct Account: Codable { let signedIn: Bool }
    struct Prefs: Codable { let clock24h: Bool }
    struct Theme: Codable { let accentLight: String; let accentDark: String }
    struct Task: Codable, Identifiable, Hashable {
        let id: String
        let title: String
        let priority: Int
        let depth: Int
        let label: String?
        let labelTone: String // "accent" | "danger"
        let overdueAt: String?
        let `repeat`: Bool
    }
    struct Today: Codable { let count: Int; let tasks: [Task] }
    struct Growth: Codable {
        let hasCharacter: Bool
        let name: String?
        let species: String?
        let level: Int
        let stage: Int
        let stageName: String
        let xpInto: Int
        let xpToNext: Int
        let todayTaskXp: Int
        let todayTaskXpCap: Int
        let mood: String
        let art: String
    }
    /// 25 §15.5 월 캘린더 위젯 — 이번 달 격자(일요일 시작, 35 또는 42칸)
    struct CalItem: Codable, Hashable {
        let id: String?     // task·event만(ext는 null → 날짜 링크)
        let kind: String    // "task" | "event" | "ext"
        let title: String
        let color: String?  // null = 테마 강조색
        let done: Bool
        let allDay: Bool
        let `repeat`: Bool
    }
    struct CalDay: Codable, Hashable {
        let d: String       // YYYY-MM-DD
        let other: Bool?    // 다른 달 칸
        let holiday: String?
        let count: Int      // 그 날 전체 항목 수(items는 최대 6개)
        let items: [CalItem]
    }
    struct CalMonth: Codable {
        let month: String   // YYYY-MM
        let title: String   // "10월"
        let days: [CalDay]
    }
    let schema: Int
    let generatedAt: String
    let day: String?
    let account: Account
    let prefs: Prefs?
    let theme: Theme?
    let today: Today?
    let growth: Growth?
    let calendar: CalMonth?
    let appliedActions: [String]?
}

/// 위젯 확장에서 본 저장 파일 상태(§4)
enum WidgetData {
    case first          // 파일 없음(앱을 한 번도 안 열었음)
    case signedOut
    case failed         // 못 읽음 · 모르는 schema
    case ready(Snapshot)
}

/// 대기열(위젯 → 앱, §8.5)의 한 항목
struct PendingAction: Codable {
    let schema: Int
    let id: String
    let kind: String // "complete" | "uncomplete"
    let taskId: String
    let at: String
    let day: String
}

enum Store {
    /// App Group 이름 = 팀 ID + 앱 번들 ID. 같은 값: src/main/widget.ts WIDGET_GROUP_ID, build/entitlements.mac.plist
    static let groupID = "BU697KN34B.app.sprout.desktop"

    static var root: URL? {
        #if WIDGET_RENDER
        // 미리보기 렌더러(preview/render.sh): App Group 대신 임시 폴더
        if let p = ProcessInfo.processInfo.environment["SPROUT_WIDGET_ROOT"] { return URL(fileURLWithPath: p, isDirectory: true) }
        #endif
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID)?
            .appendingPathComponent("widget", isDirectory: true)
    }
    static var actionsDir: URL? { root?.appendingPathComponent("actions", isDirectory: true) }

    static func load() -> WidgetData {
        guard let file = root?.appendingPathComponent("snapshot.json") else { return .failed }
        guard let data = try? Data(contentsOf: file) else {
            return FileManager.default.fileExists(atPath: file.path) ? .failed : .first
        }
        struct Head: Decodable { let schema: Int }
        guard let head = try? JSONDecoder().decode(Head.self, from: data), head.schema == 1 else { return .failed }
        guard let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return .failed }
        return snap.account.signedIn ? .ready(snap) : .signedOut
    }

    /// 아직 앱이 반영하지 않은 체크(taskId → 항목). 파일이 남아 있으면 "반영 대기"(§4)
    static func pending() -> [String: PendingAction] {
        guard let dir = actionsDir,
              let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return [:] }
        var out: [String: PendingAction] = [:]
        for f in files where f.pathExtension == "json" {
            guard let data = try? Data(contentsOf: f), let a = try? JSONDecoder().decode(PendingAction.self, from: data), a.kind == "complete" else { continue }
            out[a.taskId] = a
        }
        return out
    }

    /// 체크박스 누름: 반영 대기 중이면 대기를 지우고(완료 취소), 아니면 완료 항목을 쓴다
    static func toggle(taskId: String) {
        guard let dir = actionsDir else { return }
        let fm = FileManager.default
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        if let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) {
            var removed = false
            for f in files where f.pathExtension == "json" {
                if let data = try? Data(contentsOf: f), let a = try? JSONDecoder().decode(PendingAction.self, from: data), a.taskId == taskId, a.kind == "complete" {
                    try? fm.removeItem(at: f)
                    removed = true
                }
            }
            if removed { return }
        }
        write(kind: "complete", taskId: taskId, into: dir)
    }

    static func write(kind: String, taskId: String, into dir: URL) {
        let now = Date()
        let id = "\(Int(now.timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(8))"
        let iso = ISO8601DateFormatter()
        let day = DateFormatter()
        day.calendar = Calendar(identifier: .gregorian)
        day.locale = Locale(identifier: "en_US_POSIX")
        day.dateFormat = "yyyy-MM-dd"
        let action = PendingAction(schema: 1, id: id, kind: kind, taskId: taskId, at: iso.string(from: now), day: day.string(from: now))
        guard let data = try? JSONEncoder().encode(action) else { return }
        // .tmp에 쓰고 이름 바꾸기 — 앱이 반쯤 쓴 파일을 읽지 않게
        let tmp = dir.appendingPathComponent("\(id).tmp")
        let dest = dir.appendingPathComponent("\(id).json")
        do {
            try data.write(to: tmp)
            try FileManager.default.moveItem(at: tmp, to: dest)
        } catch {
            try? FileManager.default.removeItem(at: tmp)
        }
    }

    static func imageURL(_ rel: String) -> URL? {
        guard !rel.contains(".."), let root else { return nil }
        return root.appendingPathComponent(rel)
    }

    /// "YYYY-MM-DD" (로컬)
    static func localDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
