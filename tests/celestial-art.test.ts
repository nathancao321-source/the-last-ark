import {describe,it,expect} from 'vitest';
import {celestialPixels,granulation} from '../src/render/celestial-texture';
import {solarActivity} from '../src/render/stellar-art';
describe('cached celestial materials',()=>{
 it('bakes deterministic textured warm and cool discs, not white fills',()=>{
  for(const kind of ['sun','neutron'] as const){const p=celestialPixels(kind,96,96);expect(p).toEqual(celestialPixels(kind,96,96));let white=0,opaque=0;const colors=new Set();for(let i=0;i<p.length;i+=4)if(p[i+3]>250){opaque++;if(Math.min(p[i],p[i+1],p[i+2])>245)white++;colors.add(p.slice(i,i+3).join(','));}expect(white/opaque).toBeLessThan(.01);expect(colors.size).toBeGreaterThan(500);}
 });
 it('keeps detailed corona and disc out of the absolute black danger core',()=>{
  for(const kind of ['corona','cold-corona','accretion'] as const){const p=celestialPixels(kind,96,96);expect(p[(48*96+48)*4+3]).toBe(0);expect(p.some((v,i)=>i%4===3&&v>0)).toBe(true);}
 });
 it('uses bounded smooth activity with irregular independent periods',()=>{
  for(let t=0;t<60;t+=.02){expect(Math.abs(solarActivity(t,2)-solarActivity(t+.02,2))).toBeLessThan(.05);expect(granulation(t,.3)).toBeGreaterThanOrEqual(0);}
  expect(Array.from({length:100},(_,i)=>solarActivity(i/10,1))).not.toEqual(Array.from({length:100},(_,i)=>solarActivity(i/10,2)));
 });
});
