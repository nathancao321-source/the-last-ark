import './style.css';
import { firstLevel } from '../levels/first';
import type { Phase } from '../game/types';
import { Keyboard } from '../input/keyboard';
import { FixedClock } from '../game/clock';
import { FIXED_DT } from '../game/game';
import { applyPlayerIntent } from '../physics/player';
import { createCamera,followGroup,resizeCamera,setZoom } from '../camera/camera';
import { createVisualState,updateVisuals } from '../render/spacetime/model';
import { createDemoRenderer,drawDemo } from '../render/spacetime/renderer';
import { parseWarp,RANGES,setParameter } from '../render/spacetime/config';
import type { NumericParameter,Quality } from '../render/spacetime/config';
import { DEFAULT_ART,ART_LIMITS,setArt } from '../render/spacetime/art';
import type { ArtParameter,ArtConfig } from '../render/spacetime/art';
import { peekNodeAtlas } from '../render/spacetime/nodes';
import { drawAnchors } from '../render/spacetime/anchors';
const canvas=document.querySelector<HTMLCanvasElement>('#vfx-canvas')!,ctx=canvas.getContext('2d')!;
const config=parseWarp(location.search),art={...DEFAULT_ART},clock=new FixedClock(),camera=createCamera({x:0,y:0});
let players=structuredClone(firstLevel.players),revision=0,phase:Phase='running';
const cameraOffset={x:0,y:0};let debugAnchors=false,freezeTime=false;
function place(overlap=false):void {players=structuredClone(firstLevel.players);players[0].position={x:overlap?-65:-165,y:0};players[1].position={x:overlap?65:165,y:0};}
place();let visuals=createVisualState(players),renderer=createDemoRenderer();
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
function pause():void {phase=phase==='running'?'paused':'running';clock.reset();el('pause').textContent=phase==='running'?'暂停':'继续';}
function reset(overlap=false):void {place(overlap);revision++;visuals=createVisualState(players,revision);renderer={...createDemoRenderer(),background:renderer.background};clock.reset();keyboard.clear();phase='running';cameraOffset.x=0;cameraOffset.y=0;el<HTMLInputElement>('camera-test-x').value='0';el<HTMLInputElement>('camera-test-y').value='0';el('pause').textContent='暂停';followGroup(camera,players,0,true);}
const keyboard=new Keyboard(action=>{
  if(action==='toggle')pause();
  if(action==='restart'||action==='reset')reset();
  if(action==='blur'&&phase==='running')pause();
  if(action==='zoom-in')setZoom(camera,(camera.preferredZoom??1)*1.1);
  if(action==='zoom-out')setZoom(camera,(camera.preferredZoom??1)/1.1);
  if(action==='zoom-reset')setZoom(camera,1);
});keyboard.attach(window);
setZoom(camera,1.3);
function resize():void {const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);canvas.width=Math.round(box.width*dpr);canvas.height=Math.round(box.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);resizeCamera(camera,box.width,box.height);}
new ResizeObserver(resize).observe(canvas);resize();followGroup(camera,players,0,true);
function click(id:string,fn:()=>void):void {el(id).addEventListener('click',()=>{fn();canvas.focus({preventScroll:true});});}
click('pause',pause);click('reset',()=>reset());click('overlap',()=>reset(true));
click('fullscreen',()=>{void canvas.requestFullscreen().catch(()=>{el('benchmark-result').textContent='浏览器未允许全屏；普通窗口仍可操作。';});});
click('blue-toggle',()=>{keyboard.keyDown('KeyF');keyboard.keyUp('KeyF');});click('gold-toggle',()=>{keyboard.keyDown('Enter');keyboard.keyUp('Enter');});
const fx=el<HTMLInputElement>('fx-enabled'),quality=el<HTMLSelectElement>('quality');fx.checked=config.quality!=='off';quality.value=config.quality==='off'?'high':config.quality;
fx.addEventListener('change',()=>{config.quality=fx.checked?quality.value as Quality:'off';});
quality.addEventListener('change',()=>{config.quality=fx.checked?quality.value as Quality:'off';});
el<HTMLSelectElement>('background').addEventListener('change',e=>{art.background=(e.target as HTMLSelectElement).value as ArtConfig['background'];});
el<HTMLInputElement>('near-particles').addEventListener('change',e=>{art.particles=(e.target as HTMLInputElement).checked;});
el<HTMLInputElement>('freeze-time').addEventListener('change',e=>{freezeTime=(e.target as HTMLInputElement).checked;});
el<HTMLInputElement>('anchor-debug').addEventListener('change',e=>{debugAnchors=(e.target as HTMLInputElement).checked;});
for(const axis of ['x','y'] as const)el<HTMLInputElement>('camera-test-'+axis).addEventListener('input',e=>{cameraOffset[axis]=Number((e.target as HTMLInputElement).value);});
const artNames:Record<ArtParameter,string>={nebula:'星云密度',stars:'星点密度',exposure:'背景曝光',nodeEnergy:'节点能量'};
for(const key of Object.keys(ART_LIMITS) as ArtParameter[]){const label=document.createElement('label'),input=document.createElement('input'),output=document.createElement('output');label.textContent=artNames[key];input.type='range';input.min=String(ART_LIMITS[key][0]);input.max=String(ART_LIMITS[key][1]);input.step=String(ART_LIMITS[key][2]);input.value=String(art[key]);input.setAttribute('aria-label',artNames[key]);output.value=input.value;
  // Texture controls commit on release: never regenerate a megapixel texture
  // for every pointer event while dragging a slider.
  input.addEventListener('change',()=>{setArt(art,key,Number(input.value));output.value=String(art[key]);});label.append(output,input);el('art-parameters').append(label);}
