import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const proc=spawn('docker',['compose','exec','-T','mqtt-server','mosquitto_sub','-t','everest/#','-t','everest_external/#','-t','everest_api/#','-v','-W','6']);
let buffer='',raw='';const latest=new Map();
proc.stdout.on('data',data=>{raw+=data;buffer+=data;const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){const i=line.indexOf(' ');latest.set(line.slice(0,i),line.slice(i+1));}});
proc.on('close',()=>{writeFileSync(fileURLToPath(new URL('../.runtime/mqtt-observation.txt',import.meta.url)),raw,{mode:0o600});for(const [topic,value]of latest)console.log(topic,/state|session|car/i.test(topic)?value.slice(0,900):'');});
