import { seededRandom, type SectorKey } from './sectors';

/** Decimal integer hashing preserves the high bits of the supported 2^40 grid. */
export function worldSeed(seed:number,key:SectorKey,tag:string):number {
  let hash=2166136261;
  for(const c of `${seed}:${key.x}:${key.y}:${tag}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return hash>>>0;
}
const smooth=(t:number)=>t*t*(3-2*t);
/** A continuous six-chunk field, sampled in chunk units without first making
 * enormous absolute world-space floats. It is also the background density input. */
export function sampleRegionWeights(seed:number,cell:SectorKey):{density:number;voidWeight:number} {
  const x=cell.x/6,y=cell.y/6,ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
  const at=(dx:number,dy:number)=>seededRandom(worldSeed(seed,{x:ix+dx,y:iy+dy},'region'))();
  const a=at(0,0)*(1-fx)+at(1,0)*fx,b=at(0,1)*(1-fx)+at(1,1)*fx;
  const density=a*(1-fy)+b*fy;
  return {density,voidWeight:Math.max(.12,Math.min(.88,.30+(0.5-density)*1.5))};
}
