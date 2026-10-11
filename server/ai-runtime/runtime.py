"""Private MLX gateway for all Qwen requests; Jev stays resident.

One serialized inference request at a time. Structured replies are validated
before publication, without swapping to a second Qwen backend.
Memory faults latch until an operator clears fault.json and restarts the service.
"""
import json,os,re,signal,socket,subprocess,threading,time,urllib.request,urllib.error
import jsonschema
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
BASE=Path(os.environ['SPROUT_MODEL_ROOT']);STATE=Path(os.environ['SPROUT_RUNTIME_STATE']);STATE.mkdir(parents=True,exist_ok=True)
PY=str(BASE/'.venv-mlx/bin/python');MODEL=str(BASE/'qwen-mlx-4bit');JEV=str(BASE/'mlx-model-v7-q6')
QUESTION=json.loads((Path(__file__).parent/'intent-question.json').read_text());PORT=int(os.environ.get('SPROUT_RUNTIME_PORT','28011'))
LOCK=threading.Lock();STOP=threading.Event();FAULT=threading.Event();CHILDREN={};LOGS=[]
def rotate(path):
 if path.exists() and path.stat().st_size>8_000_000:path.replace(path.with_suffix(path.suffix+'.1'))
def event(kind,**info):
 rotate(STATE/'events.jsonl')
 with (STATE/'events.jsonl').open('a') as f:f.write(json.dumps({'time':time.time(),'event':kind,**info})+'\n')
def memory():
 s=subprocess.check_output(['sysctl','kern.memorystatus_vm_pressure_level','vm.swapusage'],text=True)
 return {'pressure':int(re.search(r'pressure_level: (\d+)',s)[1]),'swap_mb':float(re.search(r'used = ([\d.]+)M',s)[1])}
def stop_model(name):
 p=CHILDREN.pop(name,None)
 if p:
  if p.poll() is None:
   p.terminate()
   try:p.wait(timeout=10)
   except subprocess.TimeoutExpired:p.kill();p.wait()
  event('model_stopped',model=name,pid=p.pid,exit=p.returncode)
def fault(reason):
 FAULT.set();(STATE/'fault.json').write_text(json.dumps({'time':time.time(),'reason':reason,'memory':memory()}))
 for name in list(CHILDREN):stop_model(name)
def start_model(name,args,port):
 if FAULT.is_set() or STOP.is_set():raise RuntimeError('runtime unavailable')
 if name in CHILDREN:
  if CHILDREN[name].poll() is None:return
  fault('model process exited');raise RuntimeError('model unavailable')
 with socket.socket() as s:s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',port))
 rotate(STATE/(name+'.log'));log=(STATE/(name+'.log')).open('a')
 p=subprocess.Popen([PY,str(BASE/'mlx_bounded_launch.py'),'134217728',*args],stdout=log,stderr=subprocess.STDOUT);log.close();CHILDREN[name]=p;event('model_started',model=name,pid=p.pid)
 deadline=time.monotonic()+120
 while time.monotonic()<deadline:
  if STOP.is_set() or FAULT.is_set() or p.poll() is not None:raise RuntimeError('model unavailable')
  try:
   urllib.request.urlopen(f'http://127.0.0.1:{port}/v1/models',timeout=1).close();return
  except OSError:time.sleep(.25)
 raise TimeoutError('model startup')
def unload_ollama():
 data=json.dumps({'model':'qwen3.5:9b','keep_alive':0}).encode()
 with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:11434/api/generate',data,{'Content-Type':'application/json'}),timeout=30) as r:r.read()
def ensure_pair():
 if not CHILDREN:unload_ollama()
 start_model('qwen',['mlx_lm.server','--model',MODEL,'--port','28010','--prompt-cache-size','1','--decode-concurrency','1','--chat-template-args','{"enable_thinking":false}'],28010)
 start_model('jev',[str(BASE/'serve_mlx_router.py'),'--model',JEV,'--head-source',JEV,'--port','28008'],28008)
