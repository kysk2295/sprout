// 앱 진입점: 백그라운드 작업 정의를 expo-router보다 먼저 불러온다.
// 앱이 닫힌 상태에서 FCM 메시지·알림 버튼으로 JS만 깨어날 때도(32 §4·§6) 작업이 정의돼 있어야 실행된다.
import './src/polyfills'
import './src/notifications/push'
import './src/notifications/background'
import 'expo-router/entry'
