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
