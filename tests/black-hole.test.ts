import { describe, it, expect } from 'vitest';
import { blackHoleLevel } from '../src/levels/black-hole';
import { createGame, stepGame, togglePause, pause, retryGame, saveCheckpoint } from '../src/game/game';
import { NO_CONTROLS, type GameState } from '../src/game/types';
import { createControls } from '../src/input/intent';
import { bodyGravity } from '../src/physics/gravity';
import { fieldAcceleration } from '../src/physics/fields';
import { integrate } from '../src/physics/world';
import { add, sub, scale, length, limit } from '../src/physics/vector';
import { updateDamageZones } from '../src/game/damage-zones';
import { predictTrajectory } from '../src/game/trajectory';
import { SceneController } from '../src/scenes/controller';
import { loadProgress, storeProgress } from '../src/game/progress';
import { chapterChoices } from '../src/render/scene-ui';
import { starMapPoints } from '../src/render/star-map';
import { developmentRegistry } from '../src/debug/config';
import { scenes } from '../src/scenes/registry';

/** Reproducible cooperative feedback route: only regular finite-acceleration
 * player intents and field toggles. Never edits ship/rock positions or velocities. */
function pilot(game: GameState, speed=90, side=-1) {
  // The lower orbit crosses drifting debris; leave a wider 800-unit margin.
  const clearance=side>0?800:620;
  const route=[{x:450,y:side*(clearance-40)},{x:1050,y:side*clearance},{x:1700,y:side*clearance},{x:2200,y:side*(clearance-100)},{x:2630,y:side*150},{x:3100,y:0}];
  let stage=0;const usage=[0,0];let minHealth=100;
  while(stage<route.length-1 && route[stage].x<game.bodies[0].position.x+80)stage++;
  if(game.phase!=='running')togglePause(game);
  for(let i=0;i<9000&&game.phase==='running';i++) {
    const ship=game.bodies[0];
    if(length(sub(route[stage],ship.position))<100&&stage<route.length-1)stage++;
    const delta=sub(route[stage],ship.position),cruise=stage===route.length-1?Math.min(speed,45):speed;
    const desired=scale(delta,cruise/Math.max(1,length(delta)));
    let environment={x:0,y:0};
    for(const body of game.bodies)if(body!==ship&&body.emitsGravity!==false)environment=add(environment,fieldAcceleration(ship.position,body.position,bodyGravity(body,ship)));
    const acceleration=sub(limit(scale(sub(desired,ship.velocity),1.2),60),environment);
    const power=length(acceleration),direction=scale(acceleration,1/Math.max(power,1e-9));
    const intents=game.players.map((p,index)=>{
      const actual=fieldAcceleration(ship.position,p.position,p.field);
      const active=(actual.x*direction.x+actual.y*direction.y)>length(actual)*0.5 && power>(index?23:6);
      if(active)usage[index]++;
      return {targetWorldPosition:add(ship.position,scale(direction,index?-160:135)),abilityActive:active};
    });
    stepGame(game,createControls(intents[0],intents[1]));minHealth=Math.min(minHealth,game.health!.current);
  }
  return {phase:game.phase,message:game.message,seconds:game.elapsed,position:game.bodies[0].position,stage,minHealth,usage};
}

