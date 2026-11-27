// Read one native periodic EVerest sample through the existing MQTT container.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const evse=Number(process.argv[2]||1);if(![1,2].includes(evse))throw new Error('EVSE must be 1 or 2');
const topic=`everest_api/evse_manager_${evse}/var/session_info`;
const raw=execFileSync('docker',['compose','exec','-T','mqtt-server','mosquitto_sub','-C','1','-W','8','-t',topic],{encoding:'utf8',timeout:12000}).trim();
const sample=JSON.parse(raw),evidence={captured_at:new Date().toISOString(),evse,topic,sample};
writeFileSync(root+`.runtime/everest-status-${evse}.json`,JSON.stringify(evidence,null,2),{mode:0o600});
console.log(JSON.stringify(evidence,null,2));
