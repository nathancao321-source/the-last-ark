import { afterEach, describe, expect, it, vi } from 'vitest';
import { XboxInput, stickIntent } from '../src/input/gamepad';
import type { PadState } from '../src/input/gamepad';
import { MouseInput } from '../src/input/mouse';
import { createCamera, follow } from '../src/camera/camera';
import { createGame, stepGame } from '../src/game/game';
import { firstContact } from '../src/levels/first-contact';
import { PlayerInputs } from '../src/input/sources';
import { Keyboard } from '../src/input/keyboard';
import { TutorialOverlay } from '../src/render/tutorial-overlay';
const pad = (): PadState => ({connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))});

describe('real Gamepad adapter contract (synthetic standard Xbox reports)',()=>{
  it('applies a radial deadzone and preserves analog magnitude',()=>{
    expect(stickIntent(0.1,-0.1)).toEqual({moveX:0,moveY:0});
    expect(stickIntent(0.625,0).moveX).toBeCloseTo(0.5);
    const diagonal=stickIntent(1,1);expect(Math.hypot(diagonal.moveX,diagonal.moveY)).toBeCloseTo(1);
    expect(stickIntent(NaN,Infinity)).toEqual({moveX:0,moveY:0});
  });
  it('requires neutral on assignment, toggles A once per press and allows simultaneous movement',()=>{
    const report=pad(), input=new XboxInput(0,()=>[report],()=>true,()=>{});
    report.axes=[1,0];report.buttons[0].pressed=true;
    expect(input.read()).toEqual({moveX:0,moveY:0,abilityActive:false});
    report.axes=[0,0];report.buttons[0].pressed=false;input.read();
    report.axes=[1,0];report.buttons[0].pressed=true;
    for(let i=0;i<60;i++)expect(input.read()).toEqual({moveX:1,moveY:0,abilityActive:true});
    report.buttons[0].pressed=false;input.read();report.buttons[0].pressed=true;
    expect(input.read().abilityActive).toBe(false);
  });
  it('reads separate controller slots and edge-detects Menu exactly once',()=>{
    const reports=[pad(),pad()], actions:string[]=[];
    const a=new XboxInput(0,()=>reports,()=>true,()=>actions.push('p1'));
    const b=new XboxInput(1,()=>reports,()=>true,()=>actions.push('p2'));
    a.read();b.read();reports[0].axes=[1,0];reports[1].axes=[0,-1];reports[1].buttons[9].pressed=true;
    for(let i=0;i<20;i++){expect(a.read().moveX).toBe(1);expect(b.read().moveY).toBe(-1);}
    expect(actions).toEqual(['p2']);
  });
  it('clears ability and movement on disconnect and never imports held buttons on reconnect',()=>{
    let report: PadState|null=pad();const input=new XboxInput(0,()=>[report],()=>true,()=>{});
    input.read();report.buttons[0].pressed=true;expect(input.read().abilityActive).toBe(true);
    report=null;expect(input.read()).toEqual({moveX:0,moveY:0,abilityActive:false});
    report=pad();report.buttons[0].pressed=true;expect(input.read().abilityActive).toBe(false);
    report.buttons[0].pressed=false;input.read();report.buttons[0].pressed=true;expect(input.read().abilityActive).toBe(true);
  });
  it('retains deliberate ability state across focus loss but waits for neutral before movement resumes',()=>{
    const report=pad();let focused=true;
    const input=new XboxInput(0,()=>[report],()=>focused,()=>{});input.read();report.buttons[0].pressed=true;input.read();
    report.axes=[1,0];focused=false;expect(input.read()).toEqual({moveX:0,moveY:0,abilityActive:true});
    focused=true;expect(input.read().moveX).toBe(0);
    report.axes=[0,0];report.buttons[0].pressed=false;input.read();report.axes=[1,0];expect(input.read().moveX).toBe(1);
  });
  it('safely rejects unsupported mappings and unavailable browser APIs',()=>{
    const report=pad();report.mapping='';const input=new XboxInput(0,()=>[report],()=>true,()=>{});
    expect(input.read().abilityActive).toBe(false);expect(input.status).toContain('标准');
    const unavailable=new XboxInput(0,()=>{throw new Error('unsupported');},()=>true,()=>{});
    expect(unavailable.read()).toEqual({moveX:0,moveY:0,abilityActive:false});
  });
  it('drives the existing acceleration and field pipeline alongside the keyboard',()=>{
    const report=pad(), xbox=new XboxInput(0,()=>[report],()=>true,()=>{}), keyboard=new Keyboard(()=>{});
    const inputs=new PlayerInputs([keyboard.source(0),xbox]), game=createGame(firstContact);
    inputs.read(); keyboard.keyDown('KeyD');keyboard.keyDown('KeyF');report.axes=[-1,0];report.buttons[0].pressed=true;
    stepGame(game,inputs.read());expect(game.players[1].velocity.x).toBeCloseTo(-650/60);
    for(let i=0;i<30;i++)stepGame(game,inputs.read());
    expect(game.players[0].velocity.x).toBe(260);expect(game.players[1].velocity.x).toBe(-260);expect(game.players.every(p=>p.active)).toBe(true);
  });
});

