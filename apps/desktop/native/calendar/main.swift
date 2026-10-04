// 16 §11.4 sprout-calendar — 맥 캘린더 앱(EventKit)의 캘린더·일정을 읽기 전용으로 JSON 출력. 메인 프로세스(main/appleSync.ts)가 부른다.
// 명령: status | request | calendars | events --from <ISO> --to <ISO> [--calendars id,id]
import EventKit
import Foundation

let store = EKEventStore()
let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime]

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

let args = CommandLine.arguments.dropFirst()
guard let cmd = args.first else { fail("usage: sprout-calendar status|request|calendars|events") }
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
    return ["id": c.calendarIdentifier, "title": c.title, "color": hex(c.cgColor), "source": c.source?.title ?? "", "sourceType": String(describing: c.source?.sourceType.rawValue ?? 0), "type": type, "allowsModify": c.allowsContentModifications]
  }
  out(["calendars": cals])
case "events":
  requireAccess()
  guard let fromS = opt("--from"), let toS = opt("--to"), let from = iso.date(from: fromS), let to = iso.date(from: toS) else { fail("events needs --from and --to (ISO 8601)") }
  var cals: [EKCalendar]? = nil
  if let ids = opt("--calendars") {
    let set = Set(ids.split(separator: ",").map(String.init))
    cals = store.calendars(for: .event).filter { set.contains($0.calendarIdentifier) }
    if cals!.isEmpty { out(["events": []]) }
  }
  let pred = store.predicateForEvents(withStart: from, end: to, calendars: cals)
  let events = store.events(matching: pred).map { e -> [String: Any] in
    let me = e.attendees?.first(where: { $0.isCurrentUser })
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
      "declined": me?.participantStatus == .declined
    ]
  }
  out(["events": events])
default:
  fail("unknown command \(cmd)")
}
