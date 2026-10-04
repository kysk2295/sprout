import { FileText, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { parseKakao, type KakaoParse } from '../../../../shared/collect'
import { importKakao, knownFingerprints } from '../../data/collect'
import { getDb } from '../../data/db'
import { Dialog } from '../Dialog'

export const LAST_IMPORT_KEY = 'sprout.collect.lastImport'
type Preview = { name: string; size: number; parse: KakaoParse; skip: number }
const sizeLabel = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`)
const dayKo = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

/** 카카오톡 대화 가져오기(v3-4, 폭 440): 안내 3단계 → 파일 놓기 → 미리보기 → 가져와서 정리하기. 파일은 기기 안에서만 읽는다 */
export function KakaoDialog({ onClose, onDone }: { onClose: () => void; onDone: (count: number) => void }) {
  const [preview, setPreview] = useState<Preview>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const read = async (file: File | undefined) => {
    if (!file) return
    setError(''); setPreview(undefined)
    if (!/\.(txt|csv)$/i.test(file.name)) return setError('카카오톡에서 내보낸 .txt 또는 .csv 파일을 골라 주세요.')
    if (file.size > 50 * 1024 * 1024) return setError('파일이 너무 커요(50MB까지).')
    try {
      const parse = parseKakao(await file.text())
      if (!parse.messages.length) return setError('읽을 메시지가 없어요. 카카오톡 "대화 내보내기"로 저장한 파일인지 확인해 주세요.')
      const known = await knownFingerprints(parse.messages.map((m) => m.fingerprint))
      const seen = new Set<string>()
      let skip = 0
      for (const m of parse.messages) { if (known.has(m.fingerprint) || seen.has(m.fingerprint)) skip++; seen.add(m.fingerprint) }
      setPreview({ name: file.name, size: file.size, parse, skip })
    } catch { setError('파일을 읽지 못했어요. 다시 시도해 주세요.') }
  }
  const start = async () => {
    if (!preview || busy) return
    setBusy(true)
    try {
      // 진행 띠 합계 = 아직 정리 안 된 앞선 가져오기 + 이번 것
      const left = (await (await getDb()).get<{ n: number }>("SELECT COUNT(*) AS n FROM notes WHERE source = 'kakao_import' AND ai_state = 'pending'"))?.n ?? 0
      const count = await importKakao(preview.parse.messages)
      try { localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify({ count: left + count, at: new Date().toISOString() })) } catch { /* 진행 띠 합계만 덜 정확해진다 */ }
      onDone(count)
    } catch {
      setError('가져오지 못했어요. 다시 시도해 주세요.')
      setBusy(false)
    }
  }
  const p = preview?.parse
  const fresh = p ? p.messages.length - preview!.skip : 0
  return (
    <Dialog label="카카오톡 대화 가져오기" className="kakao-dialog" onClose={onClose}>
      <h3>카카오톡 대화 가져오기</h3>
      <ol>
        <li>카카오톡 "나와의 채팅"(또는 자주 보내던 채팅방)을 열어요</li>
        <li>메뉴 → 대화 내보내기 → 텍스트로 저장</li>
        <li>저장한 파일을 아래에 놓아 주세요</li>
      </ol>
      <div
        className={`kakao-dialog__drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files[0]) }}
      >
        {preview ? <FileText /> : <Upload />}
        <div className="kakao-dialog__file">
          {preview ? <><b>{preview.name}</b><span>{sizeLabel(preview.size)}</span></> : <><b>파일을 여기에 놓으세요</b><span>.txt · .csv — 서버에 올리지 않고 이 기기에서만 읽어요</span></>}
        </div>
        <button className="kakao-dialog__pick" onClick={() => input.current?.click()}>{preview ? '다른 파일' : '파일 고르기'}</button>
        <input ref={input} type="file" accept=".txt,.csv,text/plain,text/csv" hidden onChange={(e) => { void read(e.target.files?.[0]); e.target.value = '' }} />
      </div>
      {p && (
        <div className="kakao-dialog__preview">
          <strong>메시지 {p.messages.length.toLocaleString()}개</strong>{p.from && p.to ? ` · ${dayKo(p.from) === dayKo(p.to) ? dayKo(p.from) : `${dayKo(p.from)} ~ ${dayKo(p.to)}`}` : ''}<br />
          링크 {p.links} · 글 {p.messages.length - p.links}{preview!.skip ? ` · 이미 가져온 ${preview!.skip}개는 건너뛰어요` : ''}<br />
          사진·이모티콘·파일은 빼고 가져와요{p.skipped ? `(${p.skipped}개)` : ''}
        </div>
      )}
      {error && <p className="kakao-dialog__error" role="alert">{error}</p>}
      <div className="kakao-dialog__acts">
        <button onClick={onClose}>취소</button>
        <button className="is-primary" disabled={!p || !fresh || busy} onClick={() => void start()}>{busy ? '가져오는 중…' : p && !fresh ? '새로 가져올 메시지가 없어요' : '가져와서 정리하기'}</button>
      </div>
    </Dialog>
  )
}
