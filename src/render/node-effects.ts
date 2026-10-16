import type { Body, GameState, Player } from '../game/types';
import { gammaJetProgress } from '../physics/node-gravity';

/** Deterministic Canvas-only particles. Never add entities or impulses to the world. */
export function drawGammaJet(ctx: CanvasRenderingContext2D, body: Body, time: number, zoom: number): void {
  const config=body.nodeInfluence;
  if(!config||body.layer==='hidden')return;
  const progress=gammaJetProgress(time,config.jetPeriod,config.jetSeconds);
  if(progress===undefined)return;
  const {x,y}=body.position,reach=config.ejectionDistance;
  ctx.save();ctx.globalAlpha=Math.sin(Math.PI*Math.min(1,(progress+0.08)/1.08));
  ctx.strokeStyle='#b9d8ff';ctx.lineWidth=14/zoom;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-reach*Math.min(1,progress*3));ctx.stroke();
  ctx.strokeStyle='#fff';ctx.lineWidth=3/zoom;ctx.stroke();
  for(let i=0;i<16;i++) {
    const t=(progress+i/16)%1;
    ctx.fillStyle=i%2?'#fff':'#a4caff';ctx.fillRect(x+Math.sin(i*19)*12/zoom,y-reach*t,3/zoom,8/zoom);
  }
  ctx.restore();
}

export function drawCapturedNode(ctx: CanvasRenderingContext2D, player: Player, game: GameState, zoom: number): void {
  const state=player.capture!,source=game.bodies.find(b=>b.id===state.sourceId),config=source?.nodeInfluence;
  if(!source||!config)return;
  const i=player.id==='attractor'?0:1,color=i?'#e9bd48':'#409eff';
  ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;
  if(state.phase==='captured') {
    const t=Math.min(1,state.elapsed/0.4);
    // Shards stretch from the entry point, spiral inward, then stay dispersed in the core.
    for(let n=0;n<12;n++) {
      const angle=n*Math.PI/6+state.elapsed*3,spread=(1-t)*32+8;
      const x=state.origin.x*(1-t)+source.position.x*t+Math.cos(angle)*spread/zoom;
      const y=state.origin.y*(1-t)+source.position.y*t+Math.sin(angle)*spread/zoom;
      ctx.fillRect(x,y,3/zoom,(4+8*(1-t))/zoom);
    }
  } else if(state.phase==='jet') {
    for(let n=0;n<10;n++)ctx.fillRect(player.position.x+Math.sin(n*7)*8/zoom,player.position.y+n*6/zoom,3/zoom,7/zoom);
  } else {
    const t=Math.min(1,state.elapsed/config.reformSeconds);
    for(let n=0;n<12;n++) {
      const angle=n*Math.PI/6+state.elapsed*4,r=(1-t)*42/zoom;
      ctx.fillRect(player.position.x+Math.cos(angle)*r,player.position.y+Math.sin(angle)*r,3/zoom,3/zoom);
    }
    ctx.globalAlpha=t;ctx.beginPath();ctx.arc(player.position.x,player.position.y,Math.max(player.radius,6/zoom)*t,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  ctx.textAlign='center';ctx.font=`${13/zoom}px system-ui`;
  const label=state.phase==='captured'?`已撕碎 · 下次喷流 ${Math.max(0,state.releaseAt-game.elapsed).toFixed(1)}s`:state.phase==='jet'?'伽马喷流':'重组中';
  ctx.fillText(`P${i+1} ${label}`,player.position.x,player.position.y+(i?38:-28)/zoom);
  ctx.restore();
}
