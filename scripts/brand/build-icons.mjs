// 고른 로고 후보 하나로 모든 플랫폼 아이콘을 만든다(macOS 전용: Chrome 헤드리스 + sips + iconutil, 새 의존성 없음).
//
//   . scripts/node22.sh
//   node scripts/brand/build-icons.mjs            # 추천 후보(glyphs.mjs RECOMMENDED) → docs/release/brand/out/<id>/
//   node scripts/brand/build-icons.mjs c          # 다른 후보
//   node scripts/brand/build-icons.mjs a --out /tmp/icons
//
// 앱 폴더의 지금 아이콘은 바꾸지 않는다. 결과 폴더의 APPLY.md 대로 사람이 옮긴다.
// 기호(glyphs.mjs)를 고쳤으면 먼저 node scripts/brand/measure.mjs.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONCEPTS, PALETTE, RECOMMENDED } from './glyphs.mjs'
import { variantSvg } from './compose.mjs'
import { renderSvg, resize } from './render.mjs'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const id = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--out')) ?? RECOMMENDED
if (!CONCEPTS[id]) throw new Error(`없는 후보: ${id} (가능: ${Object.keys(CONCEPTS).join(', ')})`)
const outIdx = args.indexOf('--out')
const OUT = outIdx >= 0 ? args[outIdx + 1] : join(root, 'docs', 'release', 'brand', 'out', id)

rmSync(OUT, { recursive: true, force: true })
const tmp = mkdtempSync(join(tmpdir(), 'sprout-icons-'))
const made = []
const mk = (p) => (mkdirSync(dirname(p), { recursive: true }), p)
const note = (p) => made.push(relative(OUT, p))

// 1) 쓰임새별 1024 원본을 한 번씩만 그린다
const master = {}
function m(variant) {
  if (!master[variant]) {
    master[variant] = join(tmp, `${variant}.png`)
    renderSvg(variantSvg(id, variant), master[variant])
  }
  return master[variant]
}
function png(variant, size, dest) {
  mk(dest)
  if (size === 1024) copyFileSync(m(variant), dest)
  else resize(m(variant), dest, size)
  note(dest)
  return dest
}
/** 알파 없는 PNG(App Store 1024는 투명 금지) */
function opaque(src, dest, bg = { red: 255, green: 255, blue: 255 }) {
  const img = PNG.sync.read(readFileSync(src))
  writeFileSync(mk(dest), PNG.sync.write(img, { colorType: 2, inputHasAlpha: true, bgColor: bg }))
  note(dest)
}
/** PNG를 담은 ICO(Windows Vista 이후 표준) */
/** variant가 함수면 크기마다 쓰임새를 고른다(작은 칸은 단순한 기호) */
function ico(variant, sizes, dest) {
  const bufs = sizes.map((s) => {
    const v = typeof variant === 'function' ? variant(s) : variant
    const p = join(tmp, `${v}-${s}.png`)
    if (s === 1024) copyFileSync(m(v), p)
    else resize(m(v), p, s)
    return readFileSync(p)
  })
  const head = Buffer.alloc(6 + 16 * sizes.length)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(sizes.length, 4)
  let offset = head.length
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i
    head.writeUInt8(s >= 256 ? 0 : s, e)
    head.writeUInt8(s >= 256 ? 0 : s, e + 1)
    head.writeUInt8(0, e + 2)
    head.writeUInt8(0, e + 3)
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(bufs[i].length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += bufs[i].length
  })
  writeFileSync(mk(dest), Buffer.concat([head, ...bufs]))
  note(dest)
}
function svgFile(variant, dest) {
  writeFileSync(mk(dest), variantSvg(id, variant))
  note(dest)
}
const fav = (s) => (s <= 32 ? 'favicon-small' : 'favicon')
const write = (dest, text) => (writeFileSync(mk(dest), text), note(dest))

// ── macOS ─────────────────────────────────────────────
{
  const set = join(tmp, 'icon.iconset')
  mkdirSync(set)
  for (const s of [16, 32, 128, 256, 512]) {
    resize(m('mac-light'), join(set, `icon_${s}x${s}.png`), s)
    resize(m('mac-light'), join(set, `icon_${s}x${s}@2x.png`), s * 2)
  }
  const icns = mk(join(OUT, 'macos', 'icon.icns'))
  execFileSync('iconutil', ['-c', 'icns', set, '-o', icns])
  note(icns)
  png('mac-light', 1024, join(OUT, 'macos', 'icon.png'))
  png('mac-dark', 1024, join(OUT, 'macos', 'icon-dark.png'))
  // 메뉴 막대 템플릿: 검정 + 알파, 이름 끝이 Template이어야 macOS가 밝기·다크에 맞춰 칠한다(src/main/mini.ts와 같은 이름)
  png('mono-small', 16, join(OUT, 'macos', 'trayTemplate.png'))
  png('mono-small', 32, join(OUT, 'macos', 'trayTemplate@2x.png'))
  png('mono', 48, join(OUT, 'macos', 'trayTemplate@3x.png'))
}

