// The builder prepends engine.cjs here. All events pass through this one owner.
const io=global.get('simulationIO');
if(!io){node.error('simulationIO is unavailable; prepare settings before deploying');return null;}
// Subscribe to native API state, not the noisy dashboard meter channel fan-out.
if(!msg.kind&&!msg.status&&msg.topic!=='tick'&&!/^everest_api\/(evse_manager_[12]\/var\/session_info|ocpp\/var\/connection_status)$/.test(msg.topic||''))return null;
const count=context.get('pendingCount')||0;
if(count>500){node.error('Simulation event backlog exceeded; dispatch halted');context.set('halted',true);return null;}
context.set('pendingCount',count+1);
const previous=context.get('tail')||Promise.resolve();
const task=previous.then(async()=>{
  const now=Date.now();
  let cache=context.get('cache');
  if(!cache)cache={states:{},config:null,loadedAt:0,broker:false,valid:false};
  if(msg.topic==='tick'&&now-cache.loadedAt>=15000) {
    cache.loadedAt=now;
    try {cache.config=validateSnapshot(await io.loadConfig());cache.valid=true;cache.error=null;}
    catch(e){cache.valid=false;cache.error=e.message;node.warn('Simulation configuration rejected: '+e.message);}
  }
  if(!cache.config){context.set('cache',cache);return;}
  const mode=cache.config.control.dry_run?'dry':'live';
  if(!cache.states[mode])cache.states[mode]=recover(await io.loadState(mode)||newState(),now);
  // Continue reconciling the live ledger while the operator selects dry-run.
  if(!cache.states.live)cache.states.live=recover(await io.loadState('live')||newState(),now);
  const live=cache.states.live, state=cache.states[mode],eventsBefore=new Set([...live.events,...state.events].map(e=>JSON.stringify(e)));
  let effects=[];
  if(msg.status)cache.broker=msg.status.text==='node-red:common.status.connected'||msg.status.text==='connected';
  if(msg.kind==='csms_poll') {
    if(msg.statusCode===200&&!msg.payload?.errors)for(const tx of msg.payload?.data?.Transactions||[]) {
      const j=Object.values(live.jobs).find(j=>j.target_config?.station_id===tx.ChargingStation.ocppConnectionName&&j.dispatch_at&&Date.parse(tx.startTime)>=j.dispatch_at-5000&&
        (j.transaction_id!=null?String(j.transaction_id)===String(tx.transactionId):j.target_config.type==='everest_evse'&&Date.parse(tx.startTime)<=j.dispatch_at+60000));
      if(!j)continue;
      j.csms_confirmed=true;
      if(j.target_config.type==='everest_evse'){
        j.transaction_id=tx.transactionId;
        if(!j.started_at){j.started_at=Date.parse(tx.startTime);transition(live,j,'running',now,'CSMS confirms EVerest transaction');}
      }
      if(tx.endTime&&!tx.isActive){j.stop_ack=true;j.csms_end_at=Date.parse(tx.endTime);j.csms_energy_wh=tx.totalKwh==null?null:Number(tx.totalKwh)*1000;}
      const meter=tx.MeterValues?.[0];
      if(meter&&Math.abs(now-Date.parse(meter.timestamp))<60000) {
        const soc=meter.sampledValue.find(v=>v.measurand==='SoC');
        if(soc){j.observed_soc=Number(soc.value);j.first_observed_soc??=j.observed_soc;}
      }
    }
  } else if(msg.kind==='sap_poll') {
    if(msg.statusCode===200&&msg.payload?.status==='success'&&Array.isArray(msg.payload.chargingStations)) {
      const byStation=Object.fromEntries(Object.entries(cache.config.targetRegistry.targets).filter(([,t])=>t.type==='sap_evse').map(([id,t])=>[t.station_id,id]));
      for(const s of msg.payload.chargingStations) {
        const id=byStation[s.stationInfo?.chargingStationId];if(!id)continue;
        const t=cache.config.targetRegistry.targets[id],con=s.connectors?.find(c=>c.connectorId===t.connector_id)?.connectorStatus;if(!con)continue;
        observe(live,id,{online:s.wsState===1&&s.bootNotificationResponse?.status==='Accepted',available:con.status==='Available'&&!con.transactionStarted&&!con.transactionStarting&&!con.transactionPending&&!con.transactionEnding,active:con.transactionStarted===true,transaction_id:con.transactionId,started_at:con.transactionStart?Date.parse(con.transactionStart):null,energy_wh:con.energyActiveImportRegisterValue,start_meter_wh:con.transactionBeginMeterValue?.sampledValue?.find(v=>v.measurand==='Energy.Active.Import.Register'||!v.measurand)?.value,hash_id:s.stationInfo.hashId,status:con.status},now);
      }
    }
  } else if(msg.kind==='sap'||msg.kind==='openems')effects.push(...httpResult(live,msg,now));
  else if(msg.topic==='everest_api/ocpp/var/connection_status'&&!msg.retain){cache.everestConnected=String(msg.payload)==='connected';cache.everestAt=now;cache.broker=true;}
  else if(msg.topic?.startsWith('everest_api/evse_manager_')&&!msg.retain) {
    const m=/^everest_api\/evse_manager_([12])\/var\/session_info$/.exec(msg.topic);
    if(m){const p=typeof msg.payload==='object'?msg.payload:JSON.parse(msg.payload),id='everest-'+m[1];
      if(Math.abs(now-Date.parse(p.datetime))<15000){
        const online=cache.everestConnected&&now-cache.everestAt<15000&&!p.permanent_fault;
        observe(live,id,{online,available:p.state==='Unplugged',active:p.state==='Charging',status:p.state,session_energy_wh:p.charged_energy_wh},now);
        const j=live.jobs[live.reservations[id]];
        if(j&&online&&cache.broker&&p.state==='AuthRequired'&&!j.auth_sent&&now-j.dispatch_at<45000){
          j.auth_sent=true;effects.push({kind:'mqtt',job_id:j.job_id,topic:'everest_api/dummy_token_provider/cmd/provide',qos:0,retain:false,payload:JSON.stringify({id_token:{value:'A1B2C3D4',type:'ISO14443'},authorization_type:'RFID',prevalidated:false,connectors:[Number(m[1])]})});
        }
      }
    }
  }
  if(msg.topic==='tick') {
    if(cache.valid&&!context.get('halted')) {
      // Copy planning so a queue overflow cannot commit half a configuration.
      const draft=JSON.parse(JSON.stringify(state));
      plan(draft,cache.config,now);
      Object.assign(state,draft);
      effects.push(...dispatch(state,cache.config,now,cache.broker));
    }
    // Invalid config stops new starts but does not abandon already running sessions.
    if(mode==='dry'||!cache.valid||context.get('halted'))effects.push(...dispatch(live,{control:{enabled:false,batch_size:1,max_inflight:1}},now,cache.broker));
    for(const j of Object.values(live.jobs))if(j.read_after&&now>=j.read_after&&!j.read_sent){j.read_sent=true;effects.push({kind:'openems',job_id:j.job_id,operation:'read_power_w',method:'GET',url:'http://openems-edge:8084/rest/channel/'+j.target_config.meter+'/ActivePower'});}
  }
  if(effects.some(e=>e.kind==='mqtt')&&!cache.broker)throw new Error('MQTT offline before handoff');
  // fsync + atomic rename BEFORE any native node receives a command.
  await io.saveState('live',live);if(mode==='dry')await io.saveState('dry',state);
  const events=[...live.events,...(mode==='dry'?state.events:[])].filter(e=>!eventsBefore.has(JSON.stringify(e)));
  await io.audit(events);
  if(msg.topic==='tick') {
    const report={timestamp:new Date(now).toISOString(),mode,enabled:cache.config.control.enabled,valid:cache.valid,halted:!!context.get('halted'),error:cache.error,revision:cache.config.revision,kpis:kpis(state),live_kpis:kpis(live),targets:live.observations};
    await io.status(report);
    node.status({fill:cache.valid?'green':'red',shape:'dot',text:`${mode} | ${report.live_kpis.confirmed_started} started | ${report.live_kpis.reservations} reserved`});
  }
  context.set('cache',cache);
  for(const e of effects) {
    if(e.kind==='mqtt')node.send([e,null,null]);
    else {
      const user=env.get(e.kind==='sap'?'SIM_SAP_USER':'SIM_OPENEMS_USER'),password=env.get(e.kind==='sap'?'SIM_SAP_PASSWORD':'SIM_OPENEMS_PASSWORD');
      if(!user||!password)throw new Error('Missing transport credential');
      e.headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64')};e.requestTimeout=35000;
      node.send([null,e,null]);
    }
  }
}).catch(e=>{context.set('halted',true);node.error('Simulation halted: '+e.message);}).finally(()=>{context.set('pendingCount',(context.get('pendingCount')||1)-1);node.done();});
context.set('tail',task);
return null;
