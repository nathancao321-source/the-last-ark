import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Body } from '../src/game/types';
import { createBody } from '../src/game/entities';
import { createCamera } from '../src/camera/camera';
import { createGame } from '../src/game/game';
import { endlessLevel } from './fixtures/endless-v2';
import { generateChunk, landmarks } from './fixtures/endless-v2';
import { integrate } from '../src/physics/world';
import { celestialMaterial } from '../src/render/celestial-cache';
import { clearEndlessStellarCache, collectEndlessLights, drawEndlessLighting, drawEndlessStar, endlessLightAt, endlessStellarCacheStats, ENDLESS_LIGHT_LIMIT, MAX_ENDLESS_STELLAR_MATERIALS, sampleEndlessProminence, sampleEndlessStar } from '../src/render/endless-stellar';

vi.mock('../src/render/celestial-cache', () => ({ celestialMaterial: vi.fn(() => ({ ready: true, ms: 0, canvas: { width: 512, height: 512 } })) }));
type Op = { name: string; args: unknown[] };
function context() {
  const ops: Op[] = [], values: Record<string, unknown> = {};
  const ctx = new Proxy(values, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient') return (...args: unknown[]) => { ops.push({ name: key, args }); return { addColorStop: (...stops: unknown[]) => ops.push({ name: 'stop', args: stops }) }; };
      return (...args: unknown[]) => ops.push({ name: key, args });
    },
    set(target, key: string, value) { target[key] = value; ops.push({ name: key, args: [value] }); return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}
const camera = createCamera({ x: 0, y: 0 }, 1000, 700);
function star(id = 'test/star', color = '#ffcb80', x = 0, y = 0): Body {
  return createBody({ id, kind: 'star', radius: 48, position: { x, y }, appearance: { name: id, color } });
}
beforeEach(() => {
  clearEndlessStellarCache(); vi.clearAllMocks();
  vi.stubGlobal('document', { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => context().ctx })) });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Endless stellar identity and continuous surface activity', () => {
  it('uses the existing three stellar temperatures and stable independent patterns', () => {
    const stars = generateChunk(endlessLevel.seed!, landmarks(endlessLevel.seed!).triple).bodies.filter(body => body.kind === 'star');
    const samples = stars.map(body => sampleEndlessStar(body, 12));
    expect(samples.map(sample => sample.temperature)).toEqual(['amber', 'blue', 'red']);
    expect(new Set(samples.map(sample => sample.rotation)).size).toBe(3);
    expect(new Set(samples.map(sample => sample.seed)).size).toBe(3);
    expect(stars.map(body => sampleEndlessStar(body, 12))).toEqual(samples);
    expect(sampleEndlessStar({ ...stars[0], position: { x: 1e12, y: -1e12 } }, 12)).toEqual(samples[0]);
    expect(['#ffc88b', '#e9b0a7', '#b8dfff'].map(color => sampleEndlessStar(star('ordinary', color), 0).temperature)).toEqual(['amber', 'red', 'blue']);
  });
  it('keeps all animation continuous and low frequency, including flare cycle boundaries', () => {
    const body = star(), seed = sampleEndlessStar(body, 0).seed;
    for (let t = 0; t < 120; t += .041) {
      const a = sampleEndlessStar(body, t), b = sampleEndlessStar(body, t + 1 / 30);
      expect(Math.abs(a.luminosity - b.luminosity)).toBeLessThan(.001);
      expect(a.luminosity).toBeGreaterThan(.96); expect(a.luminosity).toBeLessThan(1.04);
      for (let i = 0; i < 6; i++) {
        const before = sampleEndlessProminence(seed, t, i), after = sampleEndlessProminence(seed, t + 1 / 30, i);
        expect(Math.abs(before.height - after.height)).toBeLessThan(.012);
        expect(Math.abs(before.alpha - after.alpha)).toBeLessThan(.01);
        expect(before.flare).toBeGreaterThanOrEqual(0); expect(before.flare).toBeLessThanOrEqual(1);
      }
    }
    // No incremental frame accumulator: 30/60/144 Hz arrive at the same visual time.
    for (const fps of [30, 60, 144]) expect(sampleEndlessStar(body, fps * 12 / fps)).toEqual(sampleEndlessStar(body, 12));
  });
  it('draws every layer at the live body center without modifying real triple motion', () => {
    const stars = generateChunk(endlessLevel.seed!, landmarks(endlessLevel.seed!).triple).bodies.filter(body => body.kind === 'star');
    const localCamera = createCamera({x:stars.reduce((s,b)=>s+b.position.x,0)/3,y:stars.reduce((s,b)=>s+b.position.y,0)/3});
    const start = structuredClone(stars);
    for (let n = 0; n < 60; n++) integrate(stars, [], 1 / 60);
    expect(stars.map(body => body.position)).not.toEqual(start.map(body => body.position));
    const before = structuredClone(stars), view = structuredClone(localCamera);
    const { ctx, ops } = context();
    for (const body of stars) drawEndlessStar(ctx, body, 1, localCamera, 'high');
    for (const body of stars) expect(ops).toContainEqual({ name: 'translate', args: [body.position.x, body.position.y] });
    expect(stars).toEqual(before); expect(localCamera).toEqual(view);
    expect(ops.some(op => op.name === 'bezierCurveTo')).toBe(true);
  });
  it('uses a strict derived texture cap across long exploration and deterministic rebuilds', () => {
    const { ctx } = context();
    for (let i = 0; i < 100; i++) drawEndlessStar(ctx, star(`sector-${i}/star`), 0, camera, 'high');
    expect(endlessStellarCacheStats().entries).toBe(MAX_ENDLESS_STELLAR_MATERIALS);
    expect(endlessStellarCacheStats().bytes).toBeLessThanOrEqual(13 * 1024 * 1024);
    drawEndlessStar(ctx, star('sector-0/star'), 0, camera, 'high');
    expect(endlessStellarCacheStats().entries).toBe(MAX_ENDLESS_STELLAR_MATERIALS);
    clearEndlessStellarCache(); expect(endlessStellarCacheStats().entries).toBe(0);
  });
  it('does not draw, allocate, or request materials when off or entirely offscreen', () => {
    const { ctx, ops } = context(), game = createGame(endlessLevel);
    drawEndlessStar(ctx, star(), 15, camera, 'off');
    drawEndlessLighting(ctx, game, camera, 'off');
    drawEndlessStar(ctx, star('far', '#ffcb80', 1e6, 1e6), 15, camera, 'high');
    expect(ops).toEqual([]); expect(celestialMaterial).not.toHaveBeenCalled();
    expect(document.createElement).not.toHaveBeenCalled(); expect(endlessStellarCacheStats().entries).toBe(0);
  });
  it('uses cache-free subpixel LOD and skips derived material work at low quality', () => {
    const { ctx } = context();
    drawEndlessStar(ctx, star(), 4, { ...camera, zoom: .05 }, 'high');
    expect(celestialMaterial).not.toHaveBeenCalled();
    drawEndlessStar(ctx, star(), 4, camera, 'low');
    expect(document.createElement).not.toHaveBeenCalled(); expect(endlessStellarCacheStats().entries).toBe(0);
  });
});

