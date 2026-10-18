import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, FIXED_DT, stepGame, togglePause } from '../src/game/game';
import type { GameState, Level } from '../src/game/types';
import { createControls } from '../src/input/intent';
import { endlessLevel } from '../src/levels/endless';
import { createCamera } from '../src/camera/camera';
import { SECTOR_SIZE } from '../src/world/sectors';
import { landmarks } from '../src/world/generator';
import { MAX_CACHED_CHUNKS, MAX_LOADED_CHUNKS, MAX_UNIVERSE_BODIES, streamUniverse, worldChunk } from '../src/world/universe';
import { createVisualState, sampleDisturbance, syncVisualPositions, updateVisuals } from '../src/render/spacetime/model';
import { DEFAULT_WARP } from '../src/render/spacetime/config';
import { CINEMATIC_ART } from '../src/render/spacetime/art';
import { updateCelestialVisuals } from '../src/render/celestial-events';
import { syncUniverseVisuals } from '../src/render/endless-bridge';
import { createEndlessBackground, drawEndlessBackground, ENDLESS_TILE_LIMIT, resetEndlessBackground } from '../src/render/endless-background';
import { generateEndlessStars, generateEndlessTile, sampleEndlessField } from '../src/render/endless-field';

/** Canvas/worker transport only is stubbed. All game, streaming, VFX, field and
 * background sampling code is real. OFF has no visual object or visual calls. */
function renderHarness() {
  let draws = 0;
  const context = new Proxy({}, {
    get: (_target, key) => key === 'createImageData' ? (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) })
      : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} })
        : () => { draws++; },
    set: () => true,
  }) as CanvasRenderingContext2D;
  interface Job { key: string; res: number }
  class WorkerTransport {
    onmessage?: (event: { data: { key: string; pixels: Uint8ClampedArray; activity: Uint8ClampedArray; ms: number } }) => void;
    postMessage(job: Job) {
      const pixels = new Uint8ClampedArray((job.res + 2) ** 2 * 4);
      this.onmessage?.({ data: { key: job.key, pixels, activity: pixels, ms: 0 } });
    }
    terminate() {}
  }
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('Worker', WorkerTransport);
  return { context, draws: () => draws };
}
function freeExploration(game: GameState): void {
  expect(game.level.mode).toBe('exploration');
  expect(game.level.solarWave).toBeUndefined(); expect(game.level.blackHoleJets).toBeUndefined();
  expect(game.hazards).toBeUndefined(); expect(game.pendingScene).toBeUndefined();
  expect(game.level.port).toBeUndefined(); expect(game.level.missionBounds).toBeUndefined();
  expect(game.level.mission).toEqual({ objectives: [], triggers: [], completeOnObjectives: false });
  expect(game.mission.completedObjectives).toEqual([]); expect(game.mission.firedTriggers).toEqual([]);
  expect(game.bodies.some(body => body.stellar || body.damageZone || body.nodeInfluence)).toBe(false);
  expect(game.universe!.loaded.length).toBeLessThanOrEqual(MAX_LOADED_CHUNKS);
  expect(game.universe!.cache.length).toBeLessThanOrEqual(MAX_CACHED_CHUNKS);
  expect(game.bodies.length).toBeLessThanOrEqual(MAX_UNIVERSE_BODIES);
}
afterEach(() => vi.unstubAllGlobals());

