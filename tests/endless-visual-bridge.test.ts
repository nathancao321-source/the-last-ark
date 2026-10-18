import {describe,it,expect} from 'vitest';
import {createGame} from '../src/game/game';
import {endlessLevel} from '../src/levels/endless';
import {syncUniverseVisuals,enhancedScene} from '../src/render/endless-bridge';
import {createVisualState,updateVisuals,sampleDisturbance} from '../src/render/spacetime/model';
import {worldCells} from '../src/render/spacetime/background';
import {DEFAULT_WARP} from '../src/render/spacetime/config';
import {rebaseUniverse} from '../src/world/universe';
describe('endless cinematic bridge',()=>{
 it('enables endless and preserves all campaign visual entry points',()=>{for(const scene of ['endless','solar_system','black_hole','tutorial_part_1','tutorial_part_2'] as const)expect(enhancedScene(scene)).toBe(true);expect(enhancedScene('prototype')).toBe(false);});
 it.each([1,-1])('retains trails events samples and medium lattice through rebase %s',sign=>{
  const g=createGame(endlessLevel),x=sign*8500;g.bodies[0].position={x,y:0};g.players.forEach((p,i)=>{p.position={x:x+i*100,y:0};p.active=true;p.velocity={x:100,y:0};});
  const v=createVisualState(g.players);syncUniverseVisuals(v,g);for(let i=0;i<30;i++)updateVisuals(v,g.players,'running',0,1/60,DEFAULT_WARP);
  const sample=()=>({...sampleDisturbance({dx:0,dy:0,luminance:0},g.players[0].position.x+200,20,v,DEFAULT_WARP,.7)});
  const before=sample(),events=structuredClone(v.events),history=Array.from(v.sources[0].history),cells=worldCells(v,{...DEFAULT_WARP,quality:'medium'});
  const shift=rebaseUniverse(g),state=structuredClone(g);syncUniverseVisuals(v,g);expect(g).toEqual(state);expect(sample()).toEqual(before);
  expect(Array.from(v.sources[0].history)).toEqual(history.map((n,i)=>n+(i%2?shift.y:shift.x)));
  expect(v.events.map(e=>e.age)).toEqual(events.map(e=>e.age));expect(v.events[0].origin.x).toBe(events[0].origin.x+shift.x);
  expect(worldCells(v,{...DEFAULT_WARP,quality:'medium'})).toEqual(cells.map(c=>({...c,x:c.x+shift.x,y:c.y+shift.y})));
  const stable=structuredClone(v);syncUniverseVisuals(v,g);expect(v).toEqual(stable);
 });
 it('uses loaded save origin on the first visual frame without shifting local history',()=>{const g=createGame(endlessLevel);g.universe!.origin={x:2**35,y:-(2**35)};const v=createVisualState(g.players),h=Array.from(v.sources[0].history);syncUniverseVisuals(v,g);expect(v.worldOrigin).toEqual({x:2**46,y:-(2**46)});expect(Array.from(v.sources[0].history)).toEqual(h);});
});