// ── Windows ───────────────────────────────────────────
ico(fav, [16, 24, 32, 48, 64, 128, 256], join(OUT, 'windows', 'icon.ico'))
ico(fav, [16, 20, 24, 32, 40, 48], join(OUT, 'windows', 'tray.ico')) // 작업 표시줄 알림 영역(색 아이콘, 125~200% 배율)
png('favicon', 256, join(OUT, 'windows', 'icon-256.png'))
png('favicon', 150, join(OUT, 'windows', 'Square150x150Logo.png')) // MSIX/스토어 배포 때
png('favicon', 44, join(OUT, 'windows', 'Square44x44Logo.png'))

// ── iOS (Xcode 14+ 단일 1024 + iOS 18 다크·색조) ────────────
{
  const dir = join(OUT, 'ios', 'AppIcon.appiconset')
  opaque(m('ios-light'), join(dir, 'AppIcon-1024.png'))
  png('ios-dark', 1024, join(dir, 'AppIcon-1024-dark.png'))
  opaque(m('ios-tinted'), join(dir, 'AppIcon-1024-tinted.png'), { red: 0, green: 0, blue: 0 })
  write(
    join(dir, 'Contents.json'),
    JSON.stringify(
      {
        images: [
          { filename: 'AppIcon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
          { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: 'AppIcon-1024-dark.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
          { appearances: [{ appearance: 'luminosity', value: 'tinted' }], filename: 'AppIcon-1024-tinted.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }
        ],
        info: { author: 'xcode', version: 1 }
      },
      null,
      2
    ) + '\n'
  )
}

// ── Android ───────────────────────────────────────────
{
  const res = join(OUT, 'android', 'res')
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
  for (const [d, k] of Object.entries(dens)) {
    png('favicon', 48 * k, join(res, `mipmap-${d}`, 'ic_launcher.png'))
    png('legacy-round', 48 * k, join(res, `mipmap-${d}`, 'ic_launcher_round.png'))
    png('android-fg', 108 * k, join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'))
    png('android-bg', 108 * k, join(res, `mipmap-${d}`, 'ic_launcher_background.png'))
    png('android-mono', 108 * k, join(res, `mipmap-${d}`, 'ic_launcher_monochrome.png'))
    png(k <= 1 ? 'mono-white-small' : 'mono-white', 24 * k, join(res, `drawable-${d}`, 'ic_stat_notify.png')) // 알림 작은 아이콘(흰색+알파)
  }
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`
  write(join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive)
  write(join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive)
  // Expo(app.json) 입력용 1024 원본
  png('android-fg', 1024, join(OUT, 'android', 'expo', 'adaptive-foreground.png'))
  png('android-bg', 1024, join(OUT, 'android', 'expo', 'adaptive-background.png'))
  png('android-mono', 1024, join(OUT, 'android', 'expo', 'adaptive-monochrome.png'))
  png('mono-white', 96, join(OUT, 'android', 'expo', 'notification-icon.png'))
}

// ── 스플래시(Expo expo-splash-screen: 가운데 이미지 + 배경색) ───────
png('splash-light', 1024, join(OUT, 'splash', 'splash-icon.png'))
png('splash-dark', 1024, join(OUT, 'splash', 'splash-icon-dark.png'))

// ── 웹(파비콘·PWA·계정 삭제 안내 페이지 등) ─────────────────
ico(fav, [16, 32, 48], join(OUT, 'web', 'favicon.ico'))
svgFile('favicon', join(OUT, 'web', 'favicon.svg'))
png('favicon-small', 16, join(OUT, 'web', 'favicon-16.png'))
png('favicon-small', 32, join(OUT, 'web', 'favicon-32.png'))
opaque(m('ios-light'), join(tmp, 'touch-1024.png'))
resize(join(tmp, 'touch-1024.png'), mk(join(OUT, 'web', 'apple-touch-icon.png')), 180)
note(join(OUT, 'web', 'apple-touch-icon.png'))
png('favicon', 192, join(OUT, 'web', 'icon-192.png'))
png('favicon', 512, join(OUT, 'web', 'icon-512.png'))
png('ios-light', 512, join(OUT, 'web', 'icon-maskable-512.png')) // 꽉 찬 사각, 기호는 안전 영역(80%) 안
write(
  join(OUT, 'web', 'site.webmanifest'),
  JSON.stringify(
    {
      name: '[제품명]',
      short_name: '[제품명]',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ],
      theme_color: PALETTE.brand,
      background_color: '#ffffff',
      display: 'standalone'
    },
    null,
    2
  ) + '\n'
)

// ── 스토어 ────────────────────────────────────────────
opaque(m('ios-light'), join(OUT, 'store', 'app-store-1024.png'))
opaque(m('ios-light'), join(tmp, 'play-1024.png'))
resize(join(tmp, 'play-1024.png'), mk(join(OUT, 'store', 'play-icon-512.png')), 512) // Play: 512×512, 32비트 PNG, 모서리는 Play가 깎음
note(join(OUT, 'store', 'play-icon-512.png'))
{
  // Play 그래픽 이미지 1024×500 — 글자 없이(제품명 미정) 기호만. 이름이 정해지면 다시 만든다
  const g = variantSvg(id, 'splash-light')
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs><linearGradient id="fgbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${PALETTE.light.bgTop}"/><stop offset="1" stop-color="${PALETTE.light.bgBottom}"/></linearGradient></defs>
  <rect width="1024" height="500" fill="url(#fgbg)"/>
  <svg x="362" y="-50" width="300" height="600" viewBox="0 0 1024 1024" preserveAspectRatio="xMidYMid meet">${g}</svg>
</svg>`
  const p = mk(join(OUT, 'store', 'play-feature-graphic-1024x500.png'))
  renderSvg(svg, join(tmp, 'feature.png'), 1024, 500)
  opaque(join(tmp, 'feature.png'), p)
}

// ── 원본 SVG ─────────────────────────────────────────
for (const v of ['ios-light', 'ios-dark', 'mac-light', 'mac-dark', 'android-fg', 'android-bg', 'android-mono', 'mono', 'mono-small', 'favicon', 'favicon-small', 'splash-light', 'splash-dark'])
  svgFile(v, join(OUT, 'svg', `${v}.svg`))

rmSync(tmp, { recursive: true, force: true })

// ── 적용 안내 ─────────────────────────────────────────
write(
  join(OUT, 'APPLY.md'),
  `# 후보 ${id.toUpperCase()} — ${CONCEPTS[id].name} 아이콘 적용 안내

\`node scripts/brand/build-icons.mjs ${id}\`가 만든 결과다. **아직 앱에 적용하지 않았다** — 사용자가 후보를 고른 뒤 아래대로 옮긴다.
브랜드 색: 라이트 배경 ${PALETTE.light.bgTop} → ${PALETTE.light.bgBottom}, 단색 ${PALETTE.brand}, 다크 ${PALETTE.brandDark}.

## 데스크톱 (apps/desktop)
| 결과 | 옮길 곳 | 비고 |
|---|---|---|
| macos/icon.icns | build/icon.icns | electron-builder.yml \`mac.icon\` |
| macos/icon.png | build/icon.png | Linux·기본 아이콘 |
| svg/mac-light.svg | build/icon.svg | 원본 보관(make-icon.sh는 이 스크립트로 대체) |
| windows/icon.ico | build/icon.ico | electron-builder.yml에 \`win.icon: build/icon.ico\` 추가(Windows 대상 만들 때) |
| windows/tray.ico | resources/tray.ico | Windows 트레이는 템플릿 이미지가 없다 → mini.ts가 win32에서 이 파일을 쓰도록(코드 변경 필요) |
| macos/trayTemplate.png, @2x, @3x | resources/ | 같은 이름 그대로 덮어쓰기. @3x는 extraResources에 추가할 때만 |

## 모바일 (apps/mobile, Expo) — 파일은 \`assets/brand/\`로 복사 후 app.json
\`\`\`json
{
  "expo": {
    "icon": "./assets/brand/AppIcon-1024.png",
    "ios": { "icon": { "light": "./assets/brand/AppIcon-1024.png", "dark": "./assets/brand/AppIcon-1024-dark.png", "tinted": "./assets/brand/AppIcon-1024-tinted.png" } },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/brand/adaptive-foreground.png",
        "backgroundImage": "./assets/brand/adaptive-background.png",
        "monochromeImage": "./assets/brand/adaptive-monochrome.png"
      }
    },
    "plugins": [
      ["expo-splash-screen", { "image": "./assets/brand/splash-icon.png", "imageWidth": 160, "backgroundColor": "${PALETTE.brand}",
        "dark": { "image": "./assets/brand/splash-icon-dark.png", "backgroundColor": "${PALETTE.brandDark}" } }],
      ["expo-notifications", { "icon": "./assets/brand/notification-icon.png", "color": "${PALETTE.brand}" }]
    ]
  }
}
\`\`\`
- 원본: ios/AppIcon.appiconset/*, android/expo/*, splash/*. 바꾼 뒤 \`npx expo prebuild --clean\`.
- 네이티브 폴더를 직접 고칠 때: ios/AppIcon.appiconset 통째로 \`ios/<앱>/Images.xcassets/AppIcon.appiconset\`, android/res/* 를 \`android/app/src/main/res/\`에.
- iOS 색조(tinted) 아이콘의 형식은 Apple 최신 지침 다시 확인(확인 필요).

## 스토어·웹
- store/app-store-1024.png (알파 없음) → App Store Connect(Xcode 빌드에 포함되므로 보통 따로 안 올림)
- store/play-icon-512.png, store/play-feature-graphic-1024x500.png → Play Console 스토어 등록정보
- web/* → 계정 삭제 안내·개인정보 처리방침 웹페이지의 파비콘

## 만든 파일 (${made.length + 1}개)
${made.map((f) => `- ${f}`).join('\n')}
`
)
console.log(`후보 ${id}: 파일 ${made.length}개 → ${OUT}`)
