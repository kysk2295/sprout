// 동기화 테이블 정의 — docs/screens/01-app-shell §10, 02-task-list §14, 03-date-picker §9
// 모든 테이블은 id(uuid, 암묵적) + owner_id + created_at + modified_at을 가진다.
export type ColumnType = 'text' | 'integer' | 'real'
export interface TableDef {
  columns: Record<string, ColumnType>
  indexes?: Record<string, string[]>
}

const common = { owner_id: 'text', created_at: 'text', modified_at: 'text' } as const

export const TABLES = {
  // 11 수집함 v3: kind 'memo'|'task'|'link'|'wiki'(없으면 memo), source 'app'|'kakao_import'|'kakao_channel'
  notes: {
    columns: {
      ...common,
      content: 'text',
      task_id: 'text',
      kind: 'text',
      kind_source: 'text', // 'ai' | 'user'
      ai_state: 'text', // 'pending' | 'done' | 'failed'
      suggestion: 'text', // 할 일 제안 JSON
      url: 'text',
      link_title: 'text',
      seen_at: 'text',
      topic_id: 'text',
      source: 'text',
      captured_at: 'text', // 원래 보낸 시각(카톡 가져오기)
      fingerprint: 'text' // 중복 막기
    },
    indexes: { topic: ['topic_id'], fingerprint: ['fingerprint'] }
  },
  wiki_topics: { columns: { ...common, name: 'text', source: 'text', content: 'text', locked: 'text', version: 'integer' } },
  wiki_versions: {
    columns: { ...common, topic_id: 'text', version: 'integer', content: 'text', reason: 'text' },
    indexes: { topic: ['topic_id'] }
  },
  folders: { columns: { ...common, name: 'text', sort_order: 'real' } },
  lists: {
    columns: {
      ...common,
      name: 'text',
      emoji: 'text',
      color: 'text',
      folder_id: 'text',
      kind: 'text', // 'inbox' | 'normal'
      sort_order: 'real',
      pinned: 'integer',
      archived_at: 'text',
      show_in_smart: 'text', // 'all' | 'none'
      description: 'text' // 33 리스트 페이지 머리 설명(500자)
    }
  },
  // 33 태그 = 위키 페이지. kind 'topic'|'person'|'project'|'place'(없으면 topic) · aliases JSON 글 배열 ·
  // topic_id = wiki_topics.id(1:1) · home_type 'folder'|'list' + home_id(프로젝트의 집) ·
  // source 'user'|'ai'(AI가 자동으로 만든 태그 = ai, 사용자가 이름·종류를 고치면 user) · run_id = 만든 일괄 태그 묶음
  tags: {
    columns: {
      ...common,
      name: 'text',
      color: 'text',
      parent_id: 'text',
      sort_order: 'real',
      pinned: 'integer',
      kind: 'text',
      aliases: 'text',
      description: 'text',
      topic_id: 'text',
      home_type: 'text',
      home_id: 'text',
      source: 'text',
      run_id: 'text'
    }
  },
  filters: { columns: { ...common, name: 'text', emoji: 'text', rule_json: 'text', sort_order: 'real' } },
  sections: { columns: { ...common, list_id: 'text', name: 'text', sort_order: 'real' }, indexes: { list: ['list_id'] } },
  tasks: {
    columns: {
      ...common,
      list_id: 'text',
      parent_id: 'text',
      section_id: 'text',
      title: 'text',
      content: 'text',
      content_mode: 'text', // 'text' | 'checklist'
      status: 'integer', // 0 미완료 · 1 완료 · 2 하지 않음
      priority: 'integer', // 0 없음 · 1 낮음 · 2 중간 · 3 높음
      start_at: 'text',
      due_at: 'text', // floating: 'YYYY-MM-DD' (종일) 또는 'YYYY-MM-DDTHH:mm'
      is_all_day: 'integer',
      time_zone: 'text', // 'floating'
      repeat_rule: 'text',
      repeat_from: 'text',
      repeat_origin_id: 'text',
      sort_order: 'real',
      pinned_at: 'text',
      completed_at: 'text',
      deleted_at: 'text'
    },
    indexes: { list: ['list_id'], due: ['due_at'], parent: ['parent_id'], status: ['status'] }
  },
  check_items: {
    columns: { ...common, task_id: 'text', title: 'text', done: 'integer', sort_order: 'real', completed_at: 'text' },
    indexes: { task: ['task_id'] }
  },
  // 33: source 'user'|'link'|'rule'|'ai'(없으면 user) · state 'accepted'|'suggested'|'dismissed'(없으면 accepted) ·
  // confidence 0~100(ai만) · run_id 일괄 태그 묶음. 태그를 세는 곳은 state가 없거나 'accepted'인 행만 본다
  task_tags: {
    columns: { ...common, task_id: 'text', tag_id: 'text', source: 'text', state: 'text', confidence: 'integer', run_id: 'text' },
    indexes: { task: ['task_id'], tag: ['tag_id'] }
  },
  reminders: { columns: { ...common, task_id: 'text', trigger: 'text' }, indexes: { task: ['task_id'] } },
  view_settings: {
    columns: { ...common, view_key: 'text', group_by: 'text', sort_by: 'text', sort_dir: 'text', show_completed: 'integer', show_details: 'integer', options_json: 'text' },
    indexes: { key: ['view_key'] }
  },
  // notify_json: 32 §9.2 알림 설정(사용자 단위 — 데스크톱·휴대폰이 같은 값, notify.ts parseNotifyPrefs)
  // avatar_json: 35 프로필 이미지 {kind:'follow'|'char'|'face', id?, color} — null = 글자 아바타(avatar.ts parseAvatar)
  user_prefs: { columns: { ...common, smart_list_visibility: 'text', theme: 'text', follow_system_dark: 'integer', week_start: 'integer', notify_json: 'text', avatar_json: 'text' } },
  // 10 성장: XP 원장(레벨은 계산), 캐릭터, 주간 목표, 주간 리포트
  xp_events: { columns: { ...common, kind: 'text', amount: 'integer', ref_id: 'text', day: 'text' }, indexes: { day: ['day'] } },
  characters: { columns: { ...common, name: 'text', species: 'text', type_code: 'text', answers_json: 'text', assessed_at: 'text' } },
  kpis: {
    columns: { ...common, week_start: 'text', title: 'text', target: 'integer', progress: 'integer', link_kind: 'text', link_id: 'text', status: 'text', source: 'text', achieved_at: 'text', sort_order: 'real' },
    indexes: { week: ['week_start'] }
  },
  weekly_reports: { columns: { ...common, week_start: 'text', stats_json: 'text', text_json: 'text', xp_total: 'integer', seen_at: 'text' } },
  // 14 작업 지도: parent_id 없음 = 영역, 있음 = 세부 주제. source 'ai'|'user' — user면 AI가 덮어쓰지 않는다
  map_areas: {
    columns: { ...common, name: 'text', parent_id: 'text', sort_order: 'real', source: 'text', color: 'text', archived_at: 'text' },
    indexes: { parent: ['parent_id'] }
  },
  task_areas: {
    columns: { ...common, task_id: 'text', area_id: 'text', source: 'text', state: 'text', run_id: 'text' }, // id = task_id, state 'ok'|'review'
    indexes: { task: ['task_id'], area: ['area_id'] }
  },
  map_links: {
    // kind 'sequence'|'goal', from_type 'task'|'kpi', state 'suggested'|'accepted'|'dismissed'
    columns: { ...common, kind: 'text', from_type: 'text', from_id: 'text', to_id: 'text', source: 'text', state: 'text' },
    indexes: { from: ['from_id'], to: ['to_id'] }
  },
  // 33 [[링크]]·리스트 고정 쌍·메모 ↔ 태그. from_type 'task'|'note'|'list'|'tag' · to_type 'task'|'list'|'tag' ·
  // source 'link'|'manual'|'ai' · state 'accepted'|'dismissed' · field 'title'|'content'|'description'.
  // id = relationId(from_id, to_id, field) — 두 기기가 같은 링크를 만들어도 한 행
  relations: {
    columns: { ...common, from_type: 'text', from_id: 'text', to_type: 'text', to_id: 'text', source: 'text', state: 'text', field: 'text' },
    indexes: { from: ['from_id'], to: ['to_id'] }
  },
  // 06 §14.4 sprout 자체 일정(2026-10-05 사용자 결정). start_at·end_at은 태스크와 같은 floating 표기(늘 둘 다, 종일은 날짜만·끝 포함) ·
  // repeat_rule = 태스크 반복 형식 · reminders = 트리거 JSON 배열('-PT0M' …) · color 비면 "내 일정" 색 · deleted_at = 되돌리기용 삭제
  events: {
    columns: {
      ...common,
      title: 'text',
      notes: 'text',
      start_at: 'text',
      end_at: 'text',
      is_all_day: 'integer',
      time_zone: 'text',
      repeat_rule: 'text',
      location: 'text',
      reminders: 'text',
      color: 'text',
      deleted_at: 'text',
      // 16 §12.0 연결된 일정(꿈틀 + 구글·Apple 양쪽 저장). ext_provider 'google'|'apple' · ext_account = 기기 캐시 계정 id(이메일 해시) ·
      // ext_calendar = 캘린더 id 해시('c_'…) · ext_id = 외부 일정 id(올리기 전 null) · ext_hash = 마지막으로 맞춘 내용 지문 · ext_error = 마지막 올리기 오류
      ext_provider: 'text',
      ext_account: 'text',
      ext_calendar: 'text',
      ext_id: 'text',
      ext_etag: 'text',
      ext_updated: 'text',
      ext_hash: 'text',
      ext_error: 'text'
    },
    indexes: { start: ['start_at'], end: ['end_at'], ext: ['ext_provider'] }
  },
  // 15 일기: id = 'diary-<날짜>'(사용자당 하루 1개)
  diary_entries: {
    columns: { ...common, date: 'text', mood: 'integer', content: 'text', prompt: 'text', private: 'integer', summary: 'text' },
    indexes: { date: ['date'] }
  },
  diary_messages: {
    columns: { ...common, entry_id: 'text', role: 'text', content: 'text', safety: 'integer' }, // role 'me'|'buddy'
    indexes: { entry: ['entry_id'] }
  }
} satisfies Record<string, TableDef>

export type TableName = keyof typeof TABLES

/** 로그인 전(M1~M2) 로컬 데이터의 owner_id. M3에서 로그인하면 실제 사용자 id로 바꾼다. */
export const LOCAL_OWNER = 'local'
