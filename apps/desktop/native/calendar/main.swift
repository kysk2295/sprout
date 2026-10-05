// 16 §11.4·§12.10 sprout-calendar — 맥 캘린더 앱(EventKit)의 캘린더·일정을 JSON으로 읽고 쓴다. 메인 프로세스(main/appleSync.ts)가 부른다.
// 명령: status | request | calendars | events --from <ISO> --to <ISO> [--calendars id,id]
//       get | create | update | delete — 입력은 표준 입력 JSON(§12.10.1)
import EventKit
import Foundation

let store = EKEventStore()
let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime]
let isoMs = ISO8601DateFormatter()
isoMs.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
/** 밀리초가 있어도 없어도 읽는다(메인이 Date.toISOString()을 넘기던 v1 호환) */
func parseDate(_ s: String?) -> Date? {
  guard let s = s else { return nil }
  return iso.date(from: s) ?? isoMs.date(from: s)
}

func out(_ obj: Any) -> Never {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
  exit(0)
}
func fail(_ msg: String, code: Int32 = 1) -> Never {
  FileHandle.standardError.write("\(msg)\n".data(using: .utf8)!)
  FileHandle.standardOutput.write("{\"error\":\"\(msg)\"}\n".data(using: .utf8)!)
  exit(code)
}

func statusName() -> String {
  let s = EKEventStore.authorizationStatus(for: .event)
  if #available(macOS 14.0, *) {
    switch s {
    case .fullAccess: return "fullAccess"
    case .writeOnly: return "writeOnly"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    @unknown default: return "denied"
    }
  } else {
    switch s {
    case .authorized: return "fullAccess"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "notDetermined"
    default: return "denied"
    }
  }
}

func hex(_ c: CGColor?) -> String {
  guard let c = c, let rgb = c.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil), let comps = rgb.components, comps.count >= 3 else { return "#4E75F2" }
  return String(format: "#%02X%02X%02X", Int(round(comps[0] * 255)), Int(round(comps[1] * 255)), Int(round(comps[2] * 255)))
}

func requireAccess() {
  if statusName() != "fullAccess" { fail("not authorized: \(statusName())", code: 3) }
}


// ── 16 §12 쓰기 ──
func readInput() -> [String: Any] {
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard !data.isEmpty, let obj = try? JSONSerialization.jsonObject(with: data), let dict = obj as? [String: Any] else { fail("input must be a JSON object") }
  return dict
}
func err(_ code: String, _ message: String = "") -> Never { out(["error": code, "message": message]) }

