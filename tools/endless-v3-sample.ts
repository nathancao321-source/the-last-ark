import {generateChunk,chunkId,landmarks} from '../src/world/generator';
import {sampleRegionWeights} from '../src/world/regions';
import {V3_CONFIG} from '../src/world/structures';
export function sampleV3(){
 const families:Record<string,number>={},members:Record<string,number>={},rejections:Record<string,number>={},examples:Record<string,{seed:number;x:number;y:number}>={},centers=Array(9).fill(0),emptyRuns:Record<string,number>={};
 let minEdge=Infinity,minGap=Infinity,chunks=0,ordinary=0,empty=0,maxRun=0;
 const seeds=[20261017,7,424242,...Array.from({length:29},(_,i)=>123+i*7919)];
 for(const seed of seeds){const special=new Set(Object.values(landmarks(seed,3)).map(chunkId));for(let y=-8;y<8;y++){
  let run=0;const flush=()=>{if(run){emptyRuns[run]=(emptyRuns[run]??0)+1;maxRun=Math.max(maxRun,run);run=0;}};
  for(let x=-8;x<8;x++){
   const c=generateChunk(seed,{x,y},3),d=c.structure!;chunks++;if(!c.bodies.length){empty++;run++;}else flush();
   if(d.rejection)rejections[d.rejection]=(rejections[d.rejection]??0)+1;
   if(special.has(`${x},${y}`))continue;ordinary++;
   families[d.family]=(families[d.family]??0)+1;const signature=`${d.family}:${c.bodies.filter(b=>b.kind==='planet').length}p/${c.bodies.length}b`;members[signature]=(members[signature]??0)+1;
   if(c.bodies.length)examples[signature]??={seed,x,y};
   centers[Math.min(2,Math.floor(d.center.y/2048*3))*3+Math.min(2,Math.floor(d.center.x/2048*3))]++;
   for(const b of c.bodies)minEdge=Math.min(minEdge,b.position.x-b.radius,b.position.y-b.radius,2048-b.position.x-b.radius,2048-b.position.y-b.radius);
   for(let i=0;i<c.bodies.length;i++)for(let j=0;j<i;j++)minGap=Math.min(minGap,Math.hypot(c.bodies[i].position.x-c.bodies[j].position.x,c.bodies[i].position.y-c.bodies[j].position.y)-c.bodies[i].radius-c.bodies[j].radius);
  }flush();
 }}
 const regionLine=Array.from({length:257},(_,i)=>({x:i/16-8,...sampleRegionWeights(20261017,{x:i/16-8,y:0})}));
 return {seeds,chunks,ordinary,config:V3_CONFIG,families,members,empty,maxRun,emptyRuns,rejections,centers,minEdge,minGap,examples,regionLine};
}
