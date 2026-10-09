// 43 키우기 화면 캡처용 데모 — EXPO_PUBLIC_SPROUT_RAISE_DEMO=1로 번들할 때만 켜진다(출시 빌드에는 안 들어감, perfProbe와 같은 방식).
// 로그인·서버 없이 가짜 상태로 성장 무대·꾸미기·도감·진화·새 옷 카드를 그린다. 고르기: sprout://raise?v=stage|ward|dex|evo|choice|toast|hatch|avatar&sp=worm&lv=8&eq=straw,mug&path=b&night=1&t=1330&act=spin
import { progressFromEvents, cumulativeXp, normalizeSpecies, type Species } from '@sprout/schema/growth'
import { DEFAULT_LOOK, ITEMS, ownedItems, parseLook, raiseStateFrom, wornEquip, ITEM_BY_ID, type CharacterItemRow, type Look } from '@sprout/schema/wardrobe'
import { useEffect, useMemo, useRef, useState } from 'react'
import { File, Paths } from 'expo-file-system'
import { Linking, ScrollView, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProfileAvatar } from '../avatar/ProfileAvatar'
import { CharacterArt, CharacterWearProvider } from '../growth/art/CharacterArt'
import { DexScreen, WardScreen } from '../growth/Decorate'
import { EvolutionMoment } from '../growth/EvolutionMoment'
import { NewItemToast } from '../growth/NewItemToast'
import type { Raise } from '../growth/raise'
import { RaiseStage, type StageHandle } from '../growth/Stage'
import { usePalette } from '../theme/ThemeProvider'
import { tabBarSpace } from '../ui/tabBarSpace'
import { sceneKeyFor } from '@sprout/schema/characterArt'
import { CompanionFace } from '../ui/CompanionFace'

export const RAISE_DEMO = process.env.EXPO_PUBLIC_SPROUT_RAISE_DEMO === '1'

type Q = Record<string, string>
const parse = (url: string | null): Q => { const q: Q = {}; const i = url?.indexOf('?') ?? -1; if (url && i >= 0) for (const kv of url.slice(i + 1).split('&')) { const [k, v] = kv.split('='); q[k] = decodeURIComponent(v ?? '') } return q }

function fakeRaise(q: Q): Raise {
  const species = (normalizeSpecies(q.sp ?? 'worm') ?? 'worm') as Species
  const lv = Number(q.lv ?? 8)
  const xp = [{ kind: 'kpi', amount: cumulativeXp(lv) + 30, day: '2026-10-01', created_at: '2026-10-01T09:00:00Z' },
    ...Array.from({ length: 23 }, (_, i) => ({ kind: 'task', amount: 1, day: `2026-09-${String(i + 1).padStart(2, '0')}`, created_at: `2026-09-${String(i + 1).padStart(2, '0')}T09:00:00Z` }))]
  const progress = progressFromEvents(xp)
  const state = { ...raiseStateFrom(progress.level, xp), reviews: 3 }
  const look: Look = { ...DEFAULT_LOOK, path: q.path === 'b' ? 'b' : 'a', eq: { ...DEFAULT_LOOK.eq } }
  for (const id of (q.eq ?? '').split(',').filter(Boolean)) { const it = ITEM_BY_ID[id]; if (it) (look.eq as Record<string, string | null>)[it.slot] = id }
  const items = [{ id: 'trophy:c:project:p', character_id: 'c', item_id: 'cup', kind: 'trophy', source: 'project', ref_id: 'p', title: '공모전', earned_at: '2026-10-10T00:00:00Z', seen_at: 'x' },
    { id: 'trophy:c:days:7', character_id: 'c', item_id: 'medal-7', kind: 'trophy', source: 'days', ref_id: null, title: '한 날 7일', earned_at: '2026-09-20T00:00:00Z', seen_at: 'x' },
    { id: 'item:c:backpack', character_id: 'c', item_id: 'bandana', kind: 'item', source: 'level', ref_id: null, title: '노랑 반다나', earned_at: '2026-10-08', seen_at: null }]
  const owned = ownedItems(items, state)
  for (const id of (q.eq ?? '').split(',')) if (id) owned.add(id)
  return { character: { id: 'c', name: q.name ?? null, species, look_json: JSON.stringify(look) }, species, progress, state, look: parseLook(JSON.stringify(look)), owned, worn: wornEquip(look, owned), items: items as never, trophies: items.filter((i) => i.kind === 'trophy') as never, fresh: new Set(['bandana']) }
}

