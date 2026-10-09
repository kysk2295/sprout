// 아주 작은 SVG 글 → 나무 변환(휴대폰 react-native-svg가 캐릭터 그림 글을 요소로 그리려고).
// 우리 그림 글(characterArt.ts)만 읽는다: 태그 · 따옴표 속성 · 스스로 닫는 태그 · <text> 안 글. 주석·CDATA·엔티티는 없다.
export type SvgNode = { tag: string; attrs: Record<string, string>; children: SvgNode[]; text?: string }

const ATTR = /([A-Za-z_:][-\w:.]*)\s*=\s*"([^"]*)"/g
export function parseSvg(src: string): SvgNode {
  const root: SvgNode = { tag: '#root', attrs: {}, children: [] }
  const stack: SvgNode[] = [root]
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt < 0) break
    if (lt > i) { const t = src.slice(i, lt); if (t.trim()) { const top = stack[stack.length - 1]; top.text = (top.text ?? '') + t } }
    const gt = src.indexOf('>', lt)
    if (gt < 0) break
    const raw = src.slice(lt + 1, gt)
    i = gt + 1
    if (raw.startsWith('/')) { if (stack.length > 1) stack.pop(); continue }
    if (raw.startsWith('!') || raw.startsWith('?')) continue
    const self = raw.endsWith('/')
    const body = self ? raw.slice(0, -1) : raw
    const sp = body.search(/\s/)
    const tag = sp < 0 ? body : body.slice(0, sp)
    const attrs: Record<string, string> = {}
    if (sp >= 0) for (const m of body.slice(sp).matchAll(ATTR)) attrs[m[1]] = m[2]
    const node: SvgNode = { tag, attrs, children: [] }
    stack[stack.length - 1].children.push(node)
    if (!self) stack.push(node)
  }
  return root.children[0] ?? root
}

/** 속성 이름 kebab → react-native-svg prop(camel). class·style·xmlns·role·aria-*는 버린다 */
export function rnProps(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class' || k === 'style' || k === 'xmlns' || k === 'role' || k.startsWith('aria-')) continue
    out[k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = v
  }
  return out
}
