// Metro 설정 — npm 워크스페이스(모노레포)
// - expo/metro-config가 워크스페이스 루트를 감시 폴더로 잡아 packages/schema의 .ts 원본을 그대로 읽는다.
// - react는 반드시 apps/mobile/node_modules의 사본(19.2.3)으로 고정한다.
//   React Native 렌더러는 react와 정확히 같은 버전이어야 하는데, 루트에는 데스크톱용 react 19.3이 올라가 있다.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)
const fromMobile = path.join(__dirname, 'package.json')
const PINNED = ['react']

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = PINNED.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))
  return context.resolveRequest(pinned ? { ...context, originModulePath: fromMobile } : context, moduleName, platform)
}

module.exports = config
