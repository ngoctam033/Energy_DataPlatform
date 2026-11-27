import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import engine from '../node-red/engine.cjs';
import io from '../node-red/io.cjs';
const root=fileURLToPath(new URL('../',import.meta.url)),tab='sim_orchestrator_v1';
export function mergeFlows(existing,fragment) {
  const ids=new Set(fragment.map(n=>n.id));if(ids.size!==fragment.length)throw new Error('Duplicate fragment ID');
  const owned=n=>n.id===tab||n.z===tab;
  for(const n of existing)if(ids.has(n.id)&&!owned(n))throw new Error('Unowned ID collision: '+n.id);
  const merged=[...existing.filter(n=>!owned(n)),...fragment],allIds=new Set(merged.map(n=>n.id));
  for(const n of fragment) {
    for(const id of (n.wires||[]).flat())if(!allIds.has(id))throw new Error('Dangling wire '+id);
    if(n.broker&&!merged.some(b=>b.id===n.broker&&b.type==='mqtt-broker'&&b.broker==='mqtt-server'&&String(b.port)==='1883'))throw new Error('Verified broker missing');
  }
  return merged;
}
export async function api(method='GET',data) {
  const headers={'Content-Type':'application/json','Node-RED-API-Version':'v2','Node-RED-Deployment-Type':'flows'};
  if(process.env.NR_ADMIN_TOKEN)headers.Authorization='Bearer '+process.env.NR_ADMIN_TOKEN;
  const r=await fetch((process.env.NR_ADMIN_URL||'http://127.0.0.1:1880')+'/flows',{method,headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error(`Admin API ${r.status}; abort without forcing revision`);return r.json();
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const action=process.argv[2];
  if(action==='validate') {
    const c=engine.validateSnapshot(await io.loadConfig());console.log(`Valid: ${c.scenarios.length} scenarios, ${Object.keys(c.targetRegistry.targets).length} targets, revision ${c.revision}`);
  } else if(action==='deploy'||action==='rollback') {
    engine.validateSnapshot(await io.loadConfig());
    const before=await api();if(!before.rev||!Array.isArray(before.flows))throw new Error('Expected API v2 snapshot');
    const fragment=action==='rollback'?[]:JSON.parse(readFileSync(root+'node-red/flows.json','utf8'));
    const merged=mergeFlows(before.flows,fragment);
    mkdirSync(root+'.runtime',{recursive:true,mode:0o700});
    const stamp=new Date().toISOString().replaceAll(':','-');
    writeFileSync(root+`.runtime/flows-${stamp}.before.json`,JSON.stringify(before,null,2),{mode:0o600});
    writeFileSync(root+'.runtime/flows.merged.json',JSON.stringify({rev:before.rev,flows:merged},null,2),{mode:0o600});
    console.log(`${action}: ${before.flows.length} -> ${merged.length} nodes. Existing unowned nodes preserved.`);
    if(process.argv.includes('--apply')) {
      const c=await io.loadConfig();if(c.control.enabled)throw new Error('Pause control.enabled before deploying');
      const ledgerPath=root+'.runtime/node-red/simulation/live.json';
      let state;try{state=JSON.parse(readFileSync(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
      if(state&&Object.keys(state.reservations).length)throw new Error('Drain/reconcile active reservations before deploy or rollback');
      await api('POST',{rev:before.rev,flows:merged});
      const after=await api();
      for(const n of before.flows.filter(n=>n.id!==tab&&n.z!==tab))if(JSON.stringify(n)!==JSON.stringify(after.flows.find(x=>x.id===n.id)))throw new Error('Unowned node changed: '+n.id);
      console.log('Deployed and verified existing nodes unchanged.');
    } else console.log('Preview only; pass --apply to deploy.');
  } else throw new Error('Use validate, deploy [--apply], rollback [--apply]');
}
