// 36 §7.2 데이터 계약 schema 1 (앱 → 위젯). TS 쪽: packages/schema/src/widget.ts, 앱 조립: apps/mobile/src/widgets/snapshot.ts
// 맥 위젯(apps/desktop/native/widget/SproutWidget/Snapshot.swift)과 같은 필드 + calendar.
import Foundation

struct Snapshot: Codable {
    struct Account: Codable { let signedIn: Bool }
    struct Theme: Codable { let accentLight: String; let accentDark: String }
    struct Task: Codable, Identifiable, Hashable {
        let id: String
        let title: String
        let priority: Int
        let depth: Int
        let label: String?
        let labelTone: String // "accent" | "danger"
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
    struct CalItem: Codable, Hashable {
        let id: String
        let kind: String // "task" | "event"
        let title: String
        let color: String?
        let faded: Bool
    }
    struct CalDay: Codable, Hashable {
        let date: String
        let n: Int
        let inMonth: Bool
        let today: Bool
        let tone: String? // "sun" | "sat" | "holiday"
        let holiday: String?
        let total: Int
        let items: [CalItem]
    }
    struct Month: Codable { let month: String; let title: String; let weeks: [[CalDay]] }
    struct Calendar: Codable { let weekStart: Int; let weekHead: [String]; let current: Int; let months: [Month] }

    let schema: Int
    let generatedAt: String
    let day: String?
    let account: Account
    let theme: Theme?
    let today: Today?
    let growth: Growth?
    let calendar: Calendar?
}

/// 위젯이 본 저장 파일 상태(25 §4)
enum WidgetData {
    case first
    case signedOut
    case failed
    case ready(Snapshot)
}

struct PendingAction: Codable {
    let schema: Int
    let id: String
    let kind: String
    let taskId: String
    let at: String
    let day: String
}

enum Store {
    /// App Group 이름 — Info.plist SproutAppGroup(플러그인이 넣음). 없으면 기본값
    static let groupID: String = (Bundle.main.object(forInfoDictionaryKey: "SproutAppGroup") as? String).flatMap { $0.hasPrefix("group.") ? $0 : nil } ?? "group.app.sprout.mobile"

    static var root: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID)?.appendingPathComponent("widget", isDirectory: true)
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

    static func pending() -> [String: PendingAction] {
        guard let dir = actionsDir, let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return [:] }
        var out: [String: PendingAction] = [:]
        for f in files where f.pathExtension == "json" {
            guard let data = try? Data(contentsOf: f), let a = try? JSONDecoder().decode(PendingAction.self, from: data), a.kind == "complete" else { continue }
            out[a.taskId] = a
        }
        return out
    }

    /// 체크박스: 반영 대기 중이면 대기를 지우고(완료 취소), 아니면 완료 항목을 쓴다(25 §8.5)
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
        let now = Date()
        let id = "\(Int(now.timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(8))"
        let action = PendingAction(schema: 1, id: id, kind: "complete", taskId: taskId, at: ISO8601DateFormatter().string(from: now), day: localDay(now))
        guard let data = try? JSONEncoder().encode(action) else { return }
        let tmp = dir.appendingPathComponent("\(id).tmp")
        do {
            try data.write(to: tmp)
            try fm.moveItem(at: tmp, to: dir.appendingPathComponent("\(id).json"))
        } catch {
            try? fm.removeItem(at: tmp)
        }
    }

    // ── 월 위젯 달 넘김(36 §7.4): nav.json { "offset": n } — 이번 달 기준 몇 달 ──
    static func monthOffset() -> Int {
        guard let url = root?.appendingPathComponent("nav.json"), let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let n = obj["offset"] as? Int else { return 0 }
        return n
    }
    static func setMonthOffset(_ n: Int) {
        guard let root else { return }
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if let data = try? JSONSerialization.data(withJSONObject: ["offset": n]) {
            try? data.write(to: root.appendingPathComponent("nav.json"), options: .atomic)
        }
    }

    static func imageURL(_ rel: String) -> URL? {
        guard !rel.contains(".."), let root else { return nil }
        return root.appendingPathComponent(rel)
    }

    static func localDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Foundation.Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
