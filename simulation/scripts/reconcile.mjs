// Explicit operator recovery only. Never replays a start or invents OCPP meters.
import {readFileSync,writeFileSync,renameSync,statSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {sap,graphql} from './lab.mjs';
import {api} from './manage.mjs';
import engine from '../node-red/engine.cjs';
const root=fileURLToPath(new URL('../',import.meta.url)),path=root+'.runtime/node-red/simulation/live.json';
if(JSON.parse(readFileSync(root+'config/control.json')).enabled)throw new Error('Pause before reconciliation');
let state=JSON.parse(readFileSync(path));const apply=process.argv.includes('--apply');
const stamp=Date.now(),before=await api();
writeFileSync(root+`.runtime/reconcile-${stamp}.before.json`,JSON.stringify({state,flows:before}),{mode:0o600});
let disabled=false;
try {
  const installed=before.flows.some(n=>n.id==='sim_orchestrator_v1');
  if(apply&&installed){await api('POST',{rev:before.rev,flows:before.flows.map(n=>n.id==='sim_orchestrator_v1'?{...n,disabled:true}:n)});disabled=true;
    // Function promises already in flight may outlive the deployment response.
    let stable=false;for(let i=0;i<15;i++){const m=statSync(path).mtimeMs;await delay(2000);if(statSync(path).mtimeMs===m){stable=true;break;}}
    if(!stable)throw new Error('Ledger writer is still active; abort reconciliation');
    state=JSON.parse(readFileSync(path));
  }
  state=engine.recover(state,Date.now());
  let stations=(await sap('listChargingStations')).chargingStations;
  const report=[];
  for(const j of Object.values(state.jobs).filter(j=>j.status==='unknown')) {
    if(j.target_config?.type!=='sap_evse'||Date.now()-j.dispatch_at<180000)continue;
    const s=stations.find(s=>s.stationInfo.chargingStationId===j.target_config.station_id),c=s?.connectors.find(c=>c.connectorId===1)?.connectorStatus;
    if(!s||s.wsState!==1||c.transactionStarted||c.transactionPending||c.transactionStarting||c.transactionEnding)continue;
    // Preparing left behind by a rejected/timed-out StartTransaction is occupied.
    if(c.status==='Preparing'&&apply)await sap('statusNotification',{hashIds:[s.stationInfo.hashId],connectorId:1,status:'Available',errorCode:'NoError'});
    report.push({job_id:j.job_id,station:j.target_config.station_id,previous_status:c.status});
  }
  stations=(await sap('listChargingStations')).chargingStations;
  const data=await graphql('query{Transactions(where:{ChargingStation:{_or:[{ocppConnectionName:{_like:"SIM-S%"}},{ocppConnectionName:{_eq:"cp001"}}]}},order_by:{createdAt:desc},limit:1000){transactionId isActive startTime endTime totalKwh ChargingStation{ocppConnectionName}}}');
  for(const item of report) {
    const j=state.jobs[item.job_id],s=stations.find(s=>s.stationInfo.chargingStationId===item.station),c=s.connectors.find(c=>c.connectorId===1).connectorStatus;
    const tx=data.Transactions.find(t=>t.ChargingStation.ocppConnectionName===item.station&&Date.parse(t.startTime)>=j.dispatch_at-5000&&Date.parse(t.startTime)<=j.dispatch_at+180000);
    item.csms_transaction=tx||null;
    if(c.status!=='Available'||c.transactionStarted){item.result='held';continue;}
    if(tx?.endTime&&!tx.isActive&&j.started_at){j.stop_ack=true;j.energy_wh=Number(tx.totalKwh)*1000;engine.transition(state,j,'done',Date.now(),'Operator reconciled CSMS end and native Available');}
    else {j.csms_orphan_transaction=tx?.isActive?tx.transactionId:null;engine.transition(state,j,'failed',Date.now(),'Commissioning failure; native idle verified; see reconciliation evidence, no start replay');}
    delete state.reservations[j.target];item.result=j.status;
  }
  for(const j of Object.values(state.jobs).filter(j=>j.status==='unknown'&&j.target_config?.type==='everest_evse')){
    let native;try{native=JSON.parse(readFileSync(root+`.runtime/everest-status-${j.target_config.evse_id}.json`));}catch{continue;}
    const tx=data.Transactions.find(t=>t.ChargingStation.ocppConnectionName==='cp001'&&Date.parse(t.startTime)>=j.dispatch_at-5000&&Date.parse(t.startTime)<=j.dispatch_at+60000);
    const fresh=Date.now()-Date.parse(native.captured_at)<15000&&Date.now()-Date.parse(native.sample.datetime)<15000;
    const item={job_id:j.job_id,station:'cp001',native_state:native.sample.state,csms_transaction:tx||null};report.push(item);
    if(!fresh||native.sample.state!=='Unplugged'||!tx?.endTime||tx.isActive){item.result='held';continue;}
    j.transaction_id=tx.transactionId;j.started_at=Date.parse(tx.startTime);j.stop_ack=true;j.csms_energy_wh=Number(tx.totalKwh)*1000;
    engine.transition(state,j,'done',Date.now(),'Operator reconciled EVerest Unplugged and CSMS end');delete state.reservations[j.target];item.result='done';
  }
  writeFileSync(root+`.runtime/reconcile-${stamp}.report.json`,JSON.stringify(report,null,2),{mode:0o600});
  if(apply){const temp=path+'.operator.tmp';writeFileSync(temp,JSON.stringify(state),{mode:0o600,flush:true});renameSync(temp,path);}
  console.log(JSON.stringify({apply,considered:report.length,released:report.filter(r=>['done','failed'].includes(r.result)).length,held:Object.keys(state.reservations).length,orphan_csms:report.filter(r=>r.csms_transaction?.isActive).length}));
}finally {
  if(disabled){const current=await api();await api('POST',{rev:current.rev,flows:current.flows.map(n=>n.id==='sim_orchestrator_v1'?{...n,disabled:false}:n.id==='sim_owner'?{...n,initialize:"context.set('halted',false);context.set('pendingCount',0);context.set('cache',null);context.set('tail',null);"}:n)});}
}
