import { createUsageLogin, readUsageProfiles } from './src/main/usageLogin'
import { createUsageService } from './src/main/usageService'
// 렌더러만 브라우저에서 띄워 화면을 확인할 때 쓴다(틱틱 캡처와 나란히 비교용). 실제 앱은 electron-vite로 실행한다.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRemoteOllama } from './src/main/remoteOllama'

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react(), {
    name:'macmini-assistant',
    configureServer(server){
      const usage=createUsageService(undefined,readUsageProfiles)
      const usageLogin=createUsageLogin()
      server.httpServer?.once('close',()=>usageLogin.close())
      server.middlewares.use('/api/usage',async(req,res)=>{
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store')
        try{
          if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.statusCode=403;res.end('{}');return}
          const url=new URL(req.url??'/', 'http://localhost')
          if(req.method==='GET'&&url.pathname==='/')res.end(JSON.stringify(await usage.read(url.searchParams.get('provider'),url.searchParams.get('force')==='1')))
          else if(req.method==='POST'&&['/login','/login/status','/login/cancel','/login/code'].includes(url.pathname)){
            if(req.headers['x-sprout-request']!=='usage'){res.statusCode=403;res.end('{}');return}
            let body='';for await(const chunk of req){body+=chunk.toString();if(body.length>8192)throw new Error('요청이 너무 커요.')}
            const input=JSON.parse(body)
            const state=url.pathname==='/login'?await usageLogin.start(input.provider):url.pathname==='/login/cancel'?usageLogin.cancel(input.id):url.pathname==='/login/code'?usageLogin.submitCode(input.id,input.code):usageLogin.status(input.id)
            if(state.status==='connected')usage.invalidate(state.provider)
            res.end(JSON.stringify(state))
          }
          else{res.statusCode=404;res.end('{}')}
        }catch(error){res.statusCode=503;res.end(JSON.stringify({error:error instanceof Error&&/[가-힣]/.test(error.message)?error.message:'사용량 서비스에 연결하지 못했어요.'}))}
      })
      const remote=createRemoteOllama()
      server.httpServer?.once('close',remote.close)
      server.middlewares.use('/api/assistant',async(req,res)=>{
        const abort=new AbortController()
        const timer=setTimeout(()=>abort.abort(),120000)
        res.on('close',()=>abort.abort())
        res.setHeader('Content-Type','application/json')
        try{
          if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.statusCode=403;res.end('{}');return}
          if(req.method==='GET'&&req.url==='/api/tags')res.end(JSON.stringify({models:(await remote.models()).map(name=>({name,capabilities:['completion']}))}))
          else if(req.method==='POST'&&req.url==='/api/chat'){
            let body=''
            for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>65536)throw new Error('요청이 너무 커요.')}
            const input=JSON.parse(body)
            if(input.stream){
              res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-cache');res.flushHeaders()
              await remote.chat(input,abort.signal,text=>{if(!res.destroyed)res.write(JSON.stringify({message:{content:text},done:false})+'\n')})
              if(!res.destroyed)res.end(JSON.stringify({done:true})+'\n')
            }else{
              const content=await remote.chat(input,abort.signal)
              if(!res.destroyed)res.end(JSON.stringify({message:{content}}))
            }
          }else{res.statusCode=404;res.end('{}')}
        }catch(error){if(!res.destroyed){if(!res.headersSent)res.statusCode=503;res.end(JSON.stringify({error:error instanceof Error?error.message:'맥미니 연결 실패'}))}}
        finally{clearTimeout(timer)}
      })
    }
  }],
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  define: { __WEB_PREVIEW__: true },
  server: { port: 5173, strictPort: true }
})
