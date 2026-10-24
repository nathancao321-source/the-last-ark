import { createBody } from '../game/entities';
import type { Body, Level } from '../game/types';
import { seededRandom, SECTOR_SIZE, type SectorKey } from './sectors';
import { bodyGravity } from '../physics/gravity';
import { fieldAcceleration } from '../physics/fields';
import { add, length, sub } from '../physics/vector';
import type { Vec2 } from '../physics/vector';
import { generateV3Chunk, type StructureDescriptor } from './structures';
export type DiscoveryKind = 'triple' | 'nebula';
export type GeneratorVersion=1|2|3;
export const GENERATOR_VERSION:GeneratorVersion=3;
export const LAYOUT={edgeClearance:80,minGap:40,maxAttempts:48,featureFootprint:228} as const;
export interface ChunkContent { bodies: Body[]; decorations: NonNullable<Level['decorations']>; feature?: DiscoveryKind; center:Vec2; structure?:StructureDescriptor; layout?:{attempts:number;fallback:boolean} }
/** Hash full decimal coordinates: unlike bitwise coordinates, no 2^32-chunk repeat. */
export function chunkSeed(seed:number,key:SectorKey):number {
  let hash=2166136261;
  for(const c of `${seed}:${key.x}:${key.y}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return hash>>>0;
}
export function landmarks(seed:number,version:GeneratorVersion=GENERATOR_VERSION):Record<DiscoveryKind,SectorKey> {
  const random=seededRandom(seed);
  if(version>=2){
    const polar=(near:number,range:number)=>{const a=random()*Math.PI*2,r=near+random()*range;return {x:Math.round(Math.cos(a)*r),y:Math.round(Math.sin(a)*r)};};
    return {triple:polar(3.5,.5),nebula:polar(12,4)};
  }
  return {triple:{x:3+Math.floor(random()*2),y:0},nebula:{x:12+Math.floor(random()*4),y:-3}};
}
export const chunkId=(key:SectorKey)=>`${key.x},${key.y}`;
const layoutRandom=(seed:number,key:SectorKey,tag:number)=>seededRandom(chunkSeed(seed^tag,key));
function centerSample(seed:number,key:SectorKey,footprint:number):Vec2 {
 const random=layoutRandom(seed,key,0x43454e54),pad=LAYOUT.edgeClearance+footprint;
 return {x:pad+random()*(SECTOR_SIZE-2*pad),y:pad+random()*(SECTOR_SIZE-2*pad)};
}
/** Shared anchor for guaranteed landmarks, dev jumps and background. V3's
 * additional local triples expose their authoritative descriptor centre.
 * It needs no neighboring chunks, camera, entity construction or history. */
export function chunkFeatureCenter(seed:number,key:SectorKey,version:GeneratorVersion=GENERATOR_VERSION):Vec2 {
 return version===1||(key.x===0&&key.y===0)?{x:1024,y:1024}:centerSample(seed,key,LAYOUT.featureFootprint);
}
export function landmarkPosition(seed:number,kind:DiscoveryKind,version:GeneratorVersion=GENERATOR_VERSION):Vec2 {
 const key=landmarks(seed,version)[kind],center=chunkFeatureCenter(seed,key,version);
 return {x:key.x*SECTOR_SIZE+center.x,y:key.y*SECTOR_SIZE+center.y};
}
/** Node coupling is independent of environmental gravity. Smaller bodies respond
 * more, while even a large procedural star can visibly move under sustained input. */
export const ENDLESS_NODE_RESPONSE={
  star:{referenceRadius:60,response:0.008,min:0.004,max:0.02},
  planet:{referenceRadius:25,response:0.04,min:0.012,max:0.09},
} as const;
function nodeResponse(kind:'star'|'planet',radius:number):number {
  const config=ENDLESS_NODE_RESPONSE[kind];
  return Math.max(config.min,Math.min(config.max,config.response*(config.referenceRadius/radius)**3));
}
/** Seed only the initial tangential velocity from the same softened, finite-range
 * force used by the integrator. No orbit script or corrective force runs later.
 * Radii stay inside the stable part of the tapered field, not near its cutoff. */
function seedCircularVelocity(body:Body,center:Vec2,sources:Body[]):void {
  let acceleration={x:0,y:0};
  for(const source of sources)if(source!==body)acceleration=add(acceleration,fieldAcceleration(body.position,source.position,bodyGravity(source,body)));
  const delta=sub(body.position,center),radius=length(delta);
  if(radius<1e-8){body.velocity={x:0,y:0};return;}
  const inward=-(acceleration.x*delta.x+acceleration.y*delta.y)/radius;
  const speed=Math.sqrt(Math.max(0,inward)*radius);
  body.velocity={x:-delta.y/radius*speed,y:delta.x/radius*speed};
}

/** v1 saves used analytic paths and disabled environmental gravity. Preserve their
 * actual positions/velocities (including player disturbances), but release the
 * path constraint. Old trajectories will naturally change under real forces. */
export function migrateLegacyChunkGravity(body:Body):void {
  if(!body.chunk||(body.kind!=='star'&&body.kind!=='planet'))return;
  if(body.receivesGravity===false) {
    body.receivesGravity=true;body.gravityResponse=1;
    delete body.orbit;delete body.orbitTime;
  }
  // Also upgrade the previous near-imperceptible node coupling in saved chunks.
  body.affectedByFields=true;body.response=nodeResponse(body.kind,body.radius);
}
/** V1 content rolls stay in their original order: layout consumes a separate
 * random stream, so counts, physical parameters and ordinary appearance survive.
 * V1 saves remain pinned to the complete old layout, including future chunks. */
export function generateChunk(seed:number,key:SectorKey,version:GeneratorVersion=GENERATOR_VERSION):ChunkContent {
  if(version===3)return generateV3Chunk(seed,key);
  const random=seededRandom(chunkSeed(seed,key)),known=landmarks(seed,version),id=chunkId(key);
  const feature:DiscoveryKind|undefined=id===chunkId(known.triple)?'triple':id===chunkId(known.nebula)?'nebula':random()<0.018?'triple':undefined;
  const bodies:Body[]=[],decorations:ChunkContent['decorations']=[];
  const add=(b:Body)=>{b.chunk={...key};bodies.push(b);};
  const center={x:1024,y:1024};
  if(feature==='triple') {
    for(let i=0;i<3;i++) {
      const phase=i*Math.PI*2/3;
      add(createBody({id:`${id}/star${i}`,kind:'star',radius:48,position:{x:center.x+180*Math.cos(phase),y:center.y+180*Math.sin(phase)},
        affectedByFields:true,receivesGravity:true,gravityResponse:1,response:nodeResponse('star',48),gravityStrength:1_000_000,gravityRadius:750,gravitySoftening:95,
        stabilization:{halfLife:1},appearance:{name:`三日系统 ${i+1}`,color:['#ffcb80','#a8d9ff','#f99787'][i]}}));
    }
    bodies.forEach(body=>seedCircularVelocity(body,center,bodies));
  } else if(id!=='0,0'&&feature!=='nebula'&&random()<0.68) {
    const radius=45+random()*30;
    add(createBody({id:`${id}/sun`,kind:'star',radius,position:{...center},affectedByFields:true,receivesGravity:true,gravityResponse:1,response:nodeResponse('star',radius),
      gravityStrength:1_200_000,gravityRadius:720,gravitySoftening:100,stabilization:{halfLife:1},
      appearance:{name:'恒星',color:['#ffc88b','#e9b0a7','#b8dfff'][Math.floor(random()*3)]}}));
    const phaseOffset=random()*0.3;
    for(let i=0;i<2;i++) {
      const phase=i*Math.PI+phaseOffset,r=18+random()*22;
      add(createBody({id:`${id}/planet${i}`,kind:'planet',radius:r,position:{x:center.x+300*Math.cos(phase),y:center.y+300*Math.sin(phase)},
        affectedByFields:true,receivesGravity:true,gravityResponse:1,response:nodeResponse('planet',r),gravityStrength:90000,gravityRadius:400,gravitySoftening:45,
        stabilization:{halfLife:1.1},appearance:{name:'游星',color:['#7dc2ba','#d6a0cb','#8fa9db','#c4ab81'][Math.floor(random()*4)]}}));
    }
    bodies.filter(body=>body.kind==='planet').forEach(body=>seedCircularVelocity(body,center,bodies));
  }
  // One sparse cluster, well separated from the central orbital system.
  if(id!=='0,0'&&feature!=='triple'&&random()<0.55)for(let i=0;i<3;i++)add(createBody({
    id:`${id}/rock${i}`,kind:'asteroid',radius:10+random()*9,position:{x:530+i*70,y:510+random()*30},
    receivesGravity:true,gravityRadius:100,stabilization:{halfLife:1},appearance:{name:'小行星',color:'#8c96a6'}}));
  if(feature==='nebula'||random()<0.12)for(let i=0;i<3;i++)decorations.push({position:{x:700+random()*600,y:700+random()*600},radius:500+random()*200,color:feature==='nebula'?'#9f61c31c':'#476da018'});
  for(let i=0;i<8;i++)decorations.push({position:{x:random()*SECTOR_SIZE,y:random()*SECTOR_SIZE},radius:1+random()*2,color:'#bdc9e455'});
  const result:ChunkContent={bodies,decorations,feature,center};
  if(version===2)layoutChunk(seed,key,result);
  return result;
}

/** Collision circles retain 80 units to their chunk edges: any pair of
 * adjacent chunks has >=160 units of initial clearance, including diagonal
 * seams. A system's FULL initial orbit footprint determines its centre bounds.
 * Later motion is exclusively the existing integrator, never this function. */
function layoutChunk(seed:number,key:SectorKey,chunk:ChunkContent):void {
 const random=layoutRandom(seed,key,0x4f524249),angle=random()*Math.PI*2;
 const system=chunk.bodies.filter(b=>b.kind!=='asteroid'),rocks=chunk.bodies.filter(b=>b.kind==='asteroid');
 const planets=system.filter(b=>b.kind==='planet');
 if(planets.length){
  // Independent co-orbital radii rapidly create close encounters under the
  // existing finite-range forces. Use verified rotating initial configurations:
  // opposite or +/-60 degrees, with a shared seeded scale, not scripted orbits.
  const separation=random()<.5?Math.PI:(random()<.5?-1:1)*Math.PI/3,r=270+random()*50;
  planets.forEach((b,i)=>{const phase=angle+i*separation;b.position={x:r*Math.cos(phase),y:r*Math.sin(phase)};});
  system.find(b=>b.kind==='star')!.position={x:0,y:0};
 }else for(const [i,b]of system.entries())b.position={x:180*Math.cos(angle+i*Math.PI*2/3),y:180*Math.sin(angle+i*Math.PI*2/3)};
 const footprint=Math.max(0,...system.map(b=>length(b.position)+b.radius));
 const center=chunk.feature?chunkFeatureCenter(seed,key):centerSample(seed,key,footprint);
 // The origin keeps its original protected preparation area, even for the
 // rare pre-existing triple roll. No content probability is changed.
 if(key.x===0&&key.y===0){center.x=1024;center.y=1024;}
 chunk.center=center;
 for(const b of system){b.position=add(center,b.position);b.velocity={x:0,y:0};}
 let rotationCenter=center;
 if(planets.length){
  const star=system.find(b=>b.kind==='star')!,planet=planets[0];
  const primary=length(fieldAcceleration(planet.position,star.position,bodyGravity(star,planet)));
  const secondary=length(fieldAcceleration(star.position,planet.position,bodyGravity(planet,star)));
  // For equal pair distances, these are the exact force coefficients of the
  // existing fields. Seed around their common rotation centre, including the
  // small stellar reflex velocity. No masses, fields or later motion change.
  const fraction=secondary/(primary+2*secondary);
  rotationCenter={x:center.x+fraction*(planets[0].position.x+planets[1].position.x-2*center.x),y:center.y+fraction*(planets[0].position.y+planets[1].position.y-2*center.y)};
 }
 system.forEach(b=>seedCircularVelocity(b,rotationCenter,system));

 let attempts=0,fallback=false;
 if(rocks.length){
  const cluster=layoutRandom(seed,key,0x524f434b),rotation=cluster()*Math.PI*2;
  const offsets=rocks.map((_,i)=>{const a=rotation+i*Math.PI*2/3+(cluster()-.5)*.4,r=68+cluster()*48;return {x:r*Math.cos(a),y:r*Math.sin(a)};});
  const pad=LAYOUT.edgeClearance+Math.max(...offsets.map((p,i)=>length(p)+rocks[i].radius));
  const legal=(point:Vec2)=>offsets.every((p,i)=>{
   const position=add(point,p),rock=rocks[i];
   return (!system.length||length(sub(position,center))>770)&&system.every(b=>length(sub(position,b.position))>rock.radius+b.radius+LAYOUT.minGap);
  });
  let site:Vec2|undefined;
  for(attempts=1;attempts<=LAYOUT.maxAttempts;attempts++){
   const candidate={x:pad+cluster()*(SECTOR_SIZE-2*pad),y:pad+cluster()*(SECTOR_SIZE-2*pad)};
   if(legal(candidate)){site=candidate;break;}
  }
  if(!site){
   fallback=true;attempts=LAYOUT.maxAttempts;
   // The farthest corner is >=~1100 from a central system; even the
   // closest cluster member clears the entire 770-unit exclusion circle.
   site=[{x:pad,y:pad},{x:SECTOR_SIZE-pad,y:pad},{x:pad,y:SECTOR_SIZE-pad},{x:SECTOR_SIZE-pad,y:SECTOR_SIZE-pad}].sort((a,b)=>length(sub(b,center))-length(sub(a,center))).find(legal)!;
  }
  rocks.forEach((b,i)=>{b.position=add(site!,offsets[i]);});
 }
 // Move/rotate the existing cloud group; its count, radii, colors and noise
 // materials are untouched. Point-star decoration retains its original sites.
 const clouds=chunk.decorations.filter(d=>d.radius>100),decor=layoutRandom(seed,key,0x434c4f55),rotation=decor()*Math.PI*2;
 const cloudCenter=chunk.feature==='nebula'?center:{x:280+decor()*(SECTOR_SIZE-560),y:280+decor()*(SECTOR_SIZE-560)};
 for(const d of clouds){const dx=d.position.x-1000,dy=d.position.y-1000;d.position={x:cloudCenter.x+dx*Math.cos(rotation)-dy*Math.sin(rotation),y:cloudCenter.y+dx*Math.sin(rotation)+dy*Math.cos(rotation)};}
 chunk.layout={attempts,fallback};
}
