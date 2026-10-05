// OG 이미지(1200×630) 다시 만들기: node scripts/og.mjs — 맥 Chrome 헤드리스로 scripts/og.html을 찍는다
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import cfg from '../site.config.mjs'
const here = dirname(fileURLToPath(import.meta.url))
const tmp = join(here, '.og.html')
writeFileSync(tmp, readFileSync(join(here, 'og.html'), 'utf8').replace('NAME', cfg.name))
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
execFileSync(chrome, ['--headless=new', '--hide-scrollbars', '--allow-file-access-from-files', `--screenshot=${join(here, '../public/og.png')}`, '--window-size=1200,630', '--virtual-time-budget=3000', 'file://' + tmp], { stdio: 'ignore' })
rmSync(tmp)
console.log('public/og.png')