let freqName: [EKRecurrenceFrequency: String] = [.daily: "DAILY", .weekly: "WEEKLY", .monthly: "MONTHLY", .yearly: "YEARLY"]
let dayName: [EKWeekday: String] = [.sunday: "SU", .monday: "MO", .tuesday: "TU", .wednesday: "WE", .thursday: "TH", .friday: "FR", .saturday: "SA"]
/** EKRecurrenceRule → RRULE 본문(FREQ=…;…) */
func ruleString(_ r: EKRecurrenceRule) -> String {
  var parts = ["FREQ=\(freqName[r.frequency] ?? "DAILY")"]
  if r.interval > 1 { parts.append("INTERVAL=\(r.interval)") }
  if let days = r.daysOfTheWeek, !days.isEmpty {
    parts.append("BYDAY=" + days.map { d in (d.weekNumber != 0 ? "\(d.weekNumber)" : "") + (dayName[d.dayOfTheWeek] ?? "MO") }.joined(separator: ","))
  }
  if let md = r.daysOfTheMonth, !md.isEmpty { parts.append("BYMONTHDAY=" + md.map { "\($0)" }.joined(separator: ",")) }
  if let m = r.monthsOfTheYear, !m.isEmpty { parts.append("BYMONTH=" + m.map { "\($0)" }.joined(separator: ",")) }
  if let end = r.recurrenceEnd {
    if let d = end.endDate {
      let f = DateFormatter(); f.dateFormat = "yyyyMMdd"; f.timeZone = TimeZone.current
      parts.append("UNTIL=\(f.string(from: d))")
    } else if end.occurrenceCount > 0 { parts.append("COUNT=\(end.occurrenceCount)") }
  }
  return parts.joined(separator: ";")
}
/** RRULE 본문 → EKRecurrenceRule(FREQ·INTERVAL·BYDAY·BYMONTHDAY·BYMONTH·UNTIL·COUNT) */
func parseRRule(_ s: String) -> EKRecurrenceRule? {
  var kv: [String: String] = [:]
  for p in s.replacingOccurrences(of: "RRULE:", with: "").split(separator: ";") {
    let pair = p.split(separator: "=", maxSplits: 1).map(String.init)
    if pair.count == 2 { kv[pair[0]] = pair[1] }
  }
  let freqs: [String: EKRecurrenceFrequency] = ["DAILY": .daily, "WEEKLY": .weekly, "MONTHLY": .monthly, "YEARLY": .yearly]
  guard let fs = kv["FREQ"], let freq = freqs[fs] else { return nil }
  let interval = Int(kv["INTERVAL"] ?? "1") ?? 1
  let wd: [String: EKWeekday] = ["SU": .sunday, "MO": .monday, "TU": .tuesday, "WE": .wednesday, "TH": .thursday, "FR": .friday, "SA": .saturday]
  var days: [EKRecurrenceDayOfWeek]? = nil
  if let b = kv["BYDAY"] {
    days = b.split(separator: ",").compactMap { tok in
      let t = String(tok)
      guard t.count >= 2, let d = wd[String(t.suffix(2))] else { return nil }
      let n = Int(t.dropLast(2)) ?? 0
      return n != 0 ? EKRecurrenceDayOfWeek(d, weekNumber: n) : EKRecurrenceDayOfWeek(d)
    }
  }
  let md = kv["BYMONTHDAY"].map { $0.split(separator: ",").compactMap { Int($0) }.map { NSNumber(value: $0) } }
  let months = kv["BYMONTH"].map { $0.split(separator: ",").compactMap { Int($0) }.map { NSNumber(value: $0) } }
  var end: EKRecurrenceEnd? = nil
  if let u = kv["UNTIL"] {
    let f = DateFormatter(); f.timeZone = TimeZone.current
    f.dateFormat = "yyyyMMdd"
    if let d = f.date(from: String(u.prefix(8))) { end = EKRecurrenceEnd(end: d.addingTimeInterval(86399)) }
  } else if let c = kv["COUNT"], let n = Int(c), n > 0 { end = EKRecurrenceEnd(occurrenceCount: n) }
  return EKRecurrenceRule(recurrenceWith: freq, interval: max(1, interval), daysOfTheWeek: days, daysOfTheMonth: md, monthsOfTheYear: months, weeksOfTheYear: nil, daysOfTheYear: nil, setPositions: nil, end: end)
}

func eventJSON(_ e: EKEvent) -> [String: Any] {
  let me = e.attendees?.first(where: { $0.isCurrentUser })
  let others = (e.attendees ?? []).filter { !$0.isCurrentUser }
  return [
    "id": e.eventIdentifier ?? e.calendarItemIdentifier,
    "calendarId": e.calendar.calendarIdentifier,
    "title": e.title ?? "",
    "notes": e.notes ?? NSNull(),
    "location": e.location ?? NSNull(),
    "url": e.url?.absoluteString ?? NSNull(),
    "start": iso.string(from: e.startDate),
    "end": iso.string(from: e.endDate),
    "allDay": e.isAllDay,
    "timeZone": e.timeZone?.identifier ?? NSNull(),
    "recurring": e.hasRecurrenceRules || e.isDetached,
    "status": e.status == .canceled ? "canceled" : "confirmed",
    "declined": me?.participantStatus == .declined,
    "modifiedAt": e.lastModifiedDate.map { iso.string(from: $0) } ?? NSNull(),
    "occurrence": e.occurrenceDate.map { iso.string(from: $0) } ?? NSNull(),
    "organizerIsMe": e.organizer == nil || e.organizer!.isCurrentUser,
    "hasAttendees": !others.isEmpty,
    "rrule": e.recurrenceRules?.first.map(ruleString) ?? NSNull()
  ]
}

