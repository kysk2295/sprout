// 28 §8.2·§8.10·§9(M) 그날의 장들: 장마다 종이 카드(시각·제목·태그·본문, 💬 대화로 만든 장 / ✎ 혼자 쓴 장) + `느리와 나눈 이야기 N개`(접힘)
// + `그날 끝낸 할 일 N개`(접힘). 혼자 쓴 장 = 고치기, 아래 `＋ 혼자 이어 쓰기`. 빈 날 = `그날 이야기 하기` · `혼자 쓰기`.
// 오늘도 혼자 쓰기를 저장하면 이 화면. 나만 보기는 없앴다(§9.7 ⑥ — 예전 private 날도 표시 없음). 좌우로 밀면 앞뒤 날(밀기는 화면이 준다).
import { CheckSquare, ChevronDown, ChevronRight, MessageCircle, PenLine, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Tap } from '../ui/Pressables'
import { GestureDetector, type GestureType } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '../theme/ThemeProvider'
import { alpha } from '../theme/palette'
import { parseSections } from '@sprout/schema/diaryPrompts'
import { MoodFace } from './art'
import { useDayStats, useMessages } from './data'
import { isWritten, josa, mayCallAi, moodOf, parseBuddyReply, type Buddy, type DiaryEntry } from './logic'
import { BuddyArt } from './parts'
import { useDiaryPrefs } from './prefs'
import { paperOf } from './SoloWrite'
import { useRouter } from 'expo-router'
import { Image } from 'react-native'
import { SceneCardView } from './SceneCard'
import { useSceneCard } from './sceneData'
import { PhotoSheet } from './PhotoSheet'
import { usePendingPhotos, usePhotos, usePhotoUri, removePhoto, type DiaryPhoto } from './photos'
import { ImagePlus } from 'lucide-react-native'

