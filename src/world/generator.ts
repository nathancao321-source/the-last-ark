import { createBody } from '../game/entities';
import type { Body, Level } from '../game/types';
import { seededRandom, SECTOR_SIZE, type SectorKey } from './sectors';
import { sampleOrbit } from '../physics/orbits';
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
      const orbit={center:{...center},radius:280,phase:i*Math.PI*2/3,angularSpeed:0.055};
      const initial=sampleOrbit(orbit,0);
      add(createBody({id:`${id}/star${i}`,kind:'star',radius:48,position:initial.position,velocity:initial.velocity,orbit,
        receivesGravity:false,response:0.001,gravityStrength:1_000_000,gravityRadius:650,gravitySoftening:95,
        stabilization:{halfLife:1},appearance:{name:`三日系统 ${i+1}`,color:['#ffcb80','#a8d9ff','#f99787'][i]}}));
    }
  } else if(id!=='0,0'&&feature!=='nebula'&&random()<0.68) {
    const radius=45+random()*30;
    add(createBody({id:`${id}/sun`,kind:'star',radius,position:{...center},receivesGravity:false,response:0.0005,
      gravityStrength:1_200_000,gravityRadius:720,gravitySoftening:100,stabilization:{halfLife:1},
      appearance:{name:'恒星',color:['#ffc88b','#e9b0a7','#b8dfff'][Math.floor(random()*3)]}}));
    for(let i=0;i<2;i++) {
      const orbit={center:{...center},radius:430,phase:i*Math.PI+random()*0.3,angularSpeed:0.028};
      const initial=sampleOrbit(orbit,0),r=18+random()*22;
      add(createBody({id:`${id}/planet${i}`,kind:'planet',radius:r,position:initial.position,velocity:initial.velocity,orbit,
        receivesGravity:false,response:0.02*(25/r)**3,gravityStrength:90000,gravityRadius:260,gravitySoftening:45,
        stabilization:{halfLife:1.1},appearance:{name:'游星',color:['#7dc2ba','#d6a0cb','#8fa9db','#c4ab81'][Math.floor(random()*4)]}}));
    }
  }
  // One sparse cluster, well separated from the central orbital system.
  if(id!=='0,0'&&feature!=='triple'&&random()<0.55)for(let i=0;i<3;i++)add(createBody({
    id:`${id}/rock${i}`,kind:'asteroid',radius:10+random()*9,position:{x:530+i*70,y:510+random()*30},
    receivesGravity:true,gravityRadius:100,stabilization:{halfLife:1},appearance:{name:'小行星',color:'#8c96a6'}}));
  if(feature==='nebula'||random()<0.12)for(let i=0;i<3;i++)decorations.push({position:{x:700+random()*600,y:700+random()*600},radius:500+random()*200,color:feature==='nebula'?'#9f61c31c':'#476da018'});
  for(let i=0;i<8;i++)decorations.push({position:{x:random()*SECTOR_SIZE,y:random()*SECTOR_SIZE},radius:1+random()*2,color:'#bdc9e455'});
  return {bodies,decorations,feature};
}
