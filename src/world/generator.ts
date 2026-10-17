import { createBody } from '../game/entities';
import type { Body, Level } from '../game/types';
import { seededRandom, SECTOR_SIZE, type SectorKey } from './sectors';
import { bodyGravity } from '../physics/gravity';
import { fieldAcceleration } from '../physics/fields';
import { add, length, sub } from '../physics/vector';
import type { Vec2 } from '../physics/vector';
export type DiscoveryKind = 'triple' | 'nebula';
export interface ChunkContent { bodies: Body[]; decorations: NonNullable<Level['decorations']>; feature?: DiscoveryKind }
/** Hash full decimal coordinates: unlike bitwise coordinates, no 2^32-chunk repeat. */
export function chunkSeed(seed:number,key:SectorKey):number {
  let hash=2166136261;
  for(const c of `${seed}:${key.x}:${key.y}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return hash>>>0;
}
export function landmarks(seed:number):Record<DiscoveryKind,SectorKey> {
  const random=seededRandom(seed);
  return {triple:{x:3+Math.floor(random()*2),y:0},nebula:{x:12+Math.floor(random()*4),y:-3}};
}
export const chunkId=(key:SectorKey)=>`${key.x},${key.y}`;
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
/** Chunk-local templates; no dependence on load order, camera, or current ship position.
 * All hazards start inside a 440-unit boundary margin; adjacent chunks cannot overlap.
 * The origin chunk is a safe launch corridor. At most six physical bodies per chunk. */
export function generateChunk(seed:number,key:SectorKey):ChunkContent {
  const random=seededRandom(chunkSeed(seed,key)),known=landmarks(seed),id=chunkId(key);
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
  return {bodies,decorations,feature};
}
