// 사이트 전체 설정 — 이름·주소·연락처는 여기만 바꾸고 `npm run build`.
// 값이 '['로 시작하면 아직 정하지 않은 자리로 보고, 화면에 노란 표시로 드러낸다.
export default {
  // 제품명(2026-10-05 확정). 한국어 화면은 name, 영어 화면은 nameEn. 코드네임 sprout은 내부에서만 쓴다.
  name: '꿈틀',
  nameEn: 'Kkumteul',
  // 공개 주소(끝에 / 없이). 자체 도메인을 붙이면 바꾼다 — canonical·OG·sitemap에 쓰인다.
  baseUrl: 'https://web-production-cd889.up.railway.app',
  // 연락처(문의·개인정보 요청 같은 주소)
  supportEmail: 'kysk2295@naver.com',
  privacyEmail: 'kysk2295@naver.com',
  // 운영자(사업자) — 상호와 대표자. 저작권 줄은 상호만.
  operator: '유니포트(대표 고윤서)',
  operatorEn: 'UniPort (Representative: Ko Yunseo)',
  copyrightHolder: '유니포트',
  copyrightHolderEn: 'UniPort',
  year: 2026,
  // 법률 문서 위 "초안" 띠. 2026-10-05 법률 문서 확정 → false.
  legalDraftBanner: false
}
