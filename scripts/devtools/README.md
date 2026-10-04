# 개발용 화면 확인 도구 (Electron 원격 디버깅)

앱을 `--remoteDebuggingPort 9229`로 띄운 뒤 쓴다. 다른 포트면 `CDP_PORT=9231 node cdp.mjs …`. 여러 앱을 동시에 띄울 땐 `SPROUT_PROFILE=이름`으로 데이터 폴더를 나눈다. Node 22에서 실행(`. scripts/node22.sh`).

```bash
cd apps/desktop && . ../../scripts/node22.sh && npx electron-vite dev --remoteDebuggingPort 9229
```

| 파일 | 사용 |
|---|---|
| `cdp.mjs` | `node cdp.mjs '<JS 식>'` — 렌더러에서 식을 평가해 결과 출력. `TARGET=window=mini`처럼 창 고르기 |
| `shot.mjs` | `node shot.mjs out.png` — 현재 화면 캡처 |
| `shot2.mjs` | `node shot2.mjs out.png 1378 884` — 뷰포트를 맞추고 캡처(틱틱 창과 같은 크기) |
| `win.mjs` | `node win.mjs 1378 884` — 실제 창 크기 변경 |
| `input.mjs` | `click x y` · `rclick x y` · `drag x1 y1 x2 y2`(HOLD=ms) · `key Escape` · `undo` · `type 글자` · `move x y` |

메인 프로세스(src/main)는 핫 리로드가 안 된다 — 바꾸면 앱을 껐다 다시 띄운다. preload를 바꿔도 마찬가지(2026-10-04 AI 사용량 JSON 오류의 원인이었다).
