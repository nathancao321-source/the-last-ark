import type { GameState } from '../game/types';
import { navigationBounds, mapPoint } from '../camera/navigation';
import { currentObjective, objectivePosition } from '../game/mission';
import { explorationText } from '../world/universe';
export function starMapPoints(game:GameState) {
  return [...game.bodies,...game.players].filter(body=>body.layer!=='hidden'&&body.layer!=='background');
}
export function renderStarMap(ctx:CanvasRenderingContext2D,game:GameState,width:number,height:number):void {
  const bodies=starMapPoints(game),target=objectivePosition(game);
  const bounds=navigationBounds(game.level.mapBounds??{minX:0,minY:0,maxX:game.level.width,maxY:game.level.height},[...bodies.map(b=>b.position),...(target?[target]:[])]);
  const panel={minX:45,minY:120,maxX:width-45,maxY:height-55};
  ctx.save();ctx.fillStyle='#080d16';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#e5eaf4';ctx.textAlign='left';ctx.font='20px system-ui';ctx.fillText('全局星图 · M / Space 关闭',22,32);
  ctx.font='13px system-ui';ctx.fillText(game.universe?explorationText(game).split('\n')[0]:'查看星图时暂停 · 蓝 P1 / 金 P2 / 白 方舟 / 绿 目标',22,58,width-44);
  ctx.fillText(game.universe?explorationText(game).split('\n')[1]:currentObjective(game)?.label??game.message,22,82,width-44);
  ctx.strokeStyle='#324156';ctx.strokeRect(panel.minX,panel.minY,panel.maxX-panel.minX,panel.maxY-panel.minY);
  for(const wave of game.level.waves??[]) {
    const a=mapPoint({x:wave.bounds.minX,y:wave.bounds.minY},bounds,panel),b=mapPoint({x:wave.bounds.maxX,y:wave.bounds.maxY},bounds,panel);
    ctx.fillStyle='#70798822';ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.fillStyle='#aab8ca';ctx.font='12px system-ui';ctx.fillText('小行星带',a.x,b.y+17);
  }
  const scale=Math.min((panel.maxX-panel.minX)/(bounds.maxX-bounds.minX),(panel.maxY-panel.minY)/(bounds.maxY-bounds.minY));
  for(const [i,body] of bodies.entries()) {
    const p=mapPoint(body.position,bounds,panel),r=body.kind==='wormhole'?7:Math.max(body.kind==='ship'?4:3,body.radius*scale);
    if('damageZone' in body && body.damageZone) {
      ctx.strokeStyle='#ec768caa';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,body.damageZone.radius*scale,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle=body.kind==='ship'?'#fff':body.kind==='player'?body.id==='attractor'?'#409eff':'#e9bd48':body.appearance?.color??'#8f69b9';
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);
    if(body.kind==='wormhole'){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=2;ctx.stroke();}else ctx.fill();
    if(body.kind!=='asteroid') {
      ctx.textAlign='center';ctx.font='12px system-ui';ctx.fillText(body.kind==='player'?(body.id==='attractor'?'P1':'P2'):body.kind==='ship'?'方舟':body.appearance?.name??body.id,p.x,p.y+(i%2?20:-12));
    }
  }
  if(target){const p=mapPoint(target,bounds,panel);ctx.strokeStyle='#64d98b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);ctx.stroke();}
  if(game.universe){ctx.textAlign='left';ctx.font='12px system-ui';ctx.fillStyle='#c3b2e0';ctx.fillText('最近发现：'+(game.universe.discoveries.slice(-3).map(d=>`${d.kind==='triple'?'三日系统':'遥远星云'} (${d.key.x},${d.key.y})`).join(' / ')||'尚无记录'),22,height-20,width-44);}
  ctx.restore();
}
