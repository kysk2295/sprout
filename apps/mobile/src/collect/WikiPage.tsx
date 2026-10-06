// 26 C7 위키 주제 페이지(읽기 전용): 둥근 ‹ · 이력 🕘 / 제목 24/700 · `자료 N · 버전 N · 방금 고침` / AI가 바꿨으면 띠(✦ 이유 · 되돌리기)
// / 구역(개요 · 핵심 정리 · 볼 것 · 관련 주제 · 열린 질문 — 내용 없는 구역은 숨김) · 줄 끝 출처 꼬리표 · 새 줄 강조 · 🔒 직접 고침 · 제안은 "컴퓨터에서 보기".
// 이력 = 아래 시트 버전 목록 → 누르면 그 버전 미리보기 + "이 버전으로 되돌리기"(데스크톱과 같은 restoreVersion).
import { useLiveQuery } from '../data/rows'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, History, Lock, Sparkles, X } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FONT, M } from '../theme/palette'
import { usePalette } from '../theme/ThemeProvider'
import { BottomSheet } from '../ui/BottomSheet'
import { GlassButton } from '../ui/Glass'
import { SheetHead } from '../ui/SheetHead'
import { NavRow } from '../ui/Header'
import { useToast } from '../ui/Toast'
import {
  bandReason, changedAt, contentOf, domainOf, fullKo, lockedOf, restoreReason, SECTION_NAME, SECTIONS, sourceLabel,
  type CollectItem, type WikiContent, type WikiLine, type WikiSection, type WikiTopic
} from './core'
import { restoreVersion } from './data'
import { openItem } from './events'
import { SiteMark } from './parts'
import { markSeen, seenVersions } from './wikiSeen'
import { useTabBarSpace } from '../ui/tabBarSpace'

type Topic = WikiTopic & { count: number }
type Version = { id: string; version: number; content: string; reason: string; created_at: string }
type Src = Pick<CollectItem, 'id' | 'source' | 'captured_at' | 'created_at'>

