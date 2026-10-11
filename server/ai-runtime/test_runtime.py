import os,tempfile,unittest
os.environ.setdefault('SPROUT_MODEL_ROOT','/unused-model-path')
os.environ.setdefault('SPROUT_RUNTIME_STATE',tempfile.mkdtemp(prefix='jev-runtime-test-'))
import runtime
class PayloadTests(unittest.TestCase):
 def test_structured_system_stays_first(self):
  body={'messages':[{'role':'user','content':'classify'}],'format':'json'}
  out=runtime.mlx_payload(body)
  self.assertEqual(out['messages'][0]['role'],'system')
  self.assertEqual(out['messages'][-1]['role'],'user')
  self.assertEqual(len(body['messages']),1)
 def test_existing_system_not_duplicated(self):
  out=runtime.mlx_payload({'messages':[{'role':'system','content':'rules'},{'role':'user','content':'hi'}],'format':{'type':'object'}})
  self.assertEqual([m['role'] for m in out['messages']],['system','user'])
  self.assertIn('JSON Schema',out['messages'][0]['content'])
 def test_tool_call_links(self):
  out=runtime.mlx_payload({'messages':[{'role':'assistant','content':'','tool_calls':[{'function':{'name':'find_tasks','arguments':{'query':'x'}}}]},{'role':'tool','tool_name':'find_tasks','content':'[]'}]})
  self.assertEqual(out['messages'][0]['tool_calls'][0]['id'],out['messages'][1]['tool_call_id'])
 def test_route_bounds_rejected_before_model_load(self):
  with self.assertRaises(ValueError):runtime.route_request({'sprout_route':{'text':'x'*4001,'history':[]}})
if __name__=='__main__':unittest.main()
