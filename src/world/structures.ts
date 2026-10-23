import { createBody } from '../game/entities';
import type { Body } from '../game/types';
import { bodyGravity } from '../physics/gravity';
import { fieldAcceleration } from '../physics/fields';
import { length, sub } from '../physics/vector';
import type { Vec2 } from '../physics/vector';
import { seededRandom, SECTOR_SIZE, type SectorKey } from './sectors';
import { sampleRegionWeights, worldSeed } from './regions';
import { chunkFeatureCenter, chunkId, landmarks, type ChunkContent } from './generator';

export type StructureFamily='void'|'rogue'|'star'|'small-system'|'multi-system'|'binary'|'rocks'|'triple';
export const V3_CONFIG={weights:{void:30,rogue:10,star:10,'small-system':22,'multi-system':10,binary:8,rocks:8,triple:2},edge:80,gap:40,maxAttempts:48,maxGravityRadius:1600} as const;
export interface StructureDescriptor {
  id:string;family:StructureFamily;key:SectorKey;center:Vec2;members:Body[];
  bounds:{minX:number;minY:number;maxX:number;maxY:number}; attempts:number;rejection?:string;
}
const response=(kind:'star'|'planet',r:number)=>kind==='star'?Math.max(.004,Math.min(.02,.008*(60/r)**3)):Math.max(.012,Math.min(.09,.04*(25/r)**3));
/** The only velocity seeding path uses the exact finite-range softened field. */
function circular(bodies:Body[],center:Vec2):void {
  for(const b of bodies){
    const d=sub(b.position,center),r=length(d);let a={x:0,y:0};
    for(const source of bodies)if(source!==b){const force=fieldAcceleration(b.position,source.position,bodyGravity(source,b));a.x+=force.x;a.y+=force.y;}
    const inward=r?-(a.x*d.x+a.y*d.y)/r:0,speed=Math.sqrt(Math.max(0,inward)*r);
    b.velocity=r?{x:-d.y/r*speed,y:d.x/r*speed}:{x:0,y:0};
  }
}
export function describeLocalStructures(seed:number,key:SectorKey,forced?:StructureFamily,planetCount?:number):StructureDescriptor {
  const id=`${chunkId(key)}/v3`,composition=seededRandom(worldSeed(seed,key,'composition')),
    layout=seededRandom(worldSeed(seed,key,'layout')),material=seededRandom(worldSeed(seed,key,'material'));
  const known=landmarks(seed,3),feature=chunkId(key)===chunkId(known.triple)?'triple':chunkId(key)===chunkId(known.nebula)?'nebula':undefined;
  const region=sampleRegionWeights(seed,{x:key.x+.5,y:key.y+.5});
  let family:StructureFamily='void',roll=composition();
  if(roll>=region.voidWeight){
    roll=(roll-region.voidWeight)/(1-region.voidWeight)*70;
    for(const [name,weight] of Object.entries(V3_CONFIG.weights))if(name!=='void'){if(roll<weight){family=name as StructureFamily;break;}roll-=weight;}
  }
  family=forced??(feature==='triple'?'triple':feature==='nebula'||(key.x===0&&key.y===0)?'void':family);
  const members:Body[]=[],angle=layout()*Math.PI*2;
  const star=(r:number,strength=1_200_000,range=1600)=>createBody({id:`${id}/star${members.length}`,kind:'star',radius:r,position:{x:0,y:0},affectedByFields:true,receivesGravity:true,gravityResponse:1,response:response('star',r),gravityStrength:strength,gravityRadius:range,gravitySoftening:100,stabilization:{halfLife:1},appearance:{name:family==='binary'?'双星':'恒星',color:['#ffc88b','#e9b0a7','#b8dfff'][Math.floor(material()*3)]}});
  const planet=(r:number)=>createBody({id:`${id}/planet${members.length}`,kind:'planet',radius:r,position:{x:0,y:0},affectedByFields:true,receivesGravity:true,gravityResponse:1,response:response('planet',r),gravityStrength:500,gravityRadius:150,gravitySoftening:40,stabilization:{halfLife:1.1},appearance:{name:family==='rogue'?'流浪行星':'游星',color:['#7dc2ba','#d6a0cb','#8fa9db','#c4ab81'][Math.floor(material()*4)],ring:material()<.2}});
  if(family==='rogue'){
    const b=planet(25+composition()*18);b.gravityStrength=90_000;b.gravityRadius=400;
    b.velocity={x:Math.cos(angle)*(3+composition()*5),y:Math.sin(angle)*(3+composition()*5)};members.push(b);
  }else if(family==='star')members.push(star(45+composition()*25));
  else if(family==='small-system'||family==='multi-system'){
    members.push(star(45+composition()*20));
    const count=planetCount??(family==='small-system'?1+Math.floor(composition()*2):3+Math.floor(composition()*2));
    // Nested radial families; much weaker planets than v2 (500 vs 90,000),
    // with 150-unit natural fields. The primary's normal field remains 1600.
    // No peer exemptions, orbit controllers, damping of gravity or mass edits.
    const scale=.92+layout()*.12;
    for(let i=0;i<count;i++){
      const b=planet(18+composition()*7),r=[180,290,400,510][i]*scale,a=angle+layout()*Math.PI*2;
      b.position={x:r*Math.cos(a),y:r*Math.sin(a)};members.push(b);
    }
    circular(members,{x:0,y:0});
  }else if(family==='binary'){
    const a=star(43+composition()*14,900_000,950);members.push(a);
    const b=star(43+composition()*14,650_000+composition()*500_000,950);members.push(b);
    const distance=260+layout()*90;
    a.position={x:0,y:0};b.position={x:distance,y:0};
    const aa=length(fieldAcceleration(a.position,b.position,bodyGravity(b,a))),ab=length(fieldAcceleration(b.position,a.position,bodyGravity(a,b)));
    const r=distance*aa/(aa+ab);
    a.position={x:-r*Math.cos(angle),y:-r*Math.sin(angle)};
    b.position={x:(distance-r)*Math.cos(angle),y:(distance-r)*Math.sin(angle)};circular(members,{x:0,y:0});
  }else if(family==='triple'){
    for(let i=0;i<3;i++){const b=star(48,1_000_000,750),a=angle+i*Math.PI*2/3;b.gravitySoftening=95;b.position={x:180*Math.cos(a),y:180*Math.sin(a)};b.appearance!.color=['#ffcb80','#a8d9ff','#f99787'][i];members.push(b);}circular(members,{x:0,y:0});
  }else if(family==='rocks'){
    const count=2+Math.floor(composition()*4),curve=composition()<.5;
    for(let i=0;i<count;i++){
      const t=i/(count-1),a=angle+t*1.5,r=curve?130:100+layout()*180;
      const p=curve?{x:(t-.5)*420,y:Math.sin(t*Math.PI)*100}:{x:Math.cos(a+i*1.7)*r,y:Math.sin(a+i*1.7)*r};
      const b=createBody({id:`${id}/rock${i}`,kind:'asteroid',radius:10+composition()*9,position:p,receivesGravity:true,gravityResponse:1,gravityStrength:300,gravityRadius:100,stabilization:{halfLife:1},appearance:{name:'小行星',color:'#8c96a6'}});members.push(b);
    }
  }
  const footprint=Math.max(0,...members.map(b=>length(b.position)+b.radius));
  const pad=V3_CONFIG.edge+footprint;
  let center=feature?chunkFeatureCenter(seed,key,3):{x:pad+layout()*(SECTOR_SIZE-2*pad),y:pad+layout()*(SECTOR_SIZE-2*pad)};
  let rejection:string|undefined,attempts=1;
  if(pad>=SECTOR_SIZE/2){members.length=0;rejection='footprint';}
  // Rocks are the only non-orbital layout with candidate overlap. Reject a
  // bounded suffix, rather than invent a repeated fallback centre or retry loop.
  for(let i=members.length-1;i>=0;i--)if(members.slice(0,i).some(b=>length(sub(b.position,members[i].position))<b.radius+members[i].radius+V3_CONFIG.gap)){
    if(family==='rocks'){members.splice(i,1);rejection='overlapping-rock-member';}else {members.length=0;rejection='overlapping-system';break;}
  }
  if(key.x===0&&key.y===0){center={x:1024,y:1024};members.length=0;}
  for(const b of members){b.position.x+=center.x;b.position.y+=center.y;b.chunk={...key};}
  if(members.some(b=>Math.hypot(key.x*SECTOR_SIZE+b.position.x,key.y*SECTOR_SIZE+b.position.y)-b.radius<600)){
    members.length=0;rejection='start-exclusion';
  }
  const bounds={minX:Math.min(center.x,...members.map(b=>b.position.x-b.radius)),minY:Math.min(center.y,...members.map(b=>b.position.y-b.radius)),maxX:Math.max(center.x,...members.map(b=>b.position.x+b.radius)),maxY:Math.max(center.y,...members.map(b=>b.position.y+b.radius))};
  return {id,family,key:{...key},center,members,bounds,attempts,rejection};
}
export const instantiateStructure=(descriptor:StructureDescriptor):Body[]=>structuredClone(descriptor.members);
export function generateV3Chunk(seed:number,key:SectorKey):ChunkContent {
  const d=describeLocalStructures(seed,key),known=landmarks(seed,3),feature=chunkId(key)===chunkId(known.triple)?'triple':chunkId(key)===chunkId(known.nebula)?'nebula':d.family==='triple'?'triple':undefined;
  const random=seededRandom(worldSeed(seed,key,'decoration')),decorations:ChunkContent['decorations']=[];
  if(feature==='nebula')for(let i=0;i<3;i++)decorations.push({position:{x:d.center.x+(random()-.5)*500,y:d.center.y+(random()-.5)*500},radius:500+random()*200,color:'#9f61c31c'});
  for(let i=0;i<8;i++)decorations.push({position:{x:random()*SECTOR_SIZE,y:random()*SECTOR_SIZE},radius:1+random()*2,color:'#bdc9e455'});
  return {bodies:instantiateStructure(d),decorations,feature,center:d.center,structure:d,layout:{attempts:d.attempts,fallback:!!d.rejection}};
}
