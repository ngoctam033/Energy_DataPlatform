import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(root+p,'utf8'));
const save=(p,d)=>{writeFileSync(root+p+'.tmp',JSON.stringify(d,null,2)+'\n');renameSync(root+p+'.tmp',root+p);};
const action=process.argv[2];
if(action==='status') {
  const s=read('.runtime/node-red/simulation/status.json');
  console.log(JSON.stringify({...s,targets:{observed:Object.keys(s.targets).length,online:Object.values(s.targets).filter(t=>t.online).length}},null,2));
  if(process.argv.includes('--detail')){const state=read('.runtime/node-red/simulation/live.json');console.log(JSON.stringify(Object.values(state.jobs).filter(j=>['unknown'].includes(j.status)),null,2));}
} else if(action==='pause') {
  const c=read('config/control.json');c.enabled=false;save('config/control.json',c);console.log('Paused new dispatch; active sessions continue to their planned end.');
} else if(action==='smoke') {
  const count=Number(process.argv[3]||100);if(!Number.isInteger(count)||count<1||count>200)throw new Error('Count 1..200');
  const mode=process.argv[4]||'dry';if(!['dry','live','behaviors'].includes(mode))throw new Error('Mode dry/live/behaviors');
  const s=read('scenarios/daily/normal_working_day.json'),slot=Math.ceil((Date.now()+30000)/60000)*60000;
  const time=new Date(slot+7*3600000).toISOString().slice(11,16);
  s.id='smoke-'+mode+'-'+slot;s.name='Bounded commissioning run';s.enabled=true;s.schedule.times=[time];
  s.parameters.vehicle_count_by_time={[time]:count};s.parameters.duration_by_time={[time]:{min:60,max:75}};s.parameters.arrival_window_seconds=Math.max(30,count*2);s.parameters.max_wait_seconds=900;
  if(s.parameters.customer_weights_by_time)s.parameters.customer_weights_by_time={[time]:s.parameters.customer_weights_by_time[time.slice(0,2)+':00']};
  if(mode!=='behaviors')s.parameters.behaviors={NORMAL_CHARGING:100};
  save('scenarios/smoke.json',s);
  const registry=read('scenarios/index.json');if(!registry.files.includes('smoke.json'))registry.files.push('smoke.json');save('scenarios/index.json',registry);
  registry.files=registry.files.filter(f=>f!=='everest-smoke.json');save('scenarios/index.json',registry);
  const ctl=read('config/control.json');ctl.enabled=true;ctl.dry_run=mode==='dry';save('config/control.json',ctl);
  console.log(JSON.stringify({id:s.id,count,mode,scheduled_at:new Date(slot).toISOString(),local_time:time}));
} else if(action==='commissioning-complete') {
  const registry=read('scenarios/index.json');registry.files=registry.files.filter(f=>!['smoke.json','everest-smoke.json'].includes(f));save('scenarios/index.json',registry);
  const ctl=read('config/control.json');ctl.enabled=false;ctl.dry_run=true;save('config/control.json',ctl);console.log('Commissioning scenarios removed; engine paused in dry-run.');
} else if(action==='native') {
  const at=Math.ceil((Date.now()+30000)/60000)*60000,time=new Date(at+7*3600000).toISOString().slice(11,16);
  save('scenarios/everest-smoke.json',{schema_version:1,id:'native-smoke-'+at,name:'EVerest AC and OpenEMS commissioning',enabled:true,kind:'native_dispatch',schedule:{type:'daily',timezone:'Asia/Ho_Chi_Minh',times:[time],catch_up_seconds:120},parameters:{actions:[{id:'ac',target:'everest-1',transport:'mqtt',command:'execute_charging_session',payload:'sleep 1;iec_wait_pwr_ready;sleep 1;draw_power_regulated 16,3;sleep 30;unplug',offset_seconds:0},{id:'power',target:'factory-load',transport:'http',command:'set_power_w',payload:{value:120000},offset_seconds:0}]}});
  const registry=read('scenarios/index.json');if(!registry.files.includes('everest-smoke.json'))registry.files.push('everest-smoke.json');save('scenarios/index.json',registry);
  const ctl=read('config/control.json');ctl.enabled=true;ctl.dry_run=false;save('config/control.json',ctl);console.log('Native smoke at '+new Date(at).toISOString());
} else if(action==='daily') {
  const daily=process.argv[3]||'s01';if(!/^s0[1-6]$/.test(daily))throw new Error('Daily profile s01..s06');
  const files=read('scenarios/index.json').files;
  for(const file of files.filter(f=>f.startsWith('daily/')||f==='energy/peak_load.json')){const s=read('scenarios/'+file);s.enabled=s.kind==='power_profile'||s.id.startsWith(daily+'-');save('scenarios/'+file,s);}
  const registry=read('scenarios/index.json');registry.files=registry.files.filter(f=>!['smoke.json','everest-smoke.json'].includes(f));save('scenarios/index.json',registry);
  const ctl=read('config/control.json');ctl.enabled=true;ctl.dry_run=false;save('config/control.json',ctl);console.log(daily+' and factory daily profile enabled.');
} else throw new Error('Use status, pause, smoke [count] [dry|live|behaviors], daily');
