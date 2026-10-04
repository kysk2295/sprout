// 25 §7 위젯 자체 시간표 + 갤러리 미리보기(가짜 예시 데이터, §2)
import WidgetKit
import Foundation

struct SproutEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
    let pending: [String: PendingAction]
    /// 시스템 자리 표시(회색 막대, §4 "불러오는 중")
    var placeholder = false

    /// 이 시각에 "오래된 데이터"인지(앱이 자정을 못 넘김, §4)
    var stale: Bool {
        if case .ready(let s) = data, let day = s.day { return day != Store.localDay(date) }
        return false
    }
    /// 60초 넘게 반영되지 않은 체크가 있는지(§4 "sprout을 열면 반영돼요")
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
        // 갤러리 미리보기에는 내 할 일 제목을 보이지 않는다 — 예시 데이터(§2)
        if context.isPreview {
            completion(SproutEntry(date: Date(), data: .ready(Sample.snapshot), pending: [:]))
        } else {
            completion(SproutEntry(date: Date(), data: Store.load(), pending: Store.pending()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SproutEntry>) -> Void) {
        let now = Date()
        let data = Store.load()
        let pending = Store.pending()
        var dates: [Date] = [now]
        // 체크가 60초 안에 반영되지 않으면 안내 문구를 띄울 시각
        let f = ISO8601DateFormatter()
        if let oldest = pending.values.compactMap({ f.date(from: $0.at) }).min() {
            let t = oldest.addingTimeInterval(61)
            if t > now { dates.append(t) }
        }
        // 오늘 할 일의 시각마다 만료 빨강으로(앱이 준 overdueAt — 지금 규칙에선 늘 null)
        if case .ready(let s) = data {
            for t in s.today?.tasks ?? [] {
                if let raw = t.overdueAt, let d = f.date(from: raw), d > now { dates.append(d) }
            }
        }
        // 다음 자정 → 앱이 새로 쓰지 않았으면 "오래된 데이터"
        let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(24 * 60 * 60 + 1)
        dates.append(midnight)
        let entries = Array(Set(dates)).sorted().prefix(20).map { SproutEntry(date: $0, data: data, pending: pending) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

/// 갤러리·Xcode 미리보기용 예시(실제 사용자 데이터 아님)
enum Sample {
    static let json = """
    {"schema":1,"generatedAt":"2026-10-04T09:12:03+09:00","day":"__TODAY__","account":{"signedIn":true},"prefs":{"clock24h":false},
     "theme":{"accentLight":"#4E75F2","accentDark":"#545DFA"},
     "today":{"count":7,"tasks":[
      {"id":"s1","title":"아침 스트레칭","priority":1,"depth":0,"label":"오전 8:00","labelTone":"accent","overdueAt":null,"repeat":true},
      {"id":"s2","title":"기획서 초안 쓰기","priority":3,"depth":0,"label":"오전 9:30","labelTone":"accent","overdueAt":null,"repeat":false},
      {"id":"s3","title":"자료 조사","priority":0,"depth":1,"label":null,"labelTone":"accent","overdueAt":null,"repeat":false},
      {"id":"s4","title":"독서 30분","priority":0,"depth":0,"label":"오늘","labelTone":"accent","overdueAt":null,"repeat":false},
      {"id":"s5","title":"점심 약속","priority":2,"depth":0,"label":"오후 12:30","labelTone":"accent","overdueAt":null,"repeat":false},
      {"id":"s6","title":"메일 답장","priority":0,"depth":0,"label":"오늘","labelTone":"accent","overdueAt":null,"repeat":false},
      {"id":"s7","title":"보고서 제출","priority":2,"depth":0,"label":"어제","labelTone":"danger","overdueAt":null,"repeat":false}]},
     "growth":{"hasCharacter":true,"name":"미미","species":"cat","level":4,"stage":2,"stageName":"꼬마","xpInto":40,"xpToNext":100,
      "todayTaskXp":3,"todayTaskXpCap":10,"mood":"happy","art":"__sample__"},
     "appliedActions":[]}
    """
    static var snapshot: Snapshot {
        let text = json.replacingOccurrences(of: "__TODAY__", with: Store.localDay(Date()))
        return try! JSONDecoder().decode(Snapshot.self, from: Data(text.utf8))
    }
}
