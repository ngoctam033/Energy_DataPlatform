#!/usr/bin/env node

import {randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const simulationRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const projectRoot=resolve(simulationRoot,'..');
const defaults={
  config:resolve(simulationRoot,'config/openems/deployment.json'),
  envFile:resolve(simulationRoot,'.runtime/openems/deployment.env')
};

function usage(){
  console.log(`Usage: node simulation/scripts/openems.mjs <command> [options]

Commands:
  validate                  Validate the four-site deployment manifest
  prepare-secrets           Create ignored per-site passwords/API keys once
  render-backend-metadata   Render Metadata.File input for OpenEMS Backend
  plan                      Save a non-mutating API configuration plan
  apply                     Apply App Manager and Component Manager changes
  verify                    Verify that runtime matches the manifest

Options:
  --edge <site01|all>       Target one site or all sites (default: all)
  --config <path>           Manifest path
  --env-file <path>         Runtime secret file path`);
}

function parseArgs(argv){
  const out={command:argv[0],edge:'all',...defaults};
  for(let i=1;i<argv.length;i++){
    const value=argv[i+1];
    if(argv[i]==='--edge'&&value){out.edge=value;i++;continue;}
    if(argv[i]==='--config'&&value){out.config=resolve(value);i++;continue;}
    if(argv[i]==='--env-file'&&value){out.envFile=resolve(value);i++;continue;}
    throw new Error(`Unknown or incomplete option: ${argv[i]}`);
  }
  return out;
}

function readJson(path){return JSON.parse(readFileSync(path,'utf8'));}
function ensureParent(path){mkdirSync(dirname(path),{recursive:true});}
function writeJson(path,value,mode=0o644){ensureParent(path);writeFileSync(path,`${JSON.stringify(value,null,2)}\n`,{mode});chmodSync(path,mode);}
function timestamp(){return new Date().toISOString().replaceAll(':','-').replaceAll('.','-');}
function reportPath(command,edge){return resolve(simulationRoot,`reports/openems-${command}-${edge}-${timestamp()}.json`);}
function runtimePath(...parts){return resolve(simulationRoot,'.runtime/openems',...parts);}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function asProperties(properties){return Object.entries(properties).map(([name,value])=>({name,value}));}
function deepEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function envName(name){return /API.?KEY|PASSWORD|SECRET|TOKEN/i.test(name);}
function redact(value,key=''){
  if(envName(key))return '<redacted>';
  if(Array.isArray(value))return value.map(item=>redact(item,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v,k)]));
  return value;
}

function readEnv(path,required=true){
  let text;
  try{text=readFileSync(path,'utf8');}catch(error){if(!required)return {};throw new Error(`Missing runtime secret file: ${path}. Run prepare-secrets first.`);}
  const values={};
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const pos=line.indexOf('=');
    if(pos<1)throw new Error(`Invalid env line in ${path}: ${raw}`);
    values[line.slice(0,pos)]=line.slice(pos+1);
  }
  return {...values,...process.env};
}

function validateManifest(manifest){
  const errors=[];
  if(manifest.schemaVersion!==1)errors.push('schemaVersion must be 1');
  if(!manifest.backend?.edgeWebsocketUri)errors.push('backend.edgeWebsocketUri is required');
  if(!Array.isArray(manifest.sites)||manifest.sites.length!==4)errors.push('exactly four sites are required');
  const ids=new Set();
  for(const site of manifest.sites||[]){
    if(!site.edgeId||ids.has(site.edgeId))errors.push(`invalid or duplicate edgeId: ${site.edgeId}`);
    ids.add(site.edgeId);
    const count=Object.values(site.fleet||{}).reduce((sum,value)=>sum+Number(value||0),0);
    if(count!==50)errors.push(`${site.edgeId} must declare exactly 50 EVSEs; got ${count}`);
    if(!site.websocketUrl||!site.passwordEnv||!site.apiKeyEnv)errors.push(`${site.edgeId} is missing API connection fields`);
    if(!Number.isFinite(site.gridLimitW)||site.gridLimitW<=0)errors.push(`${site.edgeId}.gridLimitW must be positive`);
  }
  for(const component of manifest.components||[]){
    if(!component.factoryPid||!(component.componentId||component.properties?.id))errors.push('every component needs factoryPid and componentId or properties.id');
  }
  if(errors.length)throw new Error(`Invalid OpenEMS deployment manifest:\n- ${errors.join('\n- ')}`);
  return {deploymentId:manifest.deploymentId,sites:manifest.sites.length,evses:manifest.sites.length*50};
}

function selectSites(manifest,target){
  if(target==='all')return manifest.sites;
  const site=manifest.sites.find(candidate=>candidate.edgeId===target);
  if(!site)throw new Error(`Unknown edge '${target}'`);
  return [site];
}

