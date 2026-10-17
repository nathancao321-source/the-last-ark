import { describe, expect, it } from 'vitest';
import { createGame, pause, stepGame, togglePause } from '../src/game/game';
import type { Controls, GameState } from '../src/game/types';
import { NO_CONTROLS } from '../src/game/types';
import { currentLesson } from '../src/game/tutorial';
import { movingWorld } from '../src/levels/moving-world';
import { firstContact } from '../src/levels/first-contact';
import { positionPlayer, fieldControls } from './helpers';
import { SceneController } from '../src/scenes/controller';
import { predictTrajectory } from '../src/game/trajectory';
import { loadProgress, storeProgress } from '../src/game/progress';
import { chapterChoices } from '../src/render/scene-ui';
import { scenes } from '../src/scenes/registry';

/** Only normal directional intents, fields and teaching acknowledgements. */
function pilotSecondPart(g: GameState, launchX=420, aimY=380) {
  positionPlayer(g,1,{x:950,y:450});
  togglePause(g); togglePause(g);
  const fly = (input: Controls) => {
    stepGame(g,input);
    for(let n=0;n<8 && g.phase==='paused' && g.tutorial && !g.tutorial.acknowledged;n++) togglePause(g);
  };
  let stage=0;
  for(let i=0;i<2400 && g.phase==='running';i++) {
    const ship=g.bodies[0];
    if(stage===0 && ship.position.x>=launchX)stage=1;
    if(stage===1 && ship.position.x>=650){pause(g);positionPlayer(g,0,{x:690,y:320});togglePause(g);stage=2;}
    const projected=ship.position.y+(970-ship.position.x)*ship.velocity.y/ship.velocity.x;
    if(stage===2 && projected>=aimY && i%6===0){
      pause(g);stepGame(g,fieldControls([false,true]));
      if(predictTrajectory(g).outcome==='completed')stage=3;
      togglePause(g);
    }
    fly(fieldControls([stage===0||stage===2,stage===3]));
  }
}

describe('The Moving World',()=>{
  for(const launch of [410,420,430])for(const aim of [370,380,390])it(`physically docks after launch ${launch}, tangent ${aim}`,()=>{
    const game=createGame(movingWorld); pilotSecondPart(game,launch,aim);
    expect(game.phase).toBe('completed');expect(Math.hypot(game.bodies[0].velocity.x,game.bodies[0].velocity.y)).toBeLessThanOrEqual(48);
    expect(game.tutorial!.visited).toContain('caution');expect(game.tutorial!.visited).toContain('dock');
    expect(game.bodies.find(b=>b.kind==='planet')!.position).not.toEqual(movingWorld.bodies.find(b=>b.kind==='planet')!.position);
  });
  it('has no new mechanics or fake moving artwork and fails without intervention',()=>{
    const game=createGame(movingWorld), planet=game.bodies.find(b=>b.kind==='planet')!;
    expect(planet).toMatchObject({response:0.18,affectedByFields:true,radius:65,stabilization:{halfLife:1.2}});
    expect(game.bodies.map(b=>b.kind)).toEqual(['ship','planet','station']);
    togglePause(game);togglePause(game);for(let i=0;i<1200&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed');
  });
  it('gives TOO FAST feedback, rejects a fast contact, and accepts a later slow return',()=>{
    const level=structuredClone(movingWorld);delete level.tutorial;
    level.bodies=level.bodies.filter(b=>b.kind!=='planet');
    level.bodies[0].position={x:965,y:340};level.bodies[0].velocity={x:65,y:0};
    const game=createGame(level);togglePause(game);stepGame(game,NO_CONTROLS);
    expect(game.message).toContain('TOO FAST TO DOCK');expect(game.phase).toBe('running');
    for(let i=0;i<100;i++)stepGame(game,NO_CONTROLS);
    expect(game.bodies[0].position.x).toBeLessThan(894);expect(game.bodies[0].velocity.x).toBeCloseTo(-22.75);
    // A separate low-speed return fixture tests the same station, without a capture latch.
    game.bodies[0].position={x:1030,y:340};game.bodies[0].velocity={x:-30,y:0};
    for(let i=0;i<30 && game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('completed');
  });
  it('completes the entire prologue through the live wormhole transition, then continues into Solar Exodus',()=>{
    const c=new SceneController();c.enter('tutorial_part_1');
    const g=c.game!;togglePause(g);togglePause(g);
    positionPlayer(g,0,{x:280,y:230});togglePause(g);
    for(let i=0;i<30;i++)stepGame(g,fieldControls([true,false]));togglePause(g);
    for(let i=0;i<120&&g.phase==='running';i++)stepGame(g,fieldControls([true,false]));
    togglePause(g);positionPlayer(g,1,{x:100,y:460});togglePause(g);
    for(let i=0;i<30;i++)stepGame(g,fieldControls([true,true]));togglePause(g);
    for(let i=0;i<120&&g.phase==='running';i++)stepGame(g,fieldControls([true,true]));
    expect(currentLesson(g)!.id).toBe('exit');
    stepGame(g,NO_CONTROLS);expect(predictTrajectory(g).outcome).toBe('transition');
    togglePause(g);
    for(let i=0;i<2000&&c.scene==='tutorial_part_1';i++)c.step(NO_CONTROLS);
    expect(c.scene).toBe('tutorial_part_2');expect(c.game!.level.id).toBe('moving-world');
    pilotSecondPart(c.game!); c.step(NO_CONTROLS);
    expect(c.game!.phase).toBe('completed');expect(c.game!.message).toContain('Level 0 Complete');
    expect(c.progress.level0Complete).toBe(true);
    expect(chapterChoices(c.registry,c.progress).find(choice=>choice.id==='solar_system')).toMatchObject({playable:true});
    expect(c.enter('solar_system')).toBe(true);expect(scenes.solar_system.level?.id).toBe('solar-exodus');
    expect(firstContact.bodies[0].position).toEqual({x:120,y:360});
  });
  it('persists only the chapter unlock, tolerating corrupt or unavailable local storage',()=>{
    const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
    expect(loadProgress(storage).level0Complete).toBe(false);storeProgress(storage,{level0Complete:true});expect(loadProgress(storage).level0Complete).toBe(true);
    data.set('the-last-ark.progress.v1','broken');expect(loadProgress(storage).level0Complete).toBe(false);
    const denied={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');}};
    expect(loadProgress(denied).level0Complete).toBe(false);expect(()=>storeProgress(denied,{level0Complete:true})).not.toThrow();
  });
});
