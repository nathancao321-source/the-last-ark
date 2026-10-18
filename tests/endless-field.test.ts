import {describe,it,expect} from 'vitest';
import {ENDLESS_STAR_TILE_LIMIT,generateEndlessStars,generateEndlessTile,sampleEndlessField} from '../src/render/endless-field';
import {landmarks} from '../src/world/generator';

const seed=20261017;
describe('continuous deterministic endless background field',()=>{
 it('has no DOM dependency, keeps revisits identical and distinguishes seeds',()=>{
  const a=generateEndlessTile(seed,-3,7,2048,20),stars=generateEndlessStars(seed,-3,7);
  generateEndlessTile(seed,88,-92,2048,20);
  expect(generateEndlessTile(seed,-3,7,2048,20)).toEqual(a);
  expect(generateEndlessStars(seed,-3,7)).toEqual(stars);
  expect(generateEndlessTile(seed+1,-3,7,2048,20).pixels).not.toEqual(a.pixels);
 });
 it('matches all adjacent texel gutters across positive and negative tile boundaries',()=>{
  const res=16,size=res+2,row=(a:Uint8ClampedArray,x:number,y:number)=>a.slice((y*size+x)*4,(y*size+x+1)*4);
  for(const [tx,ty] of [[0,0],[-2,-1],[2**35,-(2**35)]]) {
   const a=generateEndlessTile(seed,tx,ty,2048,res),right=generateEndlessTile(seed,tx+1,ty,2048,res),down=generateEndlessTile(seed,tx,ty+1,2048,res);
   for(const kind of ['pixels','activity'] as const)for(let n=0;n<size;n++) {
    expect(row(a[kind],res+1,n)).toEqual(row(right[kind],1,n));
    expect(row(a[kind],res,n)).toEqual(row(right[kind],0,n));
    expect(row(a[kind],n,res+1)).toEqual(row(down[kind],n,1));
    expect(row(a[kind],n,res)).toEqual(row(down[kind],n,0));
   }
  }
 });
 it('is continuous on physical chunk seams, without a hard feature boundary',()=>{
  for(const x of [-4096,0,2048,32768])for(const y of [-2048,1234,2048]) {
   const a=sampleEndlessField(seed,x-1e-3,y),b=sampleEndlessField(seed,x+1e-3,y);
   for(const key of Object.keys(a) as (keyof typeof a)[])expect(Math.abs(a[key]-b[key])).toBeLessThan(1e-4);
  }
 });
 it('does not repeat after 2^32 chunks and remains finite around 2^46 world units',()=>{
  const base=sampleEndlessField(seed,512,912),far=sampleEndlessField(seed,512+2048*2**32,912);
  expect(far).not.toEqual(base);
  const a=sampleEndlessField(seed,2**46+1123,-(2**46)+723);
  expect(sampleEndlessField(seed,2**46+1123,-(2**46)+723)).toEqual(a);
  for(const value of Object.values(a)){expect(Number.isFinite(value)).toBe(true);expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);}
  expect(generateEndlessStars(seed,2**35,-(2**35))).not.toEqual(generateEndlessStars(seed,0,0));
 });
 it('concentrates cosmic web at the seeded landmark and leaves most distant space sparse',()=>{
  const feature=landmarks(seed).nebula,x=feature.x*2048+1024,y=feature.y*2048+1024;
  expect(sampleEndlessField(seed,x,y).density).toBeGreaterThan(.85);
  const densities=Array.from({length:100},(_,n)=>sampleEndlessField(seed,-80000+n*7919,50000+n*2511).density);
  expect(densities.filter(n=>n<.22).length).toBeGreaterThan(65);
  const dense=generateEndlessStars(seed,feature.x,feature.y),sparse=generateEndlessStars(seed,-40,30);
  expect(dense.length).toBeGreaterThan(sparse.length*4);expect(dense.length).toBeLessThanOrEqual(ENDLESS_STAR_TILE_LIMIT);
  expect(dense.filter(s=>s.brightness<.25&&s.size<.8).length).toBeGreaterThan(dense.length*.6);
 });
 it('keeps exact stellar positions and properties when neighboring sectors aggregate into coarser LODs',()=>{
  for(const [tx,ty,span] of [[6,-2,4096],[-3,4,8192],[0,0,65536]]) {
   const fine=[0,1].flatMap(y=>[0,1].flatMap(x=>generateEndlessStars(seed,tx*2+x,ty*2+y,span/2)));
   const byPosition=new Map(fine.map(s=>[`${s.x},${s.y}`,s])),coarse=generateEndlessStars(seed,tx,ty,span);
   expect(coarse.length).toBeGreaterThan(10);expect(coarse.length).toBeLessThanOrEqual(ENDLESS_STAR_TILE_LIMIT);
   for(const star of coarse)expect(byPosition.get(`${star.x},${star.y}`)).toEqual(star);
  }
 });
 it('bounds star generation at extreme LODs without filling the skipped world sectors',()=>{
  for(const span of [2048,4096,65536,2048*2**20,3000]) {
   const stars=generateEndlessStars(seed,-2,3,span);expect(stars.length).toBeLessThanOrEqual(ENDLESS_STAR_TILE_LIMIT);
   expect(new Set(stars.map(s=>`${s.x},${s.y}`)).size).toBe(stars.length);
   for(const s of stars){expect(s.x).toBeGreaterThanOrEqual(-2*span);expect(s.x).toBeLessThan(-span);expect(s.y).toBeGreaterThanOrEqual(3*span);expect(s.y).toBeLessThan(4*span);}
  }
  expect(generateEndlessStars(seed,0,0,Infinity)).toEqual([]);expect(generateEndlessStars(seed,0,0,0)).toEqual([]);
 });
 it('keeps opacity, activity and fixed star metadata bounded',()=>{
  const tile=generateEndlessTile(seed,13,-3,2048,32);expect(tile.pixels).toHaveLength(34*34*4);expect(tile.activity).toHaveLength(tile.pixels.length);
  for(let i=3;i<tile.pixels.length;i+=4)expect(tile.pixels[i]).toBe(255);
  expect(tile.activity.some((v,i)=>i%4===3&&v>0)).toBe(true);
  const stars=generateEndlessStars(seed,-2,3);
  for(const star of stars){expect(star.x).toBeGreaterThanOrEqual(-4096);expect(star.x).toBeLessThan(-2048);expect(star.y).toBeGreaterThanOrEqual(6144);expect(star.y).toBeLessThan(8192);expect(star.brightness).toBeLessThanOrEqual(1);expect(star.size).toBeGreaterThan(0);}
 });
});
