import { describe, expect, it } from 'vitest';
import { createCamera, follow, resizeCamera, screenToWorld, setZoom, worldToScreen } from '../src/camera/camera';
import { edgeMarker, mapPoint, navigationBounds } from '../src/camera/navigation';
import { createGame, stepGame, togglePause } from '../src/game/game';
import { firstLevel } from '../src/levels/first';
import { NO_CONTROLS } from '../src/game/types';
import { visibleEntities } from '../src/render/visibility';

describe('camera and navigation', () => {
  it.each([0.3, 0.8, 2])('round-trips negative and distant world coordinates at zoom %s', zoom => {
    const camera = createCamera({x:-5000,y:2000},800,400); setZoom(camera,zoom);
    for (const point of [{x:-8500,y:2100},{x:12000,y:-7000}]) {
      const back = screenToWorld(camera,worldToScreen(camera,point));
      expect(back.x).toBeCloseTo(point.x,9); expect(back.y).toBeCloseTo(point.y,9);
    }
  });
  it('smooths follow with bounded velocity lookahead, independent of render rate for a fixed target', () => {
    const results = [30,60,144].map(fps => {
      const c = createCamera({x:0,y:0}); for (let i=0;i<fps;i++) follow(c,{x:100,y:100},{x:240,y:0},1/fps);
      return c;
    });
    expect(results[0].position.x).toBeCloseTo(results[2].position.x,9);
    expect(results[0].position.x).toBeGreaterThan(100); expect(results[0].position.x).toBeLessThan(240);
  });
  it('zoom and resizing cannot change simulation state', () => {
    const a=createGame(firstLevel), b=createGame(firstLevel); togglePause(a); togglePause(b);
    const c=createCamera(a.bodies[0].position);
    for(let i=0;i<180;i++) {
      resizeCamera(c,300+i,900-i); setZoom(c,i%2 ? 0.3 : 2); follow(c,a.bodies[0].position,a.bodies[0].velocity,1/60);
      stepGame(a,NO_CONTROLS); stepGame(b,NO_CONTROLS);
    }
    expect(a).toEqual(b); expect(c.position).not.toEqual(a.bodies[0].position);
  });
  it('culls actual entities but retains circles intersecting the view', () => {
    const c=createCamera({x:0,y:0},200,100); setZoom(c,1);
    const bodies=structuredClone(firstLevel.bodies);
    bodies[0].position={x:0,y:0}; bodies[1].position={x:150,y:0}; bodies[2].position={x:-2000,y:0}; bodies[3].layer='hidden';
    expect(visibleEntities(c,bodies).map(b=>b.id)).toEqual(['ark','planet']);
    expect(bodies).toHaveLength(4);
  });
  it.each([{x:1000,y:0},{x:-1000,y:0},{x:0,y:1000},{x:0,y:-1000},{x:1000,y:-1000}])('places offscreen target %j inside inset edges', target => {
    const c=createCamera({x:0,y:0},800,400); setZoom(c,1);
    const marker=edgeMarker(c,target)!;
    expect(marker.position.x).toBeGreaterThanOrEqual(30); expect(marker.position.x).toBeLessThanOrEqual(770);
    expect(marker.position.y).toBeGreaterThanOrEqual(30); expect(marker.position.y).toBeLessThanOrEqual(370);
    expect(marker.angle).toBeCloseTo(Math.atan2(target.y,target.x)); expect(marker.distance).toBe(Math.hypot(target.x,target.y));
    expect(edgeMarker(c,{x:0,y:0})).toBeUndefined();
  });
  it('maps negative world coordinates and extends the navigation bounds with explorers', () => {
    const base={minX:-100,minY:-100,maxX:100,maxY:100}, panel={minX:10,minY:20,maxX:210,maxY:120};
    expect(mapPoint({x:0,y:0},base,panel)).toEqual({x:110,y:70});
    expect(mapPoint({x:1000,y:-1000},base,panel)).toEqual({x:210,y:20});
    expect(navigationBounds(base,[{x:-1000,y:2000}])).toEqual({minX:-1100,minY:-100,maxX:100,maxY:2100});
    expect(base.minX).toBe(-100);
  });
});
import { followGroup } from '../src/camera/camera';
describe('cooperative automatic framing',()=>{
  const group=(spread:number)=>[{position:{x:0,y:0},velocity:{x:100,y:0},radius:8},{position:{x:spread,y:spread/2},velocity:{x:260,y:0},radius:13},{position:{x:-spread,y:-spread},velocity:{x:0,y:0},radius:13}];
  it('keeps all three participants in frame at any separation, even after resize',()=>{
    const camera=createCamera({x:0,y:0});
    for(const distance of [100,1000,10000,1e7]) {
      const bodies=group(distance);resizeCamera(camera,640,380);followGroup(camera,bodies,1/60);
      for(const body of bodies){const p=worldToScreen(camera,body.position);expect(p.x).toBeGreaterThan(30);expect(p.x).toBeLessThan(610);expect(p.y).toBeGreaterThan(30);expect(p.y).toBeLessThan(350);}
    }
    expect(camera.zoom).toBeLessThan(0.0001);
  });
  it('smoothly zooms back in to a configured ceiling without touching world positions',()=>{
    const camera=createCamera({x:0,y:0});followGroup(camera,group(5000),1,true);const far=camera.zoom,bodies=group(30),before=structuredClone(bodies);
    followGroup(camera,bodies,1/60);expect(camera.zoom).toBeGreaterThan(far);expect(camera.zoom).toBeLessThan(0.8);
    for(let i=0;i<1000;i++)followGroup(camera,bodies,1/60);expect(camera.zoom).toBeCloseTo(0.8);expect(bodies).toEqual(before);
  });
  it('converges without oscillating when participants remain stationary',()=>{
    const c=createCamera({x:-1000,y:500}), bodies=group(800);
    for(const body of bodies)body.velocity={x:0,y:0};
    for(let i=0;i<1200;i++)followGroup(c,bodies,1/60);
    const settled=structuredClone(c);
    for(let i=0;i<600;i++)followGroup(c,bodies,1/60);
    expect(c.position.x).toBeCloseTo(settled.position.x,9);
    expect(c.position.y).toBeCloseTo(settled.position.y,9);
    expect(c.zoom).toBeCloseTo(settled.zoom,9);
  });
});
