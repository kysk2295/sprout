// 사이트 전체 설정 — 이름·주소·연락처는 여기만 바꾸고 `npm run build`.
// 값이 '['로 시작하면 아직 정하지 않은 자리로 보고, 화면에 노란 표시로 드러낸다.
export default {
  // 정식 제품명이 정해지면 이 한 줄만 바꾼다(법률 문서의 [제품명]·[Product Name]도 이걸로 채운다).
  name: 'sprout',
  // 공개 주소(끝에 / 없이). 자체 도메인을 붙이면 바꾼다 — canonical·OG·sitemap에 쓰인다.
  baseUrl: 'https://web-production-cd889.up.railway.app',
  // 연락처 — 아직 미정
  supportEmail: '[support@도메인 — 미정]',
  privacyEmail: '[privacy@도메인 — 미정]',
  operator: '[운영자 — 미정]',
  year: 2026,
  // 법률 문서 위 "초안" 띠. 법률 검토가 끝나면 false.
  legalDraftBanner: true
}
