import { describe,it,expect } from 'vitest';
import { firstLevel } from '../src/levels/first';
import { createGame,stepGame } from '../src/game/game';
import { NO_CONTROLS } from '../src/input/intent';
import { createCamera } from '../src/camera/camera';
import { fieldAcceleration } from '../src/physics/fields';
import { createVisualState,syncVisualPositions,updateVisuals,sampleDisturbance,lookupForce } from '../src/render/spacetime/model';
import { createDemoRenderer,drawDemo } from '../src/render/spacetime/renderer';
import { DEFAULT_WARP,parseWarp,setParameter } from '../src/render/spacetime/config';
import type { WarpConfig } from '../src/render/spacetime/config';
import { FixedClock } from '../src/game/clock';
import { applyPlayerIntent } from '../src/physics/player';
const config=():WarpConfig=>({...DEFAULT_WARP,idle:0,interaction:false});
function fixture() {
  const players=structuredClone(firstLevel.players);players[0].position={x:-165,y:0};players[1].position={x:165,y:0};
  const state=createVisualState(players);state.sources.forEach(s=>s.weight=1);return {players,state};
}
const sample=(state:ReturnType<typeof createVisualState>,x:number,y:number,c=config(),zoom=1)=>sampleDisturbance({dx:0,dy:0,luminance:0},x,y,state,c,zoom);
function recorder() {
  const commands:unknown[][]=[];
  const ctx=new Proxy({} as CanvasRenderingContext2D,{get:(_t,key)=> (...args:unknown[])=>{commands.push([key,...args]);},set:(_t,key,value)=>{commands.push(['set',key,value]);return true;}});
  return {ctx,commands};
}
function cachedRenderer() {const r=createDemoRenderer(),s={} as HTMLCanvasElement;r.cache={dark:s,light:s,blue:s,gold:s};return r;}
describe('read-only spacetime visual model',()=>{
  it('mirrors paused node transforms without advancing or mutating the players',()=>{
    const {players,state}=fixture();players[0].position={x:91,y:-37};players[0].field={...players[0].field,radius:321};const before=structuredClone(players);
    syncVisualPositions(state,players,0);expect(state.sources[0].position).toEqual({x:91,y:-37});expect(state.sources[0].field.radius).toBe(321);expect(state.time).toBe(0);expect(players).toEqual(before);
  });
  it('samples the existing physical field with a bounded interpolation error',()=>{
    const {state}=fixture();for(const s of state.sources)for(let i=1;i<600;i++) {
      const d=s.field.radius*i/600,exact=Math.hypot(...Object.values(fieldAcceleration({x:s.position.x+d,y:s.position.y},s.position,s.field)));
      expect(Math.abs(lookupForce(s,d)-exact)).toBeLessThan(0.12);
    }
  });
  it('attracts inward, repels outward, and cancels equal opposite fields before compression',()=>{
    const {state}=fixture();state.sources[1].weight=0;expect(sample(state,-85,0).dx).toBeLessThan(0);
    state.sources[1].weight=1;state.sources[0].weight=0;expect(sample(state,245,0).dx).toBeGreaterThan(0);
    const [a,b]=state.sources;a.weight=1;b.position={...a.position};b.field={...a.field,polarity:-1};b.table=a.table;
    const result=sample(state,-85,50);expect(result.dx).toBeCloseTo(0,12);expect(result.dy).toBeCloseTo(0,12);
  });
  it('preserves direction and output when source order changes',()=>{
    const {state}=fixture(),before=sample(state,25,80);state.sources.reverse();const after=sample(state,25,80);
    expect(after.dx).toBeCloseTo(before.dx,10);expect(after.dy).toBeCloseTo(before.dy,10);expect(after.luminance).toBeCloseTo(before.luminance,10);
  });
  it('is continuous at field centers and boundaries even during fade',()=>{
    const {state}=fixture();state.sources[1].weight=0;const s=state.sources[0];
    for(const weight of [0.01,0.2,0.8,1]){s.weight=weight;const a=sample(state,s.position.x-1e-6,0),b=sample(state,s.position.x+1e-6,0);expect(Math.hypot(a.dx-b.dx,a.dy-b.dy)).toBeLessThan(0.001);}
    const edge=sample(state,s.position.x+s.field.radius-1e-4,0);expect(Math.abs(edge.dx)).toBeLessThan(0.001);
    expect(sample(state,s.position.x+s.field.radius,0)).toEqual({dx:0,dy:0,luminance:0});
  });
  it('bounds displacement and luminance including tiny zoom and zero amplitudes',()=>{
    const {state}=fixture();for(const zoom of [1e-8,0.1,1,2])for(let x=-450;x<450;x+=17)for(let y=-300;y<300;y+=37) {
      const s=sample(state,x,y,config(),zoom);expect(Math.hypot(s.dx,s.dy)).toBeLessThanOrEqual(Math.min(24,22.4*zoom)+1e-12);expect(s.luminance).toBeGreaterThanOrEqual(-0.1);expect(s.luminance).toBeLessThanOrEqual(0.06);
    }
    expect(sample(state,0,80,{...config(),maxDisplacement:0,folds:0})).toEqual({dx:0,dy:0,luminance:0});
  });
  it('activation emits once, shares an event across both channels, then settles without looping',()=>{
    const {players}=fixture(),state=createVisualState(players),c={...config(),interaction:true};players[0].active=true;
    for(let i=0;i<12;i++)updateVisuals(state,players,'running',0,1/60,c);
    const a=sample(state,-95,30,c),b=sample(state,-95,30,{...c,interaction:false});
    expect(a.dx).not.toBe(b.dx);expect(a.luminance).not.toBe(b.luminance);expect(state.emitted).toBe(1);
    for(let i=0;i<600;i++)updateVisuals(state,players,'running',0,1/60,c);
    expect(state.emitted).toBe(1);expect(state.events.every(e=>!e.alive)).toBe(true);
    const before=sample(state,-95,30,c);players[0].active=false;updateVisuals(state,players,'running',0,1/60,c);
    expect(Math.abs(sample(state,-95,30,c).dx-before.dx)).toBeLessThan(1);
  });
  it('motion events are bounded and retain their world origin after the node leaves',()=>{
    const {players}=fixture(),state=createVisualState(players),c={...config(),interaction:true};players[0].active=true;
    updateVisuals(state,players,'running',0,1/60,c);const origin={...state.events[0].origin};players[0].velocity.x=260;
    for(let i=0;i<300;i++){players[0].position.x+=260/60;updateVisuals(state,players,'running',0,1/60,c);expect(state.events.filter(e=>e.alive).length).toBeLessThanOrEqual(4);if(i===1)expect(state.events[0].origin).toEqual(origin);}
    expect(state.emitted).toBeGreaterThan(1);
  });
  it.each(['ready','paused','failed','completed'] as const)('freezes during %s and resets by revision',phase=>{
    const {players,state}=fixture(),before=structuredClone(state);updateVisuals(state,players,phase,0,0.1,config());expect(state).toEqual(before);
    updateVisuals(state,players,phase,1,0.1,config());expect(state.time).toBe(0);expect(state.sources.every(s=>s.weight===0)).toBe(true);
  });
  it('uses identical node dynamics at 30, 60 and 144 rendering FPS',()=>{
    const runs=[30,60,144].map(fps=>{const {players}=fixture(),state=createVisualState(players),clock=new FixedClock();
      for(let frame=0;frame<fps*2;frame++)clock.advance(1/fps,()=>{players.forEach(p=>applyPlayerIntent(p,{moveX:1,moveY:0,abilityActive:true},1/60));updateVisuals(state,players,'running',0,1/60,config());});return {players,state};});
    expect(runs[0]).toEqual(runs[1]);expect(runs[1]).toEqual(runs[2]);
  });
});
describe('rendering gates and integration contracts',()=>{
  it('imports in Node, creates deterministic stars and clamps invalid URL controls',()=>{
    expect(createDemoRenderer().stars).toEqual(createDemoRenderer().stars);
    const c=parseWarp('?fx=off&folds=Infinity&decay=-9&idle=9');expect(c.quality).toBe('off');expect(c.decay).toBe(0.25);expect(c.idle).toBe(0.004);expect(c.folds).toBe(DEFAULT_WARP.folds);
    setParameter(c,'folds',NaN);expect(c.folds).toBe(DEFAULT_WARP.folds);
  });
  it('off is an identical baseline regardless of field/visual state, with no cache, sampling or advanced compositing',()=>{
    const {players,state}=fixture(),camera=createCamera({x:0,y:0}),c={...config(),quality:'off' as const},r=createDemoRenderer(),a=recorder(),b=recorder();
    drawDemo(a.ctx,r,players,camera,state,c);players.forEach(p=>p.active=true);state.time=123;
    drawDemo(b.ctx,r,players,camera,state,c);expect(a.commands).toEqual(b.commands);expect(r.cache).toBeUndefined();expect(r.stats.samples).toBe(0);
    expect(a.commands.some(row=>row.includes('lighter'))).toBe(false);expect(a.commands.some(row=>row[0]==='drawImage')).toBe(false);
  });
  it('gates non-additive folds independently and never mutates game or camera',()=>{
    const game=createGame(firstLevel),camera=createCamera({x:500,y:300});game.phase='running';game.players.forEach(p=>p.active=true);
    const state=createVisualState(game.players),r=cachedRenderer(),record=recorder(),c=config();
    for(let i=0;i<120;i++)updateVisuals(state,game.players,game.phase,0,1/60,c);
    const before=structuredClone(game),cam=structuredClone(camera);drawDemo(record.ctx,r,game.players,camera,state,c);expect(game).toEqual(before);expect(camera).toEqual(cam);expect(r.stats.cells).toBeGreaterThan(0);
    drawDemo(record.ctx,r,game.players,camera,state,{...c,luminance:false});expect(r.stats.cells).toBe(0);
    const control=structuredClone(game);for(let i=0;i<60;i++){stepGame(game,NO_CONTROLS);updateVisuals(state,game.players,game.phase,0,1/60,c);stepGame(control,NO_CONTROLS);}expect(game).toEqual(control);
  });
  it.each(['medium','high'] as const)('%s bounds mesh submissions even with distant moving sources and events',quality=>{
    const {players}=fixture(),state=createVisualState(players),r=cachedRenderer(),c={...config(),quality,interaction:true},record=recorder(),camera=createCamera({x:0,y:0},1920,1080);
    camera.zoom=0.35;players.forEach(p=>{p.active=true;p.velocity.x=260;});
    for(let i=0;i<500;i++) {
      players[0].position.x+=4;players[1].position.x-=4;updateVisuals(state,players,'running',0,1/60,c);drawDemo(record.ctx,r,players,camera,state,c);
      expect(r.stats.cells).toBeLessThanOrEqual(quality==='medium'?64:96);record.commands.length=0;
    }
  });
});
