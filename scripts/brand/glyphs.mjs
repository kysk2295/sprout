// sprout 로고 후보 3종의 "기호(glyph)" 정의 — 직접 그린 원본(틱틱 자산 아님).
// 좌표계: 1000×1000 상자, 기호는 대략 100~900 안에 있다. compose.mjs가 앱 아이콘·트레이·파비콘 크기로 옮긴다.
//   shape: 전경색({FG})으로 칠하는 부분
//   cut:   전경에서 파내는 부분(마스크) — 배경이 비쳐 보인다. 단색·투명 배경에서도 그대로 동작한다.
// 16px에서 읽히도록 선 굵기는 상자 대비 9% 이상, 파낸 틈은 7% 이상으로 둔다.

export const CONCEPTS = {
  a: {
    id: 'a',
    name: '새싹 체크 (Check Sprout)',
    nameEn: 'Check Sprout',
    idea: '체크 표시의 긴 획이 그대로 줄기가 되어 잎을 틔운다 — "끝낸 일이 자라난다".',
    shape: `
      <path d="M150 560 L370 770 C 450 650 520 545 600 440" fill="none" stroke="{FG}" stroke-width="130" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M585 470 C 585 290 700 150 895 120 C 912 310 790 450 585 470 Z" fill="{FG}"/>
      <path d="M560 455 C 450 450 372 375 356 262 C 480 258 560 340 560 455 Z" fill="{FG}"/>`,
    // 32px 이하: 왼쪽 작은 잎이 뭉개져 덩어리처럼 보여서 뺀다(체크 + 큰 잎)
    shapeSmall: `
      <path d="M150 560 L370 770 C 450 650 520 545 600 440" fill="none" stroke="{FG}" stroke-width="140" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M585 470 C 585 290 700 150 895 120 C 912 310 790 450 585 470 Z" fill="{FG}"/>`,
    cut: ``
  },
  b: {
    id: 'b',
    name: '달력 새싹 (Calendar Seedling)',
    nameEn: 'Calendar Seedling',
    idea: '달력 한 장에서 새싹이 돋는다 — "할 일·캘린더 + 성장".',
    shape: `
      <rect x="130" y="205" width="740" height="690" rx="150" fill="{FG}"/>
      <rect x="290" y="105" width="104" height="200" rx="52" fill="{FG}"/>
      <rect x="606" y="105" width="104" height="200" rx="52" fill="{FG}"/>`,
    cut: `
      <rect x="100" y="318" width="800" height="48" fill="#000"/>
      <path d="M500 800 L500 615" stroke="#000" stroke-width="74" stroke-linecap="round"/>
      <path d="M492 660 C 400 660 300 605 290 478 C 420 470 496 548 492 660 Z" fill="#000"/>
      <path d="M508 618 C 520 500 610 428 725 428 C 728 548 630 624 508 618 Z" fill="#000"/>`
  },
  c: {
    id: 'c',
    name: '잎 체크 (Leaf Check)',
    nameEn: 'Leaf Check',
    idea: '한 장의 잎, 잎맥 자리가 체크 표시 — 가장 단순해서 16px에서도 또렷하다.',
    shape: `
      <path d="M135 865 C 105 470 420 150 880 120 C 905 560 600 890 135 865 Z" fill="{FG}"/>`,
    cut: `
      <path d="M318 548 L452 682 L705 382" fill="none" stroke="#000" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>`
  }
}

export const RECOMMENDED = 'a'

// 색 — 성장(초록) 계열. 앱 강조색(파랑 #4e75f2)은 틱틱 UI 기준이라 브랜드 색과 분리한다.
export const PALETTE = {
  light: { bgTop: '#5CD08F', bgBottom: '#1F9455', fg: '#FFFFFF' },
  dark: { bgTop: '#17291F', bgBottom: '#0B1611', fgTop: '#7BE5A8', fgBottom: '#34B771' },
  mono: '#000000',
  brand: '#2BAE66', // 단색 배경(안드로이드 적응형 배경·스플래시 배경 등)
  brandDark: '#0F1E16'
}
