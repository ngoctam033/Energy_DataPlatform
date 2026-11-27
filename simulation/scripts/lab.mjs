import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const env=Object.fromEntries(readFileSync(root+'.runtime/runtime.env','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
export async function sap(procedure,payload={}) {
  const r=await fetch(`http://127.0.0.1:8188/ui/0.0.1/${procedure}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(env.SIM_SAP_USER+':'+env.SIM_SAP_PASSWORD).toString('base64')},body:JSON.stringify(payload),signal:AbortSignal.timeout(40000)});
  const body=await r.json();if(!r.ok)throw new Error(JSON.stringify(body));return body;
}
export async function graphql(query,variables={}) {
  const headers={'Content-Type':'application/json'};
  if(process.env.HASURA_ADMIN_SECRET)headers['x-hasura-admin-secret']=process.env.HASURA_ADMIN_SECRET;
  const r=await fetch('http://127.0.0.1:8090/v1/graphql',{method:'POST',headers,body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});
  const b=await r.json();if(!r.ok||b.errors)throw new Error(JSON.stringify(b));return b.data;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const action=process.argv[2];
  if(action==='inventory') {
    const r=await sap('listChargingStations');
    writeFileSync(root+'.runtime/sap-observed.json',JSON.stringify(r,null,2),{mode:0o600});
    const counts={};for(const s of r.chargingStations||[]){const c=s.connectors.find(c=>c.connectorId===1)?.connectorStatus;const key=c?.status+':'+!!c?.transactionStarted;counts[key]=(counts[key]||0)+1;}
    console.log(JSON.stringify({count:r.chargingStations?.length,connected:r.chargingStations?.filter(s=>s.wsState===1).length,registered:r.chargingStations?.filter(s=>s.bootNotificationResponse?.status==='Accepted').length,counts},null,2));
  } else if(action==='drain') {
    const ctl=JSON.parse(readFileSync(root+'config/control.json'));if(ctl.enabled)throw new Error('Pause first');
    const ledger=JSON.parse(readFileSync(root+'.runtime/node-red/simulation/live.json'));
    const snapshot=await sap('listChargingStations');
    for(const s of snapshot.chargingStations) {
      const con=s.connectors.find(c=>c.connectorId===1)?.connectorStatus;
      const job=Object.values(ledger.jobs).find(j=>j.target_config?.station_id===s.stationInfo.chargingStationId&&j.dispatch_at&&Math.abs(Date.parse(con?.transactionStart)-j.dispatch_at)<180000);
      if(!con?.transactionStarted||!job)continue;
      console.log('Drain owned transaction',s.stationInfo.chargingStationId,con.transactionId);
      if(process.argv.includes('--apply'))try{console.log(await sap('stopTransaction',{hashIds:[s.stationInfo.hashId],transactionId:con.transactionId,reason:'Local'}));}catch(e){console.error(e.message);}
    }
  } else if(action==='refresh-profiles') {
    if(JSON.parse(readFileSync(root+'config/control.json')).enabled)throw new Error('Pause first');
    const list=(await sap('listChargingStations')).chargingStations;
    if(list.some(s=>s.connectors.some(c=>c.connectorStatus.transactionStarted||c.connectorStatus.transactionPending)))throw new Error('Drain native transactions first');
    const customer=JSON.parse(readFileSync(root+'config/customer_profiles.json'));
    const weights={FLEET:25,TAXI:15,COMMUTER:25,PRIVATE:20,LONG_TRIP:10,OVERNIGHT:5};
    const profiles=Object.entries(customer.profiles).map(([id,p])=>({id,weight:weights[id],batteryCapacityWh:p.battery_wh,maxPowerW:['COMMUTER','OVERNIGHT'].includes(id)?22000:120000,initialSocPercentMin:p.initial_soc[0],initialSocPercentMax:p.initial_soc[1],chargingCurve:[{socPercent:0,powerFraction:1},{socPercent:75,powerFraction:1},{socPercent:100,powerFraction:0.05}]}));
    writeFileSync(root+'config/vehicle_profiles.json',JSON.stringify({profiles},null,2)+'\n');
    // Native watched templates reload profiles for subsequent sessions. No container restart.
    // Remove shared site seed: native fallback hashes each unique station identity.
    for(const file of readdirSync(root+'sap/templates').filter(f=>f.endsWith('.json'))){const path=root+'sap/templates/'+file,t=JSON.parse(readFileSync(path));delete t.randomSeed;t.firmwareVersion='1.0.1';writeFileSync(path,JSON.stringify(t,null,2)+'\n');}
    console.log('Six native battery profiles written and idle templates refreshed.');
  } else if(action==='schema') {
    for(const name of ['ChargingStations','Authorizations_insert_input','Locations_insert_input','MeterValues','Transactions'])console.log(name,JSON.stringify(await graphql('query($name:String!){__type(name:$name){fields{name} inputFields{name type{kind name ofType{kind name}}}}}',{name})));
  } else if(action==='setup-sites') {
    for(let i=1;i<=4;i++) {
      const name=`Simulation Site ${i}`;
      const data=await graphql('query($name:String!){Locations(where:{name:{_eq:$name}}){id}}',{name});
      if(data.Locations.length>1)throw new Error('Ambiguous site name');
      let id=data.Locations[0]?.id;
      if(!id){const d=await graphql('mutation($object:Locations_insert_input!){insert_Locations_one(object:$object){id}}',{object:{name,address:'Synthetic research site',city:'Simulation',country:'VN',coordinates:{type:'Point',coordinates:[106.7+i*0.01,10.77]},timeZone:'Asia/Ho_Chi_Minh',publishUpstream:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}});id=d.insert_Locations_one.id;}
      const result=await graphql('mutation($pattern:String!,$id:Int!){update_ChargingStations(where:{ocppConnectionName:{_like:$pattern}},_set:{locationId:$id}){affected_rows}}',{pattern:`SIM-S${i}-%`,id});
      console.log(name,result);
    }
  } else if(action==='evidence') {
    const result=await graphql('query{ChargingStations_aggregate(where:{ocppConnectionName:{_like:"SIM-S%"}}){aggregate{count}} Locations(where:{name:{_like:"Simulation Site %"}}){id name ChargingStations_aggregate{aggregate{count}}} Transactions(where:{ChargingStation:{ocppConnectionName:{_like:"SIM-S%"}}},order_by:{createdAt:desc},limit:220){transactionId isActive startTime endTime totalKwh ChargingStation{ocppConnectionName} MeterValues_aggregate{aggregate{count}} MeterValues(order_by:{timestamp:desc},limit:2){timestamp sampledValue}}}');
    writeFileSync(root+'.runtime/citrine-evidence.json',JSON.stringify(result,null,2),{mode:0o600});
    console.log(JSON.stringify({stations:result.ChargingStations_aggregate,sites:result.Locations,transactions:result.Transactions.length,finished:result.Transactions.filter(t=>!t.isActive&&t.endTime).length,sample:result.Transactions.slice(0,2)},null,2));
  } else if(action==='everest-evidence') {
    const r=await graphql('query{Transactions(where:{ChargingStation:{ocppConnectionName:{_eq:"cp001"}}},order_by:{createdAt:desc},limit:5){transactionId isActive startTime endTime evseId totalKwh Evse{evseId} MeterValues_aggregate{aggregate{count}}}}');
    writeFileSync(root+'.runtime/everest-evidence.json',JSON.stringify(r,null,2));console.log(r);
  } else if(action==='setup-auth') {
    for(const idToken of ['SIM-VALID-TAG','A1B2C3D4']) {
      const data=await graphql('query($token:citext!){Authorizations(where:{idToken:{_eq:$token}}){id status concurrentTransaction}}',{token:idToken});
      if(data.Authorizations.length)console.log(data);
      else console.log(await graphql('mutation($object:Authorizations_insert_input!){insert_Authorizations_one(object:$object){id status concurrentTransaction}}',{object:{idToken,idTokenType:'ISO14443',status:'Accepted',concurrentTransaction:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}));
    }
  } else if(action==='repair-openems-directories') {
    // Undo only files created by the initial, inapplicable FileInstall approach.
    for(const [file,dest] of [
      ['Simulator.Datasource.Single.Channel~simulateConsumption.config','Simulator/Datasource/Single/Channel~simulateConsumption.config'],
      ['Simulator.GridMeter.Acting~meterSimulation.config','Simulator/GridMeter/Acting~meterSimulation.config'],
      ['Controller.Api.Rest.ReadWrite~ctrlSimulationRest.config','Controller/Api/Rest/ReadWrite~ctrlSimulationRest.config']
    ]) {
      const target='/var/opt/openems/config/'+dest;
      execFileSync('docker',['compose','exec','-T','openems-edge','rm','-f',target]);
    }
    execFileSync('docker',['compose','exec','-T','openems-edge','chown','-R','abc:abc','/var/opt/openems/config/Simulator','/var/opt/openems/config/Controller/Api/Rest']);
  } else if(action==='sap-start'||action==='sap-stop') {
    const name=process.argv[3];if(!/^SIM-S[1-4]-/.test(name))throw new Error('Explicit simulation station ID required');
    const r=await sap('listChargingStations'),station=r.chargingStations.find(s=>s.stationInfo.chargingStationId===name);
    if(!station)throw new Error('Unknown station');
    const con=station.connectors.find(c=>c.connectorId===1).connectorStatus;
    console.log(JSON.stringify(await sap(action==='sap-start'?'startTransaction':'stopTransaction',action==='sap-start'?{hashIds:[station.stationInfo.hashId],connectorId:1,idTag:'SIM-VALID-TAG'}:{hashIds:[station.stationInfo.hashId],transactionId:con.transactionId,reason:'Local'}),null,2));
  } else throw new Error('Use inventory, setup-openems, sap-start <station> or sap-stop <station>');
}