function resolveTemplate(value,manifest,site,secrets){
  if(value==='$timezone')return manifest.timezone;
  if(value==='$site.name')return site.name;
  if(value==='$backend.edgeWebsocketUri')return manifest.backend.edgeWebsocketUri;
  if(value==='$site.apiKey'){
    const secret=secrets[site.apiKeyEnv];
    if(!secret)throw new Error(`Missing ${site.apiKeyEnv}`);
    return secret;
  }
  if(Array.isArray(value))return value.map(item=>resolveTemplate(item,manifest,site,secrets));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,resolveTemplate(item,manifest,site,secrets)]));
  return value;
}

function desiredComponents(manifest,site,secrets){
  return manifest.components.map(component=>({
    factoryPid:component.factoryPid,
    componentId:component.componentId||component.properties.id,
    updateOnly:Boolean(component.updateOnly),
    properties:resolveTemplate(component.properties,manifest,site,secrets)
  }));
}

function normalizeComponents(response){
  const value=response?.components||response?.config?.components||response;
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Unexpected getEdgeConfig response');
  return value;
}

function currentProperties(component){
  return component?.properties||component?.config||component||{};
}

function changedProperties(current,desired){
  const actual=currentProperties(current);
  return Object.fromEntries(Object.entries(desired).filter(([key,value])=>{
    if(envName(key)&&actual[key]==='xxx')return false;
    return !deepEqual(actual[key],value);
  }));
}

class EdgeRpc{
  constructor(url,password){this.url=url;this.password=password;this.pending=new Map();}
  async connect(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=()=>reject(new Error(`Cannot connect to ${this.url}`));});
    this.ws.onmessage=event=>{
      const message=JSON.parse(event.data);const pending=this.pending.get(message.id);if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(message.id);
      message.error?pending.reject(new Error(JSON.stringify(message.error))):pending.resolve(message.result);
    };
    await this.call('authenticateWithPassword',{password:this.password});
  }
  call(method,params={}){
    return new Promise((resolve,reject)=>{
      const id=randomUUID();
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`OpenEMS RPC timeout: ${method}`));},20000);
      this.pending.set(id,{resolve,reject,timer});
      this.ws.send(JSON.stringify({jsonrpc:'2.0',id,method,params}));
    });
  }
  async edge(method,params={}){
    const result=await this.call('edgeRpc',{edgeId:'0',payload:{jsonrpc:'2.0',id:randomUUID(),method,params}});
    if(result?.payload?.error)throw new Error(JSON.stringify(result.payload.error));
    return result?.payload?.result??result;
  }
  close(){this.ws?.close();}
}

async function inspectSite(manifest,site,secrets){
  const password=secrets[site.passwordEnv]||'admin';
  const rpc=new EdgeRpc(site.websocketUrl,password);
  await rpc.connect();
  try{
    const config=await rpc.edge('getEdgeConfig');
    const apps=[];
    for(const app of manifest.apps||[]){
      try{
        const response=await rpc.edge('getAppInstances',{appId:app.appId});
        apps.push({definition:app,instances:response?.instances||[],apiAvailable:true});
      }catch(error){
        if(!error.message.includes('Endpoint with method'))throw error;
        apps.push({definition:app,instances:[],apiAvailable:false});
      }
    }
    return {rpc,config,components:normalizeComponents(config),apps};
  }catch(error){rpc.close();throw error;}
}

function buildPlan(manifest,site,secrets,inspection){
  const actions=[];
  for(const app of inspection.apps){
    const controllerId=app.definition.properties?.CONTROLLER_ID;
    const instance=app.instances.find(item=>item.properties?.CONTROLLER_ID===controllerId);
    const componentExists=Boolean(inspection.components[controllerId]);
    if(instance)actions.push({kind:'app',action:'unchanged',appId:app.definition.appId,controllerId});
    else if(componentExists)actions.push({kind:'app',action:'adopt-existing-component',appId:app.definition.appId,controllerId,reason:'Component already exists; no duplicate App instance is created'});
    else if(app.apiAvailable)actions.push({kind:'app',action:'create',...app.definition,controllerId});
    else if(app.definition.componentFallback)actions.push({kind:'component',action:'create',factoryPid:app.definition.componentFallback.factoryPid,componentId:controllerId,properties:app.definition.componentFallback.properties,reason:'App Manager JSON-RPC is unavailable on this OpenEMS runtime; using the official Component Manager JSON-RPC'});
    else throw new Error(`${site.edgeId}: App Manager API unavailable and ${app.definition.appId} has no componentFallback`);
  }
  for(const desired of desiredComponents(manifest,site,secrets)){
    const id=desired.componentId;
    const current=inspection.components[id];
    if(!current&&desired.updateOnly)throw new Error(`${site.edgeId}: required update-only component '${id}' is missing`);
    if(!current){actions.push({kind:'component',action:'create',factoryPid:desired.factoryPid,componentId:id,properties:desired.properties});continue;}
    const changes=changedProperties(current,desired.properties);
    delete changes.id;
    actions.push(Object.keys(changes).length
      ?{kind:'component',action:'update',factoryPid:desired.factoryPid,componentId:id,properties:changes}
      :{kind:'component',action:'unchanged',factoryPid:desired.factoryPid,componentId:id});
  }
  return {edgeId:site.edgeId,websocketUrl:site.websocketUrl,actions};
}

