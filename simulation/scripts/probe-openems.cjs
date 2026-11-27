// Run inside the existing Node-RED container, which shares the EMS network.
async function main(){
  const base='http://openems-edge:8084/rest/channel/';
  const headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(process.env.SIM_OPENEMS_USER+':'+process.env.SIM_OPENEMS_PASSWORD).toString('base64')};
  if(process.argv[2]==='set'){
    const value=Number(process.argv[3]);if(!Number.isInteger(value)||value<0||value>200000)throw new Error('Power out of range');
    const r=await fetch(base+'simulateConsumption/Data',{method:'POST',headers,body:JSON.stringify({value})});console.log('write',r.status,await r.text());
  }else for(const channel of ['simulateConsumption/Data','meterSimulation/ActivePower','_sum/ConsumptionActivePower']){
    const r=await fetch(base+channel,{headers});console.log(channel,r.status,await r.text());
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
