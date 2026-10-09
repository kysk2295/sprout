// 43 §5.3 입힌 옷이 보이는 곳 — 앱 맨 위에서 한 번: 해금 실행 + 내 캐릭터 모습을 모든 CharacterArt(AI 비서·아바타·일기·사이드바…)에 준다
import { useEffect, useMemo, type ReactNode } from 'react'
import { runUnlocks, useRaise, useRaiseRunner } from '../../data/raise'
import { CharacterWearProvider } from './CharacterArt'

export function RaiseProvider({ children }: { children: ReactNode }) {
  useRaiseRunner()
  const r = useRaise()
  useEffect(() => { if (r.species) void runUnlocks() }, [r.species])
  const value = useMemo(() => ({ species: r.species, level: r.level, wear: { path: r.look.path, eq: r.worn, seed: r.look.seed } }), [r.species, r.level, r.look.path, r.worn, r.look.seed])
  return <CharacterWearProvider value={value}>{children}</CharacterWearProvider>
}
