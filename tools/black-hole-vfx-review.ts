import {createGame} from '../src/game/game';
import {blackHoleLevel} from '../src/levels/black-hole';
import {jetClock} from '../src/game/hazards';
import {jetGeometry} from '../src/game/hazard-geometry';
import {render} from '../src/render/canvas';
import {createCamera} from '../src/camera/camera';
import {createVisualState} from '../src/render/spacetime/model';
import {createDemoRenderer} from '../src/render/spacetime/renderer';
import {CINEMATIC_ART} from '../src/render/spacetime/art';
import {DEFAULT_WARP} from '../src/render/spacetime/config';
import {ABYSS_LAYERS} from '../src/render/spacetime/abyss-background';
if(!import.meta.env.DEV)throw new Error('Development review only');
const canvas=document.querySelector<HTMLCanvasElement>('#view-canvas')!,ctx=canvas.getContext('2d')!,time=document.querySelector<HTMLInputElement>('#time')!,view=document.querySelector<HTMLSelectElement>('#view')!,stats=document.querySelector('#stats')!;
const game=createGame(blackHoleLevel),source=game.bodies.find(b=>b.id===game.level.blackHoleJets!.sourceId)!,renderer=createDemoRenderer(),state=createVisualState(game.players),camera=createCamera({x:1300,y:0},1280,720),layers={...ABYSS_LAYERS},warp={...DEFAULT_WARP};
let debug=false,playing=false,clock=5.4,last=0,recordStart:number|undefined,recorder:MediaRecorder|undefined;
const samples:number[]=[],intervals:number[]=[];
game.phase='paused';game.bodies[0].position={x:1800,y:-500};game.players.forEach((p,i)=>p.position={x:1750+i*120,y:-450});
function control(label:string,checked:boolean,update:(checked:boolean)=>void){const element=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=checked;input.ariaLabel=label;input.onchange=()=>update(input.checked);element.append(input,label);document.querySelector('#layers')!.append(element);}
for(const [key,label]of [['nebula','Background Nebula'],['stars','Background Stars'],['lensing','Black Hole Lensing'],['accretion','Accretion Disk'],['jets','Gamma Jets'],['fieldWarp','Background Field Warp']] as const)control(label,true,on=>layers[key]=on);
control('Debug Collider / Lens Grid',false,on=>debug=on);
const quality=document.createElement('select');quality.ariaLabel='Quality';for(const q of ['high','medium','low','off'])quality.add(new Option(q,q));quality.onchange=()=>warp.quality=quality.value as typeof warp.quality;document.querySelector('#layers')!.append(quality);
function draw(t:number,target=ctx,c=camera){
 game.elapsed=t;const pulse=jetClock(game.level.blackHoleJets!,t,source.nodeInfluence!);Object.assign(game.hazards!.jet!,pulse,{geometry:jetGeometry(source.position,source.radius,game.level.blackHoleJets!,pulse)});
 render(target,game,{points:[],seconds:0,outcome:'horizon'},c,{enhanced:true,visuals:state,renderer,warp,art:{...CINEMATIC_ART},layers,debugColliders:debug,debugLens:debug});
}
function configure(){camera.position={x:view.value==='left'?700:view.value==='right'?1900:1300,y:0};camera.zoom=view.value==='jet'?.1:view.value==='wide'?.06:.65;}
configure();view.onchange=configure;time.oninput=()=>{clock=Number(time.value);playing=false;};
document.querySelector<HTMLButtonElement>('#play')!.onclick=()=>{clock=3;playing=true;};document.querySelector<HTMLButtonElement>('#pause')!.onclick=()=>playing=false;
function download(blob:Blob,name:string){const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.textContent=name;document.querySelector('#downloads')!.append(link,document.createTextNode('  '));return link;}
document.querySelector<HTMLButtonElement>('#export')!.onclick=()=>canvas.toBlob(blob=>{if(blob)download(blob,'black-hole-review.png');});
document.querySelector<HTMLButtonElement>('#sequence')!.onclick=()=>{
 playing=false;view.value='jet';configure();const times=[3.6,4.3,4.9,5,5.1,5.4,5.79,5.8,5.95,6.2,6.49,6.6],sheet=document.createElement('canvas');sheet.width=1280;sheet.height=4*235;const out=sheet.getContext('2d')!;
 for(const [i,t]of times.entries()){draw(t);out.drawImage(canvas,i%3*426,Math.floor(i/3)*235,426,240);out.fillStyle='#e9f3ff';out.font='16px monospace';out.fillText('t='+t.toFixed(2)+' '+game.hazards!.jet!.phase,i%3*426+12,Math.floor(i/3)*235+25);}
 document.querySelector('#sequence-output')!.replaceChildren(sheet);sheet.toBlob(blob=>{if(blob)download(blob,'jet-continuous-frames.png');});
};
document.querySelector<HTMLButtonElement>('#pan')!.onclick=()=>{
 playing=false;clock=3;view.value='near';configure();recordStart=performance.now();const stream=canvas.captureStream(30),chunks:Blob[]=[];
 recorder=new MediaRecorder(stream,{mimeType:'video/webm'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{download(new Blob(chunks,{type:'video/webm'}),'camera-pan.webm');stream.getTracks().forEach(t=>t.stop());};recorder.start();
};
function frame(now:number){
 if(last)intervals.push(now-last);const dt=last?Math.min(.1,(now-last)/1000):0;last=now;
 if(playing){clock+=dt;if(clock>8){clock=8;playing=false;}}
 if(recordStart!==undefined){const u=Math.min(1,(now-recordStart)/8000);camera.position.x=1300+600*Math.sin(u*Math.PI*2);if(u===1){recordStart=undefined;recorder?.stop();}}
 const start=performance.now();draw(clock);samples.push(performance.now()-start);if(samples.length>240)samples.shift();if(intervals.length>240)intervals.shift();
 time.value=clock.toFixed(3);const sorted=[...samples].sort((a,b)=>a-b),p=(fraction:number)=>(sorted[Math.floor((sorted.length-1)*fraction)]??0).toFixed(2);
 stats.textContent='t='+clock.toFixed(3)+' '+game.hazards!.jet!.phase+' zoom='+camera.zoom+' camera='+camera.position.x.toFixed(1)+',0 | cache='+renderer.abyss?.tiles.size+'/48 pending='+renderer.abyss?.pending.length+' | render p50='+p(.5)+'ms p95='+p(.95)+'ms | observed rAF='+(intervals.length?1000*intervals.length/intervals.reduce((a,b)=>a+b,0):0).toFixed(1)+'Hz (browser scheduling included)';
 requestAnimationFrame(frame);
}requestAnimationFrame(frame);
