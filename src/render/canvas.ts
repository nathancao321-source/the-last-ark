import type { GameState } from '../game/types';
import { length, sub } from '../physics/vector';
import { speedLimit } from '../physics/world';
import type { Trajectory } from '../game/trajectory';
import type { Camera } from '../camera/camera';
import { isVisible, viewBounds } from '../camera/camera';
import { edgeMarker, mapPoint, navigationBounds } from '../camera/navigation';
import { objectivePosition } from '../game/mission';
import { visibleEntities } from './visibility';
import { efficiency } from '../game/scoring';
import { drawGammaJet, drawCapturedNode } from './node-effects';
import { explorationText } from '../world/universe';
import type { VisualState } from './spacetime/model';
import type { DemoRenderer } from './spacetime/renderer';
import { drawCinematicNodes, drawSpaceBackdrop } from './spacetime/renderer';
import type { ArtConfig } from './spacetime/art';
import type { WarpConfig } from './spacetime/config';
import { CELESTIAL } from './palette';
import {drawStellarArt} from './stellar-art';
import {drawPortalArt} from './portal-art';
import {drawBlackHoleArt,drawAccretionDebug} from './black-hole-art';
import {drawCelestialEvents} from './celestial-events';
import { drawHazards, drawHazardImpact, drawHazardColliders } from './hazards';
const STATUS = { ready: '待发射', running: '护航中', paused: '已暂停', completed: '安全抵达', failed: '任务失败' };
export function telemetry(game: GameState): string {
  const ship = game.bodies.find(body => body.kind === 'ship')!;
  const result = efficiency(game);
  return game.level.name + ' | ' + STATUS[game.phase] + ' | 速度 ' + length(ship.velocity).toFixed(1) + ' / 限速 ' + speedLimit(ship)
    + (game.universe?' | 方舟局部 (':' | 方舟 (') + ship.position.x.toFixed(0) + ', ' + ship.position.y.toFixed(0) + ') | ' + game.elapsed.toFixed(1) + ' s'
    + (result ? ' | 航程 ' + result.distance.toFixed(1) + (result.stars ? ' | ' + '★'.repeat(result.stars) + '☆'.repeat(3-result.stars) : '') : '');
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, fill = true): void {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.strokeStyle = color; fill ? ctx.fill() : ctx.stroke();
}
function hashText(text: string): number { let h=2166136261; for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619); return (h>>>0)/4294967296; }
function drawPlanet(ctx: CanvasRenderingContext2D,body: GameState['bodies'][number],time:number):void {
  const {x,y}=body.position,r=body.radius,id=body.id;
  const palette=id==='earth'?CELESTIAL.earth:id==='mars'?CELESTIAL.mars:id==='jupiter'?CELESTIAL.jupiter:id==='saturn'?CELESTIAL.saturn:id==='uranus'?CELESTIAL.uranus:id==='neptune'?CELESTIAL.neptune:[CELESTIAL.planet[0],body.appearance?.color??CELESTIAL.planet[1],CELESTIAL.planet[2]];
  if(body.appearance?.ring){ctx.save();ctx.globalAlpha=.72;ctx.strokeStyle=CELESTIAL.ring;ctx.lineWidth=Math.max(2,r*.13);ctx.beginPath();ctx.ellipse(x,y,r*1.9,r*.62,-.18,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.38;ctx.strokeStyle=CELESTIAL.ringHighlight;ctx.lineWidth=Math.max(1,r*.035);for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(x,y,r*(1.35+i*.16),r*(.41+i*.05),-.18,0,Math.PI*2);ctx.stroke();}ctx.restore();}
  const g=ctx.createRadialGradient(x-r*.35,y-r*.4,r*.04,x,y,r*1.1);g.addColorStop(0, palette[0]);g.addColorStop(.52,palette[1]);g.addColorStop(1,palette[2]);ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();ctx.globalAlpha=.24;ctx.strokeStyle=palette[0];ctx.lineWidth=Math.max(1,r*.08);
  const bands=id==='jupiter'?7:id==='saturn'?5:3;for(let i=0;i<bands;i++){const yy=y-r*.7+i*r*1.4/(bands-1);ctx.beginPath();ctx.moveTo(x-r,yy+Math.sin(time*.08+i)*r*.04);ctx.bezierCurveTo(x-r*.3,yy-r*.08,x+r*.25,yy+r*.08,x+r,yy);ctx.stroke();}
  if(id==='earth'){ctx.fillStyle='#f2fbff88';for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(x-r*.35+i*r*.25,y-r*.15+i*r*.18,r*.3,r*.06,i,0,Math.PI*2);ctx.fill();}}
  if(id==='jupiter'){ctx.fillStyle='#b8614e99';ctx.beginPath();ctx.ellipse(x+r*.34,y+r*.18,r*.2,r*.1,-.2,0,Math.PI*2);ctx.fill();}
  ctx.restore();
  if(body.appearance?.ring){ctx.save();ctx.globalAlpha=.8;ctx.strokeStyle=CELESTIAL.ring;ctx.lineWidth=Math.max(2,r*.1);ctx.beginPath();ctx.ellipse(x,y,r*1.9,r*.62,-.18,Math.PI,Math.PI*2);ctx.stroke();ctx.restore();}
}
function drawAsteroid(ctx:CanvasRenderingContext2D,body:GameState['bodies'][number]):void {
  const {x,y}=body.position,r=body.radius,seed=hashText(body.id);ctx.save();ctx.translate(x,y);ctx.rotate(seed*Math.PI*2);ctx.beginPath();for(let i=0;i<9;i++){const a=i*Math.PI*2/9,rr=r*(.78+.2*((i*17+Math.floor(seed*100))%7)/6);if(i===0)ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);else ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();const g=ctx.createRadialGradient(-r*.3,-r*.4,0,0,0,r);g.addColorStop(0,CELESTIAL.rockLight);g.addColorStop(.5,CELESTIAL.rockMid);g.addColorStop(1,CELESTIAL.rockDark);ctx.fillStyle=g;ctx.fill();ctx.globalAlpha=.35;ctx.fillStyle='#202630';for(let i=0;i<4;i++){ctx.beginPath();ctx.arc((seed*7+i*3)%r-r/2,(seed*11+i*5)%r-r/2,Math.max(1,r*.08),0,Math.PI*2);ctx.fill();}ctx.restore();
}
export interface RenderVisualOptions { visuals?: VisualState; renderer?: DemoRenderer; art?: ArtConfig; warp?: WarpConfig; enhanced?: boolean; debugColliders?:boolean; debugAccretion?:boolean; }
export function render(ctx: CanvasRenderingContext2D, game: GameState, trajectory: Trajectory, camera: Camera, options: RenderVisualOptions = {}): void {
  const { width, height } = camera;
  const ship = game.bodies.find(b => b.kind === 'ship')!;
  const target = objectivePosition(game);
  const cinematic=Boolean(options.enhanced&&options.visuals&&options.renderer&&options.art&&options.warp&&options.warp.quality!=='off');
  ctx.clearRect(0, 0, width, height);
  if(cinematic)drawSpaceBackdrop(ctx,options.renderer!,camera,options.visuals!,options.warp!,options.art!);
  else {ctx.fillStyle = '#0c1220'; ctx.fillRect(0, 0, width, height);}
  if(cinematic)drawCinematicNodes(ctx,options.renderer!,game.players,camera,options.visuals!,options.warp!,options.art!);
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.position.x, -camera.position.y);
  ctx.lineWidth = 1 / camera.zoom;
  for(const dot of game.level.decorations??[])if(isVisible(camera,dot.position,dot.radius))circle(ctx,dot.position.x,dot.position.y,dot.radius,dot.color);
  for(const body of game.bodies) if(body.damageZone) {
    if(body.gravityRadius && isVisible(camera,body.position,body.gravityRadius)) {
      ctx.save();ctx.setLineDash([10/camera.zoom,12/camera.zoom]);
      circle(ctx,body.position.x,body.position.y,body.gravityRadius,'#a48aca55',false);ctx.restore();
    }
    if(isVisible(camera,body.position,body.damageZone.radius)) {
      circle(ctx,body.position.x,body.position.y,body.damageZone.radius,'#ec52651a');
      circle(ctx,body.position.x,body.position.y,body.damageZone.radius,'#ec768caa',false);
    }
  }
  for(const body of game.bodies)if(body.stellar&&body.stellarState?.status!=='exploded'&&body.stellarState?.status!=='neutron'&&isVisible(camera,body.position,body.stellar.burnRadius)) {
    circle(ctx,body.position.x,body.position.y,body.stellar.burnRadius,'#ff9b3d18');
    circle(ctx,body.position.x,body.position.y,body.stellar.burnRadius,'#ff9b3d80',false);
  }
  for (const [i, player] of game.players.entries()) if (player.active && isVisible(camera, player.position, player.field.radius)) {
    // The cinematic pass expresses the field through the shared star warp and
    // luminance material. Keep only a low-contrast footprint so the field
    // radius remains legible without turning the scene into a textbook ring.
    if(cinematic)circle(ctx, player.position.x, player.position.y, player.field.radius, i === 0 ? '#409eff08' : '#e9bd4808');
    else {
      circle(ctx, player.position.x, player.position.y, player.field.radius, i === 0 ? '#409eff12' : '#e9bd4812');
      circle(ctx, player.position.x, player.position.y, player.field.radius, i === 0 ? '#409eff70' : '#e9bd4870', false);
    }
  }
  // Celestial material belongs below navigation, the ship and damaging beams.
  // In particular, the bent accretion image must never hide a firing jet root.
  if(cinematic){
    drawCelestialEvents(ctx,options.visuals!,game.elapsed);
    for(const body of game.bodies)if(body.layer!=='hidden'&&!body.spawnPending&&isVisible(camera,body.position,body.radius*(body.kind==='black_hole'?5:2.2))){
      if(body.kind==='wormhole')drawPortalArt(ctx,body,game.elapsed,options.warp!.quality,Math.max(0,1-Math.hypot(ship.position.x-body.position.x,ship.position.y-body.position.y)/(body.radius*4)));
      if(body.kind==='star')drawStellarArt(ctx,body,game.elapsed,camera,options.warp!.quality);
      if(body.kind==='black_hole')drawBlackHoleArt(ctx,body,game.elapsed,options.warp!.quality);
    }
    drawHazards(ctx,game,camera,true,options.warp!.quality);
    // The event horizon remains black even where the beam's round cap overlaps it.
    for(const body of game.bodies)if(body.kind==='black_hole'&&body.layer!=='hidden')circle(ctx,body.position.x,body.position.y,body.captureRadius??body.radius,'#000000');
  }
  if (trajectory.points.length > 1) {
    const color = trajectory.outcome === 'failed' ? '#ed9b9b' : trajectory.outcome === 'completed' || trajectory.outcome === 'transition' ? '#64d98b' : '#b5c8e0';
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5 / camera.zoom; ctx.setLineDash([5 / camera.zoom, 6 / camera.zoom]);
    ctx.beginPath(); ctx.moveTo(trajectory.points[0].x, trajectory.points[0].y);
    for (const point of trajectory.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.stroke(); ctx.restore();
    const end = trajectory.points.at(-1)!;
    if (isVisible(camera, end, 4)) circle(ctx, end.x, end.y, 4, color, false);
  }
  if(!cinematic)drawHazards(ctx,game,camera,false,options.warp?.quality);
  for(const body of game.bodies)if(body.nodeInfluence&&body.id!==game.level.blackHoleJets?.sourceId&&isVisible(camera,body.position,body.nodeInfluence.ejectionDistance))drawGammaJet(ctx,body,game.elapsed,camera.zoom);
  for (const body of (cinematic?game.bodies.filter(b=>b.layer!=='hidden'&&isVisible(camera,b.position,b.radius*(b.kind==='black_hole'?5:b.kind==='star'?2.2:b.kind==='wormhole'?1.5:1))):visibleEntities(camera,game.bodies))) {
    if (body.kind === 'ship') {
      ctx.save(); ctx.translate(body.position.x, body.position.y); ctx.rotate(Math.atan2(body.velocity.y, body.velocity.x));
      const iconScale=Math.max(1,0.8/camera.zoom);ctx.scale(iconScale,iconScale);
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fillStyle = game.hazardMessage && game.health && game.health.current<game.health.max ? '#ff9a9a' : '#fff'; ctx.fill(); ctx.restore();
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`${12/camera.zoom}px system-ui`;ctx.fillText('方舟',body.position.x,body.position.y-16/camera.zoom);
    } else if (body.kind === 'station' || body.kind === 'wormhole') {
      if(!cinematic||body.kind==='station'){ctx.lineWidth = 3 / camera.zoom; circle(ctx, body.position.x, body.position.y, body.radius, '#64d98b', false);}
      ctx.fillStyle = '#9de3b3'; ctx.font = '15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(body.appearance?.name??'虫洞', body.position.x, body.position.y + body.radius + 26);
    } else {
      if(cinematic&&(body.kind==='star'||body.kind==='black_hole')&&!body.spawnPending){/* Material was drawn below hazards/navigation. */}
      else if(cinematic&&body.kind==='planet'&&!body.spawnPending)drawPlanet(ctx,body,game.elapsed);
      else if(cinematic&&body.kind==='asteroid'&&!body.spawnPending)drawAsteroid(ctx,body);
      else circle(ctx, body.position.x, body.position.y, body.radius, body.appearance?.color??(body.kind === 'asteroid' ? '#8993a3' : '#8f69b9'),!body.spawnPending);
      if(body.appearance?.ring&&!cinematic){ctx.strokeStyle=body.appearance.color;ctx.beginPath();ctx.ellipse(body.position.x,body.position.y,body.radius*1.65,body.radius*0.5,-0.3,0,Math.PI*2);ctx.stroke();}
      if (body.kind === 'black_hole') {
        if(!cinematic) {
        ctx.save();ctx.strokeStyle='#d6b28c';ctx.lineWidth=5/camera.zoom;ctx.beginPath();
        ctx.ellipse(body.position.x,body.position.y,body.radius*1.6,body.radius*0.65,-0.3,0,Math.PI*2);ctx.stroke();
        circle(ctx, body.position.x, body.position.y, body.captureRadius ?? body.radius, '#03040a');
        circle(ctx, body.position.x, body.position.y, body.captureRadius ?? body.radius, '#dba3bf',false);ctx.restore();}
      }
    }
    if(body.appearance&&body.kind!=='wormhole'&&body.kind!=='station'&&(camera.zoom>=0.14||body.kind==='star')) {
      ctx.fillStyle='#e5eaf4';ctx.textAlign='center';ctx.font=`${12/camera.zoom}px system-ui`;
      ctx.fillText(body.appearance.name,body.position.x,body.position.y-body.radius-12/camera.zoom);
    }
  }
  for (const player of visibleEntities(camera, game.players)) {
    const i = player.id === 'attractor' ? 0 : 1;
    if(player.capture) {
      drawCapturedNode(ctx,player,game,camera.zoom);
      continue;
    }
    const markerRadius=Math.max(player.radius,6/camera.zoom);
    if(!cinematic)circle(ctx, player.position.x, player.position.y, markerRadius, i === 0 ? '#409eff' : '#e9bd48');
    ctx.fillStyle = '#e5eaf4'; ctx.font = `${12/camera.zoom}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText((i === 0 ? 'P1 吸引' : 'P2 排斥') + (player.active ? ' 开' : ' 关'), player.position.x, player.position.y + (i===0?-markerRadius-9/camera.zoom:markerRadius+17/camera.zoom));
    if (camera.zoom>=0.2 && (game.phase === 'paused' || game.phase === 'ready')) {
      ctx.font = `${12/camera.zoom}px system-ui`; ctx.fillText('(' + player.position.x.toFixed(0) + ', ' + player.position.y.toFixed(0) + ')', player.position.x, player.position.y + markerRadius+(i===0?18:34)/camera.zoom);
    }
  }
  if(import.meta.env.DEV&&options.debugColliders)drawHazardColliders(ctx,game,camera);
  if(import.meta.env.DEV&&cinematic&&options.debugAccretion)for(const body of game.bodies)if(body.kind==='black_hole'&&body.layer!=='hidden')drawAccretionDebug(ctx,body,camera);
  ctx.restore();
  // Navigation and HUD are screen-space, never fed back into simulation.
  drawHazardImpact(ctx,game,camera);
  const marker = (position: {x:number;y:number}, label: string, color: string, margin = 30, labelOffset = 20) => {
    const edge = edgeMarker(camera, position, ship.position, margin); if (!edge) return;
    ctx.save(); ctx.translate(edge.position.x, edge.position.y); ctx.rotate(edge.angle);
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-7, -5); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
    ctx.font = '12px system-ui'; ctx.fillStyle = color;
    ctx.textAlign = edge.position.x > width / 2 ? 'right' : 'left';
    ctx.fillText(label + ' ' + edge.distance.toFixed(0), edge.position.x, Math.min(height - 8, Math.max(76, edge.position.y + labelOffset)));
  };
  game.players.forEach((p, i) => marker(p.position, i === 0 ? 'P1' : 'P2', i === 0 ? '#409eff' : '#e9bd48'));
  if (target) marker(target, '目标', '#64d98b', 65, -18);
  const panel = { minX: width - Math.min(210, width * 0.35) - 14, maxX: width - 14, minY: height - 134, maxY: height - 14 };
  const entities = [...game.bodies, ...game.players].filter(e => e.layer !== 'hidden' && e.layer !== 'background');
  const bounds = navigationBounds(game.level.mapBounds ?? {minX:0,minY:0,maxX:game.level.width,maxY:game.level.height}, [...entities.map(e => e.position), ...(target ? [target] : [])]);
  ctx.fillStyle = '#060b14e6'; ctx.fillRect(panel.minX, panel.minY, panel.maxX-panel.minX, panel.maxY-panel.minY);
  ctx.strokeStyle = '#48566b'; ctx.strokeRect(panel.minX, panel.minY, panel.maxX-panel.minX, panel.maxY-panel.minY);
  const view = viewBounds(camera); const a = mapPoint({x:view.minX,y:view.minY}, bounds, panel); const b = mapPoint({x:view.maxX,y:view.maxY},bounds,panel);
  ctx.strokeStyle = '#8e9bab'; ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
  for (const entity of entities) {
    const p = mapPoint(entity.position,bounds,panel);
    circle(ctx,p.x,p.y,entity.kind === 'ship' ? 3 : 2, entity.kind === 'ship' ? '#fff' : entity.kind === 'player' ? entity.id === 'attractor' ? '#409eff' : '#e9bd48' : entity.appearance?.color??'#8f69b9');
  }
  if (target) { const p = mapPoint(target,bounds,panel); circle(ctx,p.x,p.y,4,'#64d98b',false); }
  ctx.textAlign = 'left'; ctx.font = '12px system-ui'; ctx.fillStyle = '#aab8ca'; ctx.fillText('导航 · 当前已载入区域', panel.minX, panel.minY-7);
  const feedback = game.phase === 'failed' || game.phase === 'completed' || game.message.startsWith('TOO FAST');
  ctx.fillStyle = game.phase === 'failed' || game.message.startsWith('TOO FAST') ? '#ff9a9a' : '#c4cede'; ctx.font = '14px system-ui'; ctx.fillText(game.tutorial && !feedback ? STATUS[game.phase] + ' · ' + game.level.name : game.message, 16, 25, width-32);
  if (game.phase === 'completed' && game.level.id === 'moving-world') {
    ctx.fillStyle='#64d98b';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText('Level 0 Complete',width/2,height/2-20);
    ctx.font='15px system-ui';ctx.fillText('Solar Exodus 已解锁 · 点击上方继续',width/2,height/2+16);ctx.textAlign='left';
  }
  if(game.phase==='completed'&&game.level.id==='solar-exodus') {ctx.fillStyle='#64d98b';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText('Level 1 Complete',width/2,height/2);ctx.textAlign='left';}
  if(game.phase==='completed'&&game.level.id==='beyond-the-horizon') {ctx.fillStyle='#64d98b';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText('Level 2 Complete',width/2,height/2);ctx.textAlign='left';}
  if(game.level.id==='galactic-rest') {ctx.fillStyle='#c4cede';ctx.font='14px system-ui';ctx.fillText('已抵达银河边缘 · 安全休整 · Esc 返回章节，选择群星之间',16,92,width-32);}
  if(game.health) {
    ctx.fillStyle='#242d3a';ctx.fillRect(16,59,150,10);ctx.fillStyle=game.health.current<35?'#ff7b69':'#7cdd9b';ctx.fillRect(16,59,150*game.health.current/game.health.max,10);
    ctx.fillStyle='#dce4ee';ctx.font='12px system-ui';ctx.fillText(`船体 ${Math.ceil(game.health.current)} / ${game.health.max}`,176,69);
    const sun=game.bodies.find(b=>b.stellar),state=sun?.stellarState;
    if(sun) {
      const stellar=state?.status==='exploded'?'太阳已爆炸（不再产生引力）':state?.status==='neutron'?'中子星 · 强引力 / 无灼烧 / 可推动':`太阳内停留3秒：蓝色坍缩 ${(state?.blueSeconds??0).toFixed(1)} / 金色引爆 ${(state?.goldSeconds??0).toFixed(1)}`;
      ctx.fillText(stellar,16,89,width-32);ctx.fillText(`橙圈为灼烧 / 爆炸共同范围（${sun.stellar!.burnRadius}）· M 星图`,16,108,width-32);
    }
    const hole=game.bodies.find(b=>b.damageZone);
    if(hole) {
      ctx.fillText(`黑洞不可推动 · 外部引力 ${hole.gravityRadius} / 潮汐 ${hole.damageZone!.radius} / 事件视界 ${hole.captureRadius}`,16,89,width-32);
      ctx.fillText('紫色虚线：引力边缘 · 红圈：持续损伤 · 黑色核心：进入立即撕碎',16,108,width-32);
      if(hole.nodeInfluence)ctx.fillText('节点强牵引 · 视界内撕碎 · 每5秒向上喷流 · 外侧重组后恢复控制',16,126,width-32);
    }
  }
  ctx.fillStyle = '#92a0b3'; ctx.font = '12px system-ui';
  const outcome = { horizon: '预览终点', failed: '危险终点', completed: '安全跃迁', transition: '场景出口' }[trajectory.outcome];
  ctx.fillText('预测 ' + trajectory.seconds.toFixed(1) + ' s · ' + outcome + ' · 缩放 ' + camera.zoom.toFixed(2) + (target ? ' · 目标距离 ' + length(sub(target,ship.position)).toFixed(0) : ''),16,46);
  ctx.fillText('P1 ' + (game.players[0].active ? '开' : '关') + ' / P2 ' + (game.players[1].active ? '开' : '关') + ' · 检查点 ' + (game.checkpoint?.id ?? '无'),16,height-16);
  if(game.universe){ctx.fillStyle='#c3b2e0';ctx.fillText(explorationText(game).split('\n')[0],16,90,width-32);ctx.fillText('H / J 召回 P1 / P2 · K 保存 · L 恢复 · M 星图与发现线索',16,110,width-32);}
}
