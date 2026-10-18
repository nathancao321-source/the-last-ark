import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const port=Number(process.env.ARK_CDP_PORT||9335);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('ARK_CDP_PORT must be an integer TCP port');
export function gameUrl(){
 const url=new URL(process.env.ARK_URL||'http://127.0.0.1:5175/');
 for(const [key,value] of Object.entries({dev:'1',scene:'endless',fx:'high'}))url.searchParams.set(key,value);
 return url.href;
}
export function evidencePath(name){
 const prefix='docs/endless-vfx/';
 const relative=name.startsWith(prefix)?name.slice(prefix.length):name;
 const folder=path.resolve(root,'docs','endless-vfx'),resolved=path.resolve(folder,relative);
 if(!resolved.startsWith(folder+path.sep))throw Error('Evidence output must remain under docs/endless-vfx');
 return resolved;
}

/** Connect only to the explicitly started isolated QA browser. This helper has
 * no baseline capture, application navigation, or profile mutation on import. */
export async function connect(){
 await fs.mkdir(path.resolve(root,'docs','endless-vfx'),{recursive:true});
 const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const page=pages.find(p=>p.type==='page');
 if(!page)throw Error('No page target: launch a dedicated headless QA browser with about:blank');
 const ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let id=0;const pending=new Map(),errors=[];
 ws.addEventListener('message',e=>{
  const message=JSON.parse(e.data);
  if(message.id){const request=pending.get(message.id);if(!request)return;pending.delete(message.id);if(message.error)request.reject(message.error);else request.resolve(message.result);}
  else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
 });
 ws.addEventListener('close',()=>{for(const request of pending.values())request.reject(Error('QA browser closed'));pending.clear();});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
 await send('Runtime.enable');await send('Page.enable');
 return {send,errors,close:()=>ws.close(),eval:async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;},shot:async output=>{const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(output,Buffer.from(result.data,'base64'));}};
}

export const setup=`(async()=>{
 const [{createGame},{solarSystem},{blackHoleLevel},{createCamera},{render},{createVisualState},{createDemoRenderer},{DEFAULT_WARP},{DEFAULT_ART},{updateHazards}]=await Promise.all([import('/src/game/game.ts'),import('/src/levels/solar-system.ts'),import('/src/levels/black-hole.ts'),import('/src/camera/camera.ts'),import('/src/render/canvas.ts'),import('/src/render/spacetime/model.ts'),import('/src/render/spacetime/renderer.ts'),import('/src/render/spacetime/config.ts'),import('/src/render/spacetime/art.ts'),import('/src/game/hazards.ts')]);
 window.qa={createGame,solarSystem,blackHoleLevel,createCamera,render,createVisualState,createDemoRenderer,DEFAULT_WARP,DEFAULT_ART,updateHazards};
 document.querySelectorAll('#qa-canvas').forEach(c=>c.remove());const c=document.createElement('canvas');c.width=1200;c.height=720;c.id='qa-canvas';c.style='width:1200px;height:720px;position:fixed;inset:0;z-index:99999';document.body.append(c);qa.canvas=c;qa.ctx=c.getContext('2d');
 qa.fixture=(kind,t=0)=>{qa.game=createGame(kind==='hole'?blackHoleLevel:solarSystem);const g=qa.game;g.phase='running';g.elapsed=t;g.bodies[0].position={x:-20000,y:-20000};updateHazards(g,[],1/60);g.phase='paused';g.bodies[0].position={x:kind==='hole'?850:500,y:-350};qa.camera=createCamera({x:kind==='hole'?1300:900,y:0},1200,720);qa.camera.zoom=.85;qa.visuals=createVisualState(g.players);qa.renderer=createDemoRenderer();};
 qa.paint=(off=false)=>render(qa.ctx,qa.game,{points:[],seconds:0,outcome:'horizon'},qa.camera,{enhanced:true,visuals:qa.visuals,renderer:qa.renderer,warp:{...DEFAULT_WARP,quality:off?'off':'high'},art:{...DEFAULT_ART}});
 qa.fixture('solar');qa.paint(true);return 'ready';
})()`;