def request(url,body,timeout=120):return urllib.request.urlopen(urllib.request.Request(url,json.dumps(body).encode(),{'Content-Type':'application/json'}),timeout=timeout)
def route_request(body):
 state=body.get('sprout_route')
 if not isinstance(state,dict) or set(state)!={'text','history'}:raise ValueError('invalid route state')
 text=state['text'];history=state['history']
 if not isinstance(text,str) or not text.strip() or len(text)>4000 or not isinstance(history,list) or len(history)>2:raise ValueError('invalid route bounds')
 if any(not isinstance(h,dict) or set(h)!={'user','assistant'} or any(not isinstance(h[k],str) or len(h[k])>300 for k in ['user','assistant']) for h in history):raise ValueError('invalid history')
 ensure_pair()
 with request('http://127.0.0.1:28008/v1/systemone',{'state':state,'questions':{'intent':QUESTION}},30) as r:a=json.load(r)['answers']['intent']
 choice=a['choice'];confidence=a['probabilities'][choice]
 if choice not in ['chat','read','write','clarify'] or not isinstance(confidence,(float,int)) or not 0<=confidence<=1:raise ValueError('invalid decision')
 return {'intent':choice,'confidence':confidence,'resolution':'lookup'}
def mlx_payload(body):
 messages=[];pending=[];counter=0
 for raw in body['messages']:
  m=dict(raw)
  if m.get('tool_calls'):
   calls=[]
   for raw_call in m['tool_calls']:
    c=json.loads(json.dumps(raw_call));counter+=1;c['id']=f'call_{counter}';c['type']='function';f=c['function']
    if not isinstance(f['arguments'],str):f['arguments']=json.dumps(f['arguments'],ensure_ascii=False)
    pending.append((f['name'],c['id']));calls.append(c)
   m['tool_calls']=calls
  if m['role']=='tool':
   name=m.pop('tool_name',m.get('name',''));idx=next(i for i,v in enumerate(pending) if v[0]==name);m['name']=name;m['tool_call_id']=pending.pop(idx)[1]
  messages.append(m)
 if body.get('format'):
  hint='Return exactly one JSON value without markdown or explanation.'
  if isinstance(body['format'],dict):hint+=' Match this JSON Schema: '+json.dumps(body['format'],ensure_ascii=False)
  if messages and messages[0]['role']=='system':messages[0]={**messages[0],'content':messages[0]['content']+'\n'+hint}
  else:messages.insert(0,{'role':'system','content':hint})
 opt=body.get('options',{});out={'model':MODEL,'messages':messages,'temperature':opt.get('temperature',0),'max_tokens':opt.get('num_predict',450),'stream':True,'stream_options':{'include_usage':True},'chat_template_kwargs':{'enable_thinking':False}}
 if body.get('tools'):out['tools']=body['tools']
 return out
