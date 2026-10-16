import { describe, expect, it } from 'vitest';
import { createGame, stepGame, togglePause, pause, saveCheckpoint, retryGame } from '../src/game/game';
import { blackHoleLevel } from '../src/levels/black-hole';
import { solarSystem } from '../src/levels/solar-system';
import { nodeEnvironment, stepNode, gammaJetProgress } from '../src/physics/node-gravity';
import { applyPlayerIntent } from '../src/physics/player';
import { createControls } from '../src/input/intent';
import { NO_CONTROLS } from '../src/game/types';
import { add, sub, length } from '../src/physics/vector';
import { FixedClock } from '../src/game/clock';
import { predictTrajectory } from '../src/game/trajectory';
import { SceneController } from '../src/scenes/controller';
const idle={moveX:0,moveY:0,abilityActive:false};
function fixture() {
  const game=createGame(blackHoleLevel);
  game.bodies[0].position={x:-5000,y:-1000};game.bodies[0].velocity={x:0,y:0};
  return game;
}
function captureBoth() {
  const game=fixture();game.players.forEach(p=>{p.position={...game.bodies[1].position};});
  togglePause(game);stepGame(game,createControls({abilityActive:true},{abilityActive:true}));return game;
}
describe('black-hole-only control node coupling',()=>{
  it('pulls an idle node inward and bends a moving node without changing field toggles',()=>{
    const game=fixture(),hole=game.bodies[1],p=game.players[0];p.position=add(hole.position,{x:250,y:0});
    for(let i=0;i<30;i++)stepNode(p,idle,game.bodies,1/60,true);
    expect(p.position.x).toBeLessThan(hole.position.x+250);expect(p.velocity.x).toBeLessThan(-1);
    p.position=add(hole.position,{x:250,y:0});p.velocity={x:0,y:0};
    for(let i=0;i<30;i++)stepNode(p,{...idle,moveY:-1,abilityActive:true},game.bodies,1/60,true);
    expect(p.position.x).toBeLessThan(hole.position.x+250);expect(p.position.y).toBeLessThan(0);expect(p.active).toBe(true);
    expect(length(p.velocity)).toBeLessThanOrEqual(p.speed);
  });
  it.each([30,650])('caps the sum from overlapping holes below the node acceleration %s',acceleration=>{
    const game=fixture(),p=game.players[0],hole=game.bodies[1];p.acceleration=acceleration;p.position=add(hole.position,{x:120,y:0});
    hole.nodeInfluence!.gravityMultiplier=100;hole.nodeInfluence!.maxAccelerationRatio=3;
    const forces=[hole,{...structuredClone(hole),id:'second-hole'}];
    expect(length(nodeEnvironment(p,forces)!.acceleration)).toBeLessThan(acceleration);
    const start={...p.position};
    for(let i=0;i<180;i++)stepNode(p,{...idle,moveX:1},forces,1/60,true);
    expect(p.capture).toBeUndefined();expect(p.position.x).toBeGreaterThan(start.x);
  });
  it.each([0,1] as const)('lets player %s escape from just outside the horizon with sustained outward input',index=>{
    const game=fixture(),p=game.players[index],hole=game.bodies[1];p.position=add(hole.position,{x:120,y:0});
    for(let i=0;i<180;i++)stepNode(p,{...idle,moveX:1,abilityActive:true},game.bodies,1/60,true);
    expect(p.capture).toBeUndefined();expect(p.position.x).toBeGreaterThan(hole.position.x+180);expect(p.position.x).toBeLessThan(hole.position.x+300);expect(p.active).toBe(true);
    for(let i=0;i<1200;i++)stepNode(p,{...idle,moveX:1},game.bodies,1/60,true);
    expect(p.capture).toBeUndefined();expect(p.position.x).toBeGreaterThan(hole.position.x+1600);
  });
  it('leaves ordinary celestial control identical and has no black-hole coupling outside its field',()=>{
    const game=createGame(solarSystem),a=structuredClone(game.players[0]),b=structuredClone(a);
    expect(nodeEnvironment(a,game.bodies)).toBeUndefined();
    for(let i=0;i<120;i++) {const input={...idle,moveY:i<60?1:-1,abilityActive:true};stepNode(a,input,game.bodies,1/60,true);applyPlayerIntent(b,input,1/60);}
    expect(a).toEqual(b);
    const hole=blackHoleLevel.bodies[1];a.position=add(hole.position,{x:1601,y:0});expect(nodeEnvironment(a,[hole])).toBeUndefined();
  });
});
describe('node capture, gamma jet and reformation',()=>{
  it('disables both fields, uses the global pulse, then spends 0.45 seconds reforming after the jet',()=>{
    const game=captureBoth(),controls=createControls({moveX:1,abilityActive:true},{moveY:1,abilityActive:true});
    expect(game.players.every(p=>p.capture?.phase==='captured'&&!p.active)).toBe(true);
    for(let i=0;i<298;i++)stepGame(game,controls);
    expect(game.players.every(p=>p.capture?.phase==='captured')).toBe(true);
    stepGame(game,controls);expect(game.players.every(p=>p.capture?.phase==='jet')).toBe(true);
    stepGame(game,controls);expect(game.players.every(p=>p.position.y<0&&p.position.y>-620&&!p.active)).toBe(true);
    for(let i=0;i<47;i++)stepGame(game,controls);
    for(const p of game.players) {expect(p.capture?.phase).toBe('reforming');expect(p.position.y).toBeCloseTo(-620);expect(p.velocity).toEqual({x:0,y:0});expect(p.active).toBe(false);}
    for(let i=0;i<26;i++)stepGame(game,controls);
    expect(game.players.every(p=>p.capture?.phase==='reforming'&&!p.active)).toBe(true);
    stepGame(game,controls);expect(game.players.every(p=>!p.capture)).toBe(true);
    expect(game.players[0].position.x).not.toBe(game.players[1].position.x);
    stepGame(game,controls);expect(game.players.every(p=>p.active&&!p.capture)).toBe(true);
  });
  it('captures swept crossings and initial overlap, but does not kill the ship or freeze the other player',()=>{
    const game=fixture(),p=game.players[0],hole=game.bodies[1];p.position=add(hole.position,{x:-120,y:0});p.velocity={x:260,y:0};
    stepNode(p,{...idle,moveX:1},[hole],1,true);expect(p.capture?.phase).toBe('captured');
    const other={...game.players[1].position};togglePause(game);stepGame(game,createControls({}, {moveX:1}));
    expect(game.phase).toBe('running');expect(game.health!.current).toBe(100);expect(game.players[1].position.x).toBeGreaterThan(other.x);
    const q=game.players[1];q.position={...hole.position};q.velocity={x:260,y:0};stepNode(q,{...idle,moveX:1},[hole],1/60,true);
    expect(q.capture?.phase).toBe('captured');
  });
  it('freezes capture/jet on pause; a free node can be deployed but cannot hide inside the horizon',()=>{
    const game=captureBoth();for(let i=0;i<120;i++)stepGame(game,NO_CONTROLS);
    pause(game);const snapshot=structuredClone(game.players);
    for(let i=0;i<400;i++)stepGame(game,NO_CONTROLS);expect(game.players).toEqual(snapshot);
    togglePause(game);for(let i=0;i<190;i++)stepGame(game,NO_CONTROLS);
    expect(game.players[0].capture?.phase).toBe('jet');pause(game);const jet=structuredClone(game.players);
    for(let i=0;i<60;i++)stepGame(game,NO_CONTROLS);expect(game.players).toEqual(jet);
    const free=fixture();free.players[0].position={...free.bodies[1].position};stepGame(free,NO_CONTROLS);
    expect(free.players[0].capture?.phase).toBe('captured');expect(free.players[0].capture!.elapsed).toBe(0);
  });
  it('restores captured checkpoint timers, clears stale field intent and resets completely on R-style restart',()=>{
    const game=captureBoth();for(let i=0;i<90;i++)stepGame(game,createControls({abilityActive:true},{}));saveCheckpoint(game,'captured');
    for(let i=0;i<60;i++)stepGame(game,NO_CONTROLS);
    const restored=retryGame(game);expect(restored.players[0].capture!.elapsed).toBeCloseTo(1.5);expect(restored.players[0].capture!.abilityActive).toBe(false);
    stepGame(restored,NO_CONTROLS);expect(restored.players[0].capture!.elapsed).toBeCloseTo(1.5);
    const c=new SceneController();c.enter('black_hole');c.game=game;c.retry(true);expect(c.game!.players.every(p=>!p.capture)).toBe(true);
  });
  it('predicts capture/release using the same rules and preserves live capture state',()=>{
    const game=captureBoth();game.bodies[0].position={x:1300,y:-850};const before=structuredClone(game);
    const predicted=predictTrajectory(game,8);expect(game).toEqual(before);
    const actual=structuredClone(game),controls=createControls({abilityActive:true},{abilityActive:true});
    for(let i=0;i<Math.round(predicted.seconds*60);i++)stepGame(actual,controls);
    expect(length(sub(predicted.points.at(-1)!,actual.bodies[0].position))).toBeLessThan(1e-8);
  });
  it('uses simulation time rather than frame rate for capture and the gamma jet',()=>{
    const states=[30,60,144].map(fps=>{
      const game=captureBoth(),clock=new FixedClock();
      for(let i=0;i<fps*7;i++)clock.advance(1/fps,()=>stepGame(game,NO_CONTROLS));
      return game;
    });
    expect(states[0]).toEqual(states[1]);expect(states[1]).toEqual(states[2]);expect(states[0].players.every(p=>!p.capture)).toBe(true);
  });
  it('emits empty visual pulses every five seconds without touching matter',()=>{
    expect(gammaJetProgress(0,5,0.8)).toBeUndefined();expect(gammaJetProgress(4.99,5,0.8)).toBeUndefined();
    expect(gammaJetProgress(5,5,0.8)).toBe(0);expect(gammaJetProgress(5.4,5,0.8)).toBeCloseTo(0.5);
    expect(gammaJetProgress(5.81,5,0.8)).toBeUndefined();expect(gammaJetProgress(10.4,5,0.8)).toBeCloseTo(0.5);
    const game=fixture();togglePause(game);const before=structuredClone(game.bodies);
    gammaJetProgress(10.4,5,0.8);expect(game.bodies).toEqual(before);
  });
  it('late arrivals share the next pulse; arrival during a jet waits for the following pulse',()=>{
    const game=fixture();game.elapsed=4;game.players[0].position={...game.bodies[1].position};togglePause(game);
    stepGame(game,NO_CONTROLS);expect(game.players[0].capture!.releaseAt).toBe(5);
    for(let i=0;i<59;i++)stepGame(game,NO_CONTROLS);
    expect(game.players[0].capture!.phase).toBe('jet');
    game.players[1].position={...game.bodies[1].position};stepGame(game,NO_CONTROLS);
    expect(game.players[1].capture!.releaseAt).toBe(10);
    for(let i=0;i<299;i++)stepGame(game,NO_CONTROLS);
    expect(game.players[1].capture!.phase).toBe('jet');
  });
  it('captures an idle node quickly near the horizon and freezes reformation on pause',()=>{
    const game=fixture(),p=game.players[0];p.position=add(game.bodies[1].position,{x:250,y:0});togglePause(game);
    for(let i=0;i<120;i++)stepGame(game,NO_CONTROLS);
    expect(p.capture?.phase).toBe('captured');
    while(game.elapsed<5.9)stepGame(game,NO_CONTROLS);
    expect(p.capture?.phase).toBe('reforming');pause(game);const before=structuredClone(game);
    for(let i=0;i<120;i++)stepGame(game,NO_CONTROLS);
    expect(game.players[0]).toEqual(before.players[0]);expect(game.elapsed).toBe(before.elapsed);
  });
});