/** id(eventIdentifier) + 회차 시각(ISO) → 그 회차. 회차가 없으면 첫 회차(event(withIdentifier:)) */
func findEvent(_ id: String, occurrence: String?) -> EKEvent? {
  guard let first = store.event(withIdentifier: id) else { return nil }
  guard let occS = occurrence, let occ = parseDate(occS), first.hasRecurrenceRules else { return first }
  let pred = store.predicateForEvents(withStart: occ.addingTimeInterval(-60), end: occ.addingTimeInterval(86400 * 2), calendars: [first.calendar])
  return store.events(matching: pred).first { $0.eventIdentifier == id && abs(($0.occurrenceDate ?? $0.startDate).timeIntervalSince(occ)) < 1 } ?? nil
}
func checkModified(_ e: EKEvent, _ input: [String: Any]) {
  guard let expect = input["expectModified"] as? String, !expect.isEmpty else { return }
  let cur = e.lastModifiedDate.map { iso.string(from: $0) } ?? ""
  if cur != expect { err("conflict", "다른 곳에서 먼저 바뀐 일정이에요") }
}
/** patch의 칸을 일정에 적용. shift가 있으면 시작·끝을 그만큼 옮긴다(모든 회차) */
func apply(_ e: EKEvent, _ patch: [String: Any], shift: TimeInterval?) {
  if let t = patch["title"] as? String { e.title = t }
  if patch.keys.contains("notes") { e.notes = patch["notes"] as? String }
  if patch.keys.contains("location") { e.location = patch["location"] as? String }
  if let a = patch["allDay"] as? Bool { e.isAllDay = a }
  if let shift = shift {
    let len = (parseDate(patch["end"] as? String) ?? e.endDate).timeIntervalSince(parseDate(patch["start"] as? String) ?? e.startDate)
    e.startDate = e.startDate.addingTimeInterval(shift)
    e.endDate = e.startDate.addingTimeInterval(len)
  } else {
    if let s = parseDate(patch["start"] as? String) { e.startDate = s }
    if let en = parseDate(patch["end"] as? String) { e.endDate = en }
  }
  if patch.keys.contains("rrule") {
    for r in e.recurrenceRules ?? [] { e.removeRecurrenceRule(r) }
    if let rs = patch["rrule"] as? String, let r = parseRRule(rs) { e.addRecurrenceRule(r) }
  }
}
func spanOf(_ s: String?) -> EKSpan { s == "future" || s == "all" ? .futureEvents : .thisEvent }

let args = CommandLine.arguments.dropFirst()
guard let cmd = args.first else { fail("usage: sprout-calendar status|request|calendars|events|get|create|update|delete") }
func opt(_ name: String) -> String? {
  guard let i = args.firstIndex(of: name), args.index(after: i) < args.endIndex else { return nil }
  return args[args.index(after: i)]
}

switch cmd {
case "status":
  out(["status": statusName()])
case "request":
  let sem = DispatchSemaphore(value: 0)
  if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { _, _ in sem.signal() }
  } else {
    store.requestAccess(to: .event) { _, _ in sem.signal() }
  }
  _ = sem.wait(timeout: .now() + 115)
  out(["status": statusName()])
