import { describe, it, expect } from 'vitest';
import { createGame, stepGame, togglePause, pause, retryGame, saveCheckpoint } from '../src/game/game';
import { solarSystem } from '../src/levels/solar-system';
import { createControls } from '../src/input/intent';
import { bodyGravity } from '../src/physics/gravity';
import { fieldAcceleration } from '../src/physics/fields';
import { length, sub, add, scale, limit } from '../src/physics/vector';
import type { GameState } from '../src/game/types';
import { NO_CONTROLS } from '../src/game/types';
import { positionPlayer } from './helpers';
import { updateStellar } from '../src/game/stellar';
import { integrate } from '../src/physics/world';
import { predictTrajectory } from '../src/game/trajectory';
import { updateEncounters } from '../src/world/encounters';
import { starMapPoints } from '../src/render/star-map';
import { developmentRegistry } from '../src/debug/config';
import { scenes } from '../src/scenes/registry';
import { createCamera, followGroup, viewBounds } from '../src/camera/camera';
import { intersects, circleBounds } from '../src/world/geometry';
import { SceneController } from '../src/scenes/controller';
import { Keyboard } from '../src/input/keyboard';

/** Feedback pilot controls only the two normal player intents, never the ship or planets. */
function pilot(game:GameState, speed=100, clearance=600, departureSpeed=speed) {
  const waypoints=[{x:450,y:-clearance},{x:1000,y:-clearance-20},{x:1450,y:-clearance+20},{x:2100,y:-clearance-20},{x:3000,y:-clearance-20},{x:4170,y:-clearance-20},{x:4900,y:0},{x:5480,y:0}];
  const camera=createCamera(game.bodies[0].position);
  let stage=0;
  while(stage<waypoints.length-1 && waypoints[stage].x<game.bodies[0].position.x+80)stage++;
  if(game.phase!=='running')togglePause(game);
  for(let i=0;i<18000&&game.phase==='running';i++) {
    const ship=game.bodies[0],target=waypoints[stage];
    if(length(sub(target,ship.position))<120&&stage<waypoints.length-1)stage++;
    const delta=sub(waypoints[stage],ship.position);
    const cruise=stage===waypoints.length-1?Math.min(speed,45):stage<3?departureSpeed:speed;
    const desired=scale(delta,cruise/Math.max(1,length(delta)));
    let environment={x:0,y:0};
    for(const body of game.bodies)if(body!==ship&&body.emitsGravity!==false)environment=add(environment,fieldAcceleration(ship.position,body.position,bodyGravity(body)));
    const acceleration=sub(limit(scale(sub(desired,ship.velocity),1.2),60),environment);
    const power=length(acceleration),direction=scale(acceleration,1/Math.max(power,1e-9));
    const intents=game.players.map((p,index)=>{
      const aim=add(ship.position,scale(direction,index?-160:135));
      const actual=fieldAcceleration(ship.position,p.position,p.field);
      const aligned=(actual.x*direction.x+actual.y*direction.y)>length(actual)*0.5;
      return {targetWorldPosition:aim,abilityActive:aligned&&power>(index?23:6)};
    });
    stepGame(game,createControls(intents[0],intents[1]));
    followGroup(camera,[game.bodies[0],...game.players],1/60);
    updateEncounters(game,viewBounds(camera));
  }
  return {phase:game.phase,stage,seconds:game.elapsed,position:game.bodies[0].position,hp:game.health?.current,message:game.message,objectives:game.mission.completedObjectives};
}
describe('Solar Exodus physical routes',()=>{
  for(const speed of [110,120,130])it(`flies a real cooperative route from Earth to interstellar space at ${speed}`,()=>{
    const game=createGame(solarSystem);const result=pilot(game,speed);
    expect(result.phase,JSON.stringify(result)).toBe('completed');expect(result.seconds).toBeLessThan(65);
    expect(game.encounters).toContain('belt-approach');expect(game.mission.completedObjectives).toHaveLength(6);
  });
  for(const index of [0,1] as const)it(`real node travel and dwell ${index?'launches an early wave that intercepts the old route':'allows completion after collapse'}`,()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!;
    positionPlayer(game,index,sun.position);togglePause(game);
    for(let i=0;i<182;i++)stepGame(game,NO_CONTROLS);
    expect(sun.stellarState?.status).toBe(index?'exploded':'neutron');expect(game.phase).toBe('running');
    pause(game);
    positionPlayer(game,0,add(game.bodies[0].position,{x:-100,y:-180}));
    positionPlayer(game,1,add(game.bodies[0].position,{x:100,y:180}));
    const result=pilot(game,130,700,100);
    if(index){
      expect(game.hazards!.wave!.launchedAt).toBeCloseTo(3);
      expect(result.phase,JSON.stringify(result)).toBe('failed');expect(result.message).toContain('灭绝');expect(result.seconds).toBeLessThan(10);
    }else expect(result.phase,JSON.stringify(result)).toBe('completed');
  });
  it('does not award an unassisted straight flight a free boost or safe bypass',()=>{
    const game=createGame(solarSystem);togglePause(game);for(let i=0;i<2400&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed');expect(game.mission.completedObjectives).not.toContain('sun-pass');
  });
  for(const section of ['sun','belt','pluto'])it(`offers a completable ${section} development section`,()=>{
    const registry=developmentRegistry(scenes,'?dev=1&section='+section);const result=pilot(createGame(registry.solar_system.level!));
    expect(result.phase,JSON.stringify(result)).toBe('completed');
  });
});

