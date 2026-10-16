import type { GameState } from './types';
import type { Vec2 } from '../physics/vector';
import { length, sub } from '../physics/vector';
import { bodyGravity } from '../physics/gravity';
import { sweptOverlap } from '../physics/collision';

/** Configured stellar hazards. No blast impulse, orbit bonus or ship velocity edits. */
export function updateStellar(game: GameState, previous: Map<string,Vec2>, dt: number): string | undefined {
  game.hazardMessage=undefined;
  const ship=game.bodies.find(b=>b.kind==='ship')!;
  for(const star of game.bodies) {
    const config=star.stellar;if(!config)continue;
    const state=star.stellarState ??= {status:'star',blueSeconds:0,goldSeconds:0};
    if(state.status!=='star')continue;
    const inside=game.players.map(p=>length(sub(p.position,star.position))<=star.radius);
    // Opposite projections cancel the transformation; neither side wins an arbitrary tie.
    state.blueSeconds=inside[0]&&!inside[1] ? state.blueSeconds+dt : 0;
    state.goldSeconds=inside[1]&&!inside[0] ? state.goldSeconds+dt : 0;
    if(state.goldSeconds+1e-9>=config.activationSeconds) {
      state.status='exploded';star.emitsGravity=false;star.collision='none';star.motion='static';star.layer='hidden';
      star.velocity={x:0,y:0};star.affectedByFields=false;
      if(sweptOverlap(previous.get(ship.id)??ship.position,ship.position,previous.get(star.id)??star.position,star.position,config.blastRadius+ship.radius)) return '太阳爆炸：方舟位于爆炸范围内';
      game.hazardMessage='太阳已引爆 · 方舟在爆炸范围外，继续逃逸';continue;
    }
    if(state.blueSeconds+1e-9>=config.activationSeconds) {
      const strength=bodyGravity(star).strength;
      state.status='neutron';star.radius=config.remnantRadius;star.gravityStrength=strength*config.remnantGravityMultiplier;
      star.gravitySoftening=35;star.response=config.remnantResponse;
      if(star.displacementLimit)star.displacementLimit.radius=320;
      star.appearance={name:'中子星',color:'#b8e9ff'};
      game.hazardMessage='太阳坍缩为中子星 · 无灼烧，更强引力，可推拉';continue;
    }
    if(inside[0]&&inside[1])game.hazardMessage='两个节点在太阳内相互抵消 · 留下一个节点进行转化';
    const distance=length(sub(ship.position,star.position))-ship.radius;
    if(game.health && distance<config.burnRadius) {
      // Finite, distance-dependent continuous damage. Collision with the core is still fatal.
      const factor=Math.min(1,Math.max(0,(config.burnRadius-distance)/(config.burnRadius-star.radius)));
      game.health.current=Math.max(0,game.health.current-config.burnPerSecond*factor*dt);
      game.hazardMessage='太阳灼烧 · 远离橙色热区';
      if(game.health.current<=0)return '方舟被太阳灼烧摧毁';
    }
  }
}
