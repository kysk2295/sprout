// babel-preset-expo가 TypeScript·reanimated(worklets) 변환을 맡는다.
// PowerSync의 watch(비동기 반복자)를 위해 async generator 변환을 더한다(@powersync/react-native README).
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@babel/plugin-transform-async-generator-functions']
  }
}