describe('solar bodies, hazards and deterministic checkpoints',()=>{
  it.each([0,1] as const)('keeps Saturn outside Jupiter after a three-second player %s disturbance',index=>{
    const game=createGame(solarSystem),baseline=createGame(solarSystem);
    const saturn=game.bodies.find(b=>b.id==='saturn')!,jupiter=game.bodies.find(b=>b.id==='jupiter')!,sun=game.bodies.find(b=>b.id==='sun')!;
    let minimumGap=Infinity,maximumDeviation=0;
    for(let i=0;i<18000;i++) {
      const radial=scale(sub(saturn.position,sun.position),1/length(sub(saturn.position,sun.position)));
      const node=game.players[index];node.active=i<180;
      node.position=add(saturn.position,scale(radial,index?110:-110));
      integrate(game.bodies,game.players,1/60);integrate(baseline.bodies,[],1/60);
      minimumGap=Math.min(minimumGap,length(sub(saturn.position,sun.position))-length(sub(jupiter.position,sun.position)));
      maximumDeviation=Math.max(maximumDeviation,length(sub(saturn.position,baseline.bodies.find(b=>b.id==='saturn')!.position)));
    }
    expect(minimumGap).toBeGreaterThan(300);
    expect(maximumDeviation).toBeLessThan(30);
  });
  it('keeps asteroid control strong while a three-second field barely changes a giant planet',()=>{
    const perturb=(id:string)=>{
      const game=createGame(solarSystem),body=game.bodies.find(b=>b.id===id)!,initial=structuredClone(body);
      for(let i=0;i<180;i++) {game.players[0].active=true;game.players[0].position=add(body.position,{x:100,y:0});integrate([body],game.players,1/60);}
      return length(sub(body.position,add(initial.position,scale(initial.velocity,3))));
    };
    const giant=perturb('saturn'),rock=perturb('belt-rock-0');
    expect(giant).toBeGreaterThan(0);expect(giant).toBeLessThan(1);
    expect(rock).toBeGreaterThan(100);expect(rock/giant).toBeGreaterThan(100);
  });
  it.each(['running','paused','failed','completed'] as const)('R restores full health and the entire initial world from %s, ignoring damaged checkpoints',phase=>{
    const controller=new SceneController();controller.enter('solar_system');
    const initial=structuredClone(controller.game!);
    const game=controller.game!;game.health!.current=23;game.bodies[0].position={x:4200,y:350};
    game.bodies.find(b=>b.id==='saturn')!.position.x=1900;
    game.elapsed=66;game.distance=6000;game.encounters=['belt-approach'];game.mission.completedObjectives=['earth-depart'];
    game.players[0].active=true;saveCheckpoint(game,'damaged');game.phase=phase;
    const keyboard=new Keyboard(action=>{if(action==='restart'||action==='reset')controller.retry(action==='restart');});
    keyboard.keyDown('KeyR',false,true);
    expect(controller.game!.health!.current).toBe(23);expect(controller.game!.bodies[0].position.x).toBe(4200);
    keyboard.keyUp('KeyR');keyboard.keyDown('KeyR');
    expect(controller.game).toEqual(initial);
    const restored=controller.game;keyboard.keyDown('KeyR',true);expect(controller.game).toBe(restored);
  });
  it('requires a slower entry into the smaller transfer region and lets an overspeed ship leave freely',()=>{
    const game=createGame(solarSystem),gate=game.bodies.find(b=>b.id==='interstellar')!,ship=game.bodies[0];
    expect(gate.radius).toBe(110);game.bodies=[ship,gate];
    game.mission.completedObjectives=['earth-depart','sun-pass','inner-pass','belt-pass','outer-pass'];
    ship.position={...gate.position};ship.velocity={x:110,y:0};togglePause(game);stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('running');expect(game.message).toContain('TOO FAST');
    for(let i=0;i<90;i++)stepGame(game,NO_CONTROLS);
    expect(ship.position.x).toBeGreaterThan(gate.position.x+gate.radius);expect(game.phase).toBe('running');
    ship.velocity={x:-55,y:0};for(let i=0;i<180&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('completed');expect(length(ship.velocity)).toBeLessThanOrEqual(60);
  });
  it('contains every named planet and keeps background rubble outside physical lists',()=>{
    const game=createGame(solarSystem),names=starMapPoints(game).map(b=>b.appearance?.name);
    for(const name of ['太阳','水星','金星','地球','火星','木星','土星','天王星','海王星','冥王星'])expect(names).toContain(name);
    expect(game.level.decorations).toHaveLength(100);expect(game.bodies.length).toBeLessThan(20);
    expect(game.level.missionBounds).toBeUndefined();
  });
  it('lets environmental gravity bend planets and retains player-only damping',()=>{
    const game=createGame(solarSystem),earth=game.bodies.find(b=>b.id==='earth')!;
    const coast=structuredClone(earth),start=structuredClone(earth);
    for(let i=0;i<600;i++){integrate(game.bodies,[],1/60);integrate([coast],[],1/60);}
    expect(length(sub(earth.position,coast.position))).toBeGreaterThan(10);
    expect(earth.orbit).toBeUndefined();expect(earth.receivesGravity).not.toBe(false);
    game.players[0].position=add(start.position,{x:100,y:0});game.players[0].active=true;
    for(let i=0;i<60;i++)integrate([start],game.players,1/60);
    expect(length(start.stabilizationState!.playerVelocity)).toBeGreaterThan(0.1);
    game.players[0].active=false;for(let i=0;i<600;i++)integrate([start],game.players,1/60);
    expect(length(start.stabilizationState!.playerVelocity)).toBeLessThan(0.2);
    expect(length(start.velocity)).toBeGreaterThan(1);
  });
  it('weakly moves the sun but enforces a configured maximum displacement',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!,initial={...sun.position};
    for(let i=0;i<7200;i++){
      game.players[0].position=add(sun.position,{x:120,y:0});game.players[0].active=true;
      integrate([sun],game.players,1/60);
    }
    expect(length(sub(sun.position,initial))).toBeGreaterThan(10);expect(length(sub(sun.position,initial))).toBeLessThanOrEqual(60.0001);
  });
  it('burns progressively, preserves pause, and restores health and dwell timers at checkpoints',()=>{
    const game=createGame(solarSystem),ship=game.bodies[0],sun=game.bodies.find(b=>b.id==='sun')!;
    ship.position={x:900,y:180};ship.velocity={x:0,y:0};sun.emitsGravity=false;
    saveCheckpoint(game,'heat');togglePause(game);for(let i=0;i<60;i++)stepGame(game,NO_CONTROLS);
    expect(game.health!.current).toBeGreaterThan(0);expect(game.health!.current).toBeLessThan(100);
    pause(game);const hp=game.health!.current;for(let i=0;i<300;i++)stepGame(game,NO_CONTROLS);expect(game.health!.current).toBe(hp);
    const retry=retryGame(game);expect(retry.health!.current).toBe(100);expect(retry.bodies[0].position).toEqual({x:900,y:180});
    togglePause(game);for(let i=0;i<1000&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed');expect(game.health!.current).toBe(0);
  });
  it('allows unlimited detours and catches swept collision with a tiny fast-moving rock',()=>{
    const game=createGame(solarSystem);game.bodies[0].position={x:-1e6,y:1e6};togglePause(game);
    for(let i=0;i<60;i++)stepGame(game,NO_CONTROLS);expect(game.phase).toBe('running');
    const ship=game.bodies[0],rock=game.bodies.find(b=>b.kind==='asteroid')!;
    game.bodies=[ship,rock];ship.position={x:-100,y:0};ship.velocity={x:240,y:0};rock.position={x:0,y:0};rock.velocity={x:-10,y:0};rock.radius=2;
    stepGame(game,NO_CONTROLS,1);expect(game.phase).toBe('failed');
  });
  it('an explosion affects only the sun and fails the ship inside the configured blast radius',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!;
    game.players[1].position={...sun.position};game.bodies[0].position={x:900,y:300};
    const other=structuredClone(game.bodies.filter(b=>b!==sun));
    const failure=updateStellar(game,new Map(),3);expect(failure).toContain('爆炸');
    expect(game.bodies.filter(b=>b!==sun)).toEqual(other);expect(sun).toMatchObject({emitsGravity:false,collision:'none',layer:'hidden'});
  });
  it.each([330,350,400])('shares the same heat/blast boundary at ship center distance %s',distance=>{
    const heat=createGame(solarSystem),blast=createGame(solarSystem);
    const sun=blast.bodies.find(b=>b.id==='sun')!,ship=blast.bodies[0];
    ship.position={x:sun.position.x,y:sun.position.y+distance};heat.bodies[0].position={...ship.position};
    updateStellar(heat,new Map(),1);
    blast.players[1].position={...sun.position};const failure=updateStellar(blast,new Map(),3);
    expect(!!failure).toBe(heat.health!.current<100);
    if(distance===400)expect(failure).toBeUndefined(); // old 520 blast radius must not survive
  });
  it('enables gravity on physical solar asteroids while keeping decorative debris outside the solver',()=>{
    const game=createGame(solarSystem);game.bodies[0].position={x:2200,y:0};togglePause(game);
    updateEncounters(game,{minX:1600,maxX:2800,minY:-400,maxY:400});
    const rocks=game.bodies.filter(b=>b.kind==='asteroid');expect(rocks).toHaveLength(5);
    for(const rock of rocks){expect(rock.emitsGravity).not.toBe(false);expect(bodyGravity(rock).strength).toBeGreaterThan(0);expect(bodyGravity(rock).radius).toBeGreaterThan(0);}
    expect(game.level.decorations).toHaveLength(100);
  });
  it('cancels simultaneous projections and resets interrupted dwell; neutron stars lose heat but retain stronger gravity',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!,original=bodyGravity(sun).strength;
    game.players.forEach(p=>{p.position={...sun.position};});updateStellar(game,new Map(),4);expect(sun.stellarState!.status).toBe('star');
    game.players[1].position={x:0,y:500};updateStellar(game,new Map(),2);game.players[0].position={x:0,y:0};updateStellar(game,new Map(),1);expect(sun.stellarState!.blueSeconds).toBe(0);
    game.players[0].position={...sun.position};updateStellar(game,new Map(),3);
    expect(sun.stellarState!.status).toBe('neutron');expect(sun.response).toBeGreaterThan(0.18);expect(bodyGravity(sun).strength).toBeGreaterThan(original);
    game.bodies[0].position={x:900,y:100};updateStellar(game,new Map(),10);expect(game.health!.current).toBe(100);
  });
  it('uses one seeded bounded encounter, restores it on retry and predicts without mutating the world',()=>{
    const game=createGame(solarSystem);game.bodies[0].position={x:2200,y:0};
    togglePause(game);const view={minX:1600,maxX:2800,minY:-400,maxY:400};
    const copy=structuredClone(game);updateEncounters(game,view);updateEncounters(copy,view);expect(game.bodies).toEqual(copy.bodies);
    const count=game.bodies.length;for(let i=0;i<100;i++)updateEncounters(game,view);expect(game.bodies).toHaveLength(count);
    saveCheckpoint(game,'belt');const retry=retryGame(game);updateEncounters(retry,view);expect(retry.bodies).toHaveLength(count);
    const before=structuredClone(game);predictTrajectory(game,2);expect(game).toEqual(before);
  });
  it('lets sustained fields move a planet arbitrarily beyond its old 140-unit leash',()=>{
    const game=createGame(solarSystem),earth=game.bodies.find(b=>b.id==='earth')!;
    const initial=structuredClone(earth);
    for(let i=0;i<7200;i++) {
      game.players[0].position=add(earth.position,{x:100,y:0});game.players[0].active=true;
      integrate([earth],game.players,1/60);
    }
    expect(earth.orbit).toBeUndefined();expect(earth.displacementLimit).toBeUndefined();
    // Much weaker coupling still permits sustained displacement, without a leash.
    expect(length(sub(earth.position,add(initial.position,scale(initial.velocity,120))))).toBeGreaterThan(1000);
    game.players[0].active=false;for(let i=0;i<1200;i++)integrate([earth],game.players,1/60);
    expect(length(earth.stabilizationState!.playerVelocity)).toBeLessThan(0.5);
  });
  it('keeps only interstellar transfer as the final goal beyond Pluto',()=>{
    const pluto=solarSystem.bodies.find(b=>b.id==='pluto')!,gate=solarSystem.bodies.find(b=>b.id==='interstellar')!;
    expect(solarSystem.bodies.filter(b=>b.kind==='wormhole').map(b=>b.id)).toEqual(['interstellar']);
    expect(solarSystem.mission!.objectives.at(-1)!.requires).toEqual(['outer-pass']);
    expect(JSON.stringify(solarSystem)).not.toContain('pluto-gate');
    expect(JSON.stringify(solarSystem)).not.toContain('pluto-exit');
    expect(gate.position.x-gate.radius-(pluto.position.x+pluto.radius)).toBeGreaterThan(200);
  });
  it('maintains a genuine Mercury orbit in the solar field for ten minutes without prescribed drift',()=>{
    const game=createGame(solarSystem),mercury=game.bodies.find(b=>b.id==='mercury')!,sun=game.bodies.find(b=>b.id==='sun')!;
    sun.motion='static';const radius=length(sub(mercury.position,sun.position));let maxError=0;
    for(let i=0;i<36000;i++) {
      integrate([mercury,sun],game.players,1/60);
      maxError=Math.max(maxError,Math.abs(length(sub(mercury.position,sun.position))-radius));
    }
    expect(maxError/radius).toBeLessThan(0.005);
    expect(mercury.receivesGravity).not.toBe(false);expect(mercury.orbit).toBeUndefined();
  });
  it('keeps unforced Mercury clear of the sun during a full mission with all mutual gravity active',()=>{
    const game=createGame(solarSystem),mercury=game.bodies.find(b=>b.id==='mercury')!,sun=game.bodies.find(b=>b.id==='sun')!;
    let clearance=Infinity;
    for(let i=0;i<5400;i++) {integrate(game.bodies,[],1/60);clearance=Math.min(clearance,length(sub(mercury.position,sun.position))-mercury.radius-sun.radius);}
    expect(clearance).toBeGreaterThan(0);
    expect(game.bodies.every(b=>Number.isFinite(length(b.position))&&Number.isFinite(length(b.velocity)))).toBe(true);
  });
  it('makes Jupiter and the Sun much harder to move without freezing them or limiting Jupiter displacement',()=>{
    const perturb=(id:string)=>{
      const game=createGame(solarSystem),body=game.bodies.find(b=>b.id===id)!;
      const initial={...body.position},initialVelocity={...body.velocity};
      for(let i=0;i<600;i++) {
        game.players[0].position=add(body.position,{x:120,y:0});game.players[0].active=true;
        integrate([body],game.players,1/60);
      }
      const base=add(initial,scale(initialVelocity,10));
      return {distance:length(sub(body.position,base)),body};
    };
    const earth=perturb('earth'),jupiter=perturb('jupiter'),sun=perturb('sun');
    expect(jupiter.distance).toBeGreaterThan(1);
    expect(jupiter.distance).toBeLessThan(earth.distance/8);
    expect(sun.distance).toBeGreaterThan(0.1);
    expect(sun.distance).toBeLessThan(jupiter.distance/5);
    expect(jupiter.body.displacementLimit).toBeUndefined();expect(jupiter.body.orbit).toBeUndefined();
  });
  it('burns beyond the old boundary and depletes a stationary ship near the core within two seconds',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!,ship=game.bodies[0];
    ship.position=add(sun.position,{x:0,y:300});
    updateStellar(game,new Map(),1);expect(game.health!.current).toBeLessThan(90);
    game.health!.current=100;ship.position=add(sun.position,{x:0,y:180});
    expect(updateStellar(game,new Map(),2)).toContain('灼烧');expect(game.health!.current).toBe(0);
    game.health!.current=100;ship.position=add(sun.position,{x:0,y:350});
    updateStellar(game,new Map(),2);expect(game.health!.current).toBe(100);
  });
  it.each([600,6000,600000])('spawns the whole asteroid outside even a %s-unit-wide viewport and aims it inward',width=>{
    const game=createGame(solarSystem);game.bodies[0].position={x:2200,y:0};togglePause(game);
    const view={minX:2200-width/2,maxX:2200+width/2,minY:-width/3,maxY:width/3};
    updateEncounters(game,view);
    for(const rock of game.bodies.filter(b=>b.id.startsWith('belt-approach-'))) {
      expect(intersects(view,circleBounds(rock.position,rock.radius))).toBe(false);
      const toward=sub(game.bodies[0].position,rock.position);
      expect(toward.x*rock.velocity.x+toward.y*rock.velocity.y).toBeGreaterThan(0);
    }
    expect(game.encounters).toHaveLength(1);
  });
  it('restarts deterministically and supplies independent earth/sun/belt/pluto development sections',()=>{
    const a=createGame(solarSystem),b=createGame(solarSystem);togglePause(a);togglePause(b);
    for(let i=0;i<120;i++){stepGame(a,NO_CONTROLS);stepGame(b,NO_CONTROLS);}expect(a).toEqual(b);
    for(const section of ['earth','sun','belt','pluto']){
      const registry=developmentRegistry(scenes,'?dev=1&section='+section);const game=createGame(registry.solar_system.level!);
      expect(game.phase).toBe('ready');expect(game.health!.current).toBe(100);
    }
    expect(solarSystem.bodies[0].position).toEqual({x:-180,y:0});
  });
});
