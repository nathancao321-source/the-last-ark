import {describe,it,expect} from 'vitest';
import {createGame,stepGame,togglePause,pause,retryGame,saveCheckpoint} from '../src/game/game';
import {jetClock,updateHazards,hazardNotice,waveRadius} from '../src/game/hazards';
import {gammaJetProgress} from '../src/physics/node-gravity';
import {FixedClock} from '../src/game/clock';
import {blackHoleLevel} from '../src/levels/black-hole';
import {solarSystem} from '../src/levels/solar-system';
import {NO_CONTROLS} from '../src/game/types';
import {createControls} from '../src/input/intent';

function holeFixture(){
  const g=createGame(blackHoleLevel);
  g.bodies[0].position={x:-10000,y:-10000};g.bodies[0].motion='static';
  g.players.forEach(p=>{p.position={...g.bodies[1].position};});
  return g;
}
function solarFixture(){
  const g=createGame(solarSystem),sun=g.bodies.find(b=>b.id==='sun')!;
  sun.motion='static';g.bodies[0].position={x:-10000,y:-10000};g.bodies[0].motion='static';
  g.players[1].position={...sun.position};togglePause(g);
  return {g,sun};
}
describe('one black-hole clock for nodes, damage and visible beams',()=>{
  it.each([30,60,144])('shows every release at 5, 10 and 15 seconds at %s display fps',fps=>{
    const g=holeFixture(),clock=new FixedClock(),observed:number[]=[];togglePause(g);
    for(let frame=0;frame<fps*16;frame++)clock.advance(1/fps,()=>{
      // Test fixture reloads cargo after reformation; pulse phase never resets.
      g.players.forEach(p=>{if(!p.capture){p.position={...g.bodies[1].position};p.velocity={x:0,y:0};}});
      stepGame(g,NO_CONTROLS);
      const jet=g.hazards!.jet!,node=g.players[0];
      if(node.capture?.phase==='jet'){
        expect(jet.geometry!.damaging).toBe(true);expect(jet.geometry!.intensity).toBe(1);
        expect(jet.geometry!.flowAge).toBeCloseTo(node.capture.elapsed,8);
        if(!observed.includes(jet.cycle))observed.push(jet.cycle);
      }
    });
    expect(observed).toEqual([1,2,3]);expect(g.phase).toBe('running');
  });
  it.each([5,10,15,20])('both physical poles deal damage on pulse at %s seconds',time=>{
    for(const sign of [-1,1]){const g=holeFixture();g.phase='running';g.elapsed=time+.1;g.bodies[0].position={x:1300,y:sign*800};
      updateHazards(g,[],.1);expect(g.health!.current).toBe(50);expect(g.hazards!.jet!.geometry!.damaging).toBe(true);
    }
  });
  it('honors source timing changes in capture, damage and decorative fallback together',()=>{
    const g=holeFixture(),timing=g.bodies[1].nodeInfluence!;timing.jetPeriod=7;timing.jetSeconds=1.2;togglePause(g);stepGame(g,NO_CONTROLS);
    expect(g.players[0].capture!.releaseAt).toBe(7);
    for(const t of [0,5,6.999,7,7.6,8.2,14,14.6,15.2]){
      const c=jetClock(g.level.blackHoleJets!,t,timing);
      expect(c.phase==='firing').toBe(gammaJetProgress(t,7,1.2)!==undefined);
      g.elapsed=t;updateHazards(g,[],0);expect(g.hazards!.jet!.geometry!.damaging).toBe(c.phase==='firing');
    }
  });
  it('pauses and restores the same pulse boundary for cargo and beam',()=>{
    const g=holeFixture();togglePause(g);for(let i=0;i<299;i++)stepGame(g,NO_CONTROLS);saveCheckpoint(g,'before-pulse');
    pause(g);const before=structuredClone(g.hazards);for(let i=0;i<600;i++)stepGame(g,NO_CONTROLS);expect(g.hazards).toEqual(before);
    const restored=retryGame(g);togglePause(restored);stepGame(restored,NO_CONTROLS);
    expect(restored.elapsed).toBeCloseTo(5);expect(restored.players[0].capture!.phase).toBe('jet');expect(restored.hazards!.jet!.geometry!.damaging).toBe(true);
  });
});
describe('free preparation and paused deployment',()=>{
  it.each(['ready','paused'] as const)('allows both nodes to leave the core in %s without advancing time',phase=>{
    const g=holeFixture();g.phase=phase;
    for(let i=0;i<120;i++)stepGame(g,createControls({moveX:1},{moveX:-1}));
    expect(g.elapsed).toBe(0);expect(g.players.every(p=>!p.capture)).toBe(true);
    expect(g.players[0].position.x).toBeGreaterThan(1500);expect(g.players[1].position.x).toBeLessThan(1100);
  });
  it('only captures an overlapping node after Space starts simulation',()=>{
    const g=holeFixture();for(let i=0;i<10;i++)stepGame(g,NO_CONTROLS);expect(g.players[0].capture).toBeUndefined();
    togglePause(g);stepGame(g,NO_CONTROLS);expect(g.players[0].capture).toMatchObject({phase:'captured',releaseAt:5});
  });
});
describe('gold-node immediate solar wave',()=>{
  it('launches on the detonation tick, travels from that time, and never relaunches at 50',()=>{
    const {g,sun}=solarFixture();for(let i=0;i<179;i++)stepGame(g,NO_CONTROLS);expect(g.hazards!.wave).toBeUndefined();
    stepGame(g,NO_CONTROLS);const w=g.hazards!.wave!;
    expect(sun.stellarState!.status).toBe('exploded');expect(w.active).toBe(true);expect(w.launchedAt).toBeCloseTo(3);expect(w.front).toBe(sun.radius);expect(w.origin).toEqual(sun.position);
    const origin={...w.origin};sun.position.x+=200;
    for(let i=0;i<1500;i++)stepGame(g,NO_CONTROLS);expect(g.hazards!.wave).toBe(w);expect(w.front).toBeCloseTo(w.targetDistance,6);expect(w.origin).toEqual(origin);
    while(g.elapsed<51)stepGame(g,NO_CONTROLS);expect(g.hazards!.wave).toBe(w);expect(w.launchedAt).toBeCloseTo(3);expect(w.active).toBe(false);expect(hazardNotice(g)).toBeUndefined();
  });
  it('kills an intercepted ship before the old scheduled event',()=>{
    const {g,sun}=solarFixture();g.bodies[0].position={x:sun.position.x+600,y:sun.position.y};
    for(let i=0;i<180;i++)stepGame(g,NO_CONTROLS);expect(g.phase).toBe('running');
    for(let i=0;i<300&&g.phase==='running';i++)stepGame(g,NO_CONTROLS);
    expect(g.phase).toBe('failed');expect(g.health!.current).toBe(0);expect(g.elapsed).toBeLessThan(6);expect(g.message).toContain('灭绝');
  });
  it('creates the ring even if the immediate local blast ends the game',()=>{
    const {g,sun}=solarFixture();sun.stellarState={status:'star',goldSeconds:3-1/60,blueSeconds:0};g.bodies[0].position={x:sun.position.x,y:sun.position.y+300};
    stepGame(g,NO_CONTROLS);expect(g.phase).toBe('failed');expect(g.hazards!.wave).toMatchObject({active:true,launchedAt:g.elapsed,front:100});
  });
  it('freezes an early ring on pause and preserves its launch through checkpoint retry',()=>{
    const {g}=solarFixture();for(let i=0;i<240;i++)stepGame(g,NO_CONTROLS);saveCheckpoint(g,'early-wave');pause(g);const w=structuredClone(g.hazards!.wave);
    for(let i=0;i<600;i++)stepGame(g,NO_CONTROLS);expect(g.hazards!.wave).toEqual(w);
    const retry=retryGame(g);expect(retry.hazards!.wave).toEqual(w);expect(waveRadius(retry,retry.elapsed)).toBeCloseTo(w!.front);
    expect(createGame(solarSystem).hazards!.wave).toBeUndefined();
  });
  it('does not show the obsolete 50-second warning after an early explosion',()=>{
    const {g}=solarFixture();for(let i=0;i<180;i++)stepGame(g,NO_CONTROLS);g.elapsed=46;updateHazards(g,[],0);expect(hazardNotice(g)).toBeUndefined();
  });
  it('keeps the scheduled residual event for blue-node collapse',()=>{
    const {g,sun}=solarFixture();g.players[1].position={x:0,y:0};g.players[0].position={...sun.position};
    for(let i=0;i<180;i++)stepGame(g,NO_CONTROLS);expect(sun.stellarState!.status).toBe('neutron');expect(g.hazards!.wave).toBeUndefined();
    g.elapsed=50;updateHazards(g,[],0);expect(g.hazards!.wave).toMatchObject({launchedAt:50,radius0:sun.radius});
  });
});