describe('mouse event adapter',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  function fixture() {
    vi.stubGlobal('document',{hasFocus:()=>true});
    class Canvas extends EventTarget { getBoundingClientRect(){return {left:0,top:0,width:1100,height:620};} focus(){} }
    const canvas=new Canvas(), camera=createCamera({x:0,y:0}), mouse=new MouseInput();mouse.setSelected(true);
    const detach=mouse.attach(canvas as unknown as HTMLCanvasElement,camera);
    const event=(type:string,x:number,y:number,button=0)=>{const e=new Event(type);Object.assign(e,{clientX:x,clientY:y,button,pointerType:'mouse'});canvas.dispatchEvent(e);};
    return {mouse,camera,detach,event};
  }
  it('reprojects a stationary pointer after camera movement without another pointer event',()=>{
    const {mouse,camera,detach,event}=fixture();event('pointermove',750,310);
    const target=mouse.read().targetWorldPosition;expect(target).toEqual({x:250,y:0});
    follow(camera,{x:2000,y:1000},{x:100,y:0},1,true);
    expect(mouse.read().targetWorldPosition).toEqual({x:2315,y:1000});
    event('pointermove',751,310);expect(mouse.read().targetWorldPosition).not.toEqual(target);detach();
  });
  it('right click latches braking across release, pointer and camera motion; next click resumes',()=>{
    const {mouse,camera,detach,event}=fixture(),game=createGame(firstContact);
    event('pointerdown',950,310);
    const input=()=>({players:[mouse.read(),{moveX:0,moveY:0,abilityActive:false}] as const});
    for(let i=0;i<30;i++)stepGame(game,input());
    event('pointerdown',950,310,2);follow(camera,{x:4000,y:0},{x:0,y:0},1,true);
    event('pointerup',950,310,2);event('pointermove',960,320);
    expect(mouse.read().targetWorldPosition).toBeUndefined();expect(mouse.read().abilityActive).toBe(true);
    for(let i=0;i<90;i++)stepGame(game,input());
    expect(Math.hypot(game.players[0].velocity.x,game.players[0].velocity.y)).toBe(0);
    event('pointerdown',950,310,2);expect(mouse.read().targetWorldPosition!.x).toBeGreaterThan(4000);detach();
  });
  it('toggles only left clicks on the assigned pointer and resets on unassignment',()=>{
    const {mouse,detach,event}=fixture();event('pointerdown',750,310,2);expect(mouse.read().abilityActive).toBe(false);
    event('pointerdown',750,310);expect(mouse.read().abilityActive).toBe(true);
    mouse.releaseMovement();expect(mouse.read().targetWorldPosition).toBeUndefined();expect(mouse.read().abilityActive).toBe(true);
    mouse.setSelected(false);event('pointerdown',800,400);expect(mouse.read().abilityActive).toBe(false);expect(mouse.read().targetWorldPosition).toBeUndefined();detach();
  });
  it('moves through finite acceleration and can coexist with a gamepad channel',()=>{
    const {mouse,detach,event}=fixture(), report=pad(), xbox=new XboxInput(0,()=>[report],()=>true,()=>{});
    const game=createGame(firstContact), inputs=new PlayerInputs([mouse,xbox]);inputs.read();
    event('pointerdown',950,390);report.axes=[0,-1];
    const start={...game.players[0].position};stepGame(game,inputs.read());
    expect(Math.hypot(game.players[0].position.x-start.x,game.players[0].position.y-start.y)).toBeLessThan(1);
    expect(game.players[0].position).not.toEqual(mouse.read().targetWorldPosition);
    expect(game.players[0].active).toBe(true);expect(game.players[1].velocity.y).toBeLessThan(0);detach();
  });
});