async function applyPlan(rpc,plan){
  for(const action of plan.actions){
    if(action.action==='unchanged'||action.action==='adopt-existing-component')continue;
    if(action.kind==='app'&&action.action==='create'){
      await rpc.edge('addAppInstance',{appId:action.appId,key:null,alias:action.alias,properties:action.properties});
      continue;
    }
    if(action.kind==='component'&&action.action==='create'){
      await rpc.edge('createComponentConfig',{factoryPid:action.factoryPid,properties:asProperties(action.properties)});
      continue;
    }
    if(action.kind==='component'&&action.action==='update'){
      await rpc.edge('updateComponentConfig',{componentId:action.componentId,properties:asProperties(action.properties)});
    }
  }
}

async function planOrApply(command,manifest,sites,secrets){
  const report={command,deploymentId:manifest.deploymentId,createdAt:new Date().toISOString(),sites:[]};
  for(const site of sites){
    const before=await inspectSite(manifest,site,secrets);
    writeJson(runtimePath(site.edgeId,`before-${timestamp()}.json`),before.config,0o600);
    try{
      const plan=buildPlan(manifest,site,secrets,before);
      if(command==='apply')await applyPlan(before.rpc,plan);
      before.rpc.close();
      if(command==='apply'){
        let after;let remaining=[];
        for(let attempt=1;attempt<=10;attempt++){
          if(attempt>1)await sleep(500);
          after=await inspectSite(manifest,site,secrets);
          remaining=buildPlan(manifest,site,secrets,after).actions.filter(action=>!['unchanged','adopt-existing-component'].includes(action.action));
          if(!remaining.length)break;
          after.rpc.close();after=null;
        }
        if(after){writeJson(runtimePath(site.edgeId,`after-${timestamp()}.json`),after.config,0o600);after.rpc.close();}
        if(remaining.length)throw new Error(`${site.edgeId} still has ${remaining.length} pending change(s) after apply`);
      }
      report.sites.push(plan);
    }catch(error){before.rpc.close();throw error;}
  }
  const path=reportPath(command,sites.length===1?sites[0].edgeId:'all');
  writeJson(path,redact(report));
  console.log(`${command} report: ${path}`);
  return report;
}

function prepareSecrets(manifest,path){
  try{readFileSync(path);throw new Error(`Refusing to overwrite existing secret file: ${path}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  const lines=['# Generated by simulation/scripts/openems.mjs prepare-secrets'];
  for(const site of manifest.sites){
    lines.push(`${site.passwordEnv}=admin`);
    lines.push(`${site.apiKeyEnv}=${randomBytes(32).toString('hex')}`);
  }
  ensureParent(path);writeFileSync(path,`${lines.join('\n')}\n`,{mode:0o600});
  console.log(`Created runtime secrets: ${path}`);
}

function renderMetadata(manifest,secrets){
  const edges={};
  for(const site of manifest.sites){
    const apikey=secrets[site.apiKeyEnv];
    if(!apikey)throw new Error(`Missing ${site.apiKeyEnv}`);
    edges[site.edgeId]={comment:site.name,apikey,setuppassword:secrets[site.passwordEnv]||'admin'};
  }
  const path=resolve(projectRoot,manifest.backend.metadataRuntimePath);
  // Metadata.File runs as a container user and needs read access to this bind mount.
  // The source is ignored by Git; deployment.env remains owner-only (0600).
  writeJson(path,{edges},0o644);
  console.log(`Rendered Backend Metadata.File input: ${path}`);
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.command||args.command==='help'||args.command==='--help'){usage();return;}
  const manifest=readJson(args.config);
  const summary=validateManifest(manifest);
  if(args.command==='validate'){console.log(JSON.stringify(summary,null,2));return;}
  if(args.command==='prepare-secrets'){prepareSecrets(manifest,args.envFile);return;}
  const secrets=readEnv(args.envFile);
  if(args.command==='render-backend-metadata'){renderMetadata(manifest,secrets);return;}
  const sites=selectSites(manifest,args.edge);
  if(args.command==='plan'||args.command==='apply'){await planOrApply(args.command,manifest,sites,secrets);return;}
  if(args.command==='verify'){
    const report=await planOrApply('verify',manifest,sites,secrets);
    const pending=report.sites.flatMap(site=>site.actions.filter(action=>!['unchanged','adopt-existing-component'].includes(action.action)));
    if(pending.length)throw new Error(`Verification failed: ${pending.length} pending change(s)`);
    console.log(`Verified ${sites.length} OpenEMS Edge site(s)`);return;
  }
  throw new Error(`Unknown command: ${args.command}`);
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
