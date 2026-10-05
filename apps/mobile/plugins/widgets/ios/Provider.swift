// 36 §7.5 위젯 시간표 + 갤러리 미리보기(예시 데이터 — 실제 할 일 제목은 갤러리에 보이지 않는다)
import AppIntents
import Foundation
import WidgetKit

struct SproutEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
    let pending: [String: PendingAction]
    var monthOffset = 0
    var placeholder = false

    var stale: Bool {
        if case .ready(let s) = data, let day = s.day { return day != Store.localDay(date) }
        return false
    }
    var pendingTooLong: Bool {
        let f = ISO8601DateFormatter()
        return pending.values.contains { a in
            guard let at = f.date(from: a.at) else { return false }
            return date.timeIntervalSince(at) > 60
        }
    }
}

struct SproutProvider: TimelineProvider {
    func placeholder(in context: Context) -> SproutEntry {
        SproutEntry(date: Date(), data: .ready(Sample.snapshot), pending: [:], placeholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (SproutEntry) -> Void) {
        if context.isPreview {
            completion(SproutEntry(date: Date(), data: .ready(Sample.snapshot), pending: [:]))
        } else {
            completion(SproutEntry(date: Date(), data: Store.load(), pending: Store.pending(), monthOffset: Store.monthOffset()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SproutEntry>) -> Void) {
        let now = Date()
        let data = Store.load()
        let pending = Store.pending()
        let offset = Store.monthOffset()
        var dates: [Date] = [now]
        let f = ISO8601DateFormatter()
        if let oldest = pending.values.compactMap({ f.date(from: $0.at) }).min() {
            let t = oldest.addingTimeInterval(61)
            if t > now { dates.append(t) }
        }
        // 다음 자정 → 오늘 원을 옮기고, 앱이 새로 쓰지 않았으면 "오래된 데이터"
        let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(24 * 60 * 60 + 1)
        dates.append(midnight)
        let entries = Array(Set(dates)).sorted().map { SproutEntry(date: $0, data: data, pending: pending, monthOffset: offset) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: 위젯 버튼(iOS 17 대화형)
/// 25 §8.5 행 체크박스: 앱을 열지 않고 완료(대기열 파일). 다시 누르면 대기 취소
struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "할 일 체크"
    static var description = IntentDescription("꿈틀 위젯에서 할 일을 완료로 표시해요")
    static var isDiscoverable: Bool = false

    @Parameter(title: "할 일 ID")
    var taskId: String

    init() {}
    init(taskId: String) { self.taskId = taskId }

    func perform() async throws -> some IntentResult {
        Store.toggle(taskId: taskId)
        return .result()
    }
}

/// 36 §6 월 위젯 ‹ ›: 위젯 안에서 달 넘김(delta 0 = 이번 달로)
struct ShiftMonthIntent: AppIntent {
    static var title: LocalizedStringResource = "달 넘기기"
    static var description = IntentDescription("꿈틀 월 캘린더 위젯의 달을 바꿔요")
    static var isDiscoverable: Bool = false

    @Parameter(title: "몇 달")
    var delta: Int

    init() {}
    init(delta: Int) { self.delta = delta }

    func perform() async throws -> some IntentResult {
        var lo = -1, hi = 2
        if case .ready(let s) = Store.load(), let cal = s.calendar {
            lo = -cal.current
            hi = cal.months.count - 1 - cal.current
        }
        let next = delta == 0 ? 0 : min(hi, max(lo, Store.monthOffset() + delta))
        Store.setMonthOffset(next)
        return .result()
    }
}

/// 갤러리·Xcode 미리보기용 예시(실제 사용자 데이터 아님)
enum Sample {
    static let json = """
    {"schema":1,"generatedAt":"2026-10-05T09:12:03+09:00","day":"__TODAY__","account":{"signedIn":true},
     "theme":{"accentLight":"#4E75F2","accentDark":"#545DFA"},
     "today":{"count":7,"tasks":[
      {"id":"s1","title":"아침 스트레칭","priority":1,"depth":0,"label":"오전 8:00","labelTone":"accent","repeat":true},
      {"id":"s2","title":"기획서 초안 쓰기","priority":3,"depth":0,"label":"오전 9:30","labelTone":"accent","repeat":false},
      {"id":"s3","title":"자료 조사","priority":0,"depth":1,"label":null,"labelTone":"accent","repeat":false},
      {"id":"s4","title":"독서 30분","priority":0,"depth":0,"label":"오늘","labelTone":"accent","repeat":false},
      {"id":"s5","title":"점심 약속","priority":2,"depth":0,"label":"오후 12:30","labelTone":"accent","repeat":false},
      {"id":"s6","title":"메일 답장","priority":0,"depth":0,"label":"오늘","labelTone":"accent","repeat":false}]},
     "growth":{"hasCharacter":true,"name":"미미","species":"cat","level":4,"stage":2,"stageName":"꼬마","xpInto":40,"xpToNext":100,
      "todayTaskXp":3,"todayTaskXpCap":10,"mood":"happy","art":"__sample__"}}
    """
    static var snapshot: Snapshot {
        let today = Date()
        let text = json.replacingOccurrences(of: "__TODAY__", with: Store.localDay(today))
        let base = try! JSONDecoder().decode(Snapshot.self, from: Data(text.utf8))
        return Snapshot(schema: 1, generatedAt: base.generatedAt, day: base.day, account: base.account, theme: base.theme, today: base.today, growth: base.growth, calendar: sampleCalendar(today))
    }

    /// 이번 달 칸 + 예시 막대 몇 개(월요일 시작)
    static func sampleCalendar(_ today: Date) -> Snapshot.Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        let comps = cal.dateComponents([.year, .month], from: today)
        let first = cal.date(from: comps)!
        let lead = (cal.component(.weekday, from: first) + 5) % 7
        let start = cal.date(byAdding: .day, value: -lead, to: first)!
        let daysInMonth = cal.range(of: .day, in: .month, for: first)!.count
        let weeks = Int(ceil(Double(lead + daysInMonth) / 7))
        let titles = ["팀 회의", "운동", "기획서", "점심 약속", "독서", "치과", "장보기"]
        let colors = ["#4E75F2", "#2BAE66", "#E9A23B", "#C4286A", "#775DBE"]
        let todayKey = Store.localDay(today)
        var rows: [[Snapshot.CalDay]] = []
        for w in 0..<weeks {
            var row: [Snapshot.CalDay] = []
            for d in 0..<7 {
                let date = cal.date(byAdding: .day, value: w * 7 + d, to: start)!
                let key = Store.localDay(date)
                let n = cal.component(.day, from: date)
                let inMonth = cal.component(.month, from: date) == comps.month
                let count = inMonth ? (n * 7 % 5 == 0 ? 0 : n % 4) : 0
                let items = (0..<count).map { i in Snapshot.CalItem(id: "s\(n)-\(i)", kind: i == 2 ? "event" : "task", title: titles[(n + i) % titles.count], color: colors[(n + i) % colors.count], faded: key < todayKey) }
                row.append(Snapshot.CalDay(date: key, n: n, inMonth: inMonth, today: key == todayKey, tone: d == 6 ? "sun" : d == 5 ? "sat" : nil, holiday: nil, total: count, items: items))
            }
            rows.append(row)
        }
        let m = comps.month!
        return Snapshot.Calendar(weekStart: 1, weekHead: ["월", "화", "수", "목", "금", "토", "일"], current: 0, months: [Snapshot.Month(month: String(format: "%04d-%02d", comps.year!, m), title: "\(m)월", weeks: rows)])
    }
}
