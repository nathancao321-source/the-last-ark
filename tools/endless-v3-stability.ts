import {generateChunk,landmarks} from '../src/world/generator';
import {describeLocalStructures,type StructureFamily} from '../src/world/structures';
import {integrateContacts} from '../src/physics/contact-world';
import {length,sub} from '../src/physics/vector';
import type {Body} from '../src/game/types';
export function stabilityReport(){
 const rows:unknown[]=[];
 const run=(version:number,family:string,seed:number,bodies:Body[],seconds:number)=>{
  const initial=structuredClone(bodies),star=bodies.find(b=>b.kind==='star');let minRatio=Infinity,maxRatio=0,maxSpeed=0,events=0,budget=0,nonFinite=0;
  for(let tick=0;tick<seconds*60;tick++){
   const result=integrateContacts(bodies,[],1/60);bodies=result.bodies;events+=result.events.length;budget+=Number(result.budgetExhausted);
   if(tick%60===0)for(const b of bodies){maxSpeed=Math.max(maxSpeed,length(b.velocity));if(!Number.isFinite(b.position.x)||!Number.isFinite(b.position.y)||!Number.isFinite(b.velocity.x)||!Number.isFinite(b.velocity.y))nonFinite++;
    if(star&&b.kind==='planet'){const r=length(sub(b.position,star.position))/length(sub(initial.find(p=>p.id===b.id)!.position,initial.find(p=>p.id===star.id)!.position));minRatio=Math.min(minRatio,r);maxRatio=Math.max(maxRatio,r);}
   }
  }
  rows.push({version,family,seed,seconds,initialCount:initial.length,finalCount:bodies.length,events,budget,nonFinite,maxSpeed,minPlanetRatio:Number.isFinite(minRatio)?minRatio:null,maxPlanetRatio:maxRatio||null});
 };
 for(const seed of [7,424242,20261017]){
  let ordinary:Body[]=[];for(let x=1;x<100;x++){const c=generateChunk(seed,{x,y:1},2);if(c.bodies.some(b=>b.kind==='planet')){ordinary=c.bodies;break;}}
  run(2,'ordinary',seed,ordinary,120);run(2,'triple',seed,generateChunk(seed,landmarks(seed,2).triple,2).bodies,120);
  for(const family of ['rogue','star','small-system','multi-system','binary','rocks','triple'] as StructureFamily[])for(const count of family==='small-system'?[1,2]:family==='multi-system'?[3,4]:[undefined]){
   const d=describeLocalStructures(seed,{x:2,y:2},family,count);run(3,`${family}${count??''}`,seed,structuredClone(d.members),['multi-system','binary'].includes(family)?600:120);
  }
 }
 return {dt:1/60,sampleEverySeconds:1,rows};
}
