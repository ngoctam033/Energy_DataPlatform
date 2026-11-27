import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import engine from '../node-red/engine.cjs';
import io from '../node-red/io.cjs';
import {mergeFlows} from '../scripts/manage.mjs';
const original=await io.loadConfig();
function config(){const c=structuredClone(original);c.control.enabled=true;c.control.dry_run=false;c.scenarios=[c.scenarios[0]];c.scenarios[0].enabled=true;return c;}
const now=Date.parse('2026-11-27T03:00:15Z');
function planned(count=100) {
  const c=config(),s=c.scenarios[0];s.parameters.vehicle_count_by_time['10:00']=count;s.parameters.arrival_window_seconds=1;
  const state=engine.newState();engine.plan(state,c,now);return {c,state};
}
test('S01 exactly 1395 and fleet has 4 sites with correct power mix',()=>{
  engine.validateSnapshot(original);
  assert.equal(Object.values(original.scenarios[0].parameters.vehicle_count_by_time).reduce((a,b)=>a+b),1395);
  const fleet=Object.values(original.targetRegistry.targets).filter(t=>t.type==='sap_evse');assert.equal(fleet.length,200);
  for(let i=1;i<=4;i++)assert.equal(fleet.filter(t=>t.site===`site-${i}`).length,50);
  assert.deepEqual([7000,22000,60000,120000].map(w=>fleet.filter(t=>t.max_power_w===w).length),[40,40,80,40]);
});
test('invalid schema, ID, target, schedule, payload and limits fail closed',()=>{
  const mutations=[c=>c.scenarios[0].schema_version=2,c=>c.scenarios.push(c.scenarios[0]),c=>c.scenarios[0].schedule.timezone='Europe/Berlin',c=>c.scenarios[0].parameters.target_pool=['missing'],c=>c.scenarios[0].parameters.duration_by_time['10:00'].min=-1,c=>c.scenarios[0].parameters.behaviors.NORMAL_CHARGING=71,c=>c.targetRegistry.targets['everest-1'].mqtt_topic_base='arbitrary',c=>c.scenarios[0].parameters.arrival_distribution='shell'];
  for(const mutate of mutations){const c=config();mutate(c);assert.throws(()=>engine.validateSnapshot(c));}
});
test('timezone, near midnight and catch-up are exact',()=>{
  const s=config().scenarios[0];assert.equal(engine.dueSlots(s,now)[0].run_id,'s01-normal-working-day:2026-11-27:10:00');
  assert.equal(engine.dueSlots(s,Date.parse('2026-11-26T17:00:30Z'))[0].run_id,'s01-normal-working-day:2026-11-27:00:00');
  assert.equal(engine.dueSlots(s,now+180000).length,0);
});
test('100 arrivals deterministic, unique and within arrival window',()=>{
  const c=config(),s=c.scenarios[0];s.parameters.vehicle_count_by_time['10:00']=100;
  const slot=engine.dueSlots(s,now)[0],a=engine.expand(s,slot,c.targetRegistry.targets),b=engine.expand(s,slot,c.targetRegistry.targets);
  assert.deepEqual(a,b);assert.equal(a.length,100);assert.equal(new Set(a.map(j=>j.job_id)).size,100);
  assert.ok(a.every(j=>j.due_at>=slot.at&&j.due_at<slot.at+3600000));
});
test('multiple ticks and edited config do not duplicate a planned slot',()=>{
  const {c,state}=planned();engine.plan(state,c,now+15000);c.scenarios[0].parameters.vehicle_count_by_time['10:00']=200;engine.plan(state,c,now+30000);
  assert.equal(Object.keys(state.jobs).length,100);
});
test('disable cancels queued work, retains active reservation',()=>{
  const {c,state}=planned(2),jobs=Object.values(state.jobs);jobs[0].status='running';state.reservations.test=jobs[0].job_id;
  c.scenarios[0].enabled=false;engine.plan(state,c,now);assert.equal(jobs[1].status,'cancelled');assert.equal(jobs[0].status,'running');assert.equal(Object.keys(state.reservations).length,1);
});
test('offline, stale and unknown targets never get commands; waiting expires',()=>{
  const {c,state}=planned();assert.deepEqual(engine.dispatch(state,c,now),[]);assert.equal(Object.values(state.jobs)[0].status,'queued');
  engine.dispatch(state,c,now+7200000);assert.ok(Object.values(state.jobs).every(j=>j.status==='expired'));
});
test('exclusive allocation and batch limit with 100 arrivals',()=>{
  const {c,state}=planned();
  c.control.batch_size=10;c.control.max_inflight=20;
  for(const [id,t]of Object.entries(c.targetRegistry.targets))if(t.type==='sap_evse')engine.observe(state,id,{online:true,available:true,hash_id:id},now);
  const effects=engine.dispatch(state,c,now);assert.equal(effects.length,10);assert.equal(Object.keys(state.reservations).length,10);
  assert.equal(new Set(effects.map(e=>e.payload.hashIds[0])).size,10);
  for(const e of effects)assert.equal(state.jobs[e.job_id].status,'submitted');
});
test('dry run does not reach transport and uses a separate ledger',()=>{
  const {c,state}=planned();c.control.dry_run=true;assert.deepEqual(engine.dispatch(state,c,now),[]);assert.ok(Object.values(state.jobs).every(j=>j.status==='dry_run'));
  assert.equal(Object.keys(engine.newState().runs).length,0);
});
test('crash after handoff quarantines and does not replay start',()=>{
  const {c,state}=planned(1),j=Object.values(state.jobs)[0],id=j.target_pool[0];
  engine.observe(state,id,{online:true,available:true,hash_id:'abc'},now);engine.dispatch(state,c,now);
  const recovered=engine.recover(JSON.parse(JSON.stringify(state)),now+1000);assert.equal(recovered.jobs[j.job_id].status,'unknown');
  engine.observe(recovered,id,{online:true,available:true,hash_id:'abc'},now+2000);
  assert.deepEqual(engine.dispatch(recovered,c,now+2000),[]);assert.equal(recovered.reservations[id],j.job_id);
});
test('start, stop ACK and Available all required; transaction ID mismatch quarantines',()=>{
  const {c,state}=planned(1),j=Object.values(state.jobs)[0];j.behavior='NORMAL_CHARGING';const id=j.target_pool[0];
  engine.observe(state,id,{online:true,available:true,hash_id:'abc'},now);engine.dispatch(state,c,now);
  engine.observe(state,id,{online:true,available:false,active:true,transaction_id:123,energy_wh:1000,start_meter_wh:1000},now+1000);assert.equal(j.status,'running');
  engine.observe(state,id,{online:true,available:false,active:true,transaction_id:124},now+2000);assert.equal(j.status,'unknown');
  engine.observe(state,id,{online:true,available:false,active:true,transaction_id:123,energy_wh:1200},now+3000);
  j.stop_due_at=now+4000;const stop=engine.dispatch(state,c,now+4000)[0];assert.equal(stop.operation,'stopTransaction');
  engine.observe(state,id,{online:true,available:true,active:false,energy_wh:1300},now+5000);assert.notEqual(j.status,'done');
  engine.httpResult(state,{...stop,statusCode:200,payload:{status:'success'}},now+6000);
  engine.observe(state,id,{online:true,available:true,active:false,energy_wh:1300},now+7000);assert.equal(j.status,'done');assert.equal(j.energy_wh,300);assert.equal(state.reservations[id],undefined);
});
test('HTTP 401 is uncertain and never retries a start',()=>{
  const {c,state}=planned(1),j=Object.values(state.jobs)[0],id=j.target_pool[0];engine.observe(state,id,{online:true,available:true,hash_id:'abc'},now);
  const effect=engine.dispatch(state,c,now)[0];engine.httpResult(state,{...effect,statusCode:401,payload:{}},now);assert.equal(j.status,'unknown');assert.deepEqual(engine.dispatch(state,c,now+10000),[]);
});
test('ownership merge preserves shared broker and rejects collision',()=>{
  const existing=[{id:'vendor',type:'tab'},{id:'shared',type:'mqtt-broker',broker:'mqtt-server',port:'1883'}];
  assert.deepEqual(mergeFlows(existing,[{id:'sim_orchestrator_v1',type:'tab'}]).slice(0,2),existing);
  assert.throws(()=>mergeFlows(existing,[{id:'vendor',type:'tab'}]),/collision/);
});
test('in-flight limit protects CSMS across ticks until native ACK',()=>{
  const {c,state}=planned(3);c.control.max_inflight=1;c.control.batch_size=10;
  for(const [id,t]of Object.entries(c.targetRegistry.targets))if(t.type==='sap_evse')engine.observe(state,id,{online:true,available:true,hash_id:id},now);
  const [first]=engine.dispatch(state,c,now);assert.ok(first);
  assert.equal(engine.dispatch(state,c,now+1000).length,0);
  engine.httpResult(state,{...first,statusCode:200,payload:{status:'success'}},now+2000);
  assert.equal(engine.dispatch(state,c,now+2000).length,1);
});
test('normal sessions end at observed target SoC, not invented elapsed SoC',()=>{
  const {c,state}=planned(1),j=Object.values(state.jobs)[0];j.behavior='NORMAL_CHARGING';const id=j.target_pool[0];
  engine.observe(state,id,{online:true,available:true,hash_id:id},now);engine.dispatch(state,c,now);
  engine.observe(state,id,{online:true,active:true,transaction_id:7},now+1000);
  j.observed_soc=j.target_soc-1;assert.equal(engine.dispatch(state,c,now+2000).length,0);
  j.observed_soc=j.target_soc;assert.equal(engine.dispatch(state,c,now+3000)[0].operation,'stopTransaction');assert.equal(j.stop_trigger,'target_soc_reached');
});
test('cancel, rejected authorization and fault use native operations',()=>{
  for(const behavior of ['CANCEL_BEFORE_START','AUTHORIZATION_FAILED','CHARGING_FAULT']){
    const {c,state}=planned(1),j=Object.values(state.jobs)[0];j.behavior=behavior;const id=j.target_pool[0];
    engine.observe(state,id,{online:true,available:true,hash_id:id},now);const [start]=engine.dispatch(state,c,now);
    if(behavior==='AUTHORIZATION_FAILED'){
      assert.equal(start.operation,'authorize');engine.httpResult(state,{...start,statusCode:400,payload:{status:'failure',responsesFailed:[{commandResponse:{idTagInfo:{status:'Invalid'}}}]}},now+1000);
      engine.observe(state,id,{online:true,available:true,active:false},now+2000);assert.equal(j.status,'rejected');
    }else if(behavior==='CANCEL_BEFORE_START'){
      assert.equal(start.payload.status,'Preparing');engine.httpResult(state,{...start,statusCode:200,payload:{status:'success'}},now+1000);
      const [release]=engine.dispatch(state,c,now+5000);assert.equal(release.payload.status,'Available');engine.httpResult(state,{...release,statusCode:200,payload:{status:'success'}},now+6000);
      engine.observe(state,id,{online:true,available:true,active:false},now+7000);assert.equal(j.status,'cancelled');
    }else{
      engine.observe(state,id,{online:true,active:true,transaction_id:7},now+1000);j.stop_due_at=now+2000;
      const [fault]=engine.dispatch(state,c,now+2000);assert.equal(fault.payload.status,'Faulted');engine.httpResult(state,{...fault,statusCode:200,payload:{status:'success'}},now+3000);
      assert.equal(engine.dispatch(state,c,now+4000)[0].operation,'stopTransaction');
    }
  }
});
test('power success requires matching meter read-back; unknown read-back retains reservation',()=>{
  const state=engine.newState(),j={job_id:'p',target:'factory-load',status:'submitted',value:120000};state.jobs.p=j;state.reservations[j.target]='p';
  engine.httpResult(state,{job_id:'p',kind:'openems',operation:'set_power_w',statusCode:200,payload:{}},now);assert.equal(j.status,'submitted');
  engine.httpResult(state,{job_id:'p',kind:'openems',operation:'read_power_w',statusCode:200,payload:{value:0}},now);assert.equal(j.status,'unknown');
  engine.httpResult(state,{job_id:'p',kind:'openems',operation:'read_power_w',statusCode:200,payload:{value:120000}},now);assert.equal(j.status,'done');assert.equal(state.reservations[j.target],undefined);
});
test('S02-S06 have all 24 slots and preserve documented anchor values',()=>{
  for(const [name,peak]of [['weekend',140],['fleet_charging',200],['holiday_travel',220],['low_demand',40],['demand_surge',400]]){
    const s=JSON.parse(readFileSync(new URL('../scenarios/daily/'+name+'.json',import.meta.url)));
    assert.equal(s.schedule.times.length,24);assert.equal(s.parameters.vehicle_count_by_time['18:00'],peak);
    const c=config();c.scenarios=[s];engine.validateSnapshot(c);
  }
});
