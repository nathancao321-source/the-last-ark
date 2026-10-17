import type { SceneRegistry } from '../scenes/types';
import { cooperationLevel } from '../levels/cooperation';
import { solarSections } from '../levels/solar-system';
import { blackHoleSections } from '../levels/black-hole';
import { landmarks } from '../world/generator';
import { SECTOR_SIZE } from '../world/sectors';
import { collisionFixture } from './collision-fixtures';
/** Called ONLY in Vite development mode. Values become level config, so forecasts
 * and checkpoints use exactly the same settings. No runtime physics monkey patching.
 */
export function developmentRegistry(base: SceneRegistry, search: string): SceneRegistry {
  const params = new URLSearchParams(search), result = structuredClone(base);
  if (params.get('dev') !== '1') return result;
  result.coop_test = {id:'coop_test',name:'开发合作测试',status:'available',level:structuredClone(cooperationLevel)};
  const section=params.get('section');
  const contactFixture=section?collisionFixture(cooperationLevel,section):undefined;
  if(contactFixture)result.coop_test.level=contactFixture;
  if(section && Object.hasOwn(solarSections,section) && result.solar_system.level) {
    const preset=solarSections[section as keyof typeof solarSections],level=result.solar_system.level;
    level.bodies.find(b=>b.kind==='ship')!.position={...preset.position};
    level.initialObjectives=[...preset.completed];
    level.players.forEach((p,i)=>{p.position={x:preset.position.x+(i?-80:150),y:preset.position.y+(i?150:-150)};});
  }
  if(section && Object.hasOwn(blackHoleSections,section) && result.black_hole.level) {
    const preset=blackHoleSections[section as keyof typeof blackHoleSections],level=result.black_hole.level;
    const ship=level.bodies.find(b=>b.kind==='ship')!;
    ship.position={...preset.position};ship.velocity={...preset.velocity};level.initialObjectives=[...preset.completed];
    level.players.forEach((p,i)=>{p.position='nodePositions' in preset?{...preset.nodePositions[i]}:{x:preset.position.x+(i?-80:130),y:preset.position.y+(i?150:-160)};});
  }
  const number = (key: string, min: number, max: number): number | undefined => {
    const raw=params.get(key);if(raw===null || raw.trim()==='') return;
    const value=Number(raw);return Number.isFinite(value) && value>=min && value<=max ? value : undefined;
  };
  if(result.endless.level) {
    const level=result.endless.level;level.seed=Math.floor(number('seed',0,4294967295)??level.seed!);
    if(section==='triple'||section==='nebula') {
      const key=landmarks(level.seed)[section],position={x:key.x*SECTOR_SIZE+400,y:key.y*SECTOR_SIZE+1024};
      level.bodies[0].position=position;level.bodies[0].velocity={x:0,y:0};
      level.players.forEach((p,i)=>{p.position={x:position.x+(i?-90:120),y:position.y+(i?140:-140)};});
    }
  }
  for(const scene of Object.values(result)) if(scene.level) {
    scene.level.stabilizationEnabled=params.get('stabilization')!=='off';
    for(const body of scene.level.bodies) if(body.stabilization) {
      body.stabilization.halfLife=number('halfLife.'+body.id,0.1,30) ?? body.stabilization.halfLife;
    }
    for(const player of scene.level.players) {
      player.speed=number('moveSpeed',30,1000) ?? player.speed;
      player.acceleration=number('moveAcceleration',10,10000) ?? player.acceleration;
      player.braking=number('moveBraking',10,10000) ?? player.braking;
    }
  }
  return result;
}
