import {describe,it,expect} from 'vitest';
import {createGame} from '../src/game/game';
import {updateHazards} from '../src/game/hazards';
import {jetGeometry,jetParticle,waveGeometry} from '../src/game/hazard-geometry';
import {blackHoleLevel} from '../src/levels/black-hole';
import {solarSystem} from '../src/levels/solar-system';
import {drawHazards} from '../src/render/hazards';
import {createCamera} from '../src/camera/camera';

describe('authoritative hazard rendering contract',()=>{
 it.each([.1,.4,1.2])('uses continuous warning geometry without any nonempty dash at zoom %s',zoom=>{
  const g=createGame(blackHoleLevel);g.phase='running';g.elapsed=4;g.bodies[0].position={x:0,y:-10000};updateHazards(g,[],0);
  const dash:number[][]=[];const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,key)=>key==='createLinearGradient'?()=>({addColorStop:()=>{}}):key==='setLineDash'?(d:number[])=>dash.push(d):()=>{},set:()=>true});
  const c=createCamera({x:1300,y:0},1280,720);c.zoom=zoom;drawHazards(ctx,g,c,true,'high');expect(dash.length).toBeGreaterThan(0);expect(dash.every(d=>d.length===0)).toBe(true);expect(g.health!.current).toBe(100);
 });
 it.each([15,20,25,30])('uses actual coordinates and %s second travel for both boundaries',travel=>{
  const g=createGame(solarSystem);g.level.solarWave!.shockwaveTravelTime=travel;
  const sun=g.bodies.find(b=>b.id==='sun')!,exit=g.bodies.find(b=>b.id===g.level.solarWave!.exitId)!;
  sun.position={x:123,y:-456};exit.position={x:2123,y:2544};sun.radius=87;
  g.bodies[0].position={x:-10000,y:-10000};g.phase='running';g.elapsed=50;updateHazards(g,[],1/60);
  const w=g.hazards!.wave!,distance=Math.hypot(2000,3000);
  expect(w.speed).toBeCloseTo((distance-87)/travel);
  for(const fraction of [0,.2,.6,1]){g.elapsed=50+travel*fraction;updateHazards(g,[],1/60);const band=waveGeometry(w);expect(band.outer).toBeCloseTo(87+(distance-87)*fraction);expect(band.inner).toBeCloseTo(Math.max(0,band.outer-w.thickness));}
  expect(w.front).toBeCloseTo(distance);
 });
 it.each(['low','medium','high','off'])('paints the entire shared core immediately at firing start in %s',quality=>{
  const g=createGame(blackHoleLevel),config=g.level.blackHoleJets!;g.phase='running';g.elapsed=5;g.bodies[0].position={x:0,y:-10000};updateHazards(g,[],1/60);
  const geometry=g.hazards!.jet!.geometry!;expect(geometry.damaging).toBe(true);expect(geometry.progress).toBe(0);
  const strokes:{width:number;cap:string;alpha:number;points:number[][]}[]=[],props:Record<string,unknown>={};let points:number[][]=[];
  const ctx=new Proxy(props,{get:(target,key)=>{if(key==='createLinearGradient')return ()=>({addColorStop:()=>{}});if(key==='beginPath')return ()=>{points=[];};if(key==='moveTo'||key==='lineTo')return (...p:number[])=>points.push(p);if(key==='stroke')return ()=>strokes.push({width:target.lineWidth as number,cap:target.lineCap as string,alpha:target.globalAlpha as number,points:[...points]});return target[key as string]??(()=>{});},set:(t,k,v)=>{t[k as string]=v;return true;}}) as unknown as CanvasRenderingContext2D;
  // Editing level config after a simulation snapshot cannot change the rendered geometry.
  config.length=17;config.coreRadius=1;const camera=createCamera({x:1300,y:0},1600,1600);camera.zoom=.5;
  drawHazards(ctx,g,camera,quality!=='off',quality);
  const cores=strokes.filter(s=>s.width===48);expect(cores).toHaveLength(2);for(const core of cores){expect(core.cap).toBe('round');expect(core.alpha).toBeGreaterThanOrEqual(.56);expect(core.points).toEqual([[0,0],[0,geometry.beams[0].length]]);}
 });
 it('anchors both particle roots and axis to the physical poles',()=>{
  const geometry=jetGeometry({x:501,y:-91},100,blackHoleLevel.blackHoleJets!,{phase:'firing',cycle:7,progress:0});
  for(const beam of geometry.beams){expect(jetParticle(beam,0,0)).toEqual(beam.start);for(let i=0;i<100;i++){const p=jetParticle(beam,i,i*.019);expect(Math.abs(p.x-beam.start.x)).toBeLessThanOrEqual(beam.coreRadius*.35);expect((p.y-beam.start.y)*beam.direction).toBeGreaterThanOrEqual(0);expect((p.y-beam.start.y)*beam.direction).toBeLessThanOrEqual(beam.length);}}
 });
 it('keeps the lethal contact visible when CCD crosses the firing-to-fade boundary',()=>{
  const g=createGame(blackHoleLevel);g.phase='running';g.elapsed=5.81;g.health!.current=50;g.bodies[0].position={x:1300,y:-600};
  const result=updateHazards(g,[{from:{x:1300,y:-600},to:{x:1300,y:-600},start:0,end:.02}],.02);
  expect(result).toContain('失效');expect(g.hazards!.jet!.phase).toBe('firing');expect(g.hazards!.jet!.geometry!.damaging).toBe(true);expect(g.hazards!.jet!.geometry!.intensity).toBe(1);
 });
 it.each([4.999,5.8,6.1,6.6])('keeps the nonfiring snapshot harmless at %s',time=>{
  const g=createGame(blackHoleLevel);g.phase='running';g.elapsed=time;g.bodies[0].position={x:1300,y:600};updateHazards(g,[],0);expect(g.health!.current).toBe(100);expect(g.hazards!.jet!.geometry!.damaging).toBe(false);
 });
});