describe('real-source local Endless illumination', () => {
  it('caps only visible real stars and excludes hidden, pending and exploded sources', () => {
    const bodies = Array.from({ length: 30 }, (_, i) => star(`star-${i}`, '#ffcb80', i * 4));
    bodies.push({ ...star('hidden'), layer: 'hidden' }, { ...star('pending'), spawnPending: true },
      { ...star('exploded'), stellarState: { status: 'exploded', blueSeconds: 0, goldSeconds: 3 } },
      { ...star('planet'), kind: 'planet' }, star('far', '#ffcb80', 10000));
    const before = structuredClone(bodies);
    for (const quality of ['off', 'low', 'medium', 'high'] as const) {
      const lights = collectEndlessLights(bodies, camera, quality, 10);
      expect(lights).toHaveLength(ENDLESS_LIGHT_LIMIT[quality]);
      expect(lights.every(light => light.id.startsWith('star-'))).toBe(true);
      for (const light of lights) expect(light.position).toBe(bodies.find(body => body.id === light.id)!.position);
    }
    expect(bodies).toEqual(before);
  });
  it('follows moved stars, decays smoothly to zero and supports independent additive sources', () => {
    const bodies = [star('warm', '#ffcb80', -150), star('blue', '#a8d9ff', 150), star('red', '#f99787', 0, 180)];
    const lights = collectEndlessLights(bodies, camera, 'high', 7);
    const contribution = lights.map(light => endlessLightAt(light, { x: 0, y: 0 }));
    expect(contribution.every(value => value > .5)).toBe(true);
    expect(contribution.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(Math.max(...contribution));
    const warm = lights.find(light => light.id === 'warm')!;
    expect(endlessLightAt(warm, { x: warm.position.x + warm.range, y: 0 })).toBe(0);
    expect(endlessLightAt(warm, { x: warm.position.x + warm.range - .01, y: 0 })).toBeLessThan(1e-7);
    bodies[0].position = { x: -10000, y: 0 };
    expect(collectEndlessLights(bodies, camera, 'high').some(light => light.id === 'warm')).toBe(false);
  });
  it('preserves illumination exactly across floating-origin rebases and source iteration order', () => {
    const bodies = Array.from({ length: 12 }, (_, i) => star(`source-${i}`, '#ffcb80', i * 60 - 300, i * 20));
    const lights = collectEndlessLights(bodies, camera, 'high', 9), reversed = collectEndlessLights([...bodies].reverse(), camera, 'high', 9);
    expect(lights.map(light => light.id)).toEqual(reversed.map(light => light.id));
    const shift = { x: 8192, y: -6144 }, point = { x: 20, y: 30 };
    const moved = bodies.map(body => ({ ...body, position: { x: body.position.x + shift.x, y: body.position.y + shift.y } }));
    const movedCamera = { ...camera, position: { x: camera.position.x + shift.x, y: camera.position.y + shift.y } };
    const after = collectEndlessLights(moved, movedCamera, 'high', 9);
    expect(after.map(light => light.id)).toEqual(lights.map(light => light.id));
    after.forEach((light, i) => expect(endlessLightAt(light, { x: point.x + shift.x, y: point.y + shift.y })).toBe(endlessLightAt(lights[i], point)));
  });
  it('keeps planet lighting intact while real stars illuminate ship and asteroid edges', () => {
    const game = createGame(endlessLevel);
    game.bodies = [
      createBody({ id: 'ark', kind: 'ship', radius: 8, position: { x: 0, y: 0 } }),
      createBody({ id: 'rock', kind: 'asteroid', radius: 20, position: { x: 0, y: 70 } }),
      star('warm', '#ffcb80', -160), star('cold', '#a8d9ff', 160), star('red', '#f99787', 0, -170),
    ];
    const before = structuredClone(game), { ctx, ops } = context();
    drawEndlessLighting(ctx, game, camera, 'high');
    expect(game).toEqual(before);
    const strokes = ops.filter(op => op.name === 'strokeStyle').map(op => op.args[0]);
    expect(strokes).toContain('#ffcf86'); expect(strokes).toContain('#a8d9ff'); expect(strokes).toContain('#ff987b');
    expect(ops.filter(op => op.name === 'stroke').length).toBeGreaterThan(4);
    const planetsOnly = { ...game, bodies: game.bodies.map(body => body.kind === 'ship' || body.kind === 'asteroid' ? { ...body, kind: 'planet' as const } : body) };
    const planetPass = context(); drawEndlessLighting(planetPass.ctx, planetsOnly, camera, 'high');
    expect(planetPass.ops.some(op => op.name === 'stroke')).toBe(false);
    expect(planetPass.ops.filter(op => op.name === 'clip')).toHaveLength(planetsOnly.bodies.length);
    const corePass = context(), core = { ...star('black-hole', '#000000', 70, 0), kind: 'black_hole' as const, captureRadius: 39 };
    drawEndlessLighting(corePass.ctx, { ...game, bodies: [...game.bodies, core] }, camera, 'high');
    expect(corePass.ops).toContainEqual({ name: 'arc', args: [70, 0, 39, 0, Math.PI * 2] });
    const baseline = context(); drawEndlessLighting(baseline.ctx, { ...game, level: { ...game.level, mode: 'mission' } }, camera, 'high');
    expect(baseline.ops).toEqual([]);
  });
});