export function RaiseDemo() {
  const p = usePalette()
  const ins = useSafeAreaInsets()
  const win = useWindowDimensions()
  const [q, setQ] = useState<Q>({})
  useEffect(() => { void Linking.getInitialURL().then((u) => setQ(parse(u))); const sub = Linking.addEventListener('url', (e) => setQ(parse(e.url))); return () => sub.remove() }, [])
  // 캡처 스크립트는 열기 확인 창 없이 바꾸려고 Documents/raise-demo.txt(질의 글)를 쓴다 — 1초마다 읽는다
  const last = useRef('')
  useEffect(() => {
    const t = setInterval(() => {
      try { const f = new File(Paths.document, 'raise-demo.txt'); if (!f.exists) return; const txt = f.textSync().trim(); if (txt && txt !== last.current) { last.current = txt; setQ(parse(`x?${txt}`)) } } catch { /* 없음 */ }
    }, 1000)
    return () => clearInterval(t)
  }, [])
  const raise = useMemo(() => fakeRaise(q), [q])
  const v = q.v ?? 'stage'
  const stage = useRef<StageHandle>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.say) stage.current?.say(q.say, 60000)
      if (q.act === 'levelup') stage.current?.levelUp(raise.progress.level)
      if (q.act === 'xp') stage.current?.xp(1)
      // 49 §7.1 만지기 확인: act=hop|spin|giggle|wobble|pet|dizzy (spin은 회전 띠가 없으면 깡충)
      if (q.act && ['hop', 'spin', 'giggle', 'wobble', 'pet', 'dizzy'].includes(q.act)) stage.current?.play(q.act as 'hop')
    }, 600)
    return () => clearTimeout(t)
  }, [q, raise])
  const wear = { species: raise.species, level: raise.progress.level, wear: { path: raise.look.path, eq: raise.worn } }
  const name = q.name ?? '꿈틀'
  const sceneKey = sceneKeyFor(raise.worn.bg, p.dark || q.night === '1')
  const frame = { p, raise, width: win.width, height: win.height, topInset: ins.top, bottomInset: ins.bottom, sceneKey, seg: (v === 'dex' ? 'dex' : 'ward') as 'ward' | 'dex', onSeg: () => {}, onBack: () => {} }
  const week = Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${String(5 + i).padStart(2, '0')}`, label: ['월', '화', '수', '목', '금', '토', '일'][i], num: 5 + i, did: i < 3, today: i === 3 }))
  return (
    <CharacterWearProvider value={wear}>
      <View key={JSON.stringify(q)} style={{ flex: 1, backgroundColor: p.cardBg }}>
        {v === 'stage' || v === 'toast' ? (
          <ScrollView>
            <RaiseStage ref={stage} p={p} raise={raise} name={name} width={win.width} height={win.height} topInset={ins.top} bottomClear={tabBarSpace(ins.bottom).clear} sceneKey={sceneKey}
              reduced={q.reduced === '1'} live night={q.night === '1'} calm={false} lines={() => '오늘 3개 남았어. 하나만 같이 할까?'} week={week} dexN={raise.progress.stage} freshDot />
          </ScrollView>
        ) : null}
        {v === 'toast' ? <NewItemToast rows={[{ id: 'x', character_id: 'c', item_id: 'backpack', kind: 'item', source: 'level', ref_id: null, title: '' } as CharacterItemRow]} level={9} bottom={110} reduced={false} onWear={() => {}} onClose={() => {}} /> : null}
        {v === 'ward' ? <WardScreen {...frame} tab={(q.tab as never) ?? 'hat'} onTab={() => {}} hopKey={0} onEquip={() => {}} onBase={() => {}} onDecor={() => {}} /> : null}
        {v === 'dex' ? <DexScreen {...frame} onPath={() => {}} /> : null}
        {v === 'evo' || v === 'choice' || v === 'hatch' ? (
          <EvolutionMoment reduced={q.reduced === '1'} onDone={() => {}} evo={{ species: raise.species!, from: v === 'hatch' ? 0 : Number(q.from ?? 2), to: v === 'hatch' ? 1 : Number(q.from ?? 2) + 1, path: raise.look.path, eq: raise.worn, seed: raise.look.seed ?? 0, scene: sceneKey, choose: v === 'choice' }} />
        ) : null}
        {v === 'avatar' ? (
          <View style={{ paddingTop: ins.top + 30, alignItems: 'center', gap: 20 }}>
            <Text style={{ color: p.textPrimary, fontSize: 15, fontWeight: '700' }}>입힌 옷이 보이는 곳</Text>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <ProfileAvatar avatar={{ type: 'char', species: raise.species!, stage: raise.progress.stage, bg: '#C6E7C8' }} size={34} letter="꿈" />
              <ProfileAvatar avatar={{ type: 'char', species: raise.species!, stage: raise.progress.stage, bg: '#C6E7C8' }} size={72} letter="꿈" />
              <CompanionFace species={raise.species} stage={raise.progress.stage} size={30} />
              <CompanionFace species={raise.species} stage={raise.progress.stage} size={96} />
            </View>
            <CharacterArt species={raise.species} stage={raise.progress.stage} size={160} mood="happy" />
            <Text style={{ color: p.textSecondary }}>{ITEMS.length} items</Text>
          </View>
        ) : null}
      </View>
    </CharacterWearProvider>
  )
}
