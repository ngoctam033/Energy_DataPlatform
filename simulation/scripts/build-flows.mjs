import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const engine=readFileSync(root+'node-red/engine.cjs','utf8').replace(/module\.exports=\{[^\n]+\};\s*$/,'');
const owner=engine+'\n'+readFileSync(root+'node-red/owner.js','utf8');
const csmsQuery=readFileSync(root+'config/csms_observation.graphql','utf8');
const tab='sim_orchestrator_v1',broker='fc8686af.48d178';
const n=(id,type,name,props,wires=[])=>({id:'sim_'+id,type,z:tab,name,...props,wires,x:250,y:100});
const flows=[{id:tab,type:'tab',label:'Simulation Orchestrator',disabled:false,info:'Owned by simulation/scripts/build-flows.mjs. Configuration: /simulation. Persistent journal: /data/simulation. Native transports only.'},
  n('tick','inject','Scheduler / dispatcher 1s',{props:[{p:'payload'},{p:'topic',vt:'str'}],repeat:'1',once:true,onceDelay:3,topic:'tick',payloadType:'date'},[['sim_owner']]),
  n('owner','function','State owner / durable intent',{func:owner,outputs:3,noerr:0,initialize:"context.set('halted',false);context.set('pendingCount',0);context.set('cache',null);context.set('tail',null);",finalize:'',libs:[]},[['sim_mqtt_out'],['sim_http'],['sim_debug']]),
  n('mqtt_in','mqtt in','EVerest periodic session state',{topic:'everest_api/+/var/session_info',qos:'0',datatype:'auto',broker,nl:false,rap:true,rh:0},[['sim_owner']]),
  n('mqtt_connection','mqtt in','EVerest OCPP connection',{topic:'everest_api/ocpp/var/connection_status',qos:'0',datatype:'auto',broker,nl:false,rap:true,rh:0},[['sim_owner']]),
  n('mqtt_out','mqtt out','EVerest native command (no retained/offline queue)',{topic:'',qos:'0',retain:'false',broker},[]),
  n('broker_status','status','MQTT connection',{scope:['sim_mqtt_out']},[['sim_owner']]),
  n('http','http request','Native SAP / OpenEMS request',{method:'use',ret:'obj',paytoqs:'ignore',url:'',persist:false,authType:'',senderr:false},[['sim_strip_headers']]),
  n('strip_headers','function','Remove credentials before ledger',{func:'delete msg.headers; return msg;',outputs:1,noerr:0},[['sim_owner']]),
  n('poll','inject','Observe SAP every 5s',{props:[{p:'payload'}],repeat:'5',once:true,onceDelay:4,payloadType:'date'},[['sim_poll_request']]),
  n('csms_poll','inject','Observe actual CSMS SoC every 15s',{props:[{p:'payload'}],repeat:'15',once:true,onceDelay:7,payloadType:'date'},[['sim_csms_request']]),
  n('csms_request','function','Read transaction meters through GraphQL',{func:`msg.kind='csms_poll';msg.method='POST';msg.url='http://graphql-engine:8080/v1/graphql';msg.headers={'Content-Type':'application/json'};if(env.get('HASURA_ADMIN_SECRET'))msg.headers['x-hasura-admin-secret']=env.get('HASURA_ADMIN_SECRET');msg.payload={query:${JSON.stringify(csmsQuery)},variables:{since:new Date(Date.now()-10800000).toISOString()}};msg.requestTimeout=10000;return msg;`,outputs:1,noerr:0},[['sim_http']]),
  n('poll_request','function','SAP read-only snapshot',{func:"msg.kind='sap_poll';msg.method='POST';msg.url='http://sap-charging-simulator:8080/ui/0.0.1/listChargingStations';msg.payload={};msg.headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(env.get('SIM_SAP_USER')+':'+env.get('SIM_SAP_PASSWORD')).toString('base64')};msg.requestTimeout=4000;return msg;",outputs:1,noerr:0},[['sim_http']]),
  n('catch','catch','Transport errors',{scope:['sim_http','sim_poll_request'],uncaught:false},[['sim_transport_error']]),
  n('transport_error','function','Timeout is uncertain, never replay',{func:"delete msg.headers;msg.statusCode=0;msg.payload={};return msg;",outputs:1,noerr:0},[['sim_owner']]),
  n('debug','debug','Orchestrator diagnostics',{active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg'},[])
];
flows.forEach((x,i)=>{if(x.type!=='tab'){x.x=180+(i%3)*330;x.y=100+Math.floor(i/3)*120;}});
writeFileSync(root+'node-red/flows.json',JSON.stringify(flows,null,2)+'\n');
console.log(`Built ${flows.length} nodes; shared broker ${broker} preserved.`);
