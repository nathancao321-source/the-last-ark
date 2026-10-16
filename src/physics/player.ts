import type { Player } from '../game/types';
import { copyIntent } from '../input/intent';
import type { PlayerControlIntent } from '../input/intent';
import type { Vec2 } from './vector';
import { add, length, limit, scale, sub } from './vector';

export interface NodeEnvironment { acceleration: Vec2; steeringSeconds: number }
function advance(player: Player, targetVelocity: Vec2, acceleration: number, dt: number, environment?: NodeEnvironment): void {
  const delta = sub(targetVelocity, player.velocity);
  // A finite response time lets exceptional black-hole pull persist instead of
  // the velocity servo cancelling every gravity impulse on the following tick.
  const correction = environment ? scale(delta, 1-Math.exp(-dt/Math.max(dt,environment.steeringSeconds))) : delta;
  player.velocity = add(player.velocity, limit(correction, Math.max(0, acceleration) * dt));
  if (environment) player.velocity = limit(add(player.velocity,scale(environment.acceleration,dt)),player.speed);
  player.position = add(player.position, scale(player.velocity, dt));
}

/** Existing keyboard/axis dynamics, independent of celestial gravity and rendering. */
export function movePlayer(player: Player, direction: Vec2, dt: number, environment?: NodeEnvironment): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const input = limit(direction, 1);
  advance(player, scale(input, player.speed), length(input) > 0 ? player.acceleration : player.braking, dt, environment);
}

/** The only input-to-player mutation boundary. No device is allowed to move a node directly. */
export function applyPlayerIntent(player: Player, raw: PlayerControlIntent, dt: number, environment?: NodeEnvironment): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const intent = copyIntent(raw);
  player.active = intent.abilityActive;
  if (intent.moveX !== 0 || intent.moveY !== 0 || !intent.targetWorldPosition) {
    movePlayer(player, { x: intent.moveX, y: intent.moveY }, dt, environment);
    return;
  }
  const offset = sub(intent.targetWorldPosition, player.position);
  const distance = length(offset);
  // Stopping-distance envelope plus a smooth arrival envelope near the point.
  // No position snapping, no instantaneous speed reset, including after a target jump.
  const speed = Math.min(player.speed, Math.sqrt(2 * Math.max(0, Math.min(player.acceleration, player.braking)) * distance),
    distance / Math.max(dt, player.targetArrivalSeconds ?? 0.25));
  const target = distance > 0 ? scale(offset, speed / distance) : { x: 0, y: 0 };
  advance(player, target, speed < length(player.velocity) ? player.braking : player.acceleration, dt, environment);
}
