'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=process.env.SIM_CONFIG_ROOT||path.resolve(__dirname,'..');
const stateRoot=process.env.SIM_STATE_ROOT||path.join(root,'.runtime/state');
async function read(relative,max=256*1024) {
  if(typeof relative!=='string'||!relative.match(/^[a-zA-Z0-9_./-]+\.json$/)||relative.split('/').includes('..')||path.isAbsolute(relative))throw new Error('Unsafe config path');
  const real=await fs.realpath(path.join(root,relative)),base=await fs.realpath(root);
  if(!real.startsWith(base+path.sep))throw new Error('Config symlink escapes root');
  const stat=await fs.stat(real);if(stat.size>max)throw new Error('Config file too large');
  return JSON.parse(await fs.readFile(real,'utf8'));
}
async function loadConfig() {
  const [control,targetRegistry,registry]=await Promise.all([read('config/control.json'),read('config/charging_stations.json'),read('scenarios/index.json')]);
  if(registry.schema_version!==1||!Array.isArray(registry.files)||registry.files.length>64||new Set(registry.files).size!==registry.files.length)throw new Error('Invalid scenario registry');
  const scenarios=await Promise.all(registry.files.map(f=>read('scenarios/'+f)));
  const config={control,targetRegistry,registry,scenarios};
  config.revision=crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');return config;
}
async function atomic(file,data) {
  await fs.mkdir(stateRoot,{recursive:true,mode:0o700});
  const tmp=file+'.tmp';const handle=await fs.open(tmp,'w',0o600);
  try{await handle.writeFile(JSON.stringify(data));await handle.sync();}finally{await handle.close();}
  await fs.rename(tmp,file);const dir=await fs.open(stateRoot,'r');try{await dir.sync();}finally{await dir.close();}
}
function filename(mode) {if(!['live','dry'].includes(mode))throw new Error('Invalid namespace');return path.join(stateRoot,mode+'.json');}
async function loadState(mode) {try{return JSON.parse(await fs.readFile(filename(mode),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function saveState(mode,state){await atomic(filename(mode),state);}
async function audit(events) {
  if(!events.length)return;await fs.mkdir(stateRoot,{recursive:true,mode:0o700});
  const day=new Date().toISOString().slice(0,10);
  await fs.appendFile(path.join(stateRoot,`events-${day}.jsonl`),events.map(e=>JSON.stringify(e)).join('\n')+'\n',{mode:0o600});
}
async function status(data) {await atomic(path.join(stateRoot,'status.json'),data);}
module.exports={loadConfig,loadState,saveState,audit,status,read};