export function PastDay({ date, entry, buddy, reduced, swipe, onChat, onSolo }: {
  date: string; entry: DiaryEntry | undefined; buddy: Buddy & { stage: number }; reduced: boolean; swipe: GestureType; onChat: () => void
  /** 혼자 쓰기: index = 고칠 장, null = 새 장 */
  onSolo: (index: number | null) => void
}) {
  const p = usePalette()
  const insets = useSafeAreaInsets()
  const messages = useMessages(date)
  const stats = useDayStats(date)
  const prefs = useDiaryPrefs()
  const [openTalk, setOpenTalk] = useState(false)
  const [openDone, setOpenDone] = useState(false)
  const name = buddy.name
  const written = !!entry && isWritten(entry)
  const m = moodOf(entry?.mood)
  const sections = parseSections(entry?.content)
  const talk = messages.filter((x) => x.safety !== 1)
  const router = useRouter()
  const card = useSceneCard(date)
  const photos = usePhotos(date)
  const pending = usePendingPhotos(date)
  const [photoSheet, setPhotoSheet] = useState(false)
  const canTalk = written && prefs.consent !== false
  const paper = paperOf(p.dark, p.cardBg)
  return (
    // GestureDetector는 자식이 하나여야 한다 — 사진 시트를 안에 같이 두면 이 화면을 여는 순간 앱이 죽었다(2026-10-25 iOS QA) → 시트는 밖으로
    <>
    <GestureDetector gesture={swipe}>
      <ScrollView contentContainerStyle={[s.wrap, { paddingBottom: insets.bottom + 32 }]}>
        {card ? <SceneCardView card={card} variant="row" reduced={reduced} onPress={() => router.push({ pathname: '/diary/scene', params: { date } })} /> : null}
        <View style={s.photos}>
          {photos.map((ph) => <PhotoThumb key={ph.id} photo={ph} onRemove={() => void removePhoto(ph.id)} />)}
          {pending.map((x) => <View key={x.localId} style={s.thumb}><Image source={{ uri: x.file }} style={[s.thumbImg, { opacity: 0.5 }]} /></View>)}
          <Tap accessibilityRole="button" accessibilityLabel="사진 한 장 붙이기" onPress={() => setPhotoSheet(true)} style={[s.thumb, s.addThumb, { borderColor: p.borderStrong }]}>
            <ImagePlus size={20} color={p.textSecondary} />
            <Text style={{ color: p.textSecondary, fontSize: 11.5, fontWeight: '600' }}>사진</Text>
          </Tap>
        </View>
        {!written ? (
          <View style={s.empty}>
            <BuddyArt buddy={buddy} stage={buddy.stage} size={88} mood="smile" still={reduced} />
            <Text style={[s.emptyTitle, { color: p.textPrimary }]}>이 날은 비어 있어요</Text>
            <Text style={[s.emptySub, { color: p.textTertiary }]}>{josa(name, '가', '이')} 그날 이야기를 물어볼게요</Text>
            <Tap accessibilityRole="button" onPress={onChat} style={[s.btn, { backgroundColor: p.accent }]}><Text style={[s.btnText, { color: p.onAccent }]}>그날 이야기 하기</Text></Tap>
            <Tap accessibilityRole="button" onPress={() => onSolo(null)} style={[s.btn, { borderWidth: 1, borderColor: p.borderStrong }]}><Text style={[s.btnText, { color: p.textPrimary }]}>혼자 쓰기</Text></Tap>
            {stats.done ? <Text style={[s.emptySub, { color: p.textTertiary, marginTop: 12 }]}>그날 끝낸 할 일 {stats.done}개</Text> : null}
          </View>
        ) : (
          <>
            {m ? <View style={s.pm}><MoodFace mood={m.value} size={30} /><Text style={{ color: p.textPrimary, fontSize: 14, fontWeight: '700' }}>{m.label}</Text></View> : null}
            {sections.length ? sections.map((sec, i) => (
              <View key={i} style={[s.card, { backgroundColor: paper, borderColor: p.borderDivider }]}>
                <View style={s.meta}>
                  {sec.solo ? <PenLine size={13} color={p.textTertiary} /> : sec.time ? <MessageCircle size={13} color={p.textTertiary} /> : null}
                  <Text style={{ color: p.textTertiary, fontSize: 12.5, fontWeight: '600' }}>{[sec.time, sec.solo ? '혼자' : sec.time ? `${josa(name, '와', '과')} 이야기` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                {sec.title ? <Text style={{ color: p.textPrimary, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 }}>{sec.title}</Text> : null}
                {sec.tags.length ? <View style={s.tags}>{sec.tags.map((t) => <View key={t} style={[s.tag, { backgroundColor: alpha(p.accent, 0.1) }]}><Text style={{ color: p.accentInk, fontSize: 12, fontWeight: '600' }}>{t}</Text></View>)}</View> : null}
                {sec.body ? <Text style={[s.pt, { color: p.textPrimary }]} selectable>{sec.body}</Text> : null}
                {sec.solo ? (
                  <Tap accessibilityRole="button" accessibilityLabel={`${sec.title || '이 장'} 고치기`} onPress={() => onSolo(i)} style={[s.edit, { backgroundColor: alpha(p.textTertiary, 0.1) }]} hitSlop={4}>
                    <Text style={{ color: p.textSecondary, fontSize: 13, fontWeight: '600' }}>고치기</Text>
                  </Tap>
                ) : null}
              </View>
            )) : <View style={[s.card, { backgroundColor: paper, borderColor: p.borderDivider }]}><Text style={[s.pt, { color: p.textSecondary }]}>(기분만 남겼어요)</Text></View>}
            <Tap accessibilityRole="button" onPress={() => onSolo(null)} style={[s.row, { backgroundColor: p.cardBg }]}>
              <Plus size={18} color={p.textSecondary} />
              <Text style={[s.rowText, { color: p.textPrimary }]}>혼자 이어 쓰기</Text>
            </Tap>
            {talk.length ? (
              <>
                <Tap accessibilityRole="button" accessibilityState={{ expanded: openTalk }} onPress={() => setOpenTalk((v) => !v)} style={[s.row, { backgroundColor: p.cardBg }]}>
                  <MessageCircle size={18} color={p.textSecondary} />
                  <Text style={[s.rowText, { color: p.textPrimary }]}>{josa(name, '와', '과')} 나눈 이야기</Text>
                  <Text style={{ color: p.textTertiary, fontSize: 13 }}>{talk.length}개</Text>
                  {openTalk ? <ChevronDown size={18} color={p.textTertiary} /> : <ChevronRight size={18} color={p.textTertiary} />}
                </Tap>
                {openTalk ? (
                  <View style={s.talk}>
                    {talk.map((x) => (
                      <Text key={x.id} style={{ color: p.textSecondary, fontSize: 13.5, lineHeight: 20 }}>
                        <Text style={{ color: p.textPrimary, fontWeight: '700' }}>{x.role === 'me' ? '나' : name} </Text>
                        {x.role === 'buddy' && !x.safety ? parseBuddyReply(x.content).text : x.content}
                        {x.role === 'buddy' && !x.safety ? <Text style={{ color: p.brandApricot, fontSize: 10, fontWeight: '800' }}>  AI</Text> : null}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            {canTalk && mayCallAi({ consent: prefs.consent ?? true, private: entry?.private, solo: false }) ? (
              <Tap accessibilityRole="button" onPress={onChat} style={[s.row, { backgroundColor: p.cardBg }]}>
                <MessageCircle size={18} color={p.accentInk} />
                <Text style={[s.rowText, { color: p.accentInk }]}>{josa(name, '와', '과')} 이 날 이야기하기</Text>
                <ChevronRight size={18} color={p.textTertiary} />
              </Tap>
            ) : null}
            {stats.done ? (
              <>
                <Tap accessibilityRole="button" accessibilityState={{ expanded: openDone }} onPress={() => setOpenDone((v) => !v)} style={[s.row, { backgroundColor: p.cardBg }]}>
                  <CheckSquare size={18} color={p.textSecondary} />
                  <Text style={[s.rowText, { color: p.textPrimary }]}>그날 끝낸 할 일</Text>
                  <Text style={{ color: p.textTertiary, fontSize: 13 }}>{stats.done}개</Text>
                  {openDone ? <ChevronDown size={18} color={p.textTertiary} /> : <ChevronRight size={18} color={p.textTertiary} />}
                </Tap>
                {openDone ? <View style={s.talk}>{stats.doneTitles.map((t, i) => <Text key={i} style={{ color: p.textSecondary, fontSize: 13.5, lineHeight: 20 }}>✓ {t}</Text>)}</View> : null}
              </>
            ) : null}
          </>
        )}
        <Text style={[s.hint, { color: p.textQuaternary }]}>← 밀어서 다음 날 · 밀어서 전날 →</Text>
      </ScrollView>
    </GestureDetector>
    <PhotoSheet visible={photoSheet} date={date} count={photos.length + pending.length} onClose={() => setPhotoSheet(false)} />
    </>
  )
}
/** 사진 한 장(길게 누르면 지우기 확인) */
function PhotoThumb({ photo, onRemove }: { photo: DiaryPhoto; onRemove: () => void }) {
  const uri = usePhotoUri(photo.media_id)
  const [ask, setAsk] = useState(false)
  const p = usePalette()
  return (
    <Tap accessibilityRole="imagebutton" accessibilityLabel="일기 사진, 길게 누르면 지우기" onLongPress={() => setAsk(true)} style={s.thumb}>
      {uri ? <Image source={{ uri }} style={s.thumbImg} /> : <View style={[s.thumbImg, { backgroundColor: p.bgSelected }]} />}
      {ask ? (
        <Tap accessibilityRole="button" onPress={() => { setAsk(false); onRemove() }} style={[StyleSheet.absoluteFill, s.del]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12.5 }}>지우기</Text></Tap>
      ) : null}
    </Tap>
  )
}

const s = StyleSheet.create({
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 72, height: 72, borderRadius: 14, overflow: 'hidden' },
  thumbImg: { width: 72, height: 72, borderRadius: 14 },
  addThumb: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
  del: { backgroundColor: 'rgba(200,60,40,0.78)', alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  wrap: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 14, lineHeight: 20 },
  btn: { height: 48, minWidth: 180, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { fontSize: 15, fontWeight: '700' },
  card: { borderRadius: 20, padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  edit: { alignSelf: 'flex-start', marginTop: 6, height: 34, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pm: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  pt: { fontSize: 16.5, lineHeight: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 16 },
  rowText: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  talk: { paddingHorizontal: 6, gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  hint: { textAlign: 'center', fontSize: 11.5, marginTop: 16 }
})
