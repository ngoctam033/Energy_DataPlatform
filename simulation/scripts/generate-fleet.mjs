import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function save(path, data) {
  mkdirSync(root + path.slice(0, path.lastIndexOf('/')), {recursive:true});
  writeFileSync(root + path, JSON.stringify(data, null, 2) + '\n');
}
const groups = [['ac7',7000,10,'AC',1],['ac22',22000,10,'AC',3],['dc60',60000,20,'DC',0],['dc120',120000,10,'DC',0]];
const templates = [], targets = {};
const profiles = {profiles:[
  {id:'city-40',weight:3,batteryCapacityWh:40000,maxPowerW:60000,initialSocPercentMin:15,initialSocPercentMax:55,chargingCurve:[{socPercent:0,powerFraction:1},{socPercent:80,powerFraction:1},{socPercent:100,powerFraction:0.05}]},
  {id:'long-range-77',weight:2,batteryCapacityWh:77000,maxPowerW:120000,initialSocPercentMin:10,initialSocPercentMax:60,chargingCurve:[{socPercent:0,powerFraction:1},{socPercent:70,powerFraction:1},{socPercent:100,powerFraction:0.05}]}
]};
save('config/vehicle_profiles.json', profiles);
for (let site=1;site<=4;site++) for (const [kind,power,count,currentOutType,numberOfPhases] of groups) {
  const baseName = `SIM-S${site}-${kind.toUpperCase()}`;
  const file = `${baseName}.station-template.json`;
  templates.push({file,numberOfStations:count});
  save(`sap/templates/${file}`, {
    $schemaVersion:2,baseName,chargePointVendor:'Energy Lab',chargePointModel:kind,
    power,powerUnit:'W',currentOutType,numberOfPhases,voltageOut:currentOutType==='AC'?230:400,
    powerSharedByConnectors:false,numberOfConnectors:1,randomConnectors:false,
    ocppVersion:'1.6',ocppStrictCompliance:true,autoRegister:false,
    coherentMeterValues:true,evProfilesFile:'simulation-vehicles.json',randomSeed:42+site,
    postTransactionDelay:10,beginEndMeterValues:true,transactionDataMeterValues:true,
    meteringPerTransaction:false,persistentConfiguration:false,
    AutomaticTransactionGenerator:{enable:false,minDuration:60,maxDuration:180,minDelayBetweenTwoTransactions:10,maxDelayBetweenTwoTransactions:30,probabilityOfStart:0,stopAfterHours:24},
    Configuration:{configurationKey:[
      {key:'MeterValuesSampledData',readonly:false,value:'Energy.Active.Import.Register,Power.Active.Import,Current.Import,Voltage,SoC'},
      {key:'MeterValueSampleInterval',readonly:false,value:'15'},
      {key:'HeartbeatInterval',readonly:false,value:'60'},
      {key:'WebSocketPingInterval',readonly:false,value:'30'},
      {key:'SupportedFeatureProfiles',readonly:true,value:'Core,SmartCharging,RemoteTrigger'},
      {key:'LocalAuthListEnabled',readonly:false,value:'false'}
    ]},
    Connectors:{'0':{},'1':{bootStatus:'Available',maximumPower:power,MeterValues:[
      {measurand:'Energy.Active.Import.Register',unit:'Wh',context:'Sample.Periodic'},
      {measurand:'Power.Active.Import',unit:'W',context:'Sample.Periodic'},
      {measurand:'Current.Import',unit:'A',context:'Sample.Periodic'},
      {measurand:'Voltage',unit:'V',context:'Sample.Periodic'},
      {measurand:'SoC',unit:'Percent',location:'EV',context:'Sample.Periodic'}
    ]}}
  });
  // SAP's template indices start at 1 (Bootstrap's station loop).
  for(let i=1;i<=count;i++) {
    const station_id = `${baseName}-0${String(i).padStart(4,'0')}`;
    targets[station_id.toLowerCase()]={type:'sap_evse',station_id,site:`site-${site}`,connector_id:1,charging_type:currentOutType,max_power_w:power};
  }
}
for(let i=1;i<=2;i++) targets[`everest-${i}`]={type:'everest_evse',station_id:'cp001',site:'bench',connector_id:i,evse_id:i,charging_type:'AC',max_power_w:11040,mqtt_topic_base:`everest_external/nodered/${i}/carsim/cmd`};
targets['factory-load']={type:'openems_channel',site:'factory',component:'simulateConsumption',meter:'meterSimulation',value_min_w:0,value_max_w:200000};
save('config/charging_stations.json',{schema_version:1,targets});
save('sap/config.template.json',{
  supervisionUrls:['ws://citrine:8081'],supervisionUrlDistribution:'charging-station-affinity',
  log:{file:'/dev/stdout',errorFile:'/dev/stderr',console:false,rotate:false},
  worker:{processType:'workerSet',elementsPerWorker:50,poolMinSize:1,poolMaxSize:4},
  uiServer:{enabled:true,type:'http',options:{host:'0.0.0.0',port:8080},
    accessPolicy:{allowedHosts:['localhost','127.0.0.1','sap-charging-simulator'],allowedOrigins:[],allowLoopbackProxy:false,requireTlsForNonLoopback:false,trustedProxies:[]},
    authentication:{enabled:true,type:'basic-auth',username:'simulation',password:'REPLACED_BY_PREPARE'}},
  stationTemplateUrls:templates
});
const counts=[8,4,3,5,100,35,60,120,85,45,30,35,55,40,35,45,80,150,180,120,75,45,25,15];
const durations=[[60,180],[60,180],[60,180],[45,120],[30,60],[30,60],[25,60],[30,180],[30,180],[30,120],[25,60],[25,60],[30,60],[30,60],[30,60],[30,60],[30,60],[30,90],[30,90],[30,90],[45,120],[60,180],[60,180],[60,180]];
const times=counts.map((_,i)=>`${String(i).padStart(2,'0')}:00`);
save('scenarios/daily/normal_working_day.json',{
  schema_version:1,id:'s01-normal-working-day',name:'S01 - 1395 arrivals, four sites',enabled:false,kind:'charging_demand',
  schedule:{timezone:'Asia/Ho_Chi_Minh',type:'daily',times,catch_up_seconds:120},
  parameters:{vehicle_count_by_time:Object.fromEntries(times.map((t,i)=>[t,counts[i]])),
    duration_by_time:Object.fromEntries(times.map((t,i)=>[t,{min:durations[i][0]*60,max:durations[i][1]*60}])),
    arrival_window_seconds:3600,arrival_distribution:'uniform',seed:42,
    target_pool:Object.keys(targets).filter(k=>targets[k].type==='sap_evse'),
    max_parallel:200,max_wait_seconds:1800,queue_policy:'fifo',on_full:'queue',
    behaviors:{NORMAL_CHARGING:70,EARLY_STOP:15,TIME_LIMIT_REACHED:8,CANCEL_BEFORE_START:4,AUTHORIZATION_FAILED:2,CHARGING_FAULT:1},
    site_weights:{'site-1':25,'site-2':25,'site-3':25,'site-4':25},
    charging_type_weights:{AC:40,DC:60}}
});
save('scenarios/energy/peak_load.json',{
  schema_version:1,id:'factory-daily-load',name:'Factory consumption profile',enabled:false,kind:'power_profile',
  schedule:{timezone:'Asia/Ho_Chi_Minh',type:'daily',times:['08:00','10:00','12:00','18:00','22:00'],catch_up_seconds:120},
  parameters:{target:'factory-load',profile_w:{'08:00':50000,'10:00':120000,'12:00':80000,'18:00':150000,'22:00':30000}}
});
save('scenarios/index.json',{schema_version:1,files:['daily/normal_working_day.json','energy/peak_load.json']});
save('config/control.json',{schema_version:1,enabled:false,dry_run:true,max_queue:10000,batch_size:10,retention_days:7});
console.log('Generated 200 SAP EVSEs across 4 sites, 2 separate EVerest bench targets, S01 and power profile.');
