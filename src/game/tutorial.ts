import type { GameState } from './types';
import type { Vec2 } from '../physics/vector';
import { length, sub } from '../physics/vector';
import { fieldAcceleration } from '../physics/fields';

export type LessonCondition = { type: 'acknowledge' | 'exit' }
  | { type: 'moved'; player: 0 | 1; distance: number }
  | { type: 'enabled'; player: 0 | 1 }
  | { type: 'body_perturbed'; bodyId: string; minSpeed: number }
  | { type: 'influence'; players: (0 | 1)[]; seconds: number; minAcceleration: number };
export interface LessonStep {
  id: string; title: string; text: string; condition: LessonCondition;
  pauseOnEnter?: boolean;
}
export interface TutorialConfig { shipId: string; steps: LessonStep[] }
export interface TutorialState {
  step: number; age: number; effectiveSeconds: number;
  traveled: [number, number]; visited: string[];
  acknowledged: boolean;
}
export function currentLesson(game: GameState): LessonStep | undefined {
  return game.tutorial ? game.level.tutorial?.steps[game.tutorial.step] : undefined;
}
export function initializeTutorial(game: GameState): void {
  const first = game.level.tutorial?.steps[0];
  if (first) game.tutorial = { step: 0, age: 0, effectiveSeconds: 0, traveled: [0, 0], visited: [first.id], acknowledged: false };
}
/** Returns a checkpoint ID. Only teaching state/phase change; never moves physical entities. */
export function advanceLesson(game: GameState): string | undefined {
  if (!game.tutorial || game.phase === 'failed' || game.phase === 'completed' || game.pendingScene) return;
  const next = game.level.tutorial?.steps[game.tutorial.step + 1];
  if (!next) return;
  game.tutorial.step++; game.tutorial.age = 0; game.tutorial.effectiveSeconds = 0;
  game.tutorial.acknowledged = false;
  game.tutorial.visited.push(next.id);
  if (next.pauseOnEnter !== false && game.phase === 'running') game.phase = 'paused';
  return 'lesson-' + next.id;
}
/** Observe actual movement and effective field exposure. Paused planning never counts as flight. */
export function updateTutorial(game: GameState, previous: Map<string, Vec2>, dt: number, simulated: boolean): string | undefined {
  const state = game.tutorial, step = currentLesson(game);
  if (!state || !step || game.pendingScene || game.phase === 'failed' || game.phase === 'completed') return;
  state.age += dt;
  game.players.forEach((p, i) => { state.traveled[i] += length(sub(p.position, previous.get(p.id) ?? p.position)); });
  if (!state.acknowledged) return;
  const condition = step.condition;
  let met = false;
  if (condition.type === 'moved') met = state.traveled[condition.player] >= condition.distance;
  if (condition.type === 'enabled') met = game.players[condition.player].active;
  if (condition.type === 'body_perturbed') met = length(game.bodies.find(b => b.id === condition.bodyId)?.stabilizationState?.playerVelocity ?? {x:0,y:0}) >= condition.minSpeed;
  if (condition.type === 'influence') {
    const ship = game.bodies.find(b => b.id === game.level.tutorial!.shipId);
    if (simulated && ship) {
      const effective = ship.affectedByFields && condition.players.every(index => {
        const player = game.players[index];
        return player.active && length(fieldAcceleration(ship.position, player.position, player.field)) * ship.response >= condition.minAcceleration;
      });
      state.effectiveSeconds = effective ? state.effectiveSeconds + dt : 0;
    }
    met = state.effectiveSeconds + 1e-9 >= condition.seconds;
  }
  // At most one stage per update, with a brief readable dwell even for actions performed early.
  return met && state.age >= 0.35 ? advanceLesson(game) : undefined;
}
/** Exactly one primary instruction; the phase suffix explains deliberate teaching pauses. */
export function tutorialInstruction(game: GameState): string | undefined {
  const step = currentLesson(game);
  if (!step) return;
  if (game.phase === 'failed') return game.message + ' 按 R 从当前教学阶段重试；Shift+R 从头开始。';
  if (step.condition.type === 'acknowledge') return step.text + ' 按 Space 确认。';
  if (step.condition.type === 'influence' || step.condition.type === 'exit') {
    return step.text + (game.phase === 'running' ? '' : ' 按 Space 发射 / 继续。');
  }
  return step.text;
}
