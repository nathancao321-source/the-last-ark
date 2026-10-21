import {describe,it,expect} from 'vitest';
import {lensProject,lensSample,lensDisplacement} from '../src/render/spacetime/lensing';
const lens={position:{x:1300,y:-50},coreRadius:100,influenceRadius:900,strength:1.6};
describe('shared background light mapping',()=>{
 it('uses mutually inverse star projection and nebula samples',()=>{
  for(let r=0;r<1200;r+=13)for(let angle=0;angle<6.28;angle+=.8){const p={x:lens.position.x+r*Math.cos(angle),y:lens.position.y+r*Math.sin(angle)},q=lensSample(lensProject(p,lens),lens);expect(Math.hypot(p.x-q.x,p.y-q.y)).toBeLessThan(.002);}
 });
 it('has finite, outward, monotone deformation and a smooth finite boundary',()=>{
  let previous=-1;
  for(let r=0;r<=1200;r+=.5){const p={x:lens.position.x+r,y:lens.position.y},q=lensProject(p,lens),d=lensDisplacement(p,lens);expect(Number.isFinite(q.x+q.y)).toBe(true);expect(q.x).toBeGreaterThan(previous);expect(d.x).toBeGreaterThanOrEqual(0);expect(d.x).toBeLessThan(180);previous=q.x;}
  expect(lensDisplacement({x:2200,y:-50},lens)).toEqual({x:0,y:0});expect(lensDisplacement({x:2199.99,y:-50},lens).x).toBeLessThan(.00001);
 });
 it('is translation invariant without mutating source coordinates',()=>{
  const p={x:1450,y:200},before=structuredClone({p,lens}),q=lensProject(p,lens),delta={x:-500,y:820};
  const moved=lensProject({x:p.x+delta.x,y:p.y+delta.y},{...lens,position:{x:lens.position.x+delta.x,y:lens.position.y+delta.y}});expect(moved.x).toBeCloseTo(q.x+delta.x,10);expect(moved.y).toBeCloseTo(q.y+delta.y,10);expect({p,lens}).toEqual(before);
 });
});
