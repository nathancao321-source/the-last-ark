import {describe,it,expect} from 'vitest';
import {createBody} from '../src/game/entities';
import type {Body,Level} from '../src/game/types';
import {NO_CONTROLS} from '../src/game/types';
import {createGame,stepGame,togglePause,retryGame,pause} from '../src/game/game';
import {firstLevel} from '../src/levels/first';
import {sweptCircle} from '../src/physics/collision';
import {integrateContacts,collisionSubsteps} from '../src/physics/contact-world';
import {resolveContact,inverseMass} from '../src/physics/collision-resolution';
import {collisionMass} from '../src/physics/collision-policy';
import {length,sub} from '../src/physics/vector';
import {sampleOrbit} from '../src/physics/orbits';
import {predictTrajectory} from '../src/game/trajectory';
import {createCamera,followGroup,setZoom,resizeCamera} from '../src/camera/camera';
import {visibleEntities} from '../src/render/visibility';
import {collisionFixture} from '../src/debug/collision-fixtures';
import {scenes} from '../src/scenes/registry';

function body(id:string,kind:Body['kind']='asteroid',x=0,y=0,radius=10):Body {
  return createBody({id,kind,position:{x,y},radius,emitsGravity:false,receivesGravity:false,affectedByFields:false});
}
const tick=(bodies:Body[],dt=1/60)=>integrateContacts(bodies,[],dt);
const energy=(bodies:Body[])=>bodies.reduce((sum,b)=>sum+collisionMass(b)*length(b.velocity)**2/2,0);
function fixture(extra:Body[],speed=100):Level {
  const level=structuredClone(firstLevel);delete level.port;delete level.mission;
  const ship=body('ark','ship',0,0,1);ship.velocity.x=speed;
  level.bodies=[ship,...extra];return level;
}
function dockLevel(speed:number):Level {
  const level=fixture([body('station','wormhole',30,0,8)],speed);
  level.mission={objectives:[{id:'dock',label:'dock',condition:{type:'near_entity',entityId:'ark',targetId:'station',maxSpeed:48,fullContainment:true}}],triggers:[]};
  return level;
}
describe('circle detection and impulse resolution',()=>{
  it('finds the first hit with both circles moving, including coincident centers',()=>{
    const contact=sweptCircle({x:-4,y:0},{x:4,y:0},{x:4,y:0},{x:-4,y:0},2)!;
    expect(contact.time).toBeCloseTo(.375);expect(contact.normal).toEqual({x:1,y:0});
    expect(sweptCircle({x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0},2)).toEqual({time:0,normal:{x:1,y:0},penetration:2});
    expect(sweptCircle({x:0,y:0},{x:-10,y:0},{x:10,y:0},{x:20,y:0},2)).toBeUndefined();
  });
  it('rebounds head-on asteroids with configurable restitution and conserved momentum',()=>{
    const a=body('a','asteroid',-10.5),b=body('b','asteroid',10.5);a.velocity.x=60;b.velocity.x=-60;
    a.contact=b.contact={mass:2,restitution:.5};const initial=energy([a,b]);
    const result=tick([a,b]);expect(result.events).toHaveLength(1);expect(a.velocity.x).toBeCloseTo(-30);expect(b.velocity.x).toBeCloseTo(30);
    expect(energy([a,b])).toBeCloseTo(initial*.25);expect(length(sub(a.position,b.position))).toBeGreaterThanOrEqual(20);
  });
  it('preserves tangential velocity in a glancing collision',()=>{
    const a=body('a'),b=body('b','asteroid',20);a.velocity={x:40,y:15};b.velocity={x:-10,y:-8};
    resolveContact(a,b,{x:1,y:0},0);expect(a.velocity.y).toBe(15);expect(b.velocity.y).toBe(-8);
    expect(a.velocity.x).toBeLessThan(40);expect(b.velocity.x).toBeGreaterThan(-10);
  });
  it('computes an oblique swept contact normal and deflects both asteroid paths',()=>{
    const a=body('a','asteroid',-10,0),b=body('b','asteroid',10,8);a.velocity.x=60;b.velocity.x=-60;
    const before=energy([a,b]);const result=tick([a,b]);expect(result.events).toHaveLength(1);
    expect(a.velocity.y).toBeLessThan(0);expect(b.velocity.y).toBeGreaterThan(0);expect(energy([a,b])).toBeLessThan(before);
    expect(length(sub(a.position,b.position))).toBeGreaterThanOrEqual(20);
  });
  it('uses unequal inverse masses rather than equal velocity swaps',()=>{
    const a=body('a'),b=body('b','asteroid',20);a.contact={mass:1,restitution:1};b.contact={mass:3,restitution:1};a.velocity.x=40;
    resolveContact(a,b,{x:1,y:0},0);expect(a.velocity.x).toBeCloseTo(-20);expect(b.velocity.x).toBeCloseTo(20);
    expect(a.velocity.x+3*b.velocity.x).toBeCloseTo(40);
  });
  it('separates deep and coincident overlaps without an impulse on receding pairs',()=>{
    const a=body('a'),b=body('b','asteroid',19);a.velocity.x=-10;b.velocity.x=10;
    tick([a,b]);expect(length(sub(a.position,b.position))).toBeGreaterThanOrEqual(20);
    expect(a.velocity.x).toBe(-10);expect(b.velocity.x).toBe(10);
    const c=body('c'),d=body('d');tick([c,d]);expect(length(sub(c.position,d.position))).toBeGreaterThanOrEqual(20);
  });
  it('never imparts an impulse or position correction to static and kinematic bodies',()=>{
    for(const motion of ['static','kinematic'] as const){
      const a=body('a'),b=body('b','asteroid',19);b.motion=motion;a.velocity.x=20;
      resolveContact(a,b,{x:1,y:0},1);expect(b.position.x).toBe(19);expect(b.velocity.x).toBe(0);expect(inverseMass(b)).toBe(0);
    }
  });
  it('ignores stale static velocity and uses configured restitution',()=>{
    const a=body('a'),b=body('b','asteroid',20);a.velocity.x=100;b.motion='static';b.velocity.x=999;b.contact={restitution:.2};
    resolveContact(a,b,{x:1,y:0},0);expect(a.velocity.x).toBeCloseTo(-20);expect(b.velocity.x).toBe(999);
  });
  it('processes a second collision in the remaining fraction of the same step',()=>{
    const a=body('a','asteroid',0,0,.3),b=body('b','asteroid',1,0,.3),c=body('c','asteroid',2,0,.3);
    for(const item of [a,b,c])item.contact={mass:1,restitution:1};a.velocity.x=240;
    const result=tick([a,b,c]);expect(result.events.length).toBe(2);expect(c.velocity.x).toBeCloseTo(240);
    expect(result.budgetExhausted).toBe(false);
  });
  it('keeps a repeatedly contacting pile finite, separated and non-energizing',()=>{
    const bodies=Array.from({length:6},(_,i)=>{const b=body(String(i),'asteroid',i*19.7);b.velocity.x=i%2? -30:30;return b;});
    let previous=energy(bodies);
    for(let i=0;i<1800;i++){
      tick(bodies);const current=energy(bodies);expect(current).toBeLessThanOrEqual(previous+1e-6);previous=current;
      for(const b of bodies){expect(Number.isFinite(b.position.x)).toBe(true);expect(length(b.velocity)).toBeLessThanOrEqual(240);}
    }
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)expect(length(sub(bodies[i].position,bodies[j].position))).toBeGreaterThanOrEqual(20-1e-4);
  });
  it('subdivides curved, high acceleration sweeps without an unbounded work budget',()=>{
    const b=body('small','asteroid',0,0,.1);b.orbit={center:{x:0,y:0},radius:100,angularSpeed:5,phase:0};
    expect(collisionSubsteps([b],1/60)).toBeGreaterThan(1);expect(collisionSubsteps([b],100)).toBe(16);
    expect(collisionSubsteps([body('ordinary')],1/60)).toBe(1);
  });
  it('detects contact on a curved orbital arc missed by the full-step chord',()=>{
    const planet=body('planet','planet',10,0,.03);planet.motion='kinematic';
    planet.orbit={center:{x:0,y:0},radius:10,angularSpeed:20,phase:0};planet.velocity=sampleOrbit(planet.orbit,0).velocity;
    const midpoint=sampleOrbit(planet.orbit,1/120).position,rock=body('rock','asteroid',midpoint.x,midpoint.y,.03);rock.motion='static';
    expect(sweptCircle(planet.position,sampleOrbit(planet.orbit,1/60).position,rock.position,rock.position,.06)).toBeUndefined();
    const result=tick([planet,rock]);expect(result.substeps).toBeGreaterThan(1);expect(result.bodies).toEqual([planet]);
  });
});
describe('type policies, mission integration and continuous contacts',()=>{
  it.each(['planet','star'] as const)('absorbs an asteroid into a %s without kicking the large body',kind=>{
    const large=body('large',kind,30,0,20),rock=body('rock','asteroid',8,0,1);rock.velocity.x=240;
    const result=tick([large,rock]);expect(result.bodies.map(b=>b.id)).toEqual(['large']);expect(large.velocity).toEqual({x:0,y:0});
    expect(result.events).toHaveLength(1);expect(visibleEntities(createCamera({x:0,y:0}),result.bodies)).not.toContain(rock);
  });
  it('destroys the smaller colliding planet by default rather than elastically bouncing',()=>{
    const a=body('a','planet',0,0,20),b=body('b','planet',29,0,10);b.velocity.x=-20;
    const result=tick([a,b]);expect(result.bodies).toEqual([a]);expect(a.velocity.x).toBe(0);
  });
  it('supports explicit merge/failure policies and removes an obsolete orbit after merge',()=>{
    const a=body('a','planet',0,0,20),b=body('b','planet',29,0,10);
    a.contact={mass:2,largeBody:'merge'};b.contact={mass:1};a.orbit={center:{x:-100,y:0},radius:100,angularSpeed:0,phase:0};b.velocity.x=30;
    const result=tick([a,b]);expect(result.bodies).toHaveLength(1);expect(a.velocity.x).toBeCloseTo(10);expect(a.orbit).toBeUndefined();expect(a.radius).toBeCloseTo(Math.cbrt(9000));
    const c=body('c','planet'),d=body('d','planet',10);c.contact={largeBody:'fail'};expect(tick([c,d]).failure).toContain('任务失败');
  });
  it('preserves a prescribed planet orbit while absorbing a crossing asteroid',()=>{
    const planet=body('planet','planet',100,0,20);planet.orbit={center:{x:0,y:0},radius:100,angularSpeed:.2,phase:0};planet.velocity=sampleOrbit(planet.orbit,0).velocity;
    const rock=body('rock','asteroid',79,0,1);rock.velocity.x=100;
    let bodies=tick([planet,rock]).bodies;expect(bodies).toHaveLength(1);
    for(let i=1;i<600;i++)bodies=tick(bodies).bodies;
    expect(planet.position.x).toBeCloseTo(sampleOrbit(planet.orbit,10).position.x,8);expect(length(planet.position)).toBeCloseTo(100,8);
  });
  it('catches a ship and a moving tiny asteroid crossing completely within one fixed step',()=>{
    const rock=body('rock','asteroid',2,0,.2);rock.velocity.x=-240;
    const level=fixture([rock],240);level.bodies[0].radius=.2;
    const g=createGame(level);togglePause(g);stepGame(g,NO_CONTROLS);expect(g.phase).toBe('failed');expect(g.bodies[0].position.x).toBeLessThan(2);
    const snapshot=structuredClone(g);stepGame(g,NO_CONTROLS);expect(g).toEqual(snapshot);expect(g.collisionEvents).toHaveLength(1);
    expect(retryGame(g).bodies).toEqual(level.bodies);
  });
  it('fails on the solar physical radius, not a decorative halo or ring',()=>{
    const sun=body('sun','star',30,0,10);sun.appearance={name:'Sun',color:'yellow',ring:true};
    const g=createGame(fixture([sun],240));togglePause(g);
    for(let i=0;i<4;i++)stepGame(g,NO_CONTROLS);expect(g.phase).toBe('running');
    stepGame(g,NO_CONTROLS);expect(g.phase).toBe('failed');expect(g.bodies[0].position.x).toBeCloseTo(19);
  });
  it('accepts slow wormhole entry and allows a fast ship through without an impulse',()=>{
    const slow=createGame(dockLevel(30));togglePause(slow);for(let i=0;i<60&&slow.phase==='running';i++)stepGame(slow,NO_CONTROLS);
    expect(slow.phase).toBe('completed');expect(length(slow.bodies[0].velocity)).toBe(30);
    const fast=createGame(dockLevel(240));togglePause(fast);for(let i=0;i<10;i++)stepGame(fast,NO_CONTROLS);
    expect(fast.phase).toBe('running');expect(fast.bodies[0].position.x).toBeCloseTo(40);expect(fast.bodies[0].velocity.x).toBe(240);expect(fast.message).toContain('TOO FAST');expect(fast.collisionEvents).toEqual([]);
  });
  it('counts actual flight to a fatal contact instead of the unobstructed full step',()=>{
    const ship=body('ark','ship',0,0,1),rock=body('rock','asteroid',4,0,1);ship.velocity.x=240;
    const result=tick([ship,rock]);expect(result.shipDistance).toBeCloseTo(2);expect(ship.position.x).toBeCloseTo(2);expect(result.failure).toBeDefined();
  });
  it.each(['collision-bounce','collision-ccd','collision-transfer','collision-transfer-slow'])('runs the browser fixture %s through the normal game loop',section=>{
    const g=createGame(collisionFixture(firstLevel,section)!);togglePause(g);
    for(let i=0;i<180&&g.phase==='running';i++)stepGame(g,NO_CONTROLS);
    expect(g.phase).toBe(section==='collision-ccd'?'failed':section==='collision-transfer-slow'?'completed':'running');
    if(section==='collision-bounce')expect(g.bodies[1].velocity.x).toBeCloseTo(-45);
    if(section==='collision-transfer'){expect(g.bodies[0].velocity.x).toBe(240);expect(g.bodies[0].position.x).toBeGreaterThan(818);}
  });
  it('enforces transfer speed and prerequisites as mission conditions without blocking flight',()=>{
    const level=dockLevel(30);level.mission!.objectives[0].condition={type:'near_entity',entityId:'ark',targetId:'station',maxSpeed:20,fullContainment:true};
    const g=createGame(level);togglePause(g);for(let i=0;i<80;i++)stepGame(g,NO_CONTROLS);expect(g.phase).toBe('running');expect(g.bodies[0].velocity.x).toBe(30);
    const blocked=dockLevel(30);blocked.mission!.objectives[0].requires=['permission'];const h=createGame(blocked);togglePause(h);for(let i=0;i<80;i++)stepGame(h,NO_CONTROLS);expect(h.phase).toBe('running');expect(h.bodies[0].position.x).toBe(40);
  });
  it.each(['station','wormhole'] as const)('treats %s as trigger-only for all ordinary bodies, even legacy hazard configs',kind=>{
    for(const movingKind of ['ship','asteroid','planet'] as const){
      const mover=body('moving',movingKind,0,0,1),gate=body('gate',kind,2,0,1);gate.collision='hazard';mover.velocity.x=240;
      const result=tick([mover,gate]);expect(result.events).toEqual([]);expect(result.bodies).toHaveLength(2);expect(mover.position.x).toBe(4);expect(mover.velocity.x).toBe(240);
    }
  });
  it('uses wormholes for every configured chapter and prototype goal',()=>{
    for(const scene of Object.values(scenes))expect(scene.level?.bodies.some(b=>b.kind==='station')??false).toBe(false);
    expect(firstLevel.bodies.find(b=>b.id==='station')?.kind).toBe('wormhole');
  });
  it('keeps wormholes as swept transition triggers with no ordinary impulse',()=>{
    const level=fixture([body('gate','wormhole',2,0,.25)],240);level.mission={objectives:[],triggers:[{id:'gate',condition:{type:'near_entity',entityId:'ark',targetId:'gate'},actions:[{type:'transition',scene:'tutorial_part_2'}]}]};
    const g=createGame(level);togglePause(g);stepGame(g,NO_CONTROLS);expect(g.pendingScene).toBe('tutorial_part_2');expect(g.bodies[0].velocity.x).toBe(240);expect(g.collisionEvents).toEqual([]);
  });
  it('absorbs ordinary bodies at an event horizon and gives a ship no rebound or escape',()=>{
    const hole=body('hole','black_hole',4,0,2);hole.captureRadius=2;
    const rock=body('rock','asteroid',0,0,.2);rock.velocity.x=240;expect(tick([hole,rock]).bodies).toEqual([hole]);
    const g=createGame(fixture([hole],240));togglePause(g);stepGame(g,NO_CONTROLS);expect(g.phase).toBe('failed');expect(g.bodies[0].velocity.x).toBe(240);expect(g.bodies[0].position.x).toBeCloseTo(1);
  });
  it('does not give either control node a solid collider',()=>{
    const g=createGame(fixture([],240));g.players.forEach(p=>{p.position={x:2,y:0};});togglePause(g);stepGame(g,NO_CONTROLS);
    expect(g.phase).toBe('running');expect(g.bodies[0].velocity.x).toBe(240);expect(g.players.map(p=>p.velocity)).toEqual([{x:0,y:0},{x:0,y:0}]);
  });
  it('keeps offscreen collisions, camera transforms, pause and prediction independent',()=>{
    const level=dockLevel(240),g=createGame(level),h=createGame(level);const camera=createCamera({x:1e5,y:1e5});
    expect(visibleEntities(camera,g.bodies)).toHaveLength(0);const before=structuredClone(g);const forecast=predictTrajectory(g);expect(g).toEqual(before);
    togglePause(g);togglePause(h);
    for(let i=0;i<720;i++){setZoom(camera,i%2?.1:2);resizeCamera(camera,300+i,400);followGroup(camera,h.bodies,1/60);stepGame(g,NO_CONTROLS);stepGame(h,NO_CONTROLS);}
    expect(h).toEqual(g);expect(g.bodies[0].position).toEqual(forecast.points.at(-1));pause(g);const stopped=structuredClone(g.bodies);stepGame(g,NO_CONTROLS);expect(g.bodies).toEqual(stopped);
  });
});
