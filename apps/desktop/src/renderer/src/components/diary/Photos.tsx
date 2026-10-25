import { ImagePlus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { addPhotos, isPhotoFile, removePhoto, usePendingPhotos, usePhotos, usePhotoUrl, type DiaryPhoto } from '../../data/diary'
import { useToast } from '../Toast'

// 28 §10.3 · 15 §11 사진 한 장(데스크톱): 📷 단추(파일 고르기) · 끌어 놓기 · ⌘V 붙여넣기 → 줄여서(1600·JPEG 0.8) 올리고 그날 diary_photos 행.
// 사진 줄: 그날 사진(흰 테두리, 붙을 때 −8° → 5° 떨어져 붙음) + `＋ 사진`. 지우기 = 사진 위 ✕(서버가 하루 뒤 바이트 정리). 하루 10장.

/** 그날 사진 붙이기 — 고르기·끌어 놓기·붙여넣기가 같이 쓴다 */
export function usePhotoAdd(date: string) {
  const toast = useToast()
  const photos = usePhotos(date)
  const pending = usePendingPhotos(date)
  const [busy, setBusy] = useState(false)
  const count = photos.length + pending.length
  const add = useCallback(async (files: Blob[]): Promise<boolean> => {
    const imgs = files.filter((f) => isPhotoFile(f as File))
    if (!imgs.length) { if (files.length) toast.show('사진 파일만 붙일 수 있어요'); return false }
    if (count >= 10) { toast.show('하루에 사진은 10장까지예요'); return false }
    setBusy(true)
    try {
      const r = await addPhotos(date, imgs, count)
      if (r.error) toast.show(r.added && /끊|못했/.test(r.error) ? `${r.error} · 다시 연결되면 올릴게요` : r.error)
      else if (r.added) toast.show(r.added > 1 ? `사진 ${r.added}장을 그날 장면에 붙였어요` : '그날 장면에 사진을 붙였어요')
      return r.added > 0
    } finally { setBusy(false) }
  }, [date, count, toast])
  // 파일 고르기(📷) — 숨긴 input 하나
  const input = useRef<HTMLInputElement | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  useEffect(() => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = 'image/*'
    el.multiple = true
    el.style.display = 'none'
    document.body.appendChild(el)
    input.current = el
    return () => { el.remove(); input.current = null }
  }, [])
  const pick = useCallback(() => new Promise<boolean>((resolve) => {
    const el = input.current
    if (!el) { resolve(false); return }
    resolver.current?.(false)
    resolver.current = resolve
    el.value = ''
    el.onchange = () => { const fs = [...(el.files ?? [])]; resolver.current = null; void add(fs).then(resolve) }
    el.oncancel = () => { resolver.current = null; resolve(false) }
    el.click()
  }), [add])
  return { photos, pending, busy, add, pick, count }
}

/** 사진 줄(오른쪽 칸 · 혼자 쓰기 아래) */
export function PhotoStrip({ photos, pending, onAdd, size = 72, busy }: { photos: DiaryPhoto[]; pending: { localId: string; url: string }[]; onAdd: () => void; size?: number; busy?: boolean }) {
  const [seen] = useState(() => new Set(photos.map((p) => p.id)))
  return (
    <div className="dphotos" style={{ ['--ph' as string]: `${size}px` }}>
      {photos.map((ph) => <PhotoThumb key={ph.id} photo={ph} drop={!seen.has(ph.id)} />)}
      {pending.map((x) => <span key={x.localId} className="dphoto is-pending" title="올리는 중"><img src={x.url} alt="" /></span>)}
      {photos.length + pending.length < 10 && (
        <button className="dphoto is-add" onClick={onAdd} disabled={busy} aria-label="사진 한 장 붙이기" title="사진 붙이기 — 끌어다 놓거나 ⌘V로 붙여도 돼요">
          <ImagePlus /><span>{busy ? '붙이는 중' : '사진'}</span>
        </button>
      )}
    </div>
  )
}

function PhotoThumb({ photo, drop }: { photo: DiaryPhoto; drop: boolean }) {
  const url = usePhotoUrl(photo.media_id)
  const toast = useToast()
  const [ask, setAsk] = useState(false)
  return (
    <span className={`dphoto${drop ? ' is-drop' : ''}`} onMouseLeave={() => setAsk(false)}>
      {url ? <img src={url} alt="일기 사진" draggable={false} /> : <i className="dphoto__wait" />}
      {ask
        ? <button className="dphoto__del is-ask" onClick={() => { setAsk(false); void removePhoto(photo.id).then(() => toast.show('사진을 뺐어요')) }}>지우기</button>
        : <button className="dphoto__del" aria-label="사진 지우기" onClick={() => setAsk(true)}><X /></button>}
    </span>
  )
}
