import type { Vec2 } from '../physics/vector';
import type { Rect } from '../world/geometry';
import type { Mission, MissionState } from './mission';
import type { SceneId } from '../scenes/types';
import type { TutorialConfig, TutorialState } from './tutorial';
export interface Field { radius: number; strength: number; softening: number; maxAcceleration: number; polarity: 1 | -1 }
export type EntityKind = 'ship' | 'player' | 'asteroid' | 'planet' | 'star' | 'black_hole' | 'station' | 'wormhole';
export interface Entity {
  id: string;
  kind: EntityKind;
  position: Vec2;
  radius: number;
  layer?: 'world' | 'background' | 'hidden';
  appearance?: { name: string; color: string; ring?: boolean };
}
export interface Orbit { center: Vec2; radius: number; phase: number; angularSpeed: number; maxDrift?: number }
export interface StellarConfig {
  burnRadius: number; burnPerSecond: number; activationSeconds: number; blastRadius: number;
  remnantRadius: number; remnantGravityMultiplier: number; remnantResponse: number;
}
export interface StabilizationConfig {
  halfLife: number;
  rampSeconds?: number;
  sleepSpeed?: number;
  fieldEpsilon?: number;
}
export interface StabilizationState { playerVelocity: Vec2; idleTime: number }
export interface Body extends Entity {
  kind: Exclude<EntityKind, 'player'>;
  velocity: Vec2;
  affectedByFields: boolean;
  /** Acceleration response: 1 for small bodies, 0.18 for the movable first-level planet. */
  response: number;
  /** Relative density; mass is proportional to sphere volume. Defaults: 1, black hole 40. */
  density?: number;
  /** World units/second; defaults to the global celestial-body cap. */
  maxSpeed?: number;
  captureRadius?: number;
  motion?: 'dynamic' | 'static' | 'kinematic';
  emitsGravity?: boolean;
  collision?: 'none' | 'hazard' | 'capture';
  gravityRadius?: number;
  gravityStrength?: number;
  gravitySoftening?: number;
  receivesGravity?: boolean;
  orbit?: Orbit;
  orbitTime?: number;
  displacementLimit?: { center: Vec2; radius: number };
  stellar?: StellarConfig;
  stellarState?: { status: 'star' | 'neutron' | 'exploded'; blueSeconds: number; goldSeconds: number };
  stabilization?: StabilizationConfig;
  stabilizationState?: StabilizationState;
}
export interface Player extends Entity {
  kind: 'player'; id: 'attractor' | 'repulsor'; speed: number; field: Field; active: boolean;
  velocity: Vec2; acceleration: number; braking: number;
  /** Future world-target control: near-target easing time; has no effect on keyboard axes. */
  targetArrivalSeconds?: number;
}
export interface Port { position: Vec2; radius: number; maxEntrySpeed: number }
export interface Level {
  id: string; name: string;
  /** Reference framing only. Never a physical boundary or a viewport size. */
  width: number; height: number;
  bodies: Body[]; players: [Player, Player]; port?: Port;
  mapBounds?: Rect;
  /** Explicit optional mission boundary, independent of the camera. */
  missionBounds?: Rect;
  mission?: Mission;
  initialObjectives?: string[];
  tutorial?: TutorialConfig;
  seed?: number;
  stabilizationEnabled?: boolean;
  scoring?: { threeStarsSeconds: number; twoStarsSeconds: number };
  mode?: 'mission' | 'exploration';
  shipHealth?: number;
  decorations?: { position: Vec2; radius: number; color: string }[];
  cameraLandmarks?: { entityId: string; range: number; showDeadZone?: boolean }[];
  waves?: { id: string; bounds: Rect; seed: number; count: number }[];
}
export type Phase = 'ready' | 'running' | 'paused' | 'completed' | 'failed';
export interface GameState {
  level: Level; bodies: Body[]; players: [Player, Player]; phase: Phase; elapsed: number; message: string;
  mission: MissionState;
  distance: number;
  tutorial?: TutorialState;
  health?: { current: number; max: number };
  encounters?: string[];
  hazardMessage?: string;
  pendingScene?: SceneId;
  checkpoint?: { id: string; snapshot: Omit<GameState, 'checkpoint'> };
}
export type { Controls } from '../input/intent';
export { NO_CONTROLS } from '../input/intent';
