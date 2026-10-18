import type { SceneController } from '../scenes/controller';
import { stepGame,saveCheckpoint } from '../game/game';
import { updateHazards,hazardNotice } from '../game/hazards';
import { NO_CONTROLS } from '../input/intent';
import { escortPilot } from './escort-pilot';
import {waveGeometry} from '../game/hazard-geometry';

/** Explicitly labelled development fixtures. No globals, production entry or
 * automatic invulnerability. Stepping always invokes the real fixed-step rules. */
export function mountHazardPanel(scenes:SceneController){
  const panel=document.createElement('div');panel.id='hazard-debug';
  const select=document.createElement('select');select.ariaLabel='危险机制调试场景';
  for(const [value,text] of [['jet','喷流完整周期 / 首次命中'],['jet-warning','喷流预警'],['jet-firing','喷流激活'],['jet-dissipating','喷流消散'],['jet-second','喷流第二轮 / 已损伤'],['solar-45','太阳 45 秒预警'],['solar-50','太阳 50 秒发射'],['solar-55','太阳 55 秒传播'],['solar-65','太阳 65 秒传播'],['solar-75','太阳 75 秒抵达出口'],['solar-hit','太阳波接触测试']]){
    const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);
  }
  const label=document.createElement('span');label.textContent='DEV 测试注入（非通关证据） ';panel.append(label,select);
  const collider=document.createElement('input');collider.type='checkbox';collider.id='hazard-colliders';const colliderLabel=document.createElement('label');colliderLabel.append(collider,'Debug Collider');panel.append(colliderLabel);
  const travel=document.createElement('select');travel.ariaLabel='冲击波传播时间';for(const seconds of [15,20,25,30]){const o=document.createElement('option');o.value=String(seconds);o.textContent=`传播 ${seconds} 秒`;travel.append(o);}travel.value='25';panel.append(travel);
  travel.onchange=()=>{const g=scenes.game;if(!g?.level.solarWave)return;g.level.solarWave.shockwaveTravelTime=Number(travel.value);scenes.retry(true);};
  let pilot:ReturnType<typeof escortPilot>|undefined;
  const button=(text:string,fn:()=>void)=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;panel.append(b);};
  button('载入危险快照',()=>{
    pilot=undefined;const jet=select.value.startsWith('jet');scenes.enter(jet?'black_hole':'solar_system');
    const g=scenes.game!,ship=g.bodies[0];g.phase='running';
    if(jet){ship.position={x:1420,y:-600};ship.velocity={x:0,y:0};g.elapsed=select.value==='jet-second'?16.24:select.value==='jet-warning'?3:select.value==='jet-firing'?4.2:select.value==='jet-dissipating'?6.6:0;
      if(select.value==='jet-second')g.health!.current=50;updateHazards(g,[],1/60);
    }else{
      g.level.solarWave!.shockwaveTravelTime=Number(travel.value);
      const time=select.value==='solar-hit'?59.99:Number(select.value.split('-')[1]);g.elapsed=time;
      ship.position={x:20000,y:20000};ship.velocity={x:0,y:0};updateHazards(g,[],1/60);
      const front=g.hazards!.wave?.front??100;
      const origin=g.hazards!.wave?.origin??g.bodies.find(b=>b.id===g.level.solarWave!.sourceId)!.position;
      ship.position={x:origin.x+front+ (select.value==='solar-hit'?10:240),y:origin.y};
    }
    g.players.forEach((p,i)=>{p.position={x:ship.position.x+(i?-120:120),y:ship.position.y+150};p.velocity={x:0,y:0};p.active=false;});
    g.phase='paused';g.message=hazardNotice(g)??'DEV 快照 · Space 运行或单步';saveCheckpoint(g,'hazard-debug');
  });
  button('推进 1 帧',()=>step(1));button('推进 1 秒',()=>step(60));
  function step(n:number){const g=scenes.game;if(!g||g.phase==='failed'||g.phase==='completed')return;
    g.phase='running';for(let i=0;i<n&&g.phase==='running';i++)stepGame(g,NO_CONTROLS);
    if(g.phase==='running')g.phase='paused';
  }
  button('从起点验证太阳系路线',()=>{scenes.enter('solar_system');scenes.game!.phase='running';pilot=escortPilot('solar');});
  button('从起点验证黑洞路线',()=>{scenes.enter('black_hole');scenes.game!.phase='running';pilot=escortPilot('black-hole');});
  button('停止自动操作',()=>{pilot=undefined;});
  const readout=document.createElement('output');readout.style.display='block';panel.append(readout);document.querySelector('main')!.append(panel);
  return {colliders:()=>collider.checked,read:()=>pilot&&scenes.game?pilot(scenes.game):undefined,update:()=>{const g=scenes.game;if(!g)return;
    const w=g.hazards?.wave,visible=w?waveGeometry(w).outer:undefined;
    readout.textContent=`${pilot?'普通输入自动护航':'手动 / 快照'} · t=${g.elapsed.toFixed(3)} · HP=${g.health?.current.toFixed(1)??'—'} · ${g.hazards?.jet?.phase??''} · 碰撞波前=${w?.front.toFixed(2)??'未发射'} / 可见外缘=${visible?.toFixed(2)??'—'} / Δ=${w&&visible!==undefined?(visible-w.front).toFixed(6):'—'} · ${g.message}`;
  },dispose:()=>panel.remove()};
}
