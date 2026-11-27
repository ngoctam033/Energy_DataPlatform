import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import io from '../node-red/io.cjs';
const flows=JSON.parse(readFileSync(new URL('../node-red/flows.json',import.meta.url)));
test('native polling keeps working after redeploy with stale busy context',()=>{
  const fn=flows.find(n=>n.id==='sim_poll_request').func;
  const context={get:()=>true,set:()=>{}};
  for(let i=0;i<3;i++){
    const msg=vm.runInNewContext('(function(){'+fn+'})()',{msg:{},context,Buffer,env:{get:()=> 'test'}});
    assert.equal(msg.kind,'sap_poll');assert.equal(msg.requestTimeout,4000);
  }
});
test('owner initialization discards cache on redeploy, preserves disk as authority',()=>{
  const values=new Map([['cache',{old:true}],['tail',Promise.resolve()]]);
  vm.runInNewContext(flows.find(n=>n.id==='sim_owner').initialize,{context:{set:(k,v)=>values.set(k,v)}});
  assert.equal(values.get('cache'),null);assert.equal(values.get('tail'),null);
});
test('all generated Function nodes compile',()=>{
  for(const n of flows.filter(n=>n.type==='function'))assert.doesNotThrow(()=>new vm.Script('(function(){'+n.func+'})'));
});
test('configuration path traversal and arbitrary URLs are rejected',async()=>{
  for(const file of ['../config/control.json','/etc/passwd.json','http://host/a.json','scenarios/../../secret.json'])await assert.rejects(io.read(file),/Unsafe/);
});
