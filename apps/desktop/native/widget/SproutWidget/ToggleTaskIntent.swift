// 25 §6·§8.5 행 체크박스: 앱을 열지 않고 완료. 위젯은 DB를 만지지 않고 대기열 파일 한 장만 쓴다.
// 앱(main/widget.ts)이 정상 완료 경로(taskCore — 반복 다음 회차·XP +1 하루 10)로 반영하고 파일을 지운다.
// 반영 대기 중인 행을 다시 누르면 대기 파일을 지운다(= 완료 취소).
import AppIntents
import WidgetKit

struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "할 일 체크"
    static var description = IntentDescription("sprout 위젯에서 할 일을 완료로 표시해요")
    static var isDiscoverable: Bool = false

    @Parameter(title: "할 일 ID")
    var taskId: String

    init() {}
    init(taskId: String) { self.taskId = taskId }

    func perform() async throws -> some IntentResult {
        Store.toggle(taskId: taskId)
        return .result() // 시스템이 위젯을 바로 다시 그린다 → "반영 대기" 모양
    }
}