describe('Endless cinematic visuals cannot change simulation or exploration goals', () => {
  it.each([20261017, 7, 424242])('keeps every full GameState identical across 3600 real steps, streaming and rebase for seed %i', seed => {
    const level = structuredClone(endlessLevel); level.seed = seed;
    // Ordinary coast fixture: the existing speed cap, generated world and both
    // player acceleration paths remain enabled. Only initial placement differs.
    level.bodies[0].velocity = { x: 240, y: 0 };
    level.players.forEach((player, i) => { player.position = { x: i ? -520 : 520, y: i ? 130 : -130 }; player.velocity = { x: 240, y: 0 }; });
    const on = createGame(level), off = createGame(level), visual = createVisualState(on.players, 3);
    const camera = createCamera({ x: 0, y: 0 }, 1280, 720), cache = createEndlessBackground(), harness = renderHarness();
    const warp = { ...DEFAULT_WARP, quality: 'high' as const }, sample = { dx: 0, dy: 0, luminance: 0 };
    syncUniverseVisuals(visual, on); togglePause(on); togglePause(off);
    let rebases = 0, streamChanges = 0, checkedSteps = 0, lastChunk = '';
    for (let frame = 0; frame < 3600; frame++) {
      const ship = off.bodies.find(body => body.kind === 'ship')!;
      const controls = createControls(
        { targetWorldPosition: { x: ship.position.x + 520, y: -130 }, abilityActive: frame % 240 < 150 },
        { targetWorldPosition: { x: ship.position.x - 520, y: 130 }, abilityActive: frame % 300 >= 120 },
      );
      const origin = { ...on.universe!.origin };
      stepGame(on, controls); stepGame(off, controls);
      if (origin.x !== on.universe!.origin.x || origin.y !== on.universe!.origin.y) { rebases++; syncUniverseVisuals(visual, on); }
      updateVisuals(visual, on.players, on.phase, 3, FIXED_DT, warp);
      updateCelestialVisuals(visual, on, FIXED_DT); syncVisualPositions(visual, on.players, 3);
      sampleDisturbance(sample, on.players[0].position.x + 75, on.players[0].position.y + 25, visual, warp, .8);
      const liveShip = on.bodies.find(body => body.kind === 'ship')!;
      camera.position = { ...liveShip.position };
      if (frame % 60 === 0) {
        drawEndlessBackground(harness.context, cache, on, camera, visual, warp, CINEMATIC_ART, sample);
        expect(cache.tiles.size).toBeLessThanOrEqual(ENDLESS_TILE_LIMIT); freeExploration(on);
      }
      const chunk = JSON.stringify(worldChunk(on, liveShip.position));
      if (chunk !== lastChunk) { lastChunk = chunk; streamChanges++; }
      // Full equality includes bodies, health, mission, procedural cache and
      // saved checkpoint; this is stronger than comparing just ship motion.
      expect(on, `seed ${seed}, frame ${frame}: high altered simulation`).toEqual(off);
      expect(on.phase, `seed ${seed}, frame ${frame}: ${on.message}`).toBe('running');
      checkedSteps++;
    }
    expect(checkedSteps).toBe(3600); expect(rebases).toBeGreaterThan(0); expect(streamChanges).toBeGreaterThan(5);
    expect(on.elapsed).toBeCloseTo(60, 8); expect(on.health!.current).toBe(100); freeExploration(on);
    expect(visual.worldOrigin).toEqual({ x: on.universe!.origin.x * SECTOR_SIZE, y: on.universe!.origin.y * SECTOR_SIZE });
    expect(visual.emitted).toBeGreaterThan(10); expect(visual.events).toHaveLength(4); expect(visual.invalid).toBe(0);
    expect(harness.draws()).toBeGreaterThan(100); expect(cache.stats.generated).toBeGreaterThan(0);
    expect(visual.celestial?.eruption).toBeUndefined(); expect(visual.celestial?.entry).toBeUndefined();
    resetEndlessBackground(cache);
  }, 30000);

  it('has identical immutable returned-region background and real loaded bodies after unrelated visits for different seeds', () => {
    for (const seed of [7, 424242, 20261017]) {
      const game = createGame({ ...endlessLevel, seed }), known = landmarks(seed).nebula;
      const initial = structuredClone(game), point = { x: known.x * SECTOR_SIZE + 1024, y: known.y * SECTOR_SIZE + 1024 };
      const field = sampleEndlessField(seed, point.x, point.y);
      const stars = generateEndlessStars(seed, known.x, known.y), texture = generateEndlessTile(seed, known.x, known.y, SECTOR_SIZE, 20);
      const before = structuredClone(game.bodies), players = structuredClone(game.players);
      // Read-only sampling unrelated tiles cannot seed or alter physical chunks.
      for (let i = 0; i < 8; i++) {
        sampleEndlessField(seed, point.x + i * 8000, point.y - i * 6000);
        generateEndlessStars(seed, known.x + i + 13, known.y - i);
        generateEndlessTile(seed, known.x + i + 13, known.y - i, SECTOR_SIZE, 12);
      }
      expect(game).toEqual(initial);
      game.bodies.find(body => body.kind === 'ship')!.position = { x: 50000, y: 50000 };
      game.players.forEach(player => { player.position = { x: 50000, y: 50000 }; }); streamUniverse(game, true);
      game.bodies.find(body => body.kind === 'ship')!.position = { ...before.find(body => body.kind === 'ship')!.position };
      game.players.forEach((player, i) => { player.position = { ...players[i].position }; }); streamUniverse(game, true);
      // The return reuses existing cached real bodies. Array load order may differ.
      const sorted = (bodies: GameState['bodies']) => [...bodies].sort((a, b) => a.id.localeCompare(b.id));
      expect(sorted(game.bodies)).toEqual(sorted(before));
      expect(sampleEndlessField(seed, point.x, point.y)).toEqual(field);
      expect(generateEndlessStars(seed, known.x, known.y)).toEqual(stars);
      expect(generateEndlessTile(seed, known.x, known.y, SECTOR_SIZE, 20)).toEqual(texture);
      freeExploration(game);
    }
    const a: Level = { ...endlessLevel, seed: 7 }, b: Level = { ...endlessLevel, seed: 424242 };
    expect(createGame(a).bodies).not.toEqual(createGame(b).bodies);
    expect(sampleEndlessField(7, 17000, -3000)).not.toEqual(sampleEndlessField(424242, 17000, -3000));
  });
});
