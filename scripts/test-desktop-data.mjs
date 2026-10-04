import { build } from 'esbuild'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const cache=resolve('node_modules/.cache')
await mkdir(cache,{recursive:true})
const temp=await mkdtemp(join(cache,'sprout-test-'))
try {
 const outfile=join(temp,'test.mjs')
 await build({entryPoints:['apps/desktop/tests/data.test.ts'],outfile,bundle:true,platform:'node',format:'esm',external:['sql.js'],define:{__WEB_PREVIEW__:'false'}})
 await import(pathToFileURL(outfile).href)
} finally {await rm(temp,{recursive:true,force:true})}
