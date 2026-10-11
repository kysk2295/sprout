/** Only tool-derived IDs are evidence; prose and the truncated recent list are not. */
export type TaskLookup = { ids: string[]; total: number }
/** Honor an explicit no-execution constraint on a requested text draft. */
export function draftWithoutMutation(text: string): boolean {
  return /(초안|예문|문장|문구|대사|문자|메일)/.test(text) && /실제(?:로)?\s*(취소|삭제|변경|수정|등록|완료)(?:는|를|을)?\s*하지\s*(마|말)/.test(text)
}
export function taskReference(text: string, lookup?: TaskLookup): { referential: boolean; id?: string } {
  const t = text.trim().replace(/^(그러면|그럼)\s*/, '')
  const referential = /^(그거|그걸|그건|그것|저거|저것|저건|저걸|이거|이것|이건|이걸|그\s*(항목|일|건)|그중|그\s*중|그\s*둘|첫\s*번째|두\s*번째|마지막\s*항목)/.test(t) || /^(완료(?:로|\s*처리)?\s*해\s*줘|끝난\s*걸로\s*해|삭제해\s*줘|지워\s*줘|체크해\s*줘)[.!?~]*$/.test(t)
  if (!referential) return { referential: false }
  if (!lookup || lookup.total !== lookup.ids.length || new Set(lookup.ids).size !== lookup.total) return { referential: true }
  let index: number | undefined
  if (/첫\s*번째|앞에\s*(말|나온)|먼저\s*말/.test(t)) index = 0
  else if (/두\s*번째/.test(t)) index = 1
  else if (/뒤에\s*(말|나온)|마지막/.test(t)) index = lookup.total - 1
  else if (lookup.total === 1) index = 0
  return { referential: true, ...(index !== undefined && lookup.ids[index] ? { id: lookup.ids[index] } : {}) }
}
