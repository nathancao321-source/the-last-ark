import {describe,it,expect} from 'vitest';
import {nodeRadiance,drawNode} from '../src/render/spacetime/nodes';
import {createVisualState,updateVisuals} from '../src/render/spacetime/model';
import {firstLevel} from '../src/levels/first';
import {createCamera} from '../src/camera/camera';
import {DEFAULT_WARP} from '../src/render/spacetime/config';
import {CINEMATIC_ART,setArt} from '../src/render/spacetime/art';
describe('high energy atlas radiance',()=>{
 it.each([.5,1,1.2,1.8,2])('keeps crossfade brightness constant at energy %s',nodeEnergy=>{
  const players=structuredClone(firstLevel.players),v=createVisualState(players),camera=createCamera({x:0,y:0});
  const alpha:number[]=[],draws:number[]=[];let current=1;
  const ctx=new Proxy({},{get:(_t,k)=>()=>{if(k==='drawImage')draws.push(current);},set:(_t,k,x)=>{if(k==='globalAlpha'){expect(Number.isFinite(x)).toBe(true);expect(x).toBeGreaterThanOrEqual(0);expect(x).toBeLessThanOrEqual(1);current=x;}return true;}}) as CanvasRenderingContext2D;
  v.sources[0].weight=1;
  for(let frame=0;frame<240;frame++){v.sources[0].nodeClock=frame/240;draws.length=0;drawNode(ctx,{canvas:{} as HTMLCanvasElement,ready:true,failed:false,generationMs:0},players[0],v.sources[0],v,camera,{...CINEMATIC_ART,nodeEnergy,particles:false},'high',0);alpha.push(draws.reduce((a,b)=>a+b,0));}
  expect(Math.max(...alpha)-Math.min(...alpha)).toBeLessThan(1e-12);
 });
 it('increases fullness without changing phase frequency, supports two and rejects nonfinite input',()=>{
  const art={...CINEMATIC_ART};setArt(art,'nodeEnergy',2);expect(art.nodeEnergy).toBe(2);
  expect(nodeRadiance(2,1).alpha).toBeGreaterThan(nodeRadiance(1,1).alpha);expect(nodeRadiance(2,1).extent).toBeGreaterThan(nodeRadiance(1,1).extent);
  expect(Object.values(nodeRadiance(NaN,Infinity)).every(Number.isFinite)).toBe(true);
  const p=structuredClone(firstLevel.players),v=createVisualState(p);p[0].active=true;updateVisuals(v,p,'running',0,1/60,DEFAULT_WARP);const snapshot=structuredClone(v);updateVisuals(v,p,'paused',0,1,DEFAULT_WARP);expect(v).toEqual(snapshot);
 });
});
