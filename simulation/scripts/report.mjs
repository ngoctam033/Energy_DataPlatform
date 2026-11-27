// Read-only evidence exporter. Joins job intent to native OCPP transaction/meter records.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {graphql} from './lab.mjs';
import engine from '../node-red/engine.cjs';
const root=fileURLToPath(new URL('../',import.meta.url)),state=JSON.parse(readFileSync(root+'.runtime/node-red/simulation/live.json'));
const runId=process.argv[2]||Object.keys(state.runs).filter(k=>k.startsWith('smoke-live-')).at(-1);
if(!runId||!state.runs[runId])throw new Error('Supply an existing exact run_id');
const jobs=Object.values(state.jobs).filter(j=>j.run_id===runId),names=[...new Set(jobs.map(j=>j.target_config?.station_id).filter(Boolean))];
const since=new Date(Math.min(...jobs.map(j=>j.due_at))-5000).toISOString();
const data=await graphql('query($names:[String!]!,$since:timestamptz!){Transactions(where:{ChargingStation:{ocppConnectionName:{_in:$names}},startTime:{_gte:$since}},order_by:{createdAt:asc},limit:1000){transactionId isActive startTime endTime totalKwh ChargingStation{ocppConnectionName} MeterValues(order_by:{timestamp:asc},limit:2000){timestamp sampledValue}}}',{names,since});
const rows=[],issues=[];
for(const j of jobs){
 const tx=data.Transactions.find(t=>t.ChargingStation.ocppConnectionName===j.target_config?.station_id&&String(t.transactionId)===String(j.transaction_id));
 const meters=tx?.MeterValues||[],energy=[],soc=[],power=[];
 for(const m of meters)for(const v of m.sampledValue||[]){const n=Number(v.value);if(!Number.isFinite(n))continue;
  if((v.measurand==='Energy.Active.Import.Register'||!v.measurand)&&!v.phase)energy.push(n*(v.unit==='kWh'?1000:1));
  if(v.measurand==='SoC')soc.push(n);
  if(v.measurand==='Power.Active.Import'&&!v.phase)power.push(n*(v.unit==='kW'?1000:1));
 }
 if(j.status==='done'&&j.target_config?.type==='sap_evse'){
  if(!tx?.endTime||tx.isActive)issues.push(j.job_id+': missing CSMS end');
  if(meters.length<3)issues.push(j.job_id+': insufficient meter samples');
  if(!soc.length)issues.push(j.job_id+': no observed SoC');
  if(energy.some((x,i)=>i&&x+1<energy[i-1]))issues.push(j.job_id+': decreasing meter');
  if(soc.some((x,i)=>x<0||x>100||(i&&x+.01<soc[i-1])))issues.push(j.job_id+': invalid SoC');
  if(power.some(x=>x<0||x>j.target_config.max_power_w*1.05))issues.push(j.job_id+': power outside station capability');
  if(tx?.totalKwh!=null&&tx.endTime){const bound=j.target_config.max_power_w*(Date.parse(tx.endTime)-Date.parse(tx.startTime))/3600000000;if(tx.totalKwh>bound*1.1+.01)issues.push(j.job_id+': energy exceeds physical bound');}
  if(tx?.endTime&&Date.parse(tx.endTime)-Date.parse(tx.startTime)>(j.duration_seconds+120)*1000)issues.push(j.job_id+': session exceeded planned duration tolerance');
 }
 rows.push({job_id:j.job_id,scenario_id:j.scenario_id,station:j.target_config?.station_id,site:j.site,customer_intent:j.customer_profile,behavior:j.behavior,status:j.status,transaction_id:j.transaction_id,csms_ended:!!tx?.endTime,waiting_seconds:j.waiting_seconds,total_kwh:tx?.totalKwh,soc_first:soc[0],soc_last:soc.at(-1),meter_count:meters.length,stop_trigger:j.stop_trigger});
}
const subset={...state,jobs:Object.fromEntries(jobs.map(j=>[j.job_id,j])),reservations:Object.fromEntries(Object.entries(state.reservations).filter(([,id])=>jobs.some(j=>j.job_id===id)))};
const summary={captured_at:new Date().toISOString(),run_id:runId,planned:jobs.length,kpis:engine.kpis(subset),csms_matched:rows.filter(r=>r.transaction_id&&r.meter_count).length,csms_ended:rows.filter(r=>r.csms_ended).length,meter_samples:rows.reduce((n,r)=>n+r.meter_count,0),total_kwh:rows.reduce((n,r)=>n+Number(r.total_kwh||0),0),acceptance:jobs.length===100&&jobs.every(j=>['done','failed','expired','cancelled','rejected'].includes(j.status))&&rows.filter(r=>r.status==='done').every(r=>r.csms_ended&&r.meter_count>=3)&&!issues.length?'PASS':'FAIL',physical_checks:issues.length?'FAIL':'PASS',issues};
mkdirSync(root+'.runtime/reports',{recursive:true});mkdirSync(root+'reports',{recursive:true});
const name=runId.replaceAll(':','-');
writeFileSync(root+`.runtime/reports/${name}.json`,JSON.stringify({summary,rows,transactions:data.Transactions},null,2),{mode:0o600});
const fields=Object.keys(rows[0]||{}),quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
writeFileSync(root+`.runtime/reports/${name}.csv`,[fields.join(','),...rows.map(r=>fields.map(f=>quote(r[f])).join(','))].join('\n')+'\n',{mode:0o600});
writeFileSync(root+`reports/${name}.summary.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
