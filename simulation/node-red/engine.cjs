'use strict';
const TERMINAL = new Set(['done','failed','expired','cancelled','rejected','dry_run']);
const WAITING = new Set(['pending','queued']);
const BEHAVIORS = ['NORMAL_CHARGING','EARLY_STOP','TIME_LIMIT_REACHED','CANCEL_BEFORE_START','AUTHORIZATION_FAILED','CHARGING_FAULT'];
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
function assert(ok, message) { if (!ok) throw new Error(message); }
function integer(v, min, max, name) { assert(Number.isInteger(v) && v>=min && v<=max, `Invalid ${name}`); }
function object(v) { return v!==null && typeof v==='object' && !Array.isArray(v); }
function sameKeys(a,b) {return Object.keys(a).sort().join('|')===[...b].sort().join('|');}
function weights(w, allowed, label) {
  assert(object(w) && Object.keys(w).length>0, `Invalid ${label}`);
  assert(Object.entries(w).every(([k,v])=>allowed.includes(k)&&Number.isFinite(v)&&v>=0),`Invalid ${label}`);
  assert(Math.abs(Object.values(w).reduce((a,b)=>a+b,0)-100)<0.000001,`${label} must sum to 100`);
}
function validateSnapshot(c) {
  assert(c?.control?.schema_version===1 && c?.registry?.schema_version===1 && c?.targetRegistry?.schema_version===1,'Unsupported schema version');
  const ctl=c.control, targets=c.targetRegistry.targets;
  assert(typeof ctl.enabled==='boolean'&&typeof ctl.dry_run==='boolean','Invalid engine switches');
  integer(ctl.max_queue,1,20000,'max_queue'); integer(ctl.batch_size,1,20,'batch_size'); integer(ctl.retention_days,1,30,'retention_days');
  if(ctl.max_inflight!==undefined)integer(ctl.max_inflight,1,20,'max_inflight');
  assert(object(targets),'Invalid targets');
  const addresses=new Set();
  for(const [id,t] of Object.entries(targets)) {
    assert(idPattern.test(id) && object(t),'Invalid target ID');
    assert(['sap_evse','everest_evse','openems_channel'].includes(t.type),'Unknown target type');
    assert(typeof t.site==='string'&&idPattern.test(t.site),'Invalid site');
    let address;
    if(t.type==='openems_channel') {
      assert(t.component==='simulateConsumption' && t.meter==='meterSimulation','OpenEMS component not allowlisted');
      integer(t.value_min_w,0,200000,'min power'); integer(t.value_max_w,t.value_min_w,200000,'max power');
      address=t.component;
    } else {
      assert(/^[A-Za-z0-9_-]{1,64}$/.test(t.station_id),'Invalid station ID');
      integer(t.connector_id,1,200,'connector'); integer(t.max_power_w,1000,120000,'EVSE power');
      assert(['AC','DC'].includes(t.charging_type),'Invalid charging type');
      address=`${t.station_id}:${t.connector_id}`;
      if(t.type==='everest_evse') assert(t.station_id==='cp001'&&[1,2].includes(t.connector_id)&&t.mqtt_topic_base===`everest_external/nodered/${t.connector_id}/carsim/cmd`,'MQTT target not allowlisted');
    }
    assert(!addresses.has(address),'Duplicate physical target');addresses.add(address);
  }
  assert(Array.isArray(c.scenarios)&&c.scenarios.length<=64,'Too many scenarios');
  const ids=new Set();
  for(const s of c.scenarios) {
    assert(s.schema_version===1&&idPattern.test(s.id)&&!ids.has(s.id),'Invalid or duplicate scenario ID');ids.add(s.id);
    assert(typeof s.enabled==='boolean'&&typeof s.name==='string','Invalid scenario');
    assert(['charging_demand','native_dispatch','power_profile'].includes(s.kind),'Unsupported kind');
    const q=s.schedule,p=s.parameters;
    assert(object(q)&&q.type==='daily'&&q.timezone==='Asia/Ho_Chi_Minh','Only daily Asia/Ho_Chi_Minh supported');
    assert(Array.isArray(q.times)&&q.times.length>0&&q.times.length<=1440&&new Set(q.times).size===q.times.length&&q.times.every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)),'Invalid schedule times');
    integer(q.catch_up_seconds,0,3600,'catch-up'); assert(object(p),'Invalid parameters');
    if(s.kind==='charging_demand') {
      assert(object(p.vehicle_count_by_time)&&sameKeys(p.vehicle_count_by_time,q.times),'Arrival slots mismatch');
      for(const n of Object.values(p.vehicle_count_by_time))integer(n,0,1000,'vehicle count');
      assert(object(p.duration_by_time)&&sameKeys(p.duration_by_time,q.times),'Duration slots mismatch');
      for(const d of Object.values(p.duration_by_time)){integer(d.min,30,10800,'min duration');integer(d.max,d.min,10800,'max duration');}
      integer(p.seed,0,4294967295,'seed'); integer(p.arrival_window_seconds,1,3600,'arrival window');
      assert(['uniform','even'].includes(p.arrival_distribution),'Invalid arrival distribution');
      assert(Array.isArray(p.target_pool)&&p.target_pool.length>0&&new Set(p.target_pool).size===p.target_pool.length&&p.target_pool.every(id=>targets[id]&&targets[id].type!=='openems_channel'),'Unknown/duplicate target');
      integer(p.max_parallel,1,p.target_pool.length,'max_parallel'); integer(p.max_wait_seconds,1,7200,'max_wait');
      assert(p.queue_policy==='fifo'&&['queue','reject'].includes(p.on_full),'Unsupported queue policy');
      weights(p.behaviors,BEHAVIORS,'behaviors');weights(p.site_weights,[...new Set(p.target_pool.map(id=>targets[id].site))],'site weights');weights(p.charging_type_weights,['AC','DC'],'charging type weights');
      if(p.customer_profiles){
        assert(object(p.customer_profiles)&&object(p.customer_weights_by_time)&&sameKeys(p.customer_weights_by_time,q.times),'Customer profile slots mismatch');
        for(const [name,profile]of Object.entries(p.customer_profiles)){
          assert(/^[A-Z_]+$/.test(name),'Invalid customer profile');integer(profile.battery_wh,10000,200000,'battery');
          for(const field of ['initial_soc','target_soc']){assert(Array.isArray(profile[field])&&profile[field].length===2,'Invalid SoC range');integer(profile[field][0],0,100,'SoC');integer(profile[field][1],profile[field][0],100,'SoC');}
          weights(profile.charging_type_weights,['AC','DC'],'profile charging type');
        }
        for(const w of Object.values(p.customer_weights_by_time))weights(w,Object.keys(p.customer_profiles),'customer weights');
      }
      for(const [site,w] of Object.entries(p.site_weights))for(const [type,tw] of Object.entries(p.charging_type_weights))if(w&&tw)assert(p.target_pool.some(id=>targets[id].site===site&&targets[id].charging_type===type),'No compatible target in site');
      if(p.target_pool.some(id=>targets[id].type==='everest_evse'))assert(Object.entries(p.behaviors).every(([k,v])=>!v||['NORMAL_CHARGING','EARLY_STOP','TIME_LIMIT_REACHED'].includes(k)),'EVerest behavior not verified');
    } else if(s.kind==='power_profile') {
      const t=targets[p.target];assert(t?.type==='openems_channel','Unknown power target');
      assert(object(p.profile_w)&&sameKeys(p.profile_w,q.times),'Power slots mismatch');
      for(const v of Object.values(p.profile_w))integer(v,t.value_min_w,t.value_max_w,'power');
    } else {
      assert(Array.isArray(p.actions)&&p.actions.length>0&&p.actions.length<=100,'Invalid actions');
      const actionIds=new Set();
      for(const a of p.actions) {
        assert(idPattern.test(a.id)&&!actionIds.has(a.id),'Duplicate action ID');actionIds.add(a.id);
        integer(a.offset_seconds,0,86400,'offset');assert(targets[a.target],'Unknown action target');
        if(a.command==='execute_charging_session') {
          assert(targets[a.target].type==='everest_evse'&&a.transport==='mqtt','Unsupported MQTT target');
          const match=/^sleep 1;iec_wait_pwr_ready;sleep 1;draw_power_regulated 16,3;sleep (\d+);unplug$/.exec(a.payload);
          assert(match,'MQTT grammar not allowlisted');integer(Number(match[1]),30,10800,'native duration');
        } else {
          assert(a.command==='set_power_w'&&a.transport==='http'&&targets[a.target].type==='openems_channel','Command not allowlisted');
          integer(a.payload?.value,targets[a.target].value_min_w,targets[a.target].value_max_w,'power');
        }
      }
    }
  }
  return c;
}
function hash32(s) {let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function rng32(seed){let x=seed>>>0;return()=>{x=(x+0x6D2B79F5)|0;let t=Math.imul(x^(x>>>15),1|x);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function pick(w,rng){let x=rng()*100;for(const [k,v]of Object.entries(w)){x-=v;if(x<0)return k;}return Object.keys(w).at(-1);}
function dueSlots(s, now) {
  const out=[];
  for(let at=Math.ceil((now-s.schedule.catch_up_seconds*1000)/60000)*60000;at<=now;at+=60000){
    const local=new Date(at+7*3600000).toISOString(),date=local.slice(0,10),time=local.slice(11,16);
    if(s.schedule.times.includes(time))out.push({run_id:`${s.id}:${date}:${time}`,at,time});
  }return out;
}
function expand(s,slot,targets) {
  const base={run_id:slot.run_id,scenario_id:s.id,status:'pending',attempt:0,created_at:slot.at};
  if(s.kind==='power_profile')return [{...base,job_id:slot.run_id+':power',target:s.parameters.target,target_config:targets[s.parameters.target],due_at:slot.at,expires_at:slot.at+120000,command:'set_power_w',value:s.parameters.profile_w[slot.time]}];
  if(s.kind==='native_dispatch')return s.parameters.actions.map(a=>({...base,job_id:slot.run_id+':'+a.id,target:a.target,target_config:targets[a.target],due_at:slot.at+a.offset_seconds*1000,expires_at:slot.at+(a.offset_seconds+120)*1000,command:a.command,value:a.payload?.value,payload:a.payload,duration_seconds:a.command==='execute_charging_session'?Number(/sleep (\d+);unplug$/.exec(a.payload)[1]):undefined}));
  const p=s.parameters,rng=rng32(hash32(`${p.seed}:${slot.run_id}`)),n=p.vehicle_count_by_time[slot.time],jobs=[];
  for(let i=0;i<n;i++) {
    const at=slot.at+Math.floor((p.arrival_distribution==='even'?i/n:rng())*p.arrival_window_seconds)*1000;
    const d=p.duration_by_time[slot.time],duration=d.min+Math.floor(rng()*(d.max-d.min+1));
    const behavior=pick(p.behaviors,rng),site=pick(p.site_weights,rng),customer=p.customer_profiles?pick(p.customer_weights_by_time[slot.time],rng):null,profile=p.customer_profiles?.[customer],charging_type=pick(profile?.charging_type_weights||p.charging_type_weights,rng);
    const targetSoc=profile?profile.target_soc[0]+Math.floor(rng()*(profile.target_soc[1]-profile.target_soc[0]+1)):80+Math.floor(rng()*16);
    jobs.push({...base,job_id:`${slot.run_id}:vehicle-${String(i+1).padStart(4,'0')}`,due_at:at,expires_at:at+p.max_wait_seconds*1000,duration_seconds:behavior==='EARLY_STOP'?Math.max(30,Math.floor(duration*(0.2+0.5*rng()))):duration,target_soc:targetSoc,customer_profile:customer,planned_battery_wh:profile?.battery_wh,planned_initial_soc_range:profile?.initial_soc,behavior,site,charging_type,
      target_pool:p.target_pool.filter(id=>targets[id].site===site&&targets[id].charging_type===charging_type),max_parallel:p.max_parallel,on_full:p.on_full});
  }
  return jobs.sort((a,b)=>a.due_at-b.due_at||a.job_id.localeCompare(b.job_id));
}
function newState(){return {version:1,runs:{},jobs:{},reservations:{},events:[],observations:{}};}
function transition(state,j,status,now,detail) {
  j.status=status;j.updated_at=now;if(detail)j.detail=detail;
  const e={timestamp:new Date(now).toISOString(),job_id:j.job_id,run_id:j.run_id,scenario_id:j.scenario_id,target:j.target,status,detail};
  state.events.push(e);if(state.events.length>1000)state.events.shift();
}
function recover(state,now) {
  assert(state.version===1&&object(state.jobs)&&object(state.reservations),'Invalid ledger');
  state.observations={};
  for(const j of Object.values(state.jobs))if(!WAITING.has(j.status)&&!TERMINAL.has(j.status)){j.request_pending=false;transition(state,j,'unknown',now,'Recovered; reconcile before sending anything');}
  return state;
}
function plan(state,c,now) {
  const enabled=new Set(c.scenarios.filter(s=>s.enabled).map(s=>s.id));
  for(const j of Object.values(state.jobs))if(WAITING.has(j.status)&&!enabled.has(j.scenario_id))transition(state,j,'cancelled',now,'Scenario disabled or removed');
  if(!c.control.enabled)return;
  for(const s of [...c.scenarios].sort((a,b)=>a.id.localeCompare(b.id)))if(s.enabled)for(const slot of dueSlots(s,now)) {
    if(state.runs[slot.run_id])continue;
    const jobs=expand(s,slot,c.targetRegistry.targets);
    if(Object.values(state.jobs).filter(j=>!TERMINAL.has(j.status)).length+jobs.length>c.control.max_queue)throw new Error('Queue capacity exceeded; snapshot not planned');
    state.runs[slot.run_id]={scenario_id:s.id,at:slot.at,planned_arrivals:jobs.length,revision:c.revision,targets:c.targetRegistry.targets};
    for(const j of jobs)state.jobs[j.job_id]=j;
  }
  const cutoff=now-c.control.retention_days*86400000;
  for(const [id,j]of Object.entries(state.jobs))if(TERMINAL.has(j.status)&&j.updated_at<cutoff)delete state.jobs[id];
  for(const [id,r]of Object.entries(state.runs))if(r.at<cutoff&&!Object.values(state.jobs).some(j=>j.run_id===id))delete state.runs[id];
}
function observe(state,id,obs,now) {
  state.observations[id]={...state.observations[id],...obs,at:now};
  const j=state.jobs[state.reservations[id]];if(!j)return;
  if(!obs.online)return;
  if(Number.isFinite(obs.energy_wh))j.last_meter_wh=obs.energy_wh;
  if(obs.active&&obs.transaction_id!=null) {
    if(j.transaction_id!=null&&String(j.transaction_id)!==String(obs.transaction_id)){transition(state,j,'unknown',now,'Transaction mismatch; target quarantined');return;}
    if(j.transaction_id==null && obs.started_at && obs.started_at<j.dispatch_at-5000){transition(state,j,'unknown',now,'Existing unrelated transaction');return;}
    j.transaction_id=obs.transaction_id;
    if(!j.started_at){j.request_pending=false;j.started_at=obs.started_at||now;j.start_meter_wh=obs.start_meter_wh??obs.energy_wh;j.stop_due_at=j.started_at+j.duration_seconds*1000;}
    if(['submitted','dispatching','unknown'].includes(j.status))transition(state,j,'running',now,'Simulator confirms CSMS accepted transaction');
  }
  if(obs.available&&!obs.active) {
    if(j.stop_ack&&j.started_at) {transition(state,j,'done',now,'Stop acknowledged and connector available');j.energy_wh=j.csms_energy_wh??obs.session_energy_wh??Math.max(0,(j.last_meter_wh??0)-(j.start_meter_wh??0));delete state.reservations[id];}
    else if(j.release_ack) {transition(state,j,j.behavior==='AUTHORIZATION_FAILED'?'rejected':'cancelled',now,j.behavior);delete state.reservations[id];}
    else if(j.started_at&&j.status!=='running') {transition(state,j,'unknown',now,'Available without confirmed stop; operator reconciliation needed');}
  }
}
function sapRequest(j, procedure, payload={}) {
  assert(typeof j.hash_id==='string'&&j.hash_id.length>0,'Missing SAP hash ID');
  j.request_pending=true;
  return {kind:'sap',job_id:j.job_id,operation:procedure,method:'POST',url:`http://sap-charging-simulator:8080/ui/0.0.1/${procedure}`,payload:{hashIds:[j.hash_id],...payload}};
}
function startEffect(j,t,obs) {
  if(t.type==='openems_channel')return {kind:'openems',job_id:j.job_id,operation:'set_power_w',method:'POST',url:`http://openems-edge:8084/rest/channel/${t.component}/Data`,payload:{value:j.value}};
  if(t.type==='everest_evse')return {kind:'mqtt',job_id:j.job_id,operation:'execute_charging_session',topic:`${t.mqtt_topic_base}/execute_charging_session`,qos:0,retain:false,payload:j.payload||`sleep 1;iec_wait_pwr_ready;sleep 1;draw_power_regulated 16,3;sleep ${j.duration_seconds};unplug`};
  j.hash_id=obs.hash_id;
  if(j.behavior==='AUTHORIZATION_FAILED')return sapRequest(j,'authorize',{idTag:'SIM-INVALID-TAG'});
  if(j.behavior==='CANCEL_BEFORE_START')return sapRequest(j,'statusNotification',{connectorId:t.connector_id,status:'Preparing',errorCode:'NoError'});
  return sapRequest(j,'startTransaction',{connectorId:t.connector_id,idTag:'SIM-VALID-TAG'});
}
function dispatch(state,c,now,brokerOnline=true) {
  const effects=[];
  const capacity=Math.max(0,Math.min(c.control.batch_size,(c.control.max_inflight??20)-Object.values(state.jobs).filter(j=>j.request_pending).length));
  // Ending already-started sessions continues when planning is paused.
  for(const j of Object.values(state.jobs)) {
    if(['dispatching','submitted','stopping','releasing','faulting'].includes(j.status)&&now-j.updated_at>45000){j.request_pending=false;transition(state,j,'unknown',now,'Confirmation timeout; no automatic replay');}
    if(j.status==='running'&&!j.request_pending&&(now>=j.stop_due_at||(j.behavior==='NORMAL_CHARGING'&&j.observed_soc>=j.target_soc))&&j.target_config.type==='sap_evse'&&effects.length<capacity){
      j.stop_trigger=j.observed_soc>=j.target_soc?'target_soc_reached':j.behavior==='NORMAL_CHARGING'?'time_limit_reached':j.behavior;
      if(j.behavior==='CHARGING_FAULT'&&!j.fault_sent){j.fault_sent=true;transition(state,j,'faulting',now);effects.push(sapRequest(j,'statusNotification',{connectorId:1,status:'Faulted',errorCode:'GroundFailure'}));}
      else {transition(state,j,'stopping',now);effects.push(sapRequest(j,'stopTransaction',{transactionId:j.transaction_id,reason:j.behavior==='CHARGING_FAULT'?'Other':'Local'}));}
    }
    if(j.status==='releasing'&&j.release_due_at&&now>=j.release_due_at&&!j.release_sent&&effects.length<capacity){j.release_sent=true;effects.push(sapRequest(j,'statusNotification',{connectorId:1,status:'Available',errorCode:'NoError'}));}
  }
  if(!c.control.enabled)return effects;
  for(const j of Object.values(state.jobs).filter(j=>WAITING.has(j.status)).sort((a,b)=>a.due_at-b.due_at||a.job_id.localeCompare(b.job_id))) {
    if(now<j.due_at)continue;
    if(now>j.expires_at){transition(state,j,'expired',now);continue;}
    if(j.status==='pending'){j.arrived_at=now;transition(state,j,'queued',now);}
    if(effects.length>=capacity)continue;
    if(c.control.dry_run){transition(state,j,'dry_run',now,'Planned only; no transport output');continue;}
    const active=Object.values(state.jobs).filter(x=>x.scenario_id===j.scenario_id&&!WAITING.has(x.status)&&!TERMINAL.has(x.status)).length;
    if(active>=(j.max_parallel||1))continue;
    const pool=j.target_pool||[j.target];
    const id=pool.find(id=>{
      const t=j.target_config||state.runs[j.run_id]?.targets[id],o=state.observations[id];
      return !state.reservations[id]&&(t.type==='openems_channel'||(o?.online&&o.available&&now-o.at<15000&&(t.type!=='everest_evse'||brokerOnline)));
    });
    if(!id){if(j.on_full==='reject')transition(state,j,'rejected',now,'No compatible available EVSE');continue;}
    j.target=id;j.target_config=j.target_config||state.runs[j.run_id]?.targets[id];
    state.reservations[id]=j.job_id;j.dispatch_at=now;j.attempt++;j.waiting_seconds=(now-j.due_at)/1000;
    transition(state,j,'submitted',now,'Intent persisted before transport; not operation success');
    effects.push(startEffect(j,j.target_config,state.observations[id]));
  }
  return effects;
}
function httpResult(state,e,now) {
  const j=state.jobs[e.job_id];if(!j)return [];
  j.request_pending=false;
  const ok=e.statusCode>=200&&e.statusCode<300;
  const body=e.payload;
  if(e.kind==='openems') {
    if(!ok||body?.error){transition(state,j,'unknown',now,'OpenEMS API failed; read-back required');return [];}
    if(e.operation==='set_power_w') {
      j.read_after=now+2500;
      return [];
    }
    const value=body?.value;
    if(Number(value)===j.value){transition(state,j,'done',now,'OpenEMS meter read-back matches');delete state.reservations[j.target];}
    else transition(state,j,'unknown',now,'OpenEMS read-back mismatch');
    return [];
  }
  if(e.operation==='authorize'&&/"status":"(?:Invalid|Blocked|Expired|Rejected)"/.test(JSON.stringify(body))) {
    j.release_ack=true;j.release_due_at=now;transition(state,j,'releasing',now,'Authorization rejection confirmed by CSMS');return [];
  }
  if(!ok||body?.status!=='success'||body.hashIdsFailed?.length){transition(state,j,'unknown',now,'SAP request failed; target held for reconciliation');return [];}
  if(e.operation==='stopTransaction'){j.stop_ack=true;return [];}
  if(e.operation==='authorize'){
    const encoded=JSON.stringify(body);
    if(!/Invalid|Blocked|Expired|Rejected/.test(encoded)){transition(state,j,'unknown',now,'Expected invalid token was not confirmed rejected');return [];}
    j.release_ack=true;j.release_due_at=now;transition(state,j,'releasing',now);return [];
  }
  if(e.operation==='statusNotification') {
    if(j.status==='faulting'){j.stop_due_at=now;transition(state,j,'running',now,'Fault status acknowledged');}
    else if(j.release_sent){j.release_ack=true;}
    else {j.release_due_at=now+3000;transition(state,j,'releasing',now);}
  }
  return [];
}
function kpis(state) {
  const jobs=Object.values(state.jobs),counts={};for(const j of jobs)counts[j.status]=(counts[j.status]||0)+1;
  const waits=jobs.filter(j=>Number.isFinite(j.waiting_seconds)).map(j=>j.waiting_seconds).sort((a,b)=>a-b);
  return {planned_arrivals:jobs.length,arrived:jobs.filter(j=>j.arrived_at||j.dispatch_at).length,dispatched:jobs.filter(j=>j.dispatch_at).length,confirmed_started:jobs.filter(j=>j.started_at).length,confirmed_finished:counts.done||0,counts,reservations:Object.keys(state.reservations).length,waiting_p50:waits.length?waits[Math.floor((waits.length-1)*0.5)]:null,waiting_p95:waits.length?waits[Math.floor((waits.length-1)*0.95)]:null};
}
module.exports={validateSnapshot,dueSlots,expand,newState,recover,plan,dispatch,observe,httpResult,kpis,transition,hash32,rng32,TERMINAL};
