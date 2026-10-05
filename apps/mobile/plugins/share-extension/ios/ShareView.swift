// 24 §2 공유 카드(시안 C1) · 저장 확인(C2) · 로그아웃 안내(C2 아래) — SwiftUI
import SwiftUI
import UIKit

final class ShareModel: ObservableObject {
  @Published var shared = ""
  @Published var memo = ""
  @Published var linkTitle: String?
  @Published var saving = false
  @Published var saved = false
  @Published var failed = false
  @Published var privacySeen = UserDefaults(suiteName: ShareConfig.appGroup)?.bool(forKey: "share.privacySeen") ?? false
  var access: ShareAccess?
  var close: () -> Void = {}
  var cancel: () -> Void = {}
  var openApp: () -> Void = {}

  var content: String { ShareRow.compose(memo: memo, shared: shared) }
  var url: String? { ShareLink.firstUrl(content) }
  var bare: Bool { ShareLink.isBareLink(content) }
  var signedIn: Bool { access != nil }

  func seePrivacy() {
    privacySeen = true
    UserDefaults(suiteName: ShareConfig.appGroup)?.set(true, forKey: "share.privacySeen")
  }

  func save() {
    let text = content
    guard !text.isEmpty, !saving else { return }
    saving = true
    failed = false
    ShareSave.save(content: text, access: access) { [weak self] result in
      guard let self else { return }
      self.saving = false
      switch result {
      case .success:
        self.seePrivacy()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        withAnimation(.easeOut(duration: 0.2)) { self.saved = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8 + 0.4) { self.close() } // 체크 그리기 0.4초 + 0.8초
      case .failure:
        self.failed = true
      }
    }
  }
}

// ── 색(기본 테마 — packages/tokens: accent #4e75f2, 입력 #f8f8f9, 2차 #7d7d7d, 3차 #a3a4a7) ──
private func dyn(_ light: UIColor, _ dark: UIColor) -> Color { Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light }) }
private enum C {
  static let accent = Color(red: 0x4e / 255, green: 0x75 / 255, blue: 0xf2 / 255)
  static let card = dyn(.white, UIColor(white: 0.13, alpha: 1))
  static let input = dyn(UIColor(red: 0xf8 / 255, green: 0xf8 / 255, blue: 0xf9 / 255, alpha: 1), UIColor(white: 0.19, alpha: 1))
  static let text = dyn(UIColor(white: 0x19 / 255, alpha: 1), UIColor(white: 0.93, alpha: 1))
  static let text2 = dyn(UIColor(white: 0x7d / 255, alpha: 1), UIColor(white: 0.62, alpha: 1))
  static let text3 = dyn(UIColor(red: 0xa3 / 255, green: 0xa4 / 255, blue: 0xa7 / 255, alpha: 1), UIColor(white: 0.45, alpha: 1))
  static let divider = dyn(UIColor(white: 0, alpha: 0.08), UIColor(white: 1, alpha: 0.1))
  static let success = Color(red: 0x34 / 255, green: 0xc7 / 255, blue: 0x59 / 255)
  static let danger = Color(red: 0xe0 / 255, green: 0x3e / 255, blue: 0x3e / 255)
  static let warn = Color(red: 0xf5 / 255, green: 0xa6 / 255, blue: 0x23 / 255)
}

struct ShareView: View {
  @ObservedObject var model: ShareModel

  var body: some View {
    ZStack(alignment: .bottom) {
      Color.black.opacity(model.saved ? 0.28 : 0.45).ignoresSafeArea()
        .onTapGesture { if !model.saved && !model.saving { model.cancel() } }
      if model.saved {
        SavedCard().frame(maxHeight: .infinity).transition(.opacity.combined(with: .scale(scale: 0.96)))
      } else if !model.signedIn {
        SignedOutCard(model: model).transition(.move(edge: .bottom))
      } else {
        ShareCard(model: model).transition(.move(edge: .bottom))
      }
    }
  }
}

// ── C1 공유 카드 ──
private struct ShareCard: View {
  @ObservedObject var model: ShareModel

  var body: some View {
    VStack(spacing: 0) {
      Capsule().fill(C.text3.opacity(0.5)).frame(width: 36, height: 5).padding(.top, 6)
      // 머리 52
      HStack {
        Button("취소") { model.cancel() }.font(.system(size: 16)).foregroundColor(C.accent).frame(minWidth: 50, alignment: .leading)
        Spacer()
        Text("수집함에 넣기").font(.system(size: 17, weight: .semibold)).foregroundColor(C.text)
        Spacer()
        Group {
          if model.saving { ProgressView().frame(minWidth: 50, alignment: .trailing) }
          else {
            Button("넣기") { model.save() }
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(model.content.isEmpty ? C.text3 : C.accent)
              .disabled(model.content.isEmpty)
              .frame(minWidth: 50, alignment: .trailing)
          }
        }
      }
      .padding(.horizontal, 16).frame(height: 52)
      Rectangle().fill(C.divider).frame(height: 0.5)

      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          // 덧붙이기 44
          HStack(spacing: 8) {
            Image(systemName: "pencil").font(.system(size: 14)).foregroundColor(C.text3)
            TextField("메모 덧붙이기 — 예: 금요일까지 보기", text: $model.memo)
              .font(.system(size: 15)).foregroundColor(C.text)
          }
          .padding(.horizontal, 12).frame(height: 44)
          .background(RoundedRectangle(cornerRadius: 10).fill(C.input))
          .padding(.bottom, 12)
          // 공유된 글(고칠 수 있다, 최대 6줄 보이고 스크롤)
          TextEditor(text: $model.shared)
            .font(.system(size: 16)).foregroundColor(C.text)
            .frame(minHeight: 70, maxHeight: 23 * 6)
            .scrollContentBackgroundHidden()
        }
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 10)

