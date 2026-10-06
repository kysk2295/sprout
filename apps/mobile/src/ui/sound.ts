// 완료음(39 결정 ② — 3묶음): 할 일을 끝낸 순간(체크·끝까지 밀기) 짧은 두 음. 소리 파일은 직접 만든 것(assets/sounds/complete.wav, 틱틱 소리 아님).
// 설정 › 소리와 알림 `완료음`(기본 켬, 기기별)을 끄면 울리지 않는다. 무음 스위치를 따르고 다른 앱 소리와 섞인다.
// expo-audio는 네이티브 모듈 — 다시 빌드한 앱에서만 소리가 난다(모듈이 없으면 조용히 건너뜀).
import { soundOn } from './haptics'

type Player = { seekTo: (s: number) => Promise<void> | void; play: () => void }
let player: Player | null | undefined

function load(): Player | null {
  if (player !== undefined) return player
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio') as typeof import('expo-audio')
    void audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {})
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    player = audio.createAudioPlayer(require('../../assets/sounds/complete.wav')) as unknown as Player
  } catch {
    player = null
  }
  return player
}

// 39 §11: 첫 체크 순간에 모듈·플레이어를 만들지 않게 앱이 뜬 뒤 한가할 때 미리 만든다
setTimeout(() => { if (soundOn()) load() }, 3000)

/** 완료음 한 번(설정이 꺼져 있으면 아무것도 안 함) */
export function playComplete() {
  if (!soundOn()) return
  const p = load()
  if (!p) return
  try { void Promise.resolve(p.seekTo(0)).then(() => p.play()) } catch { /* 소리 실패는 무시 */ }
}
