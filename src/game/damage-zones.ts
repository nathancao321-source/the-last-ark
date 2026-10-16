import type { GameState } from './types';
import { length, sub } from '../physics/vector';

/** Game approximation for tidal damage, not a relativistic spacetime model.
 * Fixed-step sampling, bounded linear damage; only HP changes, never motion. */
export function updateDamageZones(game: GameState, dt: number): string | undefined {
  if (!game.health || !Number.isFinite(dt) || dt <= 0) return;
  const ship = game.bodies.find(body => body.kind === 'ship')!;
  for (const source of game.bodies) {
    const zone = source.damageZone;
    if (!zone || source.layer === 'hidden') continue;
    const distance = length(sub(ship.position, source.position)) - ship.radius;
    if (distance >= zone.radius) continue;
    const inner = source.captureRadius ?? source.radius;
    const depth = Math.min(1, Math.max(0, (zone.radius - distance) / Math.max(1, zone.radius - inner)));
    game.health.current = Math.max(0, game.health.current - Math.max(0, zone.damagePerSecond) * depth * dt);
    game.hazardMessage = zone.message;
    if (game.health.current <= 0) return zone.failureMessage;
  }
}