        if let url = model.url { LinkLine(url: url, title: model.linkTitle) }

        HStack(spacing: 6) {
          Image(systemName: "sparkles").font(.system(size: 12)).foregroundColor(C.accent)
          Text(model.bare ? "링크만 있어서 바로 ‘볼 것’에 넣어요" : "AI가 할 일·볼 것·위키·메모로 정리해 둘게요")
            .font(.system(size: 13)).foregroundColor(C.text3)
          Spacer()
        }
        .padding(.horizontal, 16).padding(.top, 12)

        if model.failed {
          Text("저장하지 못했어요. 다시 시도해 주세요")
            .font(.system(size: 13)).foregroundColor(C.danger)
            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.top, 8)
        }

        if !model.privacySeen {
          HStack(alignment: .top, spacing: 8) {
            Image(systemName: "lock.fill").font(.system(size: 13)).foregroundColor(C.accent).padding(.top, 2)
            (Text("수집함 글은 외부 AI가 아니라 꿈틀 서버(운영자의 Mac mini) AI가 정리해요. ").foregroundColor(C.text2)
              + Text("알겠어요").foregroundColor(C.accent).bold())
              .font(.system(size: 13))
          }
          .padding(12)
          .background(RoundedRectangle(cornerRadius: 12).fill(C.accent.opacity(0.08)))
          .padding(.horizontal, 16).padding(.top, 14)
          .onTapGesture { withAnimation { model.seePrivacy() } }
        }
        Spacer(minLength: 24)
      }
    }
    .frame(maxWidth: .infinity)
    .frame(height: 500)
    .background(TopRounded(radius: 22).fill(C.card).ignoresSafeArea(edges: .bottom))
  }
}

/** 11 v3-2 볼 것 행과 같은 표시: 유튜브 = 빨간 재생 칸, 그 밖 = 링크 칸 + 제목 + 도메인 */
private struct LinkLine: View {
  let url: String
  let title: String?
  var body: some View {
    let yt = ShareLink.isYoutube(url)
    HStack(spacing: 10) {
      ZStack {
        RoundedRectangle(cornerRadius: 6).fill(yt ? Color(red: 1, green: 0, blue: 0) : C.input).frame(width: 40, height: 28)
        Image(systemName: yt ? "play.fill" : "link").font(.system(size: 12, weight: .bold)).foregroundColor(yt ? .white : C.text2)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(title ?? url).font(.system(size: 14, weight: .medium)).foregroundColor(C.text).lineLimit(1)
        Text(ShareLink.domainOf(url)).font(.system(size: 12)).foregroundColor(C.text3).lineLimit(1)
      }
      Spacer()
    }
    .padding(.horizontal, 16).padding(.vertical, 10)
    .overlay(Rectangle().fill(C.divider).frame(height: 0.5), alignment: .top)
  }
}

// ── C2 저장 확인: 초록 원 56 + 그려지는 체크 0.4초 ──
private struct SavedCard: View {
  @State private var drawn: CGFloat = 0
  var body: some View {
    VStack(spacing: 10) {
      ZStack {
        Circle().fill(C.success).frame(width: 56, height: 56)
        Path { p in
          p.move(to: CGPoint(x: 17, y: 29)); p.addLine(to: CGPoint(x: 25, y: 37)); p.addLine(to: CGPoint(x: 40, y: 21))
        }
        .trim(from: 0, to: drawn)
        .stroke(Color.white, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
        .frame(width: 56, height: 56)
      }
      .padding(.bottom, 4)
      Text("저장했어요").font(.system(size: 19, weight: .bold)).foregroundColor(C.text)
      Text("수집함에서 AI가 정리해 둘게요\n할 일 같으면 등록할지 물어볼게요")
        .font(.system(size: 13.5)).foregroundColor(C.text3).multilineTextAlignment(.center).lineSpacing(2)
    }
    .padding(.vertical, 28).frame(maxWidth: .infinity)
    .background(RoundedRectangle(cornerRadius: 20).fill(C.card))
    .padding(.horizontal, 24)
    .onAppear { withAnimation(.easeOut(duration: 0.4)) { drawn = 1 } }
  }
}

// ── 로그아웃 상태(C2 아래 카드) ──
private struct SignedOutCard: View {
  @ObservedObject var model: ShareModel
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Button("취소") { model.cancel() }.font(.system(size: 16)).foregroundColor(C.accent)
        Spacer()
      }
      .padding(.horizontal, 16).frame(height: 44)
      HStack(spacing: 10) {
        Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 15)).foregroundColor(C.warn)
        Text("꿈틀에 먼저 로그인해 주세요").font(.system(size: 14, weight: .semibold)).foregroundColor(C.text)
        Spacer()
        Button(action: model.openApp) {
          Text("꿈틀 열기").font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Capsule().fill(C.accent))
        }
      }
      .padding(.horizontal, 16).padding(.bottom, 28)
    }
    .frame(maxWidth: .infinity)
    .background(TopRounded(radius: 22).fill(C.card).ignoresSafeArea(edges: .bottom))
  }
}

private extension View {
  @ViewBuilder func scrollContentBackgroundHidden() -> some View {
    if #available(iOS 16.0, *) { self.scrollContentBackground(.hidden) } else { self }
  }
}

/** 위 두 모서리만 둥근 면(iOS 16 — UnevenRoundedRectangle은 17부터) */
private struct TopRounded: Shape {
  let radius: CGFloat
  func path(in rect: CGRect) -> Path {
    Path(UIBezierPath(roundedRect: rect, byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSize(width: radius, height: radius)).cgPath)
  }
}
