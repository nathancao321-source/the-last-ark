import {generateChunk,landmarks,type GeneratorVersion} from '../src/world/generator';
import {length,sub} from '../src/physics/vector';
export function layoutSample(version:GeneratorVersion=2){
 const centers:number[][]=[],headings=Array(8).fill(0) as number[],regions=Array(9).fill(0) as number[],rockRegions=Array(4).fill(0) as number[],landmarkDirections=Array(8).fill(0) as number[];
 let chunks=0,ordinary=0,clusters=0,fallbacks=0,maxAttempts=0,minGap=Infinity,minEdge=Infinity;
 const phases=new Set<number>(),radius=[Infinity,0],centerRange=[Infinity,-Infinity,Infinity,-Infinity];
 for(let n=0;n<64;n++){
  const seed=(20261017+Math.imul(n,7919))>>>0;
  for(let x=-4;x<=4;x++)for(let y=-4;y<=4;y++){
   const key={x,y},c=generateChunk(seed,key,version),bodies=c.bodies;chunks++;
   if(c.layout?.fallback)fallbacks++;maxAttempts=Math.max(maxAttempts,c.layout?.attempts??0);
   for(const b of bodies)minEdge=Math.min(minEdge,b.position.x-b.radius,b.position.y-b.radius,2048-b.position.x-b.radius,2048-b.position.y-b.radius);
   for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)minGap=Math.min(minGap,length(sub(bodies[i].position,bodies[j].position))-bodies[i].radius-bodies[j].radius);
   const star=bodies.find(b=>b.id.endsWith('/sun')),p=bodies.filter(b=>b.kind==='planet');
   if(star&&p.length===2){
    ordinary++;const v=sub(p[0].position,star.position),a=(Math.atan2(v.y,v.x)+2*Math.PI)%(2*Math.PI),r=length(v);
    headings[Math.min(7,Math.floor(a/(Math.PI/4)))]++;
    regions[Math.min(2,Math.floor(star.position.x/(2048/3)))+3*Math.min(2,Math.floor(star.position.y/(2048/3)))]++;
    centers.push([star.position.x,star.position.y]);centerRange[0]=Math.min(centerRange[0],star.position.x);centerRange[1]=Math.max(centerRange[1],star.position.x);centerRange[2]=Math.min(centerRange[2],star.position.y);centerRange[3]=Math.max(centerRange[3],star.position.y);
    radius[0]=Math.min(radius[0],r);radius[1]=Math.max(radius[1],r);
    const other=sub(p[1].position,star.position),dot=(v.x*other.x+v.y*other.y)/(r*length(other));phases.add(Math.round(Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI));
   }
   const rocks=bodies.filter(b=>b.kind==='asteroid');if(rocks.length){clusters++;const x=rocks.reduce((s,b)=>s+b.position.x,0)/3,y=rocks.reduce((s,b)=>s+b.position.y,0)/3;rockRegions[(x>=1024?1:0)+(y>=1024?2:0)]++;}
  }
  const p=landmarks(seed,version).triple,a=(Math.atan2(p.y,p.x)+2*Math.PI)%(2*Math.PI);landmarkDirections[Math.min(7,Math.floor(a/(Math.PI/4)))]++;
 }
 return {version,chunks,ordinary,clusters,centers,centerRange,regions,headings,rockRegions,landmarkDirections,phases:[...phases].sort((a,b)=>a-b),orbitRadius:radius,minGap,minEdge,fallbacks,maxAttempts};
}