for(const [id,key] of [['star-warp','starWarp'],['luminance','luminance'],['interaction','interaction']] as const)el<HTMLInputElement>(id).addEventListener('change',e=>{config[key]=(e.target as HTMLInputElement).checked;});
const names:Record<NumericParameter,string>={maxDisplacement:'星光最大位移 / px',folds:'明暗褶皱强度',propagation:'波动传播速度 / u·s⁻¹',decay:'波动衰减时间 / s',idle:'稳态微弱动画'};
for(const key of Object.keys(RANGES) as NumericParameter[]) {
  const label=document.createElement('label'),output=document.createElement('output'),input=document.createElement('input');label.textContent=names[key];
  input.type='range';input.id=key;input.min=String(RANGES[key][0]);input.max=String(RANGES[key][1]);input.step=String(RANGES[key][2]);input.value=String(config[key]);input.setAttribute('aria-label',names[key]);output.value=String(config[key]);
  input.addEventListener('input',()=>{setParameter(config,key,Number(input.value));output.value=String(config[key]);});label.append(output,input);el('parameters').append(label);
}
// Count actual Canvas submissions (path vertices counted separately), not an
// estimate of how many effects "should" have drawn. No global prototype hooks.
let calls=0;
for(const name of ['fill','stroke','drawImage','fillRect','strokeRect','fillText','strokeText','clearRect'] as const) {
  const original=ctx[name].bind(ctx) as (...args:unknown[])=>unknown;
  Object.defineProperty(ctx,name,{value:(...args:unknown[])=>{calls++;return original(...args);}});
}
interface Measurement {dt:number;cpu:number;calls:number;samples:number;cells:number;events:number}
const recent:Measurement[]=[],bench:Measurement[]=[];let recording=false,benchTime=0,benchKey='',benchTitle='',last=performance.now(),uiTime=0;
const scenarioKey=()=>JSON.stringify([config,art,canvas.width,canvas.height,debugAnchors,cameraOffset,freezeTime]);
const percentile=(a:number[],p:number)=>{const sorted=[...a].sort((x,y)=>x-y);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0;};
function summary(rows:Measurement[]):string {
  const mean=rows.reduce((sum,row)=>sum+row.dt,0)/Math.max(1,rows.length);
  return `${(1000/mean).toFixed(1)} FPS · ${rows.length} 帧\n帧间隔 p50 / p95 ${percentile(rows.map(r=>r.dt),0.5).toFixed(2)} / ${percentile(rows.map(r=>r.dt),0.95).toFixed(2)} ms\n绘制 CPU p50 / p95 ${percentile(rows.map(r=>r.cpu),0.5).toFixed(2)} / ${percentile(rows.map(r=>r.cpu),0.95).toFixed(2)} ms\n提交上限 ${Math.max(0,...rows.map(r=>r.calls))} · 网格 ${Math.max(0,...rows.map(r=>r.cells))} · 事件 ${Math.max(0,...rows.map(r=>r.events))}/4`;
}
function startBenchmark():void {bench.length=0;benchTime=0;recording=true;benchKey=scenarioKey();benchTitle=`${config.quality} / ${art.background} / ${canvas.width}×${canvas.height} backing px`;el('benchmark-result').textContent='记录中：保持当前场景 10 秒…';}
click('benchmark',startBenchmark);
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&document.fullscreenElement){void document.exitFullscreen();return;}
  if(event.target!==canvas||event.repeat)return;
  if(event.code==='KeyB'){event.preventDefault();startBenchmark();}
  if(event.code==='KeyV'){event.preventDefault();fx.checked=!fx.checked;config.quality=fx.checked?quality.value as Quality:'off';}
});
function frame(now:number):void {
  const dt=Math.min(0.1,Math.max(0,(now-last)/1000)),interval=now-last;last=now;
  if(phase==='running')clock.advance(dt,()=>{const intents=keyboard.read();for(let i=0;i<2;i++)applyPlayerIntent(players[i],intents.players[i],FIXED_DT);updateVisuals(visuals,players,phase,revision,FIXED_DT,config,freezeTime);});
  followGroup(camera,players,phase==='running'?dt:0);
  const viewCamera={...camera,position:{x:camera.position.x+cameraOffset.x,y:camera.position.y+cameraOffset.y}};
  calls=0;const start=performance.now();drawDemo(ctx,renderer,players,viewCamera,visuals,config,art);const report=debugAnchors?drawAnchors(ctx,players,visuals,viewCamera):'';const cpu=performance.now()-start;
  if(debugAnchors)el('anchor-report').textContent=report;
  const row={dt:interval,cpu,calls,samples:renderer.stats.samples,cells:renderer.stats.cells,events:visuals.events.filter(e=>e.alive).length};
  recent.push(row);if(recent.length>240)recent.shift();
  if(recording&&scenarioKey()!==benchKey){recording=false;el('benchmark-result').textContent='设置或画布尺寸已变化，请重新记录，避免混合不同画质数据。';}
  if(recording){bench.push(row);benchTime+=interval;if(benchTime>=10000){recording=false;el('benchmark-result').textContent=benchTitle+'\n'+summary(bench);}}
  if(now-uiTime>500){uiTime=now;el('performance').textContent=summary(recent)+`\n采样 ${renderer.stats.samples} · 缓存 ${renderer.stats.cacheEntries} · 纹理 ${renderer.background?.generationMs===-1?'生成中':Math.round(renderer.background?.generationMs??0)+'ms（后台）'} · 节点 ${peekNodeAtlas()?.failed?'纹理失败':peekNodeAtlas()?.ready?Math.round(peekNodeAtlas()!.generationMs)+'ms':config.quality==='off'?'OFF':'生成中'}\nP1 (${players[0].position.x.toFixed(0)},${players[0].position.y.toFixed(0)}) v=${Math.hypot(players[0].velocity.x,players[0].velocity.y).toFixed(1)}\nP2 (${players[1].position.x.toFixed(0)},${players[1].position.y.toFixed(0)}) v=${Math.hypot(players[1].velocity.x,players[1].velocity.y).toFixed(1)}`;el('field-state').textContent=`P1 ${players[0].active?'ON':'OFF'} / P2 ${players[1].active?'ON':'OFF'} · ${phase==='running'?'LIVE':'PAUSED'} · ${config.quality.toUpperCase()}`;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