describe('on-map teaching fade',()=>{
  it('fades in, fades out after confirmation and emits one acknowledgement only after disappearing',()=>{
    const overlay=new TutorialOverlay();overlay.sync('intro','story');
    overlay.update(0.1);expect(overlay.alpha).toBeGreaterThan(0);expect(overlay.alpha).toBeLessThan(1);
    for(let i=0;i<5;i++)overlay.update(0.1);expect(overlay.alpha).toBe(1);
    expect(overlay.dismiss()).toBe(true);expect(overlay.update(0.1)).toBeUndefined();expect(overlay.alpha).toBeGreaterThan(0);
    overlay.dismiss();overlay.update(0.1);expect(overlay.update(0.1)).toBe('intro');expect(overlay.alpha).toBe(0);
    expect(overlay.update(0.1)).toBeUndefined();expect(overlay.dismiss()).toBe(false);
  });
  it('resets on retry/stage change and adapts device instructions without restarting the fade',()=>{
    const overlay=new TutorialOverlay();overlay.sync('scene:1:move','WASD');overlay.update(0.1);
    const alpha=overlay.alpha;overlay.sync('scene:1:move','左摇杆');expect(overlay.text).toBe('左摇杆');expect(overlay.alpha).toBe(alpha);
    overlay.sync('scene:2:move','retry');expect(overlay.alpha).toBe(0);expect(overlay.update(NaN)).toBeUndefined();
    overlay.sync(undefined);expect(overlay.dismiss()).toBe(false);
  });
});

// Regressions for actual controller release and noisy return-to-center reports.
describe('Xbox release drift regression',()=>{
  it('settles after release with drift and remains still for ten seconds while ability stays enabled',()=>{
    const report=pad(),xbox=new XboxInput(0,()=>[report],()=>true,()=>{}),game=createGame(firstContact);
    xbox.read();report.axes=[1,0];report.buttons[0].pressed=true;
    const input=()=>({players:[xbox.read(),{moveX:0,moveY:0,abilityActive:false}] as const});
    for(let i=0;i<90;i++)stepGame(game,input());
    report.axes=[0.12,-0.17];report.buttons[0].pressed=false;
    for(let i=0;i<40;i++)stepGame(game,input());
    expect(game.players[0].velocity).toEqual({x:0,y:0});const stopped={...game.players[0].position};
    for(let i=0;i<600;i++){report.axes=[0.19*Math.sin(i),0.19*Math.cos(i)];stepGame(game,input());}
    expect(game.players[0].position).toEqual(stopped);expect(game.players[0].active).toBe(true);
    report.axes=[0.29,0];expect(xbox.read().moveX).toBe(0);
    report.axes=[0.8,0];expect(xbox.read().moveX).toBeGreaterThan(0);
  });
});
