import { describe,it,expect } from 'vitest';
import { DEFAULT_ART,setArt } from '../src/render/spacetime/art';
import { noise,nebulaDensity } from '../src/render/spacetime/noise';
import { generateNebula,generateStars } from '../src/render/spacetime/texture';
import { drawBackground } from '../src/render/spacetime/background';
import { createCamera } from '../src/camera/camera';
import { firstLevel } from '../src/levels/first';
import { createVisualState } from '../src/render/spacetime/model';
import { DEFAULT_WARP } from '../src/render/spacetime/config';
describe('cinematic 2D background',()=>{
  it('is deterministic, bounded and continuous across integer noise coordinates',()=>{
    for(let x=-10;x<10;x++){expect(noise(x-1e-6,.5)).toBeCloseTo(noise(x+1e-6,.5),5);const d=nebulaDensity(x,.72);expect(Object.values(d).every(Number.isFinite)).toBe(true);}
    expect(generateNebula(DEFAULT_ART,48)).toEqual(generateNebula(DEFAULT_ART,48));
    expect(generateStars()).toEqual(generateStars());expect(generateStars().length).toBeLessThanOrEqual(55000);
  });
  it('dense and sparse are different density maps with real dark regions',()=>{
    const dense=generateNebula(DEFAULT_ART,64),sparse=generateNebula({...DEFAULT_ART,background:'sparse'},64);
    expect(dense).not.toEqual(sparse);const values=Array.from(dense).filter((_v,i)=>i%4!==3);
    expect(values.filter(v=>v<12).length/values.length).toBeGreaterThan(.5);expect(Math.max(...values)).toBeGreaterThan(40);
    expect(dense.filter((_v,i)=>i%4===3).every(v=>v===255)).toBe(true);
  });
  it('art controls clamp invalid values without changing unrelated controls',()=>{
    const a={...DEFAULT_ART};setArt(a,'exposure',99);setArt(a,'nebula',NaN);expect(a.exposure).toBe(1.6);expect(a.nebula).toBe(1);
  });
  it.each(['high','medium','low'] as const)('%s uses bounded texture submissions and reads simulation only',quality=>{
    let draws=0;const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,k)=>()=>{if(['drawImage','fill','stroke'].includes(String(k)))draws++;},set:()=>true});
    const camera=createCamera({x:0,y:0},800,600),state=createVisualState(firstLevel.players);state.sources.forEach(s=>s.weight=1);
    const before=structuredClone({state,camera});
    const b={texture:{} as HTMLCanvasElement,view:{width:800,height:600} as HTMLCanvasElement,key:'',viewKey:'800,600,0,0',stars:generateStars(),generationMs:0};
    drawBackground(ctx,b,camera,state,{...DEFAULT_WARP,quality},DEFAULT_ART,{dx:0,dy:0,luminance:0});
    expect({state,camera}).toEqual(before);expect(draws).toBeLessThanOrEqual(125);if(quality==='low')expect(draws).toBe(6);
  });
});
