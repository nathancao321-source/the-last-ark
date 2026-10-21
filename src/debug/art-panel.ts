import {CINEMATIC_ART,setArt} from '../render/spacetime/art';
import type {ArtConfig,ArtParameter} from '../render/spacetime/art';
import type {WarpConfig,Quality} from '../render/spacetime/config';
import {ABYSS_LAYERS} from '../render/spacetime/abyss-background';
import type {AbyssLayers} from '../render/spacetime/abyss-background';
import type {Camera} from '../camera/camera';
export function mountArtPanel(art:ArtConfig,warp:WarpConfig,camera?:Camera){
 const panel=document.createElement('details');panel.id='art-debug';const title=document.createElement('summary');title.textContent='DEV 美术 / A-B 对照';panel.append(title);
 const controls=new Map<ArtParameter,HTMLInputElement>(),outputs=new Map<ArtParameter,HTMLOutputElement>();
 for(const [key,label,min,max] of [['nebula','星云密度',0,2],['stars','星点密度',.1,1],['exposure','背景曝光',.4,1.6],['nodeEnergy','节点能量',.3,2]] as const){
  const item=document.createElement('label'),input=document.createElement('input'),out=document.createElement('output');input.type='range';input.min=String(min);input.max=String(max);input.step='.05';input.value=String(art[key]);input.ariaLabel=label;out.value=input.value;
  input.oninput=()=>{setArt(art,key,Number(input.value));out.value=input.value;};item.append(label,input,out);panel.append(item);controls.set(key,input);outputs.set(key,out);
 }
 const particles=document.createElement('input');particles.type='checkbox';particles.checked=art.particles;particles.ariaLabel='节点近场粒子';particles.onchange=()=>art.particles=particles.checked;const label=document.createElement('label');label.append(particles,'节点近场粒子');panel.append(label);
 const quality=document.createElement('select');quality.ariaLabel='特效质量';for(const q of ['off','low','medium','high']){const o=document.createElement('option');o.value=q;o.textContent=q;quality.append(o);}quality.value=warp.quality;quality.onchange=()=>warp.quality=quality.value as Quality;panel.append(quality);
 const preset=document.createElement('button');preset.textContent='参考图基线：2 / 1 / 1.6 / 1.8';preset.onclick=()=>{Object.assign(art,CINEMATIC_ART);for(const [key,input]of controls){input.value=String(art[key]);outputs.get(key)!.value=input.value;}particles.checked=true;};panel.append(preset);
 const accretion=document.createElement('input');accretion.type='checkbox';accretion.id='accretion-debug';accretion.ariaLabel='吸积盘中心与半径';const accretionLabel=document.createElement('label');accretionLabel.append(accretion,'黑洞吸积盘：中心 / 内外缘');panel.append(accretionLabel);
 const checkbox=(name:string,checked=false)=>{const input=document.createElement('input'),label=document.createElement('label');input.type='checkbox';input.checked=checked;input.ariaLabel=name;label.append(input,name);panel.append(label);return input;};
 const lens=checkbox('黑洞透镜网格 / 中心 / 半径');
 const layers:AbyssLayers={...ABYSS_LAYERS};
 for(const [key,name]of [['nebula','Background Nebula'],['stars','Background Stars'],['lensing','Black Hole Lensing'],['accretion','Accretion Disk'],['jets','Gamma Jets'],['fieldWarp','Background Field Warp']] as const){const input=checkbox(name,true);input.onchange=()=>layers[key]=input.checked;}
 const locked=checkbox('锁定开发相机（只移动画面）');
 if(camera){
  for(const [name,x,y,zoom]of [['黑洞近景',1300,0,.65],['完整喷流',1300,0,.10],['大范围背景',1300,0,.06],['平移左侧',700,0,.65],['平移右侧',1900,0,.65]] as const){const button=document.createElement('button');button.textContent=name;button.onclick=()=>{locked.checked=true;camera.position={x,y};camera.zoom=zoom;camera.preferredZoom=zoom;};panel.append(button);}
 }
 document.querySelector('main')!.append(panel);return {accretionDebug:()=>accretion.checked,lensDebug:()=>lens.checked,layers:()=>layers,cameraLocked:()=>locked.checked,dispose:()=>panel.remove()};
}
