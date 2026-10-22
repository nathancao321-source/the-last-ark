import {describe,it,expect} from 'vitest';
import {JET_TAIL_PROFILE,jetGeometry,jetParticle,jetSpatialFade,jetTailEnvelope,jetVisualIntensity,jetVisualEnvelope} from '../src/game/hazard-geometry';
import {blackHoleLevel} from '../src/levels/black-hole';
import {createGame} from '../src/game/game';
import {updateHazards} from '../src/game/hazards';
describe('readable jet core and harmless fading tail',()=>{
 it('keeps the existing lethal endpoints and a readable envelope until their rounded caps',()=>{
  const g=jetGeometry({x:1300,y:0},100,blackHoleLevel.blackHoleJets!,{phase:'firing',cycle:1,progress:0});
  for(const b of g.beams){expect(b.length).toBe(2400);expect(b.visualLength).toBe(3360);expect(b.end.y).toBe(b.direction*2500);expect(jetSpatialFade(b.length+b.coreRadius,b.visualLength)).toBeGreaterThan(.50);expect(jetSpatialFade(b.visualLength,b.visualLength)).toBe(0);}
 });
 it('has no sudden intensity changes at the phase boundaries and keeps firing readable',()=>{
  const value=(phase:'warning'|'firing'|'dissipating',progress:number)=>jetVisualIntensity({phase,progress});
  expect(value('warning',0)).toBe(0);expect(value('warning',1)).toBe(value('firing',0));expect(value('firing',1)).toBe(value('dissipating',0));expect(value('dissipating',1)).toBe(0);
  for(let i=0;i<=100;i++)expect(value('firing',i/100)).toBeGreaterThanOrEqual(.56);
  expect(jetVisualEnvelope({phase:'warning',progress:1})).toEqual(jetVisualEnvelope({phase:'firing',progress:0}));
  expect(jetVisualEnvelope({phase:'firing',progress:1})).toEqual(jetVisualEnvelope({phase:'dissipating',progress:0}));
  for(let i=0;i<=100;i++)expect(jetVisualEnvelope({phase:'firing',progress:i/100}).width).toBe(1);
 });
 it('continues outward particle motion across warning/firing/dissipating, with full tail coverage',()=>{
  const b=jetGeometry({x:1300,y:0},100,blackHoleLevel.blackHoleJets!,{phase:'firing',cycle:1,progress:.5}).beams[1];
  for(const t of [4.999,5,5.799,5.8,6]){let tail=0;for(let i=0;i<48;i++){
   const p=jetParticle(b,i,t,true),q=jetParticle(b,i,t+.001,true),distance=p.y-b.start.y;
   if(distance>b.length)tail++;if(q.y>=p.y)expect(q.y-p.y).toBeCloseTo(.58,7);
  }expect(tail).toBeGreaterThan(8);}
 });
 it('deals 50% in the visible terminal core but none in the decorative tail, on both poles',()=>{
  for(const sign of [-1,1])for(const [distance,health]of [[2450,50],[2600,100],[3000,100]]){
   const g=createGame(blackHoleLevel);g.phase='running';g.elapsed=5.1;g.bodies[0].position={x:1300,y:sign*distance};updateHazards(g,[],.01);expect(g.health!.current).toBe(health);
  }
 });
});

