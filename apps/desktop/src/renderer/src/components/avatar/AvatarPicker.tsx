// 35 §3.2 프로필 이미지 고르기 팝오버: 미리 보기 · 배경색 8 · 내 캐릭터 따라가기(추천) · 성장 캐릭터 4×5 · 얼굴 8 · 글자로 되돌리기.
// 칸·색을 누르는 즉시 저장(저장 버튼 없음). Esc·바깥 클릭·✕ = 닫기.
import {
  AVATAR_COLORS, AVATAR_FACES, avatarLabel, CHAR_SPECIES, charAvatarId, pickAvatar, pickAvatarColor, resolveAvatar, sameAvatar, SPECIES_SHORT, stageName,
  type AvatarKind, type AvatarPref
} from '@sprout/schema/avatar'
import { STAGES } from '@sprout/schema/growth'
import { X } from 'lucide-react'
import { saveAvatar, useAvatar } from '../../data/avatar'
import { Popover } from '../Popover'
import { ProfileAvatar } from './ProfileAvatar'

export function AvatarPicker({ anchor, letter, onClose, align = 'start' }: { anchor: HTMLElement | null; letter: string; onClose: () => void; align?: 'start' | 'end' }) {
  const { pref, resolved, growth } = useAvatar()
  const save = (next: AvatarPref | null | ((cur: AvatarPref | null) => AvatarPref | null)) => void saveAvatar(next)
  const pick = (kind: AvatarKind, id?: string) => save((cur) => pickAvatar(cur, kind, id))
  const color = pref?.color
  const cell = (kind: AvatarKind, id: string | undefined, label: string) => {
    const shown = resolveAvatar(pickAvatar(pref, kind, id), growth)
    const on = sameAvatar(pref, kind, id)
    return (
      <button key={`${kind}:${id ?? ''}`} className={`avatar-picker__cell${on ? ' is-selected' : ''}`} aria-label={label} aria-pressed={on} title={label} onClick={() => pick(kind, id)}>
        <ProfileAvatar avatar={shown} size={40} letter={letter} />
      </button>
    )
  }
  const followShown = resolveAvatar(pickAvatar(pref, 'follow'), growth)
  return (
    <Popover anchor={anchor} onClose={onClose} align={align} width={320} className="avatar-picker">
      <div role="dialog" aria-label="프로필 이미지">
        <div className="avatar-picker__head">
          <ProfileAvatar avatar={resolved} size={64} letter={letter} />
          <div className="avatar-picker__title"><strong>프로필 이미지</strong><span>{avatarLabel(pref)}</span></div>
          <button className="avatar-picker__close" aria-label="닫기" onClick={onClose}><X /></button>
        </div>
        <div className="avatar-picker__caption">배경색</div>
        <div className="avatar-picker__colors">
          {AVATAR_COLORS.map((c) => (
            <button key={c.id} className={`avatar-picker__color${color === c.id ? ' is-selected' : ''}`} style={{ background: c.hex }} aria-label={`배경 ${c.name}`} aria-pressed={color === c.id} title={c.name} onClick={() => save((cur) => pickAvatarColor(cur, c.id))} />
          ))}
        </div>
        <div className="avatar-picker__caption">추천</div>
        <button className={`avatar-picker__follow${sameAvatar(pref, 'follow') ? ' is-selected' : ''}`} aria-pressed={sameAvatar(pref, 'follow')} onClick={() => pick('follow')}>
          <ProfileAvatar avatar={followShown} size={40} letter={letter} />
          <span><strong>내 캐릭터 따라가기<span className="avatar-picker__badge">추천</span></strong><small>{growth.species ? `${SPECIES_SHORT[growth.species]} · ${stageName(growth.stage)} — 진화하면 같이 자라요` : '성향 조사를 하면 내 캐릭터가 나와요'}</small></span>
        </button>
        <div className="avatar-picker__caption">성장 캐릭터</div>
        {CHAR_SPECIES.map((sp) => (
          <div key={sp}>
            <div className="avatar-picker__row-label">{SPECIES_SHORT[sp]}</div>
            <div className="avatar-picker__grid">{STAGES.map((st) => cell('char', charAvatarId(sp, st.stage), `${SPECIES_SHORT[sp]} · ${st.name}`))}</div>
          </div>
        ))}
        <div className="avatar-picker__caption">얼굴</div>
        <div className="avatar-picker__grid avatar-picker__grid--faces">{AVATAR_FACES.map((f) => cell('face', f.id, f.name))}</div>
        <button className="avatar-picker__reset" disabled={!pref} onClick={() => save(null)}>글자로 되돌리기</button>
      </div>
    </Popover>
  )
}
