import {describe,it,expect,vi} from 'vitest';
import {ACCRETION,accretionCoordinates,accretionRate,rearHeight,bakeAccretion} from '../src/render/accretion-model';
import {createGame} from '../src/game/game';
import {blackHoleLevel} from '../src/levels/black-hole';
const recorded=vi.hoisted(()=>({times:[] as number[]}));
vi.mock('../src/render/accretion-cache',()=>({prepareAccretion:(time:number)=>{recorded.times.push(time);return {surfaces:['rear','disc','rim'].map(name=>({canvas:{name}}))};}}));
import {drawBlackHoleArt} from '../src/render/black-hole-art';
describe('centered accretion structure and flow',()=>{
 it('attaches the bent inner image to the same capture circle without a gap',()=>{
  expect(ACCRETION.inner).toBeGreaterThan(1);expect(ACCRETION.inner).toBeLessThan(1.02);
  for(const x of [-.9,-.5,0,.5,.9])expect(Math.hypot(x,rearHeight(x,ACCRETION.inner))).toBeCloseTo(ACCRETION.inner,10);
  for(let a=0;a<Math.PI*2;a+=.1)expect(accretionCoordinates('rim',Math.cos(a)*1.025,Math.sin(a)*1.025)?.coverage).toBeGreaterThan(.9);
 });
 it('excludes the entire fatal core from every material image',()=>{
  for(const name of ['rear','disc','rim'] as const)for(let a=0;a<Math.PI*2;a+=.2)for(const r of [0,.5,.99])expect(accretionCoordinates(name,Math.cos(a)*r,Math.sin(a)*r)).toBeUndefined();
 });
 it('uses continuous faster inner motion and monotonic rear radial mapping',()=>{
  expect(accretionRate(ACCRETION.inner)/accretionRate(ACCRETION.outer)).toBeGreaterThan(10);
  for(let r=1.02;r<4.8;r+=.02)expect(accretionRate(r+.01)).toBeLessThan(accretionRate(r));
  for(const x of [0,.5,1,2,3,4])for(let r=Math.max(Math.abs(x),ACCRETION.inner)+.01;r<4.79;r+=.02)expect(rearHeight(x,r+.01)).toBeGreaterThanOrEqual(rearHeight(x,r));
 });
 it('bakes deterministic periodic material and finite bounded lookup layers',()=>{
  const a=bakeAccretion(),b=bakeAccretion();expect(a.material).toEqual(b.material);expect(a.layers.map(x=>x.name)).toEqual(['rear','disc','rim']);
  for(let row=0;row<ACCRETION.rows;row++){const i=row*ACCRETION.columns;expect(Math.abs(a.material[i]-a.material[i+ACCRETION.columns-1])).toBeLessThan(.035);}
  for(const layer of a.layers){expect(layer.indices.length).toBeGreaterThan(1000);expect(layer.indices.length).toBeLessThan(ACCRETION.width*ACCRETION.height);expect(layer.rows.every(r=>r>=0&&r<=127)).toBe(true);expect(layer.coverage.every(c=>c>=0&&c<=1)).toBe(true);}
 });
 it('applies one body origin to every layer, shares simulation time and masks core last',()=>{
  const g=createGame(blackHoleLevel),body=g.bodies.find(b=>b.kind==='black_hole')!,before=structuredClone(g),ops:{name:string;args:unknown[]}[]=[];recorded.times.length=0;
  const ctx=new Proxy({},{get:(_t,k)=>(...args:unknown[])=>ops.push({name:String(k),args}),set:()=>true}) as CanvasRenderingContext2D;
  drawBlackHoleArt(ctx,body,12.75,'high');expect(recorded.times).toEqual([12.75]);expect(ops.filter(o=>o.name==='translate')).toEqual([{name:'translate',args:[1300,0]}]);
  const draws=ops.filter(o=>o.name==='drawImage').slice(-3);expect(draws).toHaveLength(3);expect(draws.every(o=>JSON.stringify(o.args.slice(1))===JSON.stringify(draws[0].args.slice(1)))).toBe(true);
  const core=ops.find(o=>o.name==='arc')!;expect(core.args.slice(0,3)).toEqual([0,0,100]);const names=ops.map(o=>o.name);expect(names.lastIndexOf('fill')).toBeGreaterThan(names.lastIndexOf('drawImage'));expect(g).toEqual(before);
 });
});