case "calendars":
  requireAccess()
  let cals = store.calendars(for: .event).map { c -> [String: Any] in
    var type = "local"
    switch c.type {
    case .birthday: type = "birthday"
    case .subscription: type = "subscription"
    case .calDAV: type = "calDAV"
    case .exchange: type = "exchange"
    default: type = "local"
    }
    return ["id": c.calendarIdentifier, "title": c.title, "color": hex(c.cgColor), "source": c.source?.title ?? "", "sourceType": String(describing: c.source?.sourceType.rawValue ?? 0), "type": type, "allowsModify": c.allowsContentModifications, "isDefault": c.calendarIdentifier == store.defaultCalendarForNewEvents?.calendarIdentifier]
  }
  out(["calendars": cals])
case "events":
  requireAccess()
  guard let fromS = opt("--from"), let toS = opt("--to"), let from = parseDate(fromS), let to = parseDate(toS) else { fail("events needs --from and --to (ISO 8601)") }
  var cals: [EKCalendar]? = nil
  if let ids = opt("--calendars") {
    let set = Set(ids.split(separator: ",").map(String.init))
    cals = store.calendars(for: .event).filter { set.contains($0.calendarIdentifier) }
    if cals!.isEmpty { out(["events": []]) }
  }
  let pred = store.predicateForEvents(withStart: from, end: to, calendars: cals)
  let events = store.events(matching: pred).map(eventJSON)
  out(["events": events])
case "get":
  requireAccess()
  let input = readInput()
  guard let id = input["id"] as? String, let e = findEvent(id, occurrence: input["occurrence"] as? String) else { err("notFound", "이미 삭제된 일정이에요") }
  out(["event": eventJSON(e)])
case "create":
  requireAccess()
  let input = readInput()
  guard let calId = input["calendarId"] as? String, let cal = store.calendar(withIdentifier: calId) else { err("notFound", "캘린더를 찾을 수 없어요") }
  if !cal.allowsContentModifications { err("readonly", "이 캘린더는 보기만 할 수 있어요") }
  let e = EKEvent(eventStore: store)
  e.calendar = cal
  e.title = ""
  apply(e, input, shift: nil)
  do { try store.save(e, span: .futureEvents, commit: true) } catch { err("save", error.localizedDescription) }
  out(["event": eventJSON(e)])
case "update":
  requireAccess()
  let input = readInput()
  guard let id = input["id"] as? String else { fail("update needs id") }
  let span = input["span"] as? String
  let patch = input["patch"] as? [String: Any] ?? [:]
  guard let occ = findEvent(id, occurrence: input["occurrence"] as? String) else { err("notFound", "이미 삭제된 일정이에요") }
  if !occ.calendar.allowsContentModifications { err("readonly", "이 캘린더는 보기만 할 수 있어요") }
  checkModified(occ, input)
  var target = occ
  var shift: TimeInterval? = nil
  if span == "all", occ.hasRecurrenceRules, let first = store.event(withIdentifier: id) {
    // 모든 회차 = 첫 회차에 같은 변경(시간은 이 회차에서 옮긴 만큼)
    if let s = parseDate(patch["start"] as? String) { shift = s.timeIntervalSince(occ.startDate) }
    target = first
  }
  apply(target, patch, shift: shift)
  do { try store.save(target, span: spanOf(span), commit: true) } catch { err("save", error.localizedDescription) }
  out(["event": eventJSON(target)])
case "delete":
  requireAccess()
  let input = readInput()
  guard let id = input["id"] as? String else { fail("delete needs id") }
  let span = input["span"] as? String
  guard let occ = findEvent(id, occurrence: input["occurrence"] as? String) else { out(["ok": true]) }
  if !occ.calendar.allowsContentModifications { err("readonly", "이 캘린더는 보기만 할 수 있어요") }
  checkModified(occ, input)
  let target = span == "all" ? (store.event(withIdentifier: id) ?? occ) : occ
  do { try store.remove(target, span: spanOf(span), commit: true) } catch { err("save", error.localizedDescription) }
  out(["ok": true])
default:
  fail("unknown command \(cmd)")
}
