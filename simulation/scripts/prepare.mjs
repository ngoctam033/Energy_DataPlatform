import {execFileSync} from 'node:child_process';
import {mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)), rt=root+'.runtime/';
mkdirSync(rt,{recursive:true,mode:0o700});
const docker=(...args)=>execFileSync('docker',args,{stdio:'inherit'});
for(const [src,dst] of [['/data','node-red'],['/config','vendor-config']]) {
  if(!existsSync(rt+dst)) docker('compose','cp',`everest-nodered:${src}`,rt+dst);
}
if(!existsSync(rt+'node-red/settings.base.js')) copyFileSync(rt+'node-red/settings.js',rt+'node-red/settings.base.js');
copyFileSync(root+'node-red/settings.cjs',rt+'node-red/settings.js');
if(!existsSync(rt+'runtime.env')) {
  writeFileSync(rt+'runtime.env',`SIM_SAP_USER=simulation\nSIM_SAP_PASSWORD=${randomBytes(24).toString('hex')}\nSIM_OPENEMS_USER=admin\nSIM_OPENEMS_PASSWORD=admin\n`,{mode:0o600});
}
const env=Object.fromEntries(readFileSync(rt+'runtime.env','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const cfg=JSON.parse(readFileSync(root+'sap/config.template.json','utf8'));
cfg.uiServer.authentication.password=env.SIM_SAP_PASSWORD;
writeFileSync(rt+'sap.json',JSON.stringify(cfg,null,2)+'\n',{mode:0o600});
console.log('Prepared persistent Node-RED working copy and local credentials. No containers restarted.');
