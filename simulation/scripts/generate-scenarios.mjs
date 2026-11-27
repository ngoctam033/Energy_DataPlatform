// Proposed missing business inputs. Re-runnable; never enables a daily scenario.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(root+p));
const save=(p,v)=>writeFileSync(root+p,JSON.stringify(v,null,2)+'\n');
const base=read('scenarios/daily/normal_working_day.json');
const hours=[0,2,4,7,10,12,14,16,18,20,23];
const days=[
 ['s02-weekend','weekend',[5,3,10,25,70,130,100,110,140,80,10]],
 ['s03-fleet-charging','fleet_charging',[5,10,180,100,15,35,20,70,200,30,5]],
 ['s04-holiday-travel','holiday_travel',[15,20,80,160,190,180,160,200,220,130,50]],
 ['s05-low-demand','low_demand',[3,1,10,25,15,20,15,25,40,20,5]],
 ['s06-demand-surge','demand_surge',[8,3,100,120,30,55,35,80,400,120,15]]
];
const profiles={FLEET:{battery_wh:60000,initial_soc:[15,35],target_soc:[80,95],charging_type_weights:{DC:100}},TAXI:{battery_wh:50000,initial_soc:[10,30],target_soc:[70,90],charging_type_weights:{DC:100}},COMMUTER:{battery_wh:60000,initial_soc:[30,60],target_soc:[80,90],charging_type_weights:{AC:100}},PRIVATE:{battery_wh:77000,initial_soc:[20,50],target_soc:[80,100],charging_type_weights:{AC:50,DC:50}},LONG_TRIP:{battery_wh:90000,initial_soc:[5,20],target_soc:[70,90],charging_type_weights:{DC:100}},OVERNIGHT:{battery_wh:60000,initial_soc:[20,60],target_soc:[90,100],charging_type_weights:{AC:100}}};
// Split Fleet/Taxi 60:40; reserve 10% of the original private group for Long Trip.
const grouped={0:[15,0,15,70],4:[85,5,5,5],8:[20,60,15,5],12:[55,15,30,0],16:[40,30,30,0],18:[25,35,40,0],22:[10,5,25,60]};
const weights={};
for(let h=0;h<24;h++){
 const anchor=Object.keys(grouped).map(Number).filter(x=>x<=h).at(-1),[fleet,commuter,privateCars,overnight]=grouped[anchor];
 weights[`${String(h).padStart(2,'0')}:00`]={FLEET:fleet*.6,TAXI:fleet*.4,COMMUTER:commuter,PRIVATE:privateCars*.9,LONG_TRIP:privateCars*.1,OVERNIGHT:overnight};
}
function enrich(s){s.parameters.customer_profiles=profiles;s.parameters.customer_weights_by_time=weights;return s;}
save('scenarios/daily/normal_working_day.json',enrich(base));
const files=[];
for(const [id,file,values]of days){
 const s=enrich(structuredClone(base));s.id=id;s.name=id+' - proposed full 24-hour schedule';s.enabled=false;
 s.parameters.vehicle_count_by_time=Object.fromEntries(Array.from({length:24},(_,h)=>{
   const lo=hours.findLastIndex(x=>x<=h),hi=Math.min(lo+1,hours.length-1);
   return [`${String(h).padStart(2,'0')}:00`,hi===lo?values[lo]:Math.round(values[lo]+(values[hi]-values[lo])*(h-hours[lo])/(hours[hi]-hours[lo]))];
 }));
 files.push('daily/'+file+'.json');save('scenarios/daily/'+file+'.json',s);
}
const registry=read('scenarios/index.json');registry.files=[...new Set([...registry.files,...files])];save('scenarios/index.json',registry);
save('config/customer_profiles.json',{schema_version:1,profiles,weights_by_time:weights,assumptions:['Missing hourly arrival counts: linear interpolation, rounded; original anchors unchanged.','Hourly customer mix: hold preceding documented anchor; Fleet/Taxi 60:40; Long Trip is 10% of Private.','Node-RED profiles describe demand intent. SAP chooses its physical battery profile independently; planned and measured SoC must not be equated.']});
console.log('Generated S02-S06, six customer intents, complete hourly weights. Existing enable switches preserved; new daily profiles disabled.');
