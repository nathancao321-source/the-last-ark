import './style.css';
import { pause, skipTeachingStep } from './game/game';
import { FixedClock } from './game/clock';
import { Keyboard } from './input/keyboard';
import { PlayerInputs } from './input/sources';
import { MouseInput } from './input/mouse';
import { XboxInput, connectedPads } from './input/gamepad';
import { mountDeviceUI } from './input/device-ui';
import { TutorialOverlay } from './render/tutorial-overlay';
import { currentLesson } from './game/tutorial';
import { loadProgress, storeProgress } from './game/progress';
import { render, telemetry } from './render/canvas';
import { renderStarMap } from './render/star-map';
import { mountSceneUI } from './render/scene-ui';
import { mountFullscreen } from './render/fullscreen';
import type { SceneId } from './scenes/types';
import { predictTrajectory } from './game/trajectory';
import type { Trajectory } from './game/trajectory';
import { SceneController } from './scenes/controller';
import { createCamera, followGroup, resizeCamera, setZoom, viewBounds } from './camera/camera';
import { updateEncounters } from './world/encounters';
import { scenes as registry } from './scenes/registry';
import { developmentRegistry } from './debug/config';
import { movementTelemetry } from './debug/telemetry';
import { recallNode, explorationText } from './world/universe';
import { SECTOR_SIZE } from './world/sectors';
import { loadExploration, storeExploration } from './game/exploration-save';
import { createVisualState, syncVisualPositions, updateVisuals } from './render/spacetime/model';
import type { VisualState } from './render/spacetime/model';
import { createDemoRenderer } from './render/spacetime/renderer';
import type { DemoRenderer } from './render/spacetime/renderer';
import { parseWarp } from './render/spacetime/config';
import { CINEMATIC_ART, levelArt } from './render/spacetime/art';
import { mountHazardPanel } from './debug/hazard-panel';
import {updateCelestialVisuals} from './render/celestial-events';
import {mountArtPanel} from './debug/art-panel';
import { isSceneUnlocked } from './scenes/campaign';
import { mountCosmos } from './render/cosmos';
import {enhancedScene,syncUniverseVisuals} from './render/endless-bridge';
import {resetEndlessBackground} from './render/endless-background';
import {clearEndlessStellarCache} from './render/endless-stellar';
import {clearEndlessPlanetCache} from './render/endless-planets';
const cosmos = mountCosmos(document.querySelector<HTMLCanvasElement>('#cosmos')!);
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('此浏览器不支持 Canvas 2D。');
const status = document.querySelector<HTMLParagraphElement>('#telemetry')!;
const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('dev') === '1';
const progressStorage = { getItem: (key:string) => localStorage.getItem(key), setItem: (key:string,value:string) => localStorage.setItem(key,value) };
const scenes = new SceneController(debug ? developmentRegistry(registry,location.search) : registry, loadProgress(progressStorage));
let savedCompletion = JSON.stringify(scenes.progress);
const hazardPanel=debug?mountHazardPanel(scenes):undefined;
if (debug) {
  const requested = new URLSearchParams(location.search).get('scene');
  if (requested && Object.hasOwn(scenes.registry, requested)) scenes.enter(requested as SceneId);
}
const debugView = debug ? document.createElement('pre') : undefined;
if (debugView) { debugView.id='debug'; debugView.style.whiteSpace='pre-wrap'; debugView.style.fontSize='12px'; document.querySelector('main')!.append(debugView); }
const camera = createCamera({x:0,y:0});
const visualRenderer: DemoRenderer = createDemoRenderer();
const visualWarp = parseWarp(location.search);
const visualArt = { ...CINEMATIC_ART };
const artPanel=debug?mountArtPanel(visualArt,visualWarp):undefined;
let visualState: VisualState | undefined;
let previousVisualQuality=visualWarp.quality;
function syncVisualState(): void { visualState = scenes.game && enhancedScene(scenes.scene) ? createVisualState(scenes.game.players, scenes.revision) : undefined;if(visualState&&scenes.game)syncUniverseVisuals(visualState,scenes.game); }
const clock = new FixedClock();
let prediction: Trajectory = {points:[],seconds:0,outcome:'horizon'};
let lastPredictionTime = -Infinity;
let predictionKey = '';
let revision = -1;
const overlay = new TutorialOverlay();
let mapOpen=false, resumeAfterMap=false;
const mapButton=document.querySelector<HTMLButtonElement>('#star-map')!;
function toggleMap():void {
  if(!scenes.game)return;
  if(!mapOpen){resumeAfterMap=scenes.game.phase==='running';pause(scenes.game);inputs.releaseMovement();}
  else if(resumeAfterMap&&scenes.game.phase==='paused')scenes.toggle();
  mapOpen=!mapOpen;clock.reset();canvas.focus();
  mouse.setSuspended(mapOpen);
}
const toggle = () => {
  if (ui.settingsOpen()) return;
  if (scenes.scene === 'title') { ui.activate(); return; }
  if(mapOpen)toggleMap();else if (!overlay.dismiss()) scenes.toggle();
};
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-game')!;
const toggleFromButton = () => { toggle(); canvas.focus(); };
pauseButton.addEventListener('click',toggleFromButton);
mapButton.addEventListener('click',toggleMap);
const explorationTools=document.querySelector<HTMLElement>('#exploration-tools')!;
const explorationNotice=document.querySelector<HTMLElement>('#exploration-notice')!;
function saveExplorationUI():void {
  if(!scenes.game?.universe){explorationNotice.textContent='请先进入无限探索';return;}
  const ok=storeExploration(progressStorage,scenes.game);
  explorationNotice.textContent=scenes.game.message=scenes.game.universe.notice=ok?'探索已保存到本机 · L 恢复':'保存失败：当前状态不可保存或浏览器存储不可用';
  canvas.focus();
}
function loadExplorationUI():void {
  if (!debug && !isSceneUnlocked('endless', scenes.progress)) return;
  const restored=loadExploration(progressStorage);
  if(restored){scenes.scene='endless';scenes.game=restored;scenes.revision++;explorationNotice.textContent='已恢复 · Space 继续';canvas.focus();}
  else explorationNotice.textContent='没有可用探索存档，或存档损坏';
}
const newUniverse=()=>{
  if (!debug && !isSceneUnlocked('endless', scenes.progress)) return;
  const seed=Number(document.querySelector<HTMLInputElement>('#universe-seed')!.value);
  if(!Number.isInteger(seed)||seed<0||seed>4294967295){explorationNotice.textContent='请输入 0–4294967295 的整数 Seed';return;}
  scenes.registry.endless.level!.seed=seed;scenes.enter('endless');explorationNotice.textContent='新探索已准备，旧存档保留至下一次保存';canvas.focus();
};
const saveButton=document.querySelector<HTMLButtonElement>('#save-universe')!,loadButton=document.querySelector<HTMLButtonElement>('#load-universe')!,newButton=document.querySelector<HTMLButtonElement>('#new-universe')!;
saveButton.addEventListener('click',saveExplorationUI);loadButton.addEventListener('click',loadExplorationUI);newButton.addEventListener('click',newUniverse);
const keyboard = new Keyboard(action => {
  if (ui.settingsOpen()) return;
  if((action==='recall-p1'||action==='recall-p2')&&scenes.game?.universe){const index=action==='recall-p1'?0:1;if(recallNode(scenes.game,index))inputs.resetPlayer(index);}
  if(action==='save')saveExplorationUI();
  if(action==='load')loadExplorationUI();
  if (action === 'toggle') toggle();
  if (action === 'map') toggleMap();
  if (action === 'reset' || action === 'restart') scenes.retry(action === 'restart');
  if (action === 'title') {if(mapOpen)toggleMap();else ui.goBack();}
  if (action === 'blur') { inputs.releaseMovement(); if (scenes.game) pause(scenes.game); }
  if (action === 'zoom-in') setZoom(camera, (camera.preferredZoom??0.8) * 1.2);
  if (action === 'zoom-out') setZoom(camera, (camera.preferredZoom??0.8) / 1.2);
  if (action === 'zoom-reset') setZoom(camera, 0.8);
  lastPredictionTime = -Infinity; clock.reset();
});
// Each player owns an independently selectable device channel.
const inputs = new PlayerInputs([keyboard.source(0), keyboard.source(1)]);
const mouse = new MouseInput();
const readPads = () => connectedPads(navigator.getGamepads());
const pads: [XboxInput,XboxInput] = [0,1].map(index=>new XboxInput(index,readPads,()=>document.hasFocus()&&!document.hidden,toggle)) as [XboxInput,XboxInput];
const devices = mountDeviceUI(inputs,keyboard,mouse,pads);
const detachMouse = mouse.attach(canvas,camera);
const detach = keyboard.attach(window, () => ui.settingsOpen());
const ui = mountSceneUI(scenes, id => { if (debug ? scenes.enter(id) : scenes.enterPlayable(id)) { syncScene(); if (scenes.game) canvas.focus(); } }, () => {
  if (debug && scenes.game) { skipTeachingStep(scenes.game); lastPredictionTime = -Infinity; canvas.focus(); }
}, debug, devices.text, () => {
  inputs.releaseMovement(); keyboard.clear();
  if (scenes.game) pause(scenes.game);
  clock.reset();
});
let dpr = 1;
function resize(): void {
  const rect = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  resizeCamera(camera, rect.width, rect.height);
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
}
const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
const fullscreen = mountFullscreen(canvas, document.querySelector<HTMLButtonElement>('#fullscreen-toggle')!, document.querySelector<HTMLElement>('#fullscreen-notice')!, () => {
  inputs.releaseMovement(); keyboard.releaseKeys(); clock.reset();
  if (scenes.game && !ui.settingsOpen()) canvas.focus({preventScroll:true});
});
function syncScene(): void {
  if (revision === scenes.revision) return;
  if(visualRenderer.endless)resetEndlessBackground(visualRenderer.endless);
  clearEndlessStellarCache();
  clearEndlessPlanetCache();
  revision = scenes.revision; inputs.reset(); keyboard.clear(); clock.reset(); lastPredictionTime = -Infinity;
  mapOpen=false;resumeAfterMap=false;
  mouse.setSuspended(false);
  const ship = scenes.game?.bodies.find(b => b.kind === 'ship');
  if (ship) followGroup(camera,[ship,...scenes.game!.players],0,true);
  syncVisualState();
  ui.update();
  if (scenes.game) resize();
}
let previousTime: number | undefined;
let frameId = 0;
const frameSamples:number[]=[],workSamples:number[]=[];
function frame(now: number): void {
  const workStart=performance.now();
  const seconds = previousTime === undefined ? 0 : (now - previousTime) / 1000; previousTime = now;
  syncScene();
  if(previousVisualQuality==='off'&&visualWarp.quality!=='off')syncVisualState();
  previousVisualQuality=visualWarp.quality;
  const lesson = scenes.game && currentLesson(scenes.game);
  const lessonKey = lesson && !scenes.game!.tutorial!.acknowledged && scenes.game!.phase !== 'failed' && scenes.game!.phase !== 'completed'
    ? scenes.scene + ':' + scenes.revision + ':' + lesson.id : undefined;
  overlay.sync(lessonKey,lesson ? devices.text(lesson.title + '\n' + lesson.text) : '');
  if (!mapOpen && !ui.settingsOpen() && overlay.update(seconds) === lessonKey && lessonKey) scenes.toggle();
  clock.advance(seconds, () => {
    const origin=scenes.game?.universe?{...scenes.game.universe.origin}:undefined;
    const intent=hazardPanel?.read()??inputs.read();if(!mapOpen && !ui.settingsOpen())scenes.step(intent);
    const next=scenes.game?.universe?.origin;
    if(origin&&next&&(origin.x!==next.x||origin.y!==next.y)) {
      camera.position.x-=(next.x-origin.x)*SECTOR_SIZE;camera.position.y-=(next.y-origin.y)*SECTOR_SIZE;
      if(visualState&&scenes.game)syncUniverseVisuals(visualState,scenes.game);
      lastPredictionTime=-Infinity;
    }
    syncScene();
    if(visualState&&scenes.game&&enhancedScene(scenes.scene)&&visualWarp.quality!=='off'){updateVisuals(visualState,scenes.game.players,scenes.game.phase,scenes.revision,1/60,visualWarp,mapOpen);updateCelestialVisuals(visualState,scenes.game,1/60);}
  });
  const game = scenes.game;
  ui.update();
  devices.update();
  hazardPanel?.update();
  explorationTools.hidden=!game?.universe;saveButton.disabled=!game?.universe;
  mapButton.hidden=!game;mapButton.textContent=mapOpen?'关闭星图 · M':'全局星图 · M';
  if (JSON.stringify(scenes.progress) !== savedCompletion) {
    const saved = storeProgress(progressStorage,scenes.progress);
    document.querySelector<HTMLElement>('#save-status')!.textContent = saved ? '● 进度已保存在此浏览器' : '存储不可用 · 进度仅在本次游玩保留';
    savedCompletion=JSON.stringify(scenes.progress);
  }
  ctx!.setTransform(dpr,0,0,dpr,0,0);
  if (game) {
    if(visualState&&enhancedScene(scenes.scene))syncVisualPositions(visualState,game.players,scenes.revision);
    if(visualState){const wave=game.hazards?.wave;visualState.hazardWave=wave?.active?{origin:{...wave.origin},front:wave.front,thickness:wave.thickness}:undefined;}
    const nextKey = game.phase + ':' + game.players.map(p => p.active).join(',');
    if (now - lastPredictionTime >= (game.universe?400:100) || nextKey !== predictionKey) {
      prediction = predictTrajectory(game); lastPredictionTime = now; predictionKey = nextKey;
    }
    const ship = game.bodies.find(b => b.kind === 'ship')!;
    followGroup(camera,[ship,...game.players],seconds);
    // Birth is presentation-aware; once born, normal fixed-step physics is camera-independent.
    // Use the exact final view rendered below, after group fit and landmark focus.
    if(!mapOpen&&game.phase==='running')updateEncounters(game,viewBounds(camera));
    const art=levelArt(visualArt,game.level.id);
    render(ctx!,game,prediction,camera,{enhanced:enhancedScene(scenes.scene),visuals:visualState,renderer:visualRenderer,warp:visualWarp,art,debugColliders:hazardPanel?.colliders(),debugAccretion:artPanel?.accretionDebug()}); status.textContent = telemetry(game);
    overlay.draw(ctx!,camera.width,camera.height);
    if(mapOpen)renderStarMap(ctx!,game,camera.width,camera.height);
    if (debugView) debugView.textContent = movementTelemetry(game)+(game.universe?'\n'+explorationText(game):'');
    canvas.dataset.phase = game.phase; canvas.dataset.fields = game.players.map(p => p.active ? 'on' : 'off').join(',');
    canvas.dataset.prediction = prediction.outcome;
    if (game.tutorial) canvas.dataset.lesson = game.level.tutorial!.steps[game.tutorial.step].id;
    else delete canvas.dataset.lesson;
  } else {
    status.textContent = scenes.scene === 'title' ? 'Space 快速进入 First Contact' : '';
    canvas.dataset.phase = 'title';
    delete canvas.dataset.fields; delete canvas.dataset.prediction;
    delete canvas.dataset.lesson;
    if (debugView) debugView.textContent = '开发模式：进入试玩，或使用 ?dev=1&scene=coop_test';
  }
  canvas.dataset.scene = scenes.scene; canvas.dataset.zoom = camera.zoom.toFixed(2);
  canvas.dataset.fx = visualWarp.quality;
  canvas.dataset.map=String(mapOpen);
  if(debug&&seconds>0){
    frameSamples.push(seconds*1000);workSamples.push(performance.now()-workStart);
    if(frameSamples.length>240){frameSamples.shift();workSamples.shift();}
    if(debugView&&frameSamples.length>30){const sorted=[...workSamples].sort((a,b)=>a-b);
      debugView.textContent+=`\n最近 ${frameSamples.length} 帧：${(1000/(frameSamples.reduce((a,b)=>a+b,0)/frameSamples.length)).toFixed(1)} FPS · 主线程帧工作 p50=${sorted[Math.floor(sorted.length*.5)].toFixed(2)}ms / p95=${sorted[Math.floor(sorted.length*.95)].toFixed(2)}ms（含预测）`;
    }
  }
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);
if (import.meta.hot) import.meta.hot.dispose(() => { fullscreen.dispose(); artPanel?.dispose(); inputs.reset(); detach(); detachMouse(); devices.dispose(); ui.dispose(); cosmos.dispose(); pauseButton.removeEventListener('click',toggleFromButton); hazardPanel?.dispose(); mapButton.removeEventListener('click',toggleMap);saveButton.removeEventListener('click',saveExplorationUI);loadButton.removeEventListener('click',loadExplorationUI);newButton.removeEventListener('click',newUniverse); observer.disconnect(); debugView?.remove(); cancelAnimationFrame(frameId); });
