import {describe,it,expect} from 'vitest';
import {createGame,stepGame,togglePause,pause,retryGame,saveCheckpoint} from '../src/game/game';
import {updateHazards,jetClock,waveRadius,hazardNotice} from '../src/game/hazards';
import {expandingRingContact,capsuleExposure} from '../src/physics/hazard-collision';
import {solarSystem} from '../src/levels/solar-system';
import {blackHoleLevel} from '../src/levels/black-hole';
import {firstLevel} from '../src/levels/first';
import {NO_CONTROLS,type GameState} from '../src/game/types';
import {predictTrajectory} from '../src/game/trajectory';
import {drawHazards} from '../src/render/hazards';
import {createCamera} from '../src/camera/camera';
import {escortPilot} from '../src/debug/escort-pilot';
import {followGroup,viewBounds} from '../src/camera/camera';
import {updateEncounters} from '../src/world/encounters';
import {createVisualState,sampleDisturbance} from '../src/render/spacetime/model';
import {DEFAULT_WARP} from '../src/render/spacetime/config';

function advance(game:GameState,time:number,from={x:10000,y:10000},to=from,dt=1/60){
  game.phase='running';game.elapsed=time;game.bodies[0].position={...to};
  return updateHazards(game,[{from,to,start:0,end:dt}],dt);
}
describe('solar extinction event',()=>{
  it('warns at 45, emits exactly once at 50 and reaches the real exit at 75',()=>{
    const g=createGame(solarSystem);advance(g,44.99);expect(hazardNotice(g)).toBeUndefined();
    advance(g,45);expect(hazardNotice(g)).toContain('异常');advance(g,49.99);expect(g.hazards!.wave).toBeUndefined();
    advance(g,50);const wave=structuredClone(g.hazards!.wave!);expect(wave.front).toBe(100);
    for(const t of [55,65,75]){advance(g,t);expect(g.hazards!.wave!.front).toBeCloseTo(100+(4580-100)/25*(t-50),8);}
    expect(g.hazards!.wave!.front).toBeCloseTo(wave.targetDistance,8);
    g.bodies.find(b=>b.id==='sun')!.position.x+=123;advance(g,76);expect(g.hazards!.wave!.origin).toEqual(wave.origin);
    expect(g.hazards!.wave!.speed).toBe(wave.speed);advance(g,91);expect(g.hazards!.wave!.active).toBe(false);
  });
  it('does not count ready/paused time, restores snapshots and resets full restarts',()=>{
    const g=createGame(solarSystem);for(let i=0;i<60;i++)stepGame(g,NO_CONTROLS);expect(g.elapsed).toBe(0);
    advance(g,55);saveCheckpoint(g,'wave');pause(g);const before=structuredClone(g.hazards);
    for(let i=0;i<120;i++)stepGame(g,NO_CONTROLS);expect(g.hazards).toEqual(before);expect(g.elapsed).toBe(55);
    advance(g,60);const retry=retryGame(g);expect(retry.elapsed).toBe(55);expect(retry.hazards).toEqual(before);
    expect(createGame(solarSystem).hazards!.wave).toBeUndefined();
  });
  it('kills on the annulus, leaves its interior safe and only applies after launch',()=>{
    const g=createGame(solarSystem);advance(g,50);const w=g.hazards!.wave!;
    const p={x:w.origin.x+waveRadius(g,55)-20,y:0};
    expect(advance(g,55,p)).toContain('灭绝');expect(g.health!.current).toBe(0);
    const safe=createGame(solarSystem);advance(safe,50);expect(advance(safe,55,{x:1500,y:0})).toBeUndefined();expect(safe.health!.current).toBe(100);
    const early=createGame(solarSystem);expect(advance(early,49.99,{x:1000,y:0})).toBeUndefined();
  });
  it('handles changed radius and rejects missing/reversed/invalid geometry without NaN',()=>{
    const g=createGame(solarSystem);g.bodies.find(b=>b.id==='sun')!.radius=32;advance(g,75);
    expect(g.hazards!.wave!.front).toBeCloseTo(4580);expect(g.hazards!.wave!.radius0).toBe(32);
    for(const x of [900,910,NaN]){const bad=createGame(solarSystem);bad.bodies.find(b=>b.id==='interstellar')!.position.x=x;advance(bad,50);
      expect(bad.hazards!.wave).toBeUndefined();expect(bad.hazards!.configurationError).toBeTruthy();}
  });
  it('uses actual stepGame failure and prediction, without changing live state',()=>{
    const g=createGame(solarSystem);advance(g,50);g.elapsed=54.99;g.bodies[0].position={x:900+waveRadius(g,55),y:0};g.bodies[0].velocity={x:0,y:0};
    const before=structuredClone(g);expect(predictTrajectory(g,1).outcome).toBe('failed');expect(g).toEqual(before);
    for(let i=0;i<5&&g.phase==='running';i++)stepGame(g,NO_CONTROLS);
    expect(g.phase).toBe('failed');expect(g.health!.current).toBe(0);const failed=structuredClone(g);stepGame(g,NO_CONTROLS);expect(g).toEqual(failed);
  });
});
describe('continuous hazard geometry',()=>{
  it('detects moving wave / moving ship crossings in either direction and tangencies',()=>{
    const o={x:0,y:0};
    expect(expandingRingContact({x:200,y:0},{x:200,y:0},o,100,300,20,8)).toBe(true);
    expect(expandingRingContact({x:400,y:0},{x:0,y:0},o,100,300,20,8)).toBe(true);
    expect(expandingRingContact({x:0,y:0},{x:500,y:0},o,100,300,20,8)).toBe(true);
    expect(expandingRingContact({x:0,y:0},{x:20,y:0},o,100,300,20,8)).toBe(false);
    expect(expandingRingContact({x:500,y:0},{x:800,y:0},o,100,300,20,8)).toBe(false);
    expect(expandingRingContact({x:-200,y:108},{x:200,y:108},o,100,100,20,8)).toBe(true);
  });
  it.each([-1,1])('sweeps finite Y-axis jet %s including its rounded tip',sign=>{
    expect(capsuleExposure({x:-300,y:sign*500},{x:300,y:sign*500},0,sign*100,sign*1200,32)).toBeDefined();
    expect(capsuleExposure({x:-100,y:sign*1232},{x:100,y:sign*1232},0,sign*100,sign*1200,32)).toBeDefined();
    expect(capsuleExposure({x:-100,y:sign*1233},{x:100,y:sign*1233},0,sign*100,sign*1200,32)).toBeUndefined();
  });
});
describe('bipolar gamma damage',()=>{
  it('has full warning and only firing is lethal; both poles deal half maximum HP',()=>{
    const c=blackHoleLevel.blackHoleJets!;
    expect([0,3,5,5.8,6.55,10].map(t=>jetClock(c,t,blackHoleLevel.bodies[1].nodeInfluence!).phase)).toEqual(['idle','warning','firing','dissipating','cooldown','firing']);
    for(const sign of [-1,1]){const g=createGame(blackHoleLevel),p={x:1300,y:sign*600};
      advance(g,3,p);expect(g.health!.current).toBe(100);advance(g,5.1,p);expect(g.health!.current).toBe(50);
      for(let t=5.2;t<5.8;t+=.1)advance(g,t,p);expect(g.health!.current).toBe(50);
      advance(g,7,p);expect(g.health!.current).toBe(50);
      expect(advance(g,10.1,p)).toContain('伽马');expect(g.health!.current).toBe(0);
    }
  });
  it('requires independent reentry, respects grace and consumes exposure during grace',()=>{
    const g=createGame(blackHoleLevel),inside={x:1300,y:-600},outside={x:1400,y:-600};
    // A longer configured pulse exercises leave/reenter both during and after grace.
    g.bodies[1].nodeInfluence!.jetSeconds=2.5;
    advance(g,5.1,inside);advance(g,5.2,outside);advance(g,5.3,inside);advance(g,6.3,inside);expect(g.health!.current).toBe(50);
    advance(g,6.4,outside);expect(advance(g,6.5,inside)).toContain('失效');expect(g.health!.current).toBe(0);
  });
  it('detects fast fly-through and clips CCD at activation boundaries',()=>{
    const g=createGame(blackHoleLevel);
    advance(g,5.2,{x:1000,y:600},{x:1600,y:600},.1);expect(g.health!.current).toBe(50);
    const early=createGame(blackHoleLevel);advance(early,5.1,{x:1200,y:600},{x:1600,y:600},.4);expect(early.health!.current).toBe(100);
    const late=createGame(blackHoleLevel);advance(late,6.0,{x:1000,y:600},{x:1400,y:600},.4);expect(late.health!.current).toBe(100);
  });
  it('uses collision-integrator chords for a real fast crossing and scales damage to maximum HP',()=>{
    const g=createGame(blackHoleLevel);g.elapsed=5.1;g.phase='running';g.health={current:200,max:200};
    g.bodies[0].position={x:1230,y:-1000};g.bodies[0].velocity={x:240,y:0};
    stepGame(g,NO_CONTROLS,.7);expect(g.health.current).toBe(100);expect(g.bodies[0].position.x).toBeGreaterThan(1332);
    expect(g.phase).toBe('running');pause(g);const before=structuredClone(g.hazards);stepGame(g,NO_CONTROLS);expect(g.hazards).toEqual(before);
  });
  it('restores exposure/grace/HP on checkpoint retry and leaves event horizons fatal',()=>{
    const g=createGame(blackHoleLevel);advance(g,5.1,{x:1300,y:600});saveCheckpoint(g,'hit');advance(g,10.1,{x:1300,y:600});
    const retry=retryGame(g);expect(retry.health!.current).toBe(50);expect(retry.hazards!.jet!.exposed).toBe(true);
    const fresh=createGame(blackHoleLevel);expect(fresh.health!.current).toBe(100);expect(fresh.hazards!.jet!.exposed).toBe(false);
    fresh.bodies[0].position={x:1300,y:0};togglePause(fresh);stepGame(fresh,NO_CONTROLS);expect(fresh.phase).toBe('failed');expect(fresh.message).toContain('视界');
  });
});
describe('render / level isolation',()=>{
  it('refracts the existing world material at the wave only, with quality gating and a single zoom transform',()=>{
    const v=createVisualState(firstLevel.players);v.hazardWave={origin:{x:0,y:0},front:1000,thickness:44};
    const sample=(x:number,zoom:number,quality=DEFAULT_WARP.quality)=>sampleDisturbance({dx:0,dy:0,luminance:0},x,0,v,{...DEFAULT_WARP,quality},zoom);
    const a=sample(978,1),b=sample(978,.5);expect(a.dx).toBeGreaterThan(0);expect(b.dx).toBeCloseTo(a.dx*.5,8);
    expect(sample(100,1).dx).toBeCloseTo(0);expect(sample(978,1,'off').dx).toBe(0);
  });
  it.each(['solar','black-hole'] as const)('completes the browser DEV %s route from the real start using only normal intents',kind=>{
    const game=createGame(kind==='solar'?solarSystem:blackHoleLevel),pilot=escortPilot(kind),camera=createCamera(game.bodies[0].position);
    togglePause(game);const uses=[0,0];
    for(let i=0;i<6000&&game.phase==='running';i++){
      const controls=pilot(game);controls.players.forEach((p,n)=>{if(p.abilityActive)uses[n]++;});
      stepGame(game,controls);followGroup(camera,[game.bodies[0],...game.players],1/60);updateEncounters(game,viewBounds(camera));
    }
    expect(game.phase,game.message).toBe('completed');expect(game.health!.current).toBe(100);expect(uses.every(n=>n>0)).toBe(true);
    if(kind==='solar')expect(game.elapsed).toBeLessThan(65);
    console.info(`${kind} physical route: ${game.elapsed.toFixed(3)}s, HP ${game.health!.current}, distance ${game.distance.toFixed(1)}, field steps ${uses.join('/')}`);
  });
  it('does not enable hazards in tutorial or an unconfigured exploration level',()=>{
    expect(createGame(firstLevel).hazards).toBeUndefined();const level=structuredClone(firstLevel);level.mode='exploration';expect(createGame(level).hazards).toBeUndefined();
  });
  it('is DOM-free and changing camera cannot mutate gameplay or launch geometry',()=>{
    const gradient={addColorStop:()=>{}};
    const ctx=new Proxy({},{get:(_t,key)=>key==='createLinearGradient'?()=>gradient:()=>{},set:()=>true}) as CanvasRenderingContext2D;
    for(const level of [solarSystem,blackHoleLevel]){const g=createGame(level);advance(g,level.solarWave?60:5.2);const before=structuredClone(g);
      for(const zoom of [.05,1,3]){const camera=createCamera({x:2000,y:-300});camera.zoom=zoom;drawHazards(ctx,g,camera,true);}
      expect(g).toEqual(before);
    }
  });
});
