// iOS formSheet(react-native-screens 4.x) 안에서 "루트 View → 첫 자식 ScrollView" 모양이면, 시트 높이가 바뀔 때(끌어 올려 전체·키보드로 커짐)
// 라이브러리가 그 ScrollView의 frame을 화면 frame(원점 포함)으로 덮어써서 내용이 시트 밖으로 밀려 **시트가 하얗게 빈다**.
// (RNSScreen.mm applyFrameCorrectionForDescendantScrollView — 첫 자식 줄만 따라 내려가며 ScrollView를 찾는다)
// 루트 View의 첫 자식으로 이 0 높이 View를 두면 그 탐색이 여기서 멈춘다. ScrollView 크기는 RN 레이아웃(flex: 1)이 이미 시트 높이에 맞춘다.
// 시트 루트가 ScrollView 자체인 화면(move·tags)은 다른 경로(크기만 맞춤)라 필요 없다.
import { View } from 'react-native'

export function SheetScrollGuard() {
  return <View collapsable={false} pointerEvents="none" style={{ height: 0 }} />
}