describe('Beyond the Horizon playable routes',()=>{
  for(const speed of [75,90,105])for(const side of [-1,1])it(`completes a physical ${side<0?'upper':'lower'} cooperative bypass at ${speed}`,()=>{
    const game=createGame(blackHoleLevel),result=pilot(game,speed,side);
    expect(result.phase,JSON.stringify(result)).toBe('completed');expect(result.seconds).toBeLessThan(90);
    expect(result.minHealth).toBe(100);expect(result.usage.every(n=>n>0)).toBe(true);
    expect(length(game.bodies[0].velocity)).toBeLessThanOrEqual(65);
    expect(game.checkpoint!.id).toBe('beyond-horizon');
  });
  it('unassisted flight is unsafe, and prediction uses the same hazards without mutating live state',()=>{
    const game=createGame(blackHoleLevel);togglePause(game);
    for(let i=0;i<2400&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed');expect(game.message).toContain('撕碎');expect(game.pendingScene).toBeUndefined();
    const near=createGame(blackHoleLevel);near.bodies[0].position={x:950,y:0};
    const before=structuredClone(near),prediction=predictTrajectory(near);
    expect(prediction.outcome).toBe('failed');expect(near).toEqual(before);
  });
  it('retries the physical bypass checkpoint and completes the exit without restarting the hazards',()=>{
    const game=createGame(blackHoleLevel);expect(pilot(game).phase).toBe('completed');
    const retry=retryGame(game);expect(retry.phase).toBe('ready');expect(retry.bodies[0].position.x).toBeGreaterThanOrEqual(2050);
    expect(pilot(retry).phase).toBe('completed');
  });
});

describe('black hole physics and three distinct regions',()=>{
  it('keeps debris available throughout a normal approach, with real gravity rather than prescribed animation',()=>{
    const game=createGame(blackHoleLevel),bodies=game.bodies.filter(b=>b.kind==='black_hole'||b.kind==='asteroid'),hole=bodies[0];
    for(let i=0;i<3600;i++)integrate(bodies,[],1/60);
    for(const rock of bodies.slice(1)) {
      expect(length(sub(rock.position,hole.position))-rock.radius).toBeGreaterThan(360);
      expect(rock.orbit).toBeUndefined();expect(rock.affectedByFields).toBe(true);
      expect(Number.isFinite(length(rock.velocity))).toBe(true);
    }
  });
  it('is fixed under simultaneous fields and attracts ship and debris through the common solver',()=>{
    const game=createGame(blackHoleLevel),hole=game.bodies[1],start={...hole.position};
    game.players.forEach((p,i)=>{p.active=true;p.position=add(hole.position,{x:i?-120:120,y:0});});
    for(let i=0;i<600;i++)integrate([hole],game.players,1/60);
    expect(hole.position).toEqual(start);expect(hole.velocity).toEqual({x:0,y:0});
    for(const id of ['ark','deep-rock-0']) {
      const target=structuredClone(game.bodies.find(b=>b.id===id)!);target.position=add(start,{x:-600,y:0});target.velocity={x:0,y:0};
      integrate([hole,target],[],1/60);expect(target.velocity.x).toBeGreaterThan(0);
    }
    expect(game.players.every(p=>p.active)).toBe(true);
  });
  it.each([0,1,100,359.9,360,800,1599.9,1600,2000])('keeps finite capped gravity at distance %s',distance=>{
    const hole=createGame(blackHoleLevel).bodies[1],force=fieldAcceleration(add(hole.position,{x:distance,y:0}),hole.position,bodyGravity(hole));
    expect(Number.isFinite(length(force))).toBe(true);expect(length(force)).toBeLessThanOrEqual(170);
    if(distance>=1600)expect(length(force)).toBe(0);
  });
  it('outer gravity bends the ship without damage; tidal damage grows inward and stops on leaving',()=>{
    const game=createGame(blackHoleLevel),ship=game.bodies[0],hole=game.bodies[1];
    ship.position=add(hole.position,{x:0,y:-600});ship.velocity={x:85,y:0};togglePause(game);stepGame(game,NO_CONTROLS);
    expect(ship.velocity.y).toBeGreaterThan(0);expect(game.health!.current).toBe(100);
    ship.position=add(hole.position,{x:0,y:250});updateDamageZones(game,1);const first=100-game.health!.current;
    expect(first).toBeGreaterThan(0);expect(game.hazardMessage).toContain('潮汐');
    game.health!.current=100;ship.position=add(hole.position,{x:0,y:150});updateDamageZones(game,1);
    expect(100-game.health!.current).toBeGreaterThan(first);
    const hp=game.health!.current;ship.position=add(hole.position,{x:0,y:400});updateDamageZones(game,1);expect(game.health!.current).toBe(hp);
  });
  it.each([0,90,107])('cannot escape after entering the horizon even with outward velocity at distance %s',distance=>{
    const game=createGame(blackHoleLevel),hole=game.bodies[1],ship=game.bodies[0];
    ship.position=add(hole.position,{x:distance,y:0});ship.velocity={x:240,y:0};togglePause(game);stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed');expect(game.message).toContain('事件视界');
    const state=structuredClone(game);stepGame(game,NO_CONTROLS);expect(game).toEqual(state);
  });
  it('sweeps horizon collisions, prioritizes death over an exit, and removes swallowed debris',()=>{
    const game=createGame(blackHoleLevel),ship=game.bodies[0],hole=game.bodies[1],exit=game.bodies.at(-1)!;
    ship.position={x:1180,y:0};ship.velocity={x:240,y:0};exit.position={...hole.position};exit.radius=1000;
    game.mission.completedObjectives=['approach','bypass'];togglePause(game);stepGame(game,NO_CONTROLS,2);
    expect(game.phase).toBe('failed');expect(game.message).toContain('事件视界');
    const safe=createGame(blackHoleLevel),rock=safe.bodies[2];rock.position={...safe.bodies[1].position};togglePause(safe);stepGame(safe,NO_CONTROLS);
    expect(safe.bodies.some(b=>b.id===rock.id)).toBe(false);expect(safe.phase).toBe('running');
  });
  it('freezes damage on pause, restores checkpoint health, and R-style full restart restores everything',()=>{
    const game=createGame(blackHoleLevel);game.bodies[0].position={x:1300,y:300};game.health!.current=80;saveCheckpoint(game,'tidal');
    togglePause(game);stepGame(game,NO_CONTROLS);expect(game.health!.current).toBeLessThan(80);
    pause(game);const hp=game.health!.current;for(let i=0;i<60;i++)stepGame(game,NO_CONTROLS);expect(game.health!.current).toBe(hp);
    expect(retryGame(game).health!.current).toBe(80);
    const c=new SceneController();c.enter('black_hole');c.game=game;c.retry(true);expect(c.game).toEqual(createGame(blackHoleLevel));
  });
  it('can lose to accumulated tidal damage outside the horizon without changing ship velocity',()=>{
    const game=createGame(blackHoleLevel),ship=game.bodies[0];ship.position={x:1300,y:150};
    const velocity={...ship.velocity};let failure:string|undefined;
    for(let i=0;i<300&&!failure;i++)failure=updateDamageZones(game,1/60);
    expect(failure).toContain('潮汐');expect(game.health!.current).toBe(0);expect(ship.velocity).toEqual(velocity);
  });
  it('provides a separate visible galaxy exit and keeps map/navigation independent of the camera',()=>{
    const game=createGame(blackHoleLevel),hole=game.bodies[1],exit=game.bodies.at(-1)!;
    expect(length(sub(exit.position,hole.position))).toBeGreaterThan(bodyGravity(hole).radius+exit.radius);
    expect(starMapPoints(game)).toContain(hole);expect(starMapPoints(game)).toContain(exit);
    expect(hole.stellar).toBeUndefined();expect(game.level.missionBounds).toBeUndefined();
  });
});

describe('chapter progression without an endless universe',()=>{
  it('keeps development exit spawns separate from normal play and reaches the real goal under physics',()=>{
    const registry=developmentRegistry(scenes,'?dev=1&scene=black_hole&section=escape');
    const game=createGame(registry.black_hole.level!);togglePause(game);
    for(let i=0;i<600&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('completed');expect(scenes.black_hole.level!.bodies[0].position).toEqual({x:0,y:0});
    expect(developmentRegistry(scenes,'?scene=black_hole&section=escape').black_hole.level!.bodies[0].position).toEqual({x:0,y:0});
  });
  it('continues from Solar Exodus to Level 2, then to the safe galaxy-edge arrival scene',()=>{
    const c=new SceneController();c.enter('solar_system');expect(c.nextScene()).toBeUndefined();
    c.game!.phase='completed';c.step(NO_CONTROLS);expect(c.progress.level1Complete).toBe(true);expect(c.nextScene()).toBe('black_hole');
    c.enter(c.nextScene()!);expect(c.game).toEqual(createGame(blackHoleLevel));
    expect(pilot(c.game!).phase).toBe('completed');c.step(NO_CONTROLS);
    expect(c.progress.level2Complete).toBe(true);expect(c.game!.message).toContain('Level 2 Complete');expect(c.nextScene()).toBe('galactic_rest');
    c.enter(c.nextScene()!);expect(c.scene).toBe('galactic_rest');expect(c.game!.health!.current).toBe(100);expect(c.game!.level.scoring).toBeUndefined();
    c.toggle();for(let i=0;i<60;i++)c.step(NO_CONTROLS);expect(c.game!.phase).toBe('running');
    expect(c.enter('endless')).toBe(false);expect(c.scene).toBe('galactic_rest');
    expect(chapterChoices(c.registry).find(v=>v.id==='black_hole')!.playable).toBe(true);
    expect(chapterChoices(c.registry).find(v=>v.id==='endless')!.playable).toBe(false);
  });
  it('persists chapter completion and accepts old progress saves',()=>{
    let value=JSON.stringify({version:1,level0Complete:true});const storage={getItem:()=>value,setItem:(_key:string,v:string)=>{value=v;}};
    expect(loadProgress(storage).level0Complete).toBe(true);expect(loadProgress(storage).level2Complete).toBe(false);
    storeProgress(storage,{level0Complete:true,level1Complete:true,level2Complete:true});expect(loadProgress(storage).level2Complete).toBe(true);
  });
});
