import type { Camera } from '../../camera/camera';
import { worldToScreen } from '../../camera/camera';
import type { Player } from '../../game/types';
import type { VisualState } from './model';
export function visualAnchors(players:readonly Player[],state:VisualState,camera:Camera){
  return players.map((player,i)=>{
    const core=worldToScreen(camera,player.position),field=worldToScreen(camera,state.sources[i].position);
    return {core,field,error:Math.hypot(core.x-field.x,core.y-field.y)};
  });
}
/** Debug-only: crosses are the core/atlas center, rings are the field/particle
 * origin. Trail samples deliberately stay at past WORLD positions. This checks
 * anchor transforms, not the location of the brightest texel in a cloud. */
export function drawAnchors(ctx:CanvasRenderingContext2D,players:readonly Player[],state:VisualState,camera:Camera):string {
  const anchors=visualAnchors(players,state,camera);ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.lineWidth=1;ctx.font='11px monospace';
  anchors.forEach((a,i)=>{ctx.strokeStyle=i?'#ffd080':'#80dfff';ctx.beginPath();ctx.moveTo(a.core.x-10,a.core.y);ctx.lineTo(a.core.x+10,a.core.y);ctx.moveTo(a.core.x,a.core.y-10);ctx.lineTo(a.core.x,a.core.y+10);ctx.stroke();ctx.beginPath();ctx.arc(a.field.x,a.field.y,15,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#cedceb';ctx.fillText(`P${i+1} anchor Δ ${a.error.toFixed(3)}px`,a.core.x+20,a.core.y-20);});ctx.restore();
  return anchors.map((a,i)=>`P${i+1} core / field Δ ${a.error.toFixed(3)} px`).join('\n')+`\nCamera (${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}) z=${camera.zoom.toFixed(3)}\n视觉时钟 ${state.time.toFixed(3)} · 累计事件 ${state.emitted}`;
}