class Handler(BaseHTTPRequestHandler):
 def send_headers(self,status=200):self.send_response(status);self.send_header('Content-Type','application/x-ndjson');self.end_headers()
 def emit(self,obj):self.wfile.write((json.dumps(obj,ensure_ascii=False)+'\n').encode());self.wfile.flush()
 def do_GET(self):
  if self.path=='/health':self.send_headers(503 if FAULT.is_set() else 200);self.emit({'ok':not FAULT.is_set(),'routing':'jev-q6','models':list(CHILDREN)});return
  if self.path not in ['/api/tags','/api/ps']:self.send_error(404);return
  if FAULT.is_set():self.send_headers(503);self.emit({'error':'runtime unavailable'});return
  self.send_headers();self.emit({'models':[{'name':'qwen3.5:9b','model':'qwen3.5:9b','details':{'family':'qwen3.5','parameter_size':'9B','quantization_level':'MLX-affine-4bit'}}] if self.path=='/api/tags' or 'qwen' in CHILDREN else []})
 def do_POST(self):
  if self.path!='/api/chat':self.send_error(404);return
  sent=False;queued=time.perf_counter()
  with LOCK:
   try:
    if FAULT.is_set() or STOP.is_set():raise RuntimeError('runtime unavailable')
    length=int(self.headers.get('Content-Length','0'))
    if not 0<length<=1_000_000:raise ValueError('invalid body size')
    body=json.loads(self.rfile.read(length));started=time.perf_counter();kind='route' if 'sprout_route' in body else 'structured' if body.get('format') else 'answer';event('request_started',request_kind=kind,wait_ms=round((started-queued)*1000))
    if 'sprout_route' in body:
     decision=route_request(body);self.send_headers();sent=True;self.emit({'message':{'role':'assistant','content':json.dumps(decision)},'done':True,'total_duration':int((time.perf_counter()-started)*1e9)});return
    ensure_pair()
    with request('http://127.0.0.1:28010/v1/chat/completions',mlx_payload(body)) as response:
     self.send_headers();sent=True;calls={};usage={};content=[];structured=bool(body.get('format'))
     for line in response:
      if not line.startswith(b'data: '):continue
      data=line[6:].strip()
      if data==b'[DONE]':break
      r=json.loads(data);usage=r.get('usage') or usage
      for choice in r.get('choices',[]):
       delta=choice.get('delta',{})
       if delta.get('content'):
        content.append(delta['content'])
        if not structured:self.emit({'message':{'role':'assistant','content':delta['content']},'done':False})
       for tc in delta.get('tool_calls',[]):
        f=tc.get('function',{});c=calls.setdefault(tc.get('index',0),{'name':'','arguments':''});c['name']+=f.get('name','');c['arguments']+=f.get('arguments','')
     if structured:
      value=json.loads(''.join(content))
      if isinstance(body['format'],dict):jsonschema.validate(value,body['format'])
      self.emit({'message':{'role':'assistant','content':json.dumps(value,ensure_ascii=False)},'done':False})
     tools=[{'function':{'name':c['name'],'arguments':json.loads(c['arguments'])}} for c in calls.values()]
     self.emit({'message':{'role':'assistant','content':'','tool_calls':tools},'done':True,'prompt_eval_count':usage.get('prompt_tokens',0),'eval_count':usage.get('completion_tokens',0),'total_duration':int((time.perf_counter()-started)*1e9)})
   except (BrokenPipeError,ConnectionResetError):pass
   except Exception as exc:
    event('request_failed',error_type=type(exc).__name__)
    try:
     if not sent:self.send_headers(503)
     self.emit({'error':'AI runtime unavailable'})
    except OSError:pass
   finally:
    event('request_finished',total_ms=round((time.perf_counter()-queued)*1000))
 def log_message(self,*unused):pass
server=None
if __name__=='__main__':
 initial=memory();event('runtime_start',memory=initial)
 if (STATE/'fault.json').exists():FAULT.set()
 for sig in [signal.SIGTERM,signal.SIGINT]:signal.signal(sig,lambda *_:STOP.set())
 try:
  server=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
  threading.Thread(target=server.serve_forever,daemon=True).start()
  def monitor():
   while not STOP.wait(2):
    m=memory()
    rotate(STATE/'memory.jsonl')
    with (STATE/'memory.jsonl').open('a') as f:f.write(json.dumps({'time':time.time(),**m})+'\n')
    if not FAULT.is_set() and (m['pressure']>=4 or m['swap_mb']-initial['swap_mb']>2048):fault('memory guard')
    if not FAULT.is_set() and any(p.poll() is not None for p in list(CHILDREN.values())):fault('model process exited')
  threading.Thread(target=monitor,daemon=True).start()
  if not FAULT.is_set():
   try:
    with LOCK:ensure_pair()
   except Exception:fault('startup failed')
  while not STOP.wait(2):pass

 finally:
  STOP.set()
  if server:server.shutdown();server.server_close()
  for name in list(CHILDREN):stop_model(name)
  for f in LOGS:f.close()
