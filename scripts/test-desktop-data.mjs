import { build } from 'esbuild'
import { mkdtemp, rm, mkdir, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const cache=resolve('node_modules/.cache')
await mkdir(cache,{recursive:true})
const temp=await mkdtemp(join(cache,'sprout-test-'))
try {
 // tests/*.test.ts를 하나씩 따로 묶어 돌린다(기능별 시험 파일 — 수집함·작업 지도·일기)
 const files=(await readdir('apps/desktop/tests')).filter(f=>f.endsWith('.test.ts')).sort()
 for(const file of files){
  const outfile=join(temp,file.replace(/\.ts$/,'.mjs'))
  await build({entryPoints:[`apps/desktop/tests/${file}`],outfile,bundle:true,platform:'node',format:'esm',external:['sql.js'],define:{__WEB_PREVIEW__:'false'}})
  await import(pathToFileURL(outfile).href)
 }
} finally {await rm(temp,{recursive:true,force:true})}
