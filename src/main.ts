import './style.css';
import { pause, skipTeachingStep } from './game/game';
import { FixedClock } from './game/clock';
import { Keyboard } from './input/keyboard';
import { PlayerInputs } from './input/sources';
import { MouseInput } from './input/mouse';
import { XboxInput } from './input/gamepad';
import { mountDeviceUI } from './input/device-ui';
import { TutorialOverlay } from './render/tutorial-overlay';
import { currentLesson } from './game/tutorial';
import { loadProgress, storeProgress } from './game/progress';
import { render, telemetry } from './render/canvas';
import { renderStarMap } from './render/star-map';
import { mountSceneUI } from './render/scene-ui';
import type { SceneId } from './scenes/types';
import { predictTrajectory } from './game/trajectory';
import type { Trajectory } from './game/trajectory';
import { SceneController } from './scenes/controller';
import { createCamera, followGroup, resizeCamera, setZoom, viewBounds } from './camera/camera';
import { cameraFocus } from './camera/director';
import { updateEncounters } from './world/encounters';
import { scenes as registry } from './scenes/registry';
import { developmentRegistry } from './debug/config';
import { movementTelemetry } from './debug/telemetry';
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('此浏览器不支持 Canvas 2D。');
const status = document.querySelector<HTMLParagraphElement>('#telemetry')!;
const debug = import.meta.env.DEV && new URLSearchParams(location.search).get('dev') === '1';
const progressStorage = { getItem: (key:string) => localStorage.getItem(key), setItem: (key:string,value:string) => localStorage.setItem(key,value) };
const scenes = new SceneController(debug ? developmentRegistry(registry,location.search) : registry, loadProgress(progressStorage));
let savedCompletion = scenes.progress.level0Complete;
if (debug) {
  const requested = new URLSearchParams(location.search).get('scene');
  if (requested && Object.hasOwn(scenes.registry, requested)) scenes.enter(requested as SceneId);
}
const debugView = debug ? document.createElement('pre') : undefined;
if (debugView) { debugView.id='debug'; debugView.style.whiteSpace='pre-wrap'; debugView.style.fontSize='12px'; document.querySelector('main')!.append(debugView); }
const camera = createCamera({x:0,y:0});
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
const toggle = () => { if(mapOpen)toggleMap();else if (!overlay.dismiss()) scenes.toggle(); };
mapButton.addEventListener('click',toggleMap);
const keyboard = new Keyboard(action => {
  if (action === 'toggle') toggle();
  if (action === 'map') toggleMap();
  if (action === 'reset' || action === 'restart') scenes.retry(action === 'restart');
  if (action === 'title') {if(mapOpen)toggleMap();else scenes.enter('title');}
  if (action === 'blur') { inputs.releaseMovement(); if (scenes.game) pause(scenes.game); }
  if (action === 'zoom-in') setZoom(camera, (camera.preferredZoom??0.8) * 1.2);
  if (action === 'zoom-out') setZoom(camera, (camera.preferredZoom??0.8) / 1.2);
  if (action === 'zoom-reset') setZoom(camera, 0.8);
  lastPredictionTime = -Infinity; clock.reset();
});
// Each player owns an independently selectable device channel.
const inputs = new PlayerInputs([keyboard.source(0), keyboard.source(1)]);
const mouse = new MouseInput();
const pads: [XboxInput,XboxInput] = [0,1].map(index=>new XboxInput(index,()=>navigator.getGamepads(),()=>document.hasFocus()&&!document.hidden,toggle)) as [XboxInput,XboxInput];
const devices = mountDeviceUI(inputs,keyboard,mouse,pads);
const detachMouse = mouse.attach(canvas,camera);
const detach = keyboard.attach(window);
const ui = mountSceneUI(scenes, id => { scenes.enter(id); syncScene(); canvas.focus(); }, () => {
  if (debug && scenes.game) { skipTeachingStep(scenes.game); lastPredictionTime = -Infinity; canvas.focus(); }
}, debug, devices.text);
let dpr = 1;
function resize(): void {
  const rect = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  resizeCamera(camera, rect.width, rect.height);
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
}
const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
function syncScene(): void {
  if (revision === scenes.revision) return;
  revision = scenes.revision; inputs.reset(); keyboard.clear(); clock.reset(); lastPredictionTime = -Infinity;
  mapOpen=false;resumeAfterMap=false;
  mouse.setSuspended(false);
  const ship = scenes.game?.bodies.find(b => b.kind === 'ship');
  if (ship) followGroup(camera,[ship,...scenes.game!.players],0,true,cameraFocus(scenes.game!));
  ui.update();
  if (scenes.game) resize();
}
let previousTime: number | undefined;
let frameId = 0;
function frame(now: number): void {
  const seconds = previousTime === undefined ? 0 : (now - previousTime) / 1000; previousTime = now;
  syncScene();
  const lesson = scenes.game && currentLesson(scenes.game);
  const lessonKey = lesson && !scenes.game!.tutorial!.acknowledged && scenes.game!.phase !== 'failed' && scenes.game!.phase !== 'completed'
    ? scenes.scene + ':' + scenes.revision + ':' + lesson.id : undefined;
  overlay.sync(lessonKey,lesson ? devices.text(lesson.title + '\n' + lesson.text) : '');
  if (!mapOpen && overlay.update(seconds) === lessonKey && lessonKey) scenes.toggle();
  clock.advance(seconds, () => { const intent=inputs.read();if(!mapOpen)scenes.step(intent); syncScene(); });
  const game = scenes.game;
  ui.update();
  devices.update();
  mapButton.hidden=!game;mapButton.textContent=mapOpen?'关闭星图 · M':'全局星图 · M';
  if (scenes.progress.level0Complete !== savedCompletion) { storeProgress(progressStorage,scenes.progress); savedCompletion=scenes.progress.level0Complete; }
  ctx!.setTransform(dpr,0,0,dpr,0,0);
  if (game) {
    const nextKey = game.phase + ':' + game.players.map(p => p.active).join(',');
    if (now - lastPredictionTime >= 100 || nextKey !== predictionKey) {
      prediction = predictTrajectory(game); lastPredictionTime = now; predictionKey = nextKey;
    }
    const ship = game.bodies.find(b => b.kind === 'ship')!;
    followGroup(camera,[ship,...game.players],seconds,false,cameraFocus(game));
    // Birth is presentation-aware; once born, normal fixed-step physics is camera-independent.
    // Use the exact final view rendered below, after group fit and landmark focus.
    if(!mapOpen&&game.phase==='running')updateEncounters(game,viewBounds(camera));
    render(ctx!,game,prediction,camera); status.textContent = telemetry(game);
    overlay.draw(ctx!,camera.width,camera.height);
    if(mapOpen)renderStarMap(ctx!,game,camera.width,camera.height);
    if (debugView) debugView.textContent = movementTelemetry(game);
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
  canvas.dataset.map=String(mapOpen);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);
if (import.meta.hot) import.meta.hot.dispose(() => { inputs.reset(); detach(); detachMouse(); devices.dispose(); ui.dispose(); mapButton.removeEventListener('click',toggleMap); observer.disconnect(); debugView?.remove(); cancelAnimationFrame(frameId); });
