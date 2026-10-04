// @sprout/schema(앱과 같은 테이블 정의)로 서버 Postgres 스키마·동기화 규칙을 만든다.
// 실행: npm run server:schema → server/db/init/02-schema.sql, server/powersync/sync-config.yaml
import { writeFileSync } from 'node:fs'
import { TABLES } from '../../packages/schema/src/index.ts'

const pgType = { text: 'text', integer: 'integer', real: 'double precision' } as const
const names = Object.keys(TABLES)

const tables = Object.entries(TABLES).map(([name, def]) => {
  const cols = Object.entries(def.columns)
    .filter(([col]) => col !== 'owner_id')
    .map(([col, type]) => `  ${col} ${pgType[type]}`)
  const idx = Object.entries('indexes' in def ? def.indexes : {}).map(
    ([key, on]) => `CREATE INDEX IF NOT EXISTS ${name}_${key}_idx ON ${name} (owner_id, ${on.join(', ')});`
  )
  return [
    `CREATE TABLE IF NOT EXISTS ${name} (`,
    `  id text PRIMARY KEY,`,
    `  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,`,
    cols.join(',\n'),
    `);`,
    `CREATE INDEX IF NOT EXISTS ${name}_owner_idx ON ${name} (owner_id);`,
    ...idx
  ].join('\n')
})

const sql = `-- 자동 생성: npm run server:schema (원본 packages/schema/src/index.ts). 직접 고치지 않는다.
${tables.join('\n\n')}

-- PowerSync는 이 publication으로 변경분을 읽는다
DROP PUBLICATION IF EXISTS powersync;
CREATE PUBLICATION powersync FOR TABLE ${names.join(', ')};
`

const sync = `# 자동 생성: npm run server:schema. 직접 고치지 않는다.
# 사용자는 자기 owner_id 행만 내려받는다.
config:
  edition: 3

streams:
  user_data:
    auto_subscribe: true
    queries:
${names.map((n) => `      - SELECT * FROM ${n} WHERE owner_id = auth.user_id()`).join('\n')}
`

writeFileSync(new URL('../db/init/02-schema.sql', import.meta.url), sql)
writeFileSync(new URL('../powersync/sync-config.yaml', import.meta.url), sync)
console.log(`tables: ${names.length} → db/init/02-schema.sql, powersync/sync-config.yaml`)
