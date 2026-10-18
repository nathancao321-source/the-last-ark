import {describe,it,expect,vi} from 'vitest';
import {createGame} from '../src/game/game';
import {solarSystem} from '../src/levels/solar-system';
import {blackHoleLevel} from '../src/levels/black-hole';
import {CINEMATIC_ART,levelArt} from '../src/render/spacetime/art';
import {createVisualState,syncVisualPositions} from '../src/render/spacetime/model';
import {updateCelestialVisuals} from '../src/render/celestial-events';
import {portalParticle} from '../src/render/portal-art';
import {render} from '../src/render/canvas';
import {createCamera} from '../src/camera/camera';
import {DEFAULT_WARP} from '../src/render/spacetime/config';
const calls=vi.hoisted(()=>[] as string[]);
vi.mock('../src/render/spacetime/renderer',()=>({drawSpaceBackdrop:()=>{},drawCinematicNodes:()=>{}}));
vi.mock('../src/render/stellar-art',()=>({drawStellarArt:()=>calls.push('star')}));
vi.mock('../src/render/black-hole-art',()=>({drawBlackHoleArt:()=>calls.push('hole')}));
vi.mock('../src/render/portal-art',async original=>({...await original<typeof import('../src/render/portal-art')>(),drawPortalArt:()=>calls.push('portal')}));
vi.mock('../src/render/hazards',()=>({drawHazards:()=>calls.push('hazards'),drawHazardImpact:()=>{},drawHazardColliders:()=>{}}));
describe('celestial layer and read-only contracts',()=>{
 it('grades only the solar backdrop and preserves the abyss preset',()=>{
  const solar=levelArt(CINEMATIC_ART,solarSystem.id);expect(solar.nebula).toBe(1.2);expect(solar.exposure).toBeCloseTo(1.2);expect(solar.nodeEnergy).toBe(1.8);expect(levelArt(CINEMATIC_ART,blackHoleLevel.id)).toBe(CINEMATIC_ART);expect(CINEMATIC_ART.nebula).toBe(2);expect(CINEMATIC_ART.exposure).toBe(1.6);
 });
 it.each([solarSystem,blackHoleLevel])('draws $id material before jets, prediction and the ship',level=>{
  const g=createGame(level),v=createVisualState(g.players),c=createCamera(g.bodies[0].position,1600,900);c.zoom=.1;calls.length=0;
  const ctx=new Proxy({},{get:(_t,k)=>k==='createRadialGradient'||k==='createLinearGradient'?()=>({addColorStop:()=>{}}):k==='setLineDash'?(p:number[])=>{if(p[0]===5/c.zoom)calls.push('trajectory');}:k==='fillText'?(t:string)=>{if(t==='方舟')calls.push('ship');}:()=>{},set:()=>true}) as CanvasRenderingContext2D;
  render(ctx,g,{points:[{x:0,y:0},{x:5000,y:0}],seconds:10,outcome:'horizon'},c,{enhanced:true,visuals:v,renderer:{} as never,art:CINEMATIC_ART,warp:DEFAULT_WARP});
  for(const material of ['portal',level===solarSystem?'star':'hole']){expect(calls).toContain(material);expect(calls.indexOf(material)).toBeLessThan(calls.indexOf('hazards'));expect(calls.indexOf(material)).toBeLessThan(calls.indexOf('trajectory'));expect(calls.indexOf(material)).toBeLessThan(calls.indexOf('ship'));}
  expect(calls.filter(x=>x==='hazards')).toHaveLength(1);
 });
 it('keeps events read-only, freezes paused entry and clears all remnants on retry',()=>{
  const g=createGame(solarSystem),v=createVisualState(g.players);updateCelestialVisuals(v,g,0);
  const sun=g.bodies.find(b=>b.id==='sun')!;sun.stellarState={status:'neutron',blueSeconds:3,goldSeconds:0};sun.radius=32;g.elapsed=12;
  const before=structuredClone(g);updateCelestialVisuals(v,g,1/60);expect(g).toEqual(before);expect(v.celestial!.stars.sun.changedAt).toBe(12);
  const portal=g.bodies.find(b=>b.kind==='wormhole')!;g.bodies[0].position={...portal.position};g.phase='completed';updateCelestialVisuals(v,g,1/60);expect(v.celestial!.entry).toBeDefined();
  g.phase='paused';const age=v.celestial!.entry!.age;updateCelestialVisuals(v,g,10);expect(v.celestial!.entry!.age).toBe(age);
  syncVisualPositions(v,g.players,1);expect(v.celestial).toBeUndefined();expect(v.portals).toBeUndefined();expect(v.hazardWave).toBeUndefined();
 });
 it('keeps inward portal particles bounded and invisible at wrap',()=>{
  for(let n=0;n<42;n++)for(let t=0;t<30;t+=.13){const p=portalParticle(n,t,130);expect(Math.hypot(p.x,p.y)).toBeLessThanOrEqual(130);expect(p.alpha).toBeGreaterThanOrEqual(0);expect(p.alpha).toBeLessThanOrEqual(1);}
 });
});