describe('continuous spatial jet taper',()=>{
 const beams=jetGeometry({x:1300,y:0},100,blackHoleLevel.blackHoleJets!,{phase:'firing',cycle:1,progress:.5}).beams;
 it('narrows and dims monotonically to zero, without a tip dot or residual line',()=>{
  for(const b of beams){
   let previous=jetTailEnvelope(b,0);
   for(let s=1;s<=b.visualLength;s++){
    const e=jetTailEnvelope(b,s);
    for(const value of Object.values(e))expect(Number.isFinite(value)&&value>=0).toBe(true);
    expect(e.width).toBeLessThanOrEqual(previous.width);expect(e.alpha).toBeLessThanOrEqual(previous.alpha);expect(e.filament).toBeLessThanOrEqual(previous.filament);
    previous=e;
   }
   const tip=jetTailEnvelope(b,b.visualLength);expect(tip).toEqual({width:0,alpha:0,filament:0,coreRadius:0,particleAlpha:0});
   expect(jetTailEnvelope(b,b.visualLength-1).width).toBeLessThan(.00001);
  }
 });
 it('protects the complete lethal capsule and fades over a substantial harmless tail',()=>{
  for(const b of beams){
   for(let s=0;s<=b.length+b.coreRadius;s++){
    const e=jetTailEnvelope(b,s);expect(e.coreRadius).toBeGreaterThanOrEqual(b.coreRadius-1e-10);expect(e.alpha).toBeGreaterThanOrEqual(JET_TAIL_PROFILE.coreAlpha);
   }
   const safe=b.length+b.coreRadius;
   expect(b.visualLength-safe).toBeGreaterThan(900);
   expect(jetTailEnvelope(b,safe+(b.visualLength-safe)/2).width).toBeGreaterThan(.3);
   expect(jetTailEnvelope(b,safe+(b.visualLength-safe)/2).width).toBeLessThan(.5);
  }
 });
 it('is C1 smooth at taper start, the complete damage cap, and the visual end',()=>{
  for(const b of beams)for(const s of [b.length*JET_TAIL_PROFILE.filamentStart,b.length*JET_TAIL_PROFILE.taperStart,b.length+b.coreRadius,b.visualLength]){
   const a=jetTailEnvelope(b,s-.01),c=jetTailEnvelope(b,s),d=jetTailEnvelope(b,s+.01);
   for(const key of ['width','alpha','filament'] as const){expect(Math.abs(a[key]-c[key])).toBeLessThan(.00002);expect(Math.abs((c[key]-a[key])/.01-(d[key]-c[key])/.01)).toBeLessThan(1e-6);}
  }
 });
 it('uses symmetric world-space widths and constrains particle spread on both poles',()=>{
  for(let s=0;s<=beams[0].visualLength;s+=7)expect(jetTailEnvelope(beams[0],s)).toEqual(jetTailEnvelope(beams[1],s));
  for(let i=0;i<48;i++)for(const age of [0,4.999,5,5.8,6.1]){
   const a=jetParticle(beams[0],i,age,true),b=jetParticle(beams[1],i,age,true),s=b.y-beams[1].start.y;
   expect(a.x).toBe(b.x);expect(a.y).toBe(-b.y);
   expect(Math.abs(b.x-beams[1].start.x)).toBeLessThanOrEqual(beams[1].coreRadius*.35*jetTailEnvelope(beams[1],s).width+1e-10);
  }
 });
 it('keeps the same shape at phase boundaries and fades particles before wrapping',()=>{
  const b=beams[0];
  for(const [a,z]of [[{phase:'warning',progress:1},{phase:'firing',progress:0}],[{phase:'firing',progress:1},{phase:'dissipating',progress:0}]] as const){
   for(let s=0;s<=b.visualLength;s+=37){const e=jetTailEnvelope(b,s),x=jetVisualEnvelope(a),y=jetVisualEnvelope(z);expect(e.width*x.width).toBe(e.width*y.width);expect(e.alpha*x.opacity).toBe(e.alpha*y.opacity);}
  }
  expect(jetTailEnvelope(b,0).particleAlpha).toBe(0);
  expect(jetTailEnvelope(b,.01).particleAlpha).toBeLessThan(1e-7);
  expect(jetTailEnvelope(b,b.visualLength-.01).particleAlpha).toBeLessThan(1e-7);
 });
 it('stays finite for clamped distances and degenerate visual lengths',()=>{
  for(const distance of [-Infinity,-1,0,1,10000,Infinity,NaN])for(const b of [beams[0],{...beams[0],length:0,visualLength:0,coreRadius:0}])for(const value of Object.values(jetTailEnvelope(b,distance)))expect(Number.isFinite(value)&&value>=0).toBe(true);
 });
});
