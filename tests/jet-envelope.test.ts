import {describe,it,expect} from 'vitest';
import {jetGeometry,jetParticle,jetSpatialFade,jetVisualIntensity,jetVisualEnvelope} from '../src/game/hazard-geometry';
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
