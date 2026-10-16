import type { GameState } from '../game/types';
import { fieldAcceleration } from '../physics/fields';
import { add, length, scale } from '../physics/vector';
import { bodyGravity } from '../physics/gravity';
import { capabilities } from '../game/entities';
export function movementTelemetry(game: GameState): string {
  const ship=game.bodies.find(b=>b.kind==='ship')!;
  const sources=game.bodies.filter(b=>b!==ship&&capabilities(b).gravity).map(body=>({body,
    acceleration:scale(fieldAcceleration(ship.position,body.position,bodyGravity(body)),ship.gravityResponse??ship.response)}));
  const gravity=sources.reduce((sum,s)=>add(sum,s.acceleration),{x:0,y:0});
  return game.players.map((p,i)=>{
    const force=p.active ? fieldAcceleration(ship.position,p.position,p.field) : {x:0,y:0};
    return 'P'+(i+1)+' 位置 ('+p.position.x.toFixed(1)+','+p.position.y.toFixed(1)+') 速度 ('+p.velocity.x.toFixed(1)+','+p.velocity.y.toFixed(1)+') |v|='+length(p.velocity).toFixed(1)
      +' | 力场 '+(p.active?'开':'关')+' 源强度='+p.field.strength+' 对飞船 |a|='+length(force).toFixed(3);
  }).join('\n')+'\n飞船速度='+length(ship.velocity).toFixed(2)+' 完成/运行时间='+game.elapsed.toFixed(2)+'s 航程='+game.distance.toFixed(1)
    +`\n天体引力（限幅前）=(${gravity.x.toFixed(3)},${gravity.y.toFixed(3)}) |a|=${length(gravity).toFixed(3)} 来源：`
    +sources.filter(s=>length(s.acceleration)>0.001).map(s=>`${s.body.appearance?.name??s.body.id} ${length(s.acceleration).toFixed(3)}`).join(' / ')
    +'\n稳定机制='+(game.level.stabilizationEnabled===false?'关闭（纯惯性对照）':'开启')+' '+game.bodies.filter(b=>b.stabilization).map(b=>b.id+': 半衰期 '+b.stabilization!.halfLife+'s 扰动速度 '+length(b.stabilizationState?.playerVelocity ?? {x:0,y:0}).toFixed(2)).join(' | ')
    +(game.health?'\n船体='+game.health.current.toFixed(1)+'/'+game.health.max+' 物理天体='+game.bodies.length+' 碎石波次='+(game.encounters??[]).join(','):'')
    +game.bodies.filter(b=>b.stellar).map(b=>'\n'+(b.appearance?.name??b.id)+' '+(b.stellarState?.status??'star')+' ('+b.position.x.toFixed(1)+','+b.position.y.toFixed(1)+') 蓝驻留='+(b.stellarState?.blueSeconds??0).toFixed(2)+' 金驻留='+(b.stellarState?.goldSeconds??0).toFixed(2)).join('');
}