export default function WikiPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const p = usePalette()
  const space = useTabBarSpace()
  const router = useRouter()
  const toast = useToast()
  const topic = useLiveQuery<Topic>('SELECT w.*, (SELECT COUNT(*) FROM notes n WHERE n.topic_id = w.id) AS count FROM wiki_topics w WHERE w.id = ?', [id ?? '']).data[0]
  const topics = useLiveQuery<{ id: string; name: string }>('SELECT id, name FROM wiki_topics').data
  const versions = useLiveQuery<Version>('SELECT id, version, content, reason, created_at FROM wiki_versions WHERE topic_id = ? ORDER BY version DESC', [id ?? '']).data
  const links = useLiveQuery<Pick<CollectItem, 'id' | 'url' | 'link_title' | 'content'>>('SELECT id, url, link_title, content FROM notes WHERE topic_id = ? AND url IS NOT NULL ORDER BY COALESCE(captured_at, created_at) DESC', [id ?? '']).data
  // 처음 열 때 본 버전 = 띠 기준. 보는 동안 바뀐 버전은 목록 점에서 바로 "봤음"
  const [baseline, setBaseline] = useState<number | null>(null)
  useEffect(() => { if (topic && baseline === null) setBaseline(seenVersions()?.[topic.id] ?? topic.version) }, [topic, baseline])
  useEffect(() => { if (topic) markSeen(topic.id, topic.version) }, [topic?.id, topic?.version]) // eslint-disable-line react-hooks/exhaustive-deps
  const [preview, setPreview] = useState<Version>()
  const [history, setHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  const content: WikiContent = preview ? contentOf(preview) : contentOf(topic)
  const locked = lockedOf(topic)
  const srcIds = useMemo(() => Array.from(new Set(SECTIONS.flatMap((s) => content.sections[s].map((l) => l.src)).filter((s): s is string => !!s))), [content])
  const srcRows = useLiveQuery<Src>(`SELECT id, source, captured_at, created_at FROM notes WHERE id IN (${srcIds.map(() => '?').join(',') || "''"})`, srcIds).data
  const sources = useMemo(() => new Map(srcRows.map((r) => [r.id, r])), [srcRows])
  if (!topic) {
    return (
      <View style={{ flex: 1, backgroundColor: p.cardBg }}>
        <NavRow left={<GlassButton label="뒤로" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>} />
        <Text style={[FONT.sub, { color: p.textTertiary, textAlign: 'center', marginTop: 60 }]}>주제를 찾을 수 없어요</Text>
      </View>
    )
  }
  const base = baseline ?? topic.version
  const fresh = !preview && topic.version > base
  const baseRow = versions.find((v) => v.version === base)
  const newSince = fresh ? baseRow?.created_at ?? '' : null
  const reason = fresh ? bandReason(topic.version, base, versions[0]?.reason) : ''
  const related = content.related.map((rid) => topics.find((t) => t.id === rid)).filter((t): t is { id: string; name: string } => !!t)
  const shown = SECTIONS.filter((s) => content.sections[s].length || locked.includes(s) || content.suggestions.some((x) => x.section === s))

  const restore = async (version: number, done: string) => {
    if (busy) return
    setBusy(true)
    try {
      const now = await restoreVersion(topic.id, version)
      setBaseline(now) // 내가 한 되돌리기는 띠로 알리지 않는다
      markSeen(topic.id, now)
      setPreview(undefined)
      toast.show(done)
    } catch (e) { toast.show(e instanceof Error ? e.message : '되돌리지 못했어요. 다시 시도해 주세요.', { error: true }) }
    finally { setBusy(false) }
  }
  const jump = (noteId: string) => { router.back(); setTimeout(() => openItem.emit(noteId), 350) }
  const chip = (l: WikiLine) => {
    const n = l.src ? sources.get(l.src) : undefined
    if (!n) return null
    return <Text accessibilityRole="button" accessibilityLabel={`출처 ${sourceLabel(n)}`} onPress={() => jump(n.id)} style={[s.src, { color: p.textTertiary, backgroundColor: p.bgSelected }]}>{`\u00a0${sourceLabel(n).split('').join('\u2060')}\u00a0`}</Text>
  }
  const section = (k: WikiSection) => {
    const lines = content.sections[k]
    const sug = content.suggestions.filter((x) => x.section === k).length
    return (
      <View key={k} style={s.sec}>
        <View style={s.secHead}>
          <Text style={[s.secTitle, { color: p.textSecondary }]}>{SECTION_NAME[k]}</Text>
          {locked.includes(k) ? <View style={s.lock}><Lock size={12} color={p.textTertiary} /><Text style={[FONT.meta, { color: p.textTertiary }]}>직접 고침</Text></View> : null}
        </View>
        {k === 'overview' && lines.length === 1 ? (
          <Text style={[s.line, { color: p.textPrimary }]}>{lines[0].text} {chip(lines[0])}</Text>
        ) : lines.map((l, i) => {
          const isNew = newSince !== null && l.at > newSince && l.by === 'ai'
          return (
            <View key={i} style={[s.li, isNew && { backgroundColor: p.accentSubtle }]}>
              <Text style={[s.line, { color: p.textTertiary }]}>•</Text>
              <Text style={[s.line, { color: p.textPrimary, flex: 1 }]}>{l.text} {chip(l)}</Text>
            </View>
          )
        })}
        {!lines.length ? <Text style={[FONT.sub, { color: p.textQuaternary }]}>아직 없어요</Text> : null}
        {sug && !preview ? <Text style={[FONT.meta, s.sug, { color: p.textTertiary, backgroundColor: p.bgSelected }]}>제안 {sug}개 · 컴퓨터에서 보기</Text> : null}
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.cardBg }}>
      <NavRow
        left={<GlassButton label="위키" onPress={() => router.back()}><ChevronLeft size={22} color={p.textPrimary} /></GlassButton>}
        right={<GlassButton label="이력" onPress={() => setHistory(true)}><History size={19} color={p.textPrimary} /></GlassButton>}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: space.pad }}>
        <View style={{ paddingHorizontal: M.gutter }}>
          <Text style={[s.h1, { color: p.textPrimary }]}>{topic.name}</Text>
          <Text style={[FONT.meta, { color: p.textTertiary, marginTop: 4, marginBottom: 10 }]}>자료 {topic.count} · 버전 {topic.version} · {changedAt(topic.modified_at).replace(' 고침', ' 정리')}</Text>
        </View>
        {preview ? (
          <View style={[s.band, { backgroundColor: p.accentSubtle }]}>
            <History size={16} color={p.accent} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={[FONT.sub, { color: p.textPrimary }]}>버전 {preview.version} 미리보기 · {preview.reason}</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Text accessibilityRole="button" onPress={() => void restore(preview.version, restoreReason(preview.version))} style={[s.bandBtn, { color: p.accent }]}>이 버전으로 되돌리기</Text>
                <Text accessibilityRole="button" onPress={() => setPreview(undefined)} style={[s.bandBtn, { color: p.textSecondary }]}>닫기</Text>
              </View>
            </View>
          </View>
        ) : fresh ? (
          <View style={[s.band, { backgroundColor: p.accentSubtle }]}>
            <Sparkles size={16} color={p.accent} style={{ marginTop: 2 }} />
            <Text style={[FONT.sub, { color: p.textPrimary, flex: 1 }]}>{reason}</Text>
            {base >= 1 ? <Text accessibilityRole="button" onPress={() => void restore(base, '되돌렸어요')} style={[s.bandBtn, { color: p.accent }]}>되돌리기</Text> : null}
            <Pressable accessibilityLabel="띠 닫기" hitSlop={8} onPress={() => setBaseline(topic.version)}><X size={16} color={p.textTertiary} /></Pressable>
          </View>
        ) : null}
        {!shown.length && !links.length && !related.length ? (
          <View style={{ paddingHorizontal: M.gutter, paddingTop: 20, gap: 6 }}>
            <Text style={[FONT.group, { color: p.textPrimary }]}>아직 정리된 내용이 없어요</Text>
            <Text style={[FONT.sub, { color: p.textTertiary }]}>이 주제에 맞는 자료를 수집에 던져 두면 AI가 여기에 정리해요.</Text>
          </View>
        ) : null}
        {shown.filter((k) => k !== 'questions').map(section)}
        {!preview && links.length ? (
          <View style={s.sec}>
            <Text style={[s.secTitle, { color: p.textSecondary }]}>볼 것</Text>
            {links.map((l) => (
              <Pressable key={l.id} accessibilityRole="link" onPress={() => void Linking.openURL(l.url!)} style={s.wlink}>
                <SiteMark url={l.url!} />
                <Text style={[FONT.body, { color: p.textPrimary, flex: 1, fontSize: 15 }]} numberOfLines={1}>{l.link_title || l.url}</Text>
                <Text style={[FONT.meta, { color: p.textTertiary }]}>{domainOf(l.url!)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {related.length ? (
          <View style={s.sec}>
            <Text style={[s.secTitle, { color: p.textSecondary }]}>관련 주제</Text>
            <View style={s.rel}>
              {related.map((t) => (
                <Pressable key={t.id} accessibilityRole="button" onPress={() => router.push(`/collect/wiki/${t.id}`)} style={[s.relChip, { backgroundColor: p.bgSelected }]}>
                  <Text style={[FONT.sub, { color: p.textPrimary }]}>{t.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {shown.includes('questions') ? section('questions') : null}
      </ScrollView>

      <BottomSheet visible={history} onClose={() => setHistory(false)} mid={0.55} label="이력" head={<SheetHead compact title="이력" onClose={() => setHistory(false)} />}>
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {versions.map((v) => {
            const on = preview?.version === v.version || (!preview && v.version === topic.version)
            return (
              <Pressable key={v.id} accessibilityRole="button" onPress={() => { setPreview(v.version === topic.version ? undefined : v); setHistory(false) }} style={({ pressed }) => [s.ver, { borderTopColor: p.borderDivider }, (pressed || on) && { backgroundColor: p.bgSelected }]}>
                <Text style={[FONT.bodyStrong, { color: p.textPrimary, fontSize: 15 }]}>버전 {v.version}{v.version === topic.version ? ' · 지금' : ''}</Text>
                <Text style={[FONT.sub, { color: p.textSecondary }]}>{v.reason}</Text>
                <Text style={[FONT.meta, { color: p.textTertiary }]}>{fullKo(v.created_at)}</Text>
              </Pressable>
            )
          })}
          {!versions.length ? <Text style={[FONT.sub, { color: p.textTertiary, padding: 16 }]}>아직 이력이 없어요</Text> : null}
        </ScrollView>
      </BottomSheet>
    </View>
  )
}

const s = StyleSheet.create({
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  band: { marginHorizontal: M.gutter, marginBottom: 8, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bandBtn: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  sec: { paddingHorizontal: M.gutter, paddingTop: 14, gap: 4 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginBottom: 2 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  li: { flexDirection: 'row', gap: 8, borderRadius: 6, paddingHorizontal: 4, marginHorizontal: -4 },
  line: { fontSize: 15, lineHeight: 23 },
  src: { fontSize: 11, lineHeight: 15, borderRadius: 4, overflow: 'hidden' },
  sug: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4, overflow: 'hidden' },
  wlink: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  ver: { paddingHorizontal: 16, paddingVertical: 10, gap: 2, borderTopWidth: StyleSheet.hairlineWidth }
})
