#!/usr/bin/env node
// Background acceptance watcher. It is read-only until the run becomes terminal,
// then it invokes the repository report exporter and records the final outcome.
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const simulationRoot=fileURLToPath(new URL('../',import.meta.url));
const statePath=simulationRoot+'.runtime/node-red/simulation/live.json';
const reportsDir=simulationRoot+'reports';
const runId=process.argv[2];
const pollSeconds=Number(process.env.ACCEPTANCE_POLL_SECONDS||30);
const timeoutMinutes=Number(process.env.ACCEPTANCE_TIMEOUT_MINUTES||45);
const terminal=new Set(['done','failed','expired','cancelled','rejected']);

if(!runId)throw new Error('Usage: node simulation/scripts/acceptance-watch.mjs <exact-run-id>');
mkdirSync(reportsDir,{recursive:true});
const safeName=runId.replaceAll(':','-');
const progressPath=`${reportsDir}/${safeName}.progress.jsonl`;
const resultPath=`${reportsDir}/${safeName}.result.json`;
const pidPath=`${reportsDir}/${safeName}.pid`;
writeFileSync(pidPath,String(process.pid)+'\n');

const record=value=>appendFileSync(progressPath,JSON.stringify(value)+'\n');
const startedAt=Date.now();
record({timestamp:new Date().toISOString(),event:'watch_started',run_id:runId,pid:process.pid});

while(true){
 try{
  if(!existsSync(statePath))throw new Error(`state file unavailable: ${statePath}`);
  const state=JSON.parse(readFileSync(statePath,'utf8'));
  if(!state.runs?.[runId])throw new Error(`run not found: ${runId}`);
  const jobs=Object.values(state.jobs||{}).filter(job=>job.run_id===runId);
  const counts=Object.fromEntries([...new Set(jobs.map(job=>job.status))].sort().map(status=>[status,jobs.filter(job=>job.status===status).length]));
  const finished=jobs.length>0&&jobs.every(job=>terminal.has(job.status));
  record({timestamp:new Date().toISOString(),event:'progress',run_id:runId,total:jobs.length,counts,finished});
  if(finished){
   const reportOutput=execFileSync(process.execPath,[simulationRoot+'scripts/report.mjs',runId],{encoding:'utf8'});
   const summary=JSON.parse(reportOutput);
   const result={watch_status:'COMPLETED',completed_at:new Date().toISOString(),run_id:runId,summary};
   writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');
   record({timestamp:new Date().toISOString(),event:'watch_completed',run_id:runId,acceptance:summary.acceptance,result_path:resultPath});
   process.exit(summary.acceptance==='PASS'?0:1);
  }
 }catch(error){
  record({timestamp:new Date().toISOString(),event:'watch_error',run_id:runId,error:String(error?.stack||error)});
 }
 if(Date.now()-startedAt>timeoutMinutes*60_000){
  const result={watch_status:'TIMEOUT',completed_at:new Date().toISOString(),run_id:runId,timeout_minutes:timeoutMinutes};
  writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n');
  record({timestamp:new Date().toISOString(),event:'watch_timeout',run_id:runId,result_path:resultPath});
  process.exit(2);
 }
 await new Promise(resolve=>setTimeout(resolve,pollSeconds*1000));
}
