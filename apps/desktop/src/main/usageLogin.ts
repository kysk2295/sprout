import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { access, mkdir, readdir, readFile, writeFile, chmod, unlink, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { isUsageProvider, normalizeUsage, type UsageProvider, type UsageLogin, type QuotaAccount } from '../shared/usage'

const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/
export const usageProfileRoot = join(homedir(), 'Library/Application Support/sprout/usage-accounts')
export function profileEnvironment(provider: UsageProvider, directory: string): NodeJS.ProcessEnv {
  // Only inherit runtime essentials; inherited API keys and OAuth overrides must not select another account.
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['HOME','USER','LOGNAME','TMPDIR','LANG','LC_ALL','SHELL','SYSTEMROOT']) if(process.env[key]) env[key]=process.env[key]
  env.PATH = `/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${join(homedir(),'.grok/bin')}`
  env.CODEXBAR_CONFIG=join(directory,'codexbar.json')
  env[provider==='codex'?'CODEX_HOME':provider==='claude'?'CLAUDE_CONFIG_DIR':'GROK_HOME']=directory
  return env
}
export function loginUrl(provider: UsageProvider, output: string): string | undefined {
  const hosts: Record<UsageProvider,string[]>={codex:['auth.openai.com'],claude:['claude.com','claude.ai','console.anthropic.com','platform.claude.com'],grok:['auth.x.ai','accounts.x.ai'],gemini:[]}
  for(const match of output.matchAll(/https:\/\/[^\s\x1b<>"']+/g)) {
    try { const url=new URL(match[0]); if(url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&hosts[provider].includes(url.hostname)) return url.href } catch {}
  }
}
async function executable(provider: UsageProvider) {
  const name=provider==='codex'?'codex':provider==='claude'?'claude':'grok'
  for(const path of [`/opt/homebrew/bin/${name}`,`/usr/local/bin/${name}`,join(homedir(),'.local/bin',name),join(homedir(),'.grok/bin',name)]) {
    try { await access(path,constants.X_OK); return path } catch {}
  }
  throw new Error(`${name} CLI가 설치되어 있지 않아요.`)
}
const argsFor=(p:UsageProvider,directory:string)=>p==='codex'?['login','-c','cli_auth_credentials_store="file"']:p==='claude'?['auth','login','--claudeai']:['login','--oauth','--leader-socket',join(directory,'leader.sock')]
const logoutArgs=(p:UsageProvider)=>p==='codex'?['logout','-c','cli_auth_credentials_store="file"']:p==='claude'?['auth','logout']:['logout']
/** Claude Code는 CLAUDE_CONFIG_DIR마다 키체인 항목 이름 뒤에 경로 해시 8자리를 붙인다 — 이 프로필 전용 항목만 가리킨다 */
export const claudeKeychainService=(directory:string)=>`Claude Code-credentials-${createHash('sha256').update(directory).digest('hex').slice(0,8)}`
/** 실패해도 멈추지 않는 정리 명령(로그아웃·키체인). 15초 넘게 걸리면 버린다 */
const runQuietly=(file:string,args:string[],env:NodeJS.ProcessEnv,cwd:string)=>new Promise<void>((resolve)=>{try{execFile(file,args,{cwd,env,timeout:15000},()=>resolve())}catch{resolve()}})
export function createUsageLogin(options: {
  root?:string; executable?:typeof executable; launch?:(path:string,args:string[],env:NodeJS.ProcessEnv,cwd:string)=>ChildProcess
  cleanup?:(path:string,args:string[],env:NodeJS.ProcessEnv,cwd:string)=>Promise<void>; platform?:NodeJS.Platform
}={}) {
  const root=options.root??usageProfileRoot
  let current:UsageLogin|undefined,child:ChildProcess|undefined,timer:ReturnType<typeof setTimeout>|undefined,starting=false
  const stop=()=>{if(timer)clearTimeout(timer);timer=undefined;const running=child;child=undefined;if(running&&running.exitCode===null){running.kill('SIGTERM');const kill=setTimeout(()=>{if(running.exitCode===null)running.kill('SIGKILL')},1500);kill.unref()}}
  const status=(id:unknown)=>{if(typeof id!=='string'||!current||current.id!==id)throw new Error('로그인 요청을 찾지 못했어요.');return {...current}}
  return {
    status,
    async start(provider:unknown):Promise<UsageLogin> {
      if(!isUsageProvider(provider))throw new Error('지원하지 않는 서비스예요.')
      if(provider==='gemini')throw new Error('현재 Gemini CLI는 앱에서 계정을 분리해 로그인하는 경로를 지원하지 않아요.')
      if(starting||current?.status==='waiting')throw new Error('진행 중인 로그인을 완료하거나 취소해 주세요.')
      starting=true
      try {
        const path=await (options.executable??executable)(provider),id=randomUUID(),directory=join(root,id)
        await mkdir(directory,{recursive:true,mode:0o700});await chmod(root,0o700);await chmod(directory,0o700)
        await writeFile(join(directory,'codexbar.json'),JSON.stringify({providers:[{id:provider,enabled:true}]}),{mode:0o600})
        current={id,provider,status:'waiting',message:'공식 로그인 페이지를 준비하고 있어요.'}
        const run=options.launch??((file,args,env,cwd)=>spawn(file,args,{cwd,env,stdio:['pipe','pipe','pipe']}))
        child=run(path,argsFor(provider,directory),profileEnvironment(provider,directory),directory)
        const session=current
        let output=''
        const consume=(chunk:Buffer)=>{if(session.status!=='waiting')return;output=(output+chunk.toString()).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').slice(-12000);const url=loginUrl(provider,output);if(url&&!session.url){session.url=url;session.requiresCode=provider==='claude'&&url.includes('code%2Fcallback');session.message='공식 로그인 페이지에서 인증을 완료해 주세요.'}}
        child.stdin?.on('error',()=>{});child.stdout?.on('data',consume);child.stderr?.on('data',consume)
        const fail=()=>{if(session.status!=='waiting')return;session.status='error';session.message='로그인을 완료하지 못했어요. 다시 시도해 주세요.';delete session.url;stop()}
        child.once('error',fail)
        child.once('close',async code=>{
          if(session.status!=='waiting')return
          if(code!==0){fail();return}
          if(timer)clearTimeout(timer);timer=undefined
          try {
            // Publish only successful sessions; cancelled/failed profiles are never discovered.
            await writeFile(join(directory,'connected.json'),JSON.stringify({provider,id}),{mode:0o600})
            if(session.status!=='waiting'){await unlink(join(directory,'connected.json'));return}
            session.status='connected';session.message='계정이 연결됐어요. 사용 한도를 확인하고 있어요.';delete session.url
          } catch { fail() }
        })
        timer=setTimeout(()=>{if(session.status==='waiting'){session.status='error';session.message='로그인 시간이 만료됐어요. 다시 시도해 주세요.';delete session.url;stop()}},600000);timer.unref()
        return {...current}
      } catch(error) {if(current?.status==='waiting'){current.status='error';current.message='로그인을 시작하지 못했어요.';delete current.url;stop()}throw error} finally { starting=false }
    },
    submitCode(id:unknown,code:unknown){
      status(id)
      if(current?.status!=='waiting'||!current.requiresCode||!child?.stdin?.writable)throw new Error('인증 코드를 입력할 수 없는 상태예요.')
      if(typeof code!=='string'||!/^[A-Za-z0-9._~#=+\/-]{8,4096}$/.test(code))throw new Error('공식 로그인 페이지에 표시된 인증 코드를 입력해 주세요.')
      child.stdin.write(code+'\n');current.requiresCode=false;current.message='인증 코드를 확인하고 있어요.';return {...current}
    },
    cancel(id:unknown){status(id);if(current?.status==='waiting'){current.status='cancelled';current.message='로그인을 취소했어요.';delete current.url;stop()}return {...current!}},
    close(){if(current?.status==='waiting'){current.status='cancelled';delete current.url}stop()},
    /** 10 §5 연결 해제: 이 앱이 만든 격리 프로필 하나만 지운다(`sprout:<id>` 계정만). 기존 CLI·CodexBar 로그인은 건드리지 않는다.
     *  순서: 연결 표시(connected.json)를 먼저 지워 더는 조회되지 않게 → CLI 로그아웃(격리 환경) → Claude 전용 키체인 항목 → 프로필 폴더 삭제 */
    async disconnect(accountId:unknown):Promise<{provider:UsageProvider}> {
      const id=typeof accountId==='string'&&accountId.startsWith('sprout:')?accountId.slice(7):''
      if(!uuid.test(id)||(current?.id===id&&current.status==='waiting'))throw new Error('연결 해제할 계정을 찾지 못했어요.')
      const directory=join(root,id)
      let provider:UsageProvider
      try { const meta=JSON.parse(await readFile(join(directory,'connected.json'),'utf8'));if(meta.id!==id||!isUsageProvider(meta.provider))throw new Error('mismatch');provider=meta.provider } catch { throw new Error('연결 해제할 계정을 찾지 못했어요.') }
      await unlink(join(directory,'connected.json'))
      const env=profileEnvironment(provider,directory),clean=options.cleanup??runQuietly
      try { await clean(await (options.executable??executable)(provider),logoutArgs(provider),env,directory) } catch {}
      if(provider==='claude'&&(options.platform??process.platform)==='darwin')try{await clean('/usr/bin/security',['delete-generic-password','-s',claudeKeychainService(directory)],env,directory)}catch{}
      await rm(directory,{recursive:true,force:true})
      return {provider}
    }
  }
}
export async function readUsageProfiles(provider:UsageProvider,root=usageProfileRoot):Promise<QuotaAccount[]> {
  let entries:string[];try{entries=await readdir(root)}catch{return []}
  const result:QuotaAccount[]=[]
  await Promise.all(entries.filter(id=>uuid.test(id)).map(async id=>{
    const directory=join(root,id)
    try { const meta=JSON.parse(await readFile(join(directory,'connected.json'),'utf8'));if(meta.id!==id||meta.provider!==provider)return } catch {return}
    try {
      let binary:string|undefined
      for(const path of ['/opt/homebrew/bin/codexbar','/usr/local/bin/codexbar','/Applications/CodexBar.app/Contents/Helpers/CodexBarCLI']){try{await access(path,constants.X_OK);binary=path;break}catch{}}
      if(!binary)throw new Error('missing')
      const output=await new Promise<string>((resolve,reject)=>execFile(binary!,['usage','--provider',provider,'--format','json','--json-only','--no-credits','--source',provider==='grok'?'auto':'oauth'],{cwd:directory,env:profileEnvironment(provider,directory),timeout:45000,maxBuffer:2*1024*1024},(error,stdout)=>stdout.trim()?resolve(stdout):reject(error)))
      const accounts=normalizeUsage(provider,JSON.parse(output))
      if(accounts.length!==1)throw new Error('Ambiguous profile')
      result.push(...accounts.map(a=>({...a,id:`sprout:${id}`,label:a.identity??'연결한 계정',source:`sprout · ${a.source}`})))
    } catch { result.push({id:`sprout:${id}`,provider,label:'연결한 계정',identity:null,organization:null,plan:null,source:'sprout',observedAt:null,status:'unavailable',reason:'이 계정의 한도를 가져오지 못했어요.',windows:[]}) }
  }))
  return result.sort((a,b)=>a.id.localeCompare(b.id))
}
