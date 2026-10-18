import type { Vec2 } from '../physics/vector';
import type { Rect } from '../world/geometry';
import type { Mission, MissionState } from './mission';
import type { SceneId } from '../scenes/types';
import type { TutorialConfig, TutorialState } from './tutorial';
import type { UniverseState } from '../world/universe';
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
  /** Shared visible heat and explosion radius: one source of truth. */
  burnRadius: number; burnPerSecond: number; activationSeconds: number;
  remnantRadius: number; remnantGravityMultiplier: number; remnantResponse: number;
}
export interface StabilizationConfig {
  halfLife: number;
  rampSeconds?: number;
  sleepSpeed?: number;
  fieldEpsilon?: number;
}
export interface StabilizationState { playerVelocity: Vec2; idleTime: number }
export interface NodeInfluence {
  gravityMultiplier: number;
  /** Sum of node gravity is capped below its own movement acceleration. */
  maxAccelerationRatio: number;
  steeringSeconds: number;
  jetPeriod: number;
  jetSeconds: number;
  reformSeconds: number;
  ejectionDistance: number;
}
export interface NodeCapture {
  sourceId: string;
  phase: 'captured' | 'jet' | 'reforming';
  elapsed: number;
  releaseAt: number;
  abilityActive: boolean;
  origin: Vec2;
  destination: Vec2;
}
export interface Body extends Entity {
  contact?: { mass?: number; restitution?: number; largeBody?: 'destroy'|'merge'|'fail' };
  /** Procedural home chunk, independent of current drifting position. */
  chunk?: { x: number; y: number };
  /** A returning cached body overlapping the ship waits harmlessly until separated. */
  spawnPending?: boolean;
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
  captureMessage?: string;
  nodeInfluence?: NodeInfluence;
  /** Optional radial damage, independent of gravity and capture. No velocity edits. */
  damageZone?: { radius: number; damagePerSecond: number; message: string; failureMessage: string };
  motion?: 'dynamic' | 'static' | 'kinematic';
  emitsGravity?: boolean;
  collision?: 'none' | 'hazard' | 'capture';
  gravityRadius?: number;
  /** Members of the same group interact only within the smaller peer radius.
   * Other targets (ship, asteroids, stars) retain the source's normal range. */
  gravityPeer?: { group: string; radius: number };
  gravityStrength?: number;
  gravitySoftening?: number;
  receivesGravity?: boolean;
  /** Environmental acceleration response, independent of player field response.
   * Legacy levels default to response; physically integrated solar bodies use 1. */
  gravityResponse?: number;
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
  capture?: NodeCapture;
}
export interface Port { position: Vec2; radius: number; maxEntrySpeed: number }
export interface Level {
  solarWave?: import('./hazard-types').SolarWaveConfig;
  blackHoleJets?: import('./hazard-types').JetConfig;
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
  procedural?: boolean;
  shipHealth?: number;
  decorations?: { position: Vec2; radius: number; color: string }[];
  waves?: { id: string; bounds: Rect; seed: number; count: number }[];
}
export type Phase = 'ready' | 'running' | 'paused' | 'completed' | 'failed';
export interface GameState {
  hazards?: import('./hazard-types').HazardState;
  collisionBudgetExhausted?: boolean;
  collisionEvents?: { type:string; a:string; b:string }[];
  collisionNotice?: { message:string; until:number };
  level: Level; bodies: Body[]; players: [Player, Player]; phase: Phase; elapsed: number; message: string;
  mission: MissionState;
  distance: number;
  universe?: UniverseState;
  tutorial?: TutorialState;
  health?: { current: number; max: number };
  encounters?: string[];
  hazardMessage?: string;
  pendingScene?: SceneId;
  checkpoint?: { id: string; snapshot: Omit<GameState, 'checkpoint'> };
}
export type { Controls } from '../input/intent';
export { NO_CONTROLS } from '../input/intent';
