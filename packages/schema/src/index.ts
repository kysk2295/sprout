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
      show_in_smart: 'text' // 'all' | 'none'
    }
  },
  tags: { columns: { ...common, name: 'text', color: 'text', parent_id: 'text', sort_order: 'real', pinned: 'integer' } },
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
  task_tags: { columns: { ...common, task_id: 'text', tag_id: 'text' }, indexes: { task: ['task_id'], tag: ['tag_id'] } },
  reminders: { columns: { ...common, task_id: 'text', trigger: 'text' }, indexes: { task: ['task_id'] } },
  view_settings: {
    columns: { ...common, view_key: 'text', group_by: 'text', sort_by: 'text', sort_dir: 'text', show_completed: 'integer', show_details: 'integer', options_json: 'text' },
    indexes: { key: ['view_key'] }
  },
  user_prefs: { columns: { ...common, smart_list_visibility: 'text', theme: 'text', follow_system_dark: 'integer', week_start: 'integer' } },
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
