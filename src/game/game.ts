import type { Controls, GameState, Level } from './types';
import { finite, length, sub } from '../physics/vector';
import { stepNode } from '../physics/node-gravity';
import { integrate } from '../physics/world';
import { sweptOverlap } from '../physics/collision';
import { capabilities } from './entities';
import { emptyMissionState, evaluateMission, currentObjective, dockingFeedback } from './mission';
import { SpatialIndex } from '../world/spatial-index';
import { contains, sweptBounds } from '../world/geometry';
import { advanceLesson, currentLesson, initializeTutorial, updateTutorial } from './tutorial';
import { updateStellar } from './stellar';
import { updateDamageZones } from './damage-zones';
import { initializeUniverse, rebaseUniverse, streamUniverse } from '../world/universe';
export const FIXED_DT = 1 / 60;
export function saveCheckpoint(game: GameState, id: string): void {
  const { checkpoint: _previous, ...state } = game;
  game.checkpoint = { id, snapshot: structuredClone(state) };
}
export function createGame(level: Level): GameState {
  const config = structuredClone(level);
  if (!config.mission && config.port) config.mission = {
    objectives: [{ id: 'dock', label: '低速进入空间港（≤ ' + config.port.maxEntrySpeed + '）',
      target: { position: config.port.position }, condition: { type: 'speed_in_region', entityId: config.bodies.find(b => b.kind === 'ship')!.id,
        region: { shape: 'circle', center: config.port.position, radius: config.port.radius }, maxSpeed: config.port.maxEntrySpeed, fullContainment: true } }], triggers: [],
  };
  const game: GameState = { level: config, bodies: structuredClone(config.bodies), players: structuredClone(config.players), phase: 'ready', elapsed: 0,
    message: '准备就绪 · Space 发射；可先调整玩家位置', mission: emptyMissionState(), distance: 0 };
  initializeTutorial(game);
  game.mission.completedObjectives=[...(config.initialObjectives ?? [])];
  if(config.shipHealth)game.health={current:config.shipHealth,max:config.shipHealth};
  if(config.procedural)initializeUniverse(game);
  saveCheckpoint(game, 'start');
  return game;
}
export function retryGame(game: GameState): GameState {
  const restored: GameState = game.checkpoint ? structuredClone(game.checkpoint.snapshot) : createGame(game.level);
  restored.phase = 'ready'; restored.players.forEach(p => { p.active = false; if(p.capture)p.capture.abilityActive=false; }); delete restored.pendingScene;
  if (restored.tutorial) restored.tutorial.acknowledged = false;
  restored.message = '已恢复检查点（保留当时血量）· Space 继续；R 从头开始';
  saveCheckpoint(restored, game.checkpoint?.id ?? 'start');
  return restored;
}
export function togglePause(game: GameState): void {
  const lesson = currentLesson(game);
  if ((game.phase === 'ready' || game.phase === 'paused') && lesson && !game.tutorial!.acknowledged) {
    if (lesson.condition.type === 'acknowledge') {
      const checkpoint = advanceLesson(game); if (checkpoint) saveCheckpoint(game, checkpoint);
    } else {
      game.tutorial!.acknowledged = true;
      if (['influence','exit','body_perturbed'].includes(lesson.condition.type)) game.phase = 'running';
    }
    return;
  }
  if (game.phase === 'ready' || game.phase === 'paused') { game.phase = 'running'; game.message = currentObjective(game)?.label ?? '护航中'; }
  else if (game.phase === 'running') { game.phase = 'paused'; game.message = '已暂停 · 可移动玩家；Space 继续'; }
}
export function pause(game: GameState): void { if (game.phase === 'running') togglePause(game); }
function lose(game: GameState, message: string): void { game.phase = 'failed'; game.message = message + ' · R 重试'; }
/** DEV UI calls this; skipping never completes the mission or teleports a body. */
export function skipTeachingStep(game: GameState): void {
  const checkpoint = advanceLesson(game); if (checkpoint) saveCheckpoint(game, checkpoint);
}
export function stepGame(game: GameState, input: Controls, dt = FIXED_DT): void {
  if (game.phase === 'completed' || game.phase === 'failed') return;
  if (!Number.isFinite(dt) || dt <= 0) return;
  let frameShift={x:0,y:0};
  if(game.universe){frameShift=rebaseUniverse(game);streamUniverse(game,frameShift.x!==0||frameShift.y!==0);}
  const previous = new Map([...game.bodies, ...game.players].map(b => [b.id, { ...b.position }]));
  game.players.forEach((player, i) => {
    const intent=input.players[i],target=intent.targetWorldPosition;
    stepNode(player, target?{...intent,targetWorldPosition:{x:target.x+frameShift.x,y:target.y+frameShift.y}}:intent, game.bodies, dt, game.phase === 'running', game.elapsed);
  });
  if (game.phase !== 'running') {
    const checkpoint = updateTutorial(game, previous, dt, false);
    if (checkpoint) saveCheckpoint(game, checkpoint);
    return;
  }
  const invalid = () => game.bodies.some(b => !finite(b.position) || !finite(b.velocity)) || game.players.some(p => !finite(p.position) || !finite(p.velocity));
  if (invalid()) { lose(game, '模拟数值异常'); return; }
  integrate(game.bodies, game.players, dt, game.level.stabilizationEnabled !== false); game.elapsed += dt;
  if (invalid()) { lose(game, '模拟数值异常'); return; }
  const ship = game.bodies.find(b => b.kind === 'ship');
  if (!ship) { lose(game, '关卡缺少方舟'); return; }
  game.distance += length(sub(ship.position, previous.get(ship.id)!));
  const stellarFailure=updateStellar(game,previous,dt);
  if(stellarFailure){lose(game,stellarFailure);return;}
  const hazards = new SpatialIndex<typeof ship>();
  const dangerRadius = (b: typeof ship) => capabilities(b).collision === 'capture' ? b.captureRadius ?? b.radius : b.radius;
  for (const body of game.bodies) if (body !== ship && capabilities(body).collision !== 'none') {
    hazards.insert(body, sweptBounds(previous.get(body.id)!, body.position, dangerRadius(body)));
  }
  const hits = (body: typeof ship, captureOnly = false) => hazards.query(sweptBounds(previous.get(body.id)!, body.position, body.radius)).find(other =>
    other !== body && (!captureOnly || capabilities(other).collision === 'capture') &&
    sweptOverlap(previous.get(body.id)!, body.position, previous.get(other.id)!, other.position, body.radius + dangerRadius(other)));
  const collision = hits(ship);
  if (collision) { lose(game, capabilities(collision).collision === 'capture' ? collision.captureMessage ?? '飞船被吞噬' : '飞船撞击危险天体'); return; }
  // Capture is checked first: entering an event horizon can never become a
  // surviving fly-through or a goal transition, even within a single fast step.
  const damageFailure = updateDamageZones(game, dt);
  if (damageFailure) { lose(game, damageFailure); return; }
  const bounds = game.level.missionBounds;
  if (bounds && (!contains(bounds, {x:ship.position.x-ship.radius,y:ship.position.y-ship.radius}) || !contains(bounds, {x:ship.position.x+ship.radius,y:ship.position.y+ship.radius}))) {
    lose(game, '飞船离开任务边界'); return;
  }
  // Offscreen bodies remain simulated. Only configured capture hazards remove dynamic bodies.
  game.bodies = game.bodies.filter(b => b === ship || capabilities(b).motion !== 'dynamic' || !hits(b, true));
  const checkpoint = evaluateMission(game, previous);
  const lessonCheckpoint = updateTutorial(game, previous, dt, true);
  game.message = (game.phase as GameState['phase']) === 'completed' ? '安全抵达！· R 从头开始；Shift+R 恢复检查点' : game.hazardMessage ?? dockingFeedback(game, previous) ?? game.mission.hint ?? currentObjective(game)?.label ?? game.universe?.notice ?? '护航中';
  if (checkpoint || lessonCheckpoint) saveCheckpoint(game, checkpoint ?? lessonCheckpoint!);
}
