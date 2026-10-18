import type { Body, GameState } from '../game/types';
import type { Vec2 } from '../physics/vector';
import type { Camera } from '../camera/camera';
import { isVisible } from '../camera/camera';
import type { Quality } from './spacetime/config';
import { celestialMaterial } from './celestial-cache';
import { hash } from './spacetime/noise';

const TAU = Math.PI * 2;
const TEXTURE_SIZE = 256;
export const MAX_ENDLESS_STELLAR_MATERIALS = 24;
export const ENDLESS_LIGHT_LIMIT = { off: 0, low: 3, medium: 5, high: 8 } as const;
type Temperature = 'amber' | 'red' | 'blue';
// Local tokens keep this Endless-only layer independent of mission palettes.
const COLORS = {
  amber: { base: '#e4a13b', tint: '#ffe6a6', hot: '#fff1bc', corona: '#ffb44d', light: '#ffcf86', clear: '#ffcf8600', spot: '#733820', surface: '#efac37' },
  red: { base: '#cc6347', tint: '#ffb09a', hot: '#ffd8b6', corona: '#ff7350', light: '#ff987b', clear: '#ff987b00', spot: '#692c2d', surface: '#e98d69' },
  blue: { base: '#9cc8f2', tint: '#a4d4ff', hot: '#e4f4ff', corona: '#8abfff', light: '#a8d9ff', clear: '#a8d9ff00', spot: '#3c6599', surface: '#bddfff' },
} as const;
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
function identity(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
function temperature(body: Readonly<Body>): Temperature {
  const color = body.appearance?.color;
  if (!color || !/^#[\da-f]{6}$/i.test(color)) return 'amber';
  const rgb = Number.parseInt(color.slice(1), 16), r = rgb >>> 16, g = (rgb >>> 8) & 255, b = rgb & 255;
  return b > r + 12 ? 'blue' : b > g * .82 && r > g * 1.05 ? 'red' : 'amber';
}
export interface EndlessStarSample {
  temperature: Temperature; seed: number; rotation: number; luminosity: number; driftX: number; driftY: number;
}
/** Absolute visual time, stable identity and real radius only; never an orbit. */
export function sampleEndlessStar(body: Readonly<Body>, time: number): EndlessStarSample {
  const seed = identity(body.id), t = Number.isFinite(time) ? Math.max(0, time) : 0;
  const phase = hash(seed, 21) * TAU;
  return { temperature: temperature(body), seed, rotation: phase + t * (.003 + hash(seed, 22) * .004),
    luminosity: 1 + .022 * Math.sin(t * .13 + phase) + .011 * Math.sin(t * .047 + phase * 2),
    driftX: Math.sin(t * .071 + phase) * .018, driftY: Math.cos(t * .053 + phase) * .014 };
}
export function sampleEndlessProminence(seed: number, time: number, index: number) {
  const period = 23 + hash(seed, index + 63) * 31, age = ((Math.max(0, time) + hash(seed, index + 43) * period) % period + period) % period;
  const flare = age < 4.8 ? Math.sin(age / 4.8 * Math.PI) ** 4 : 0;
  const life = .5 + .5 * Math.sin(time * (.072 + hash(seed, index + 57) * .035) + hash(seed, index + 58) * TAU);
  return { angle: hash(seed, index + 52) * TAU, height: .10 + life * .13 + flare * .21, alpha: .38 + life * .20 + flare * .16, flare };
}

interface StarMaterial { temperature: Temperature; surface: HTMLCanvasElement; corona: HTMLCanvasElement }
const materials = new Map<string, StarMaterial>();
export function endlessStellarCacheStats() {
  return { entries: materials.size, maximum: MAX_ENDLESS_STELLAR_MATERIALS, bytes: materials.size * TEXTURE_SIZE * TEXTURE_SIZE * 4 * 2 };
}
export function clearEndlessStellarCache(): void { materials.clear(); }

/** Shared worker textures supply fine granulation; a bounded derived atlas adds
 * identity-specific cell groups and streamer morphology, not just a color swap. */
function material(body: Readonly<Body>, sample: EndlessStarSample): StarMaterial | undefined {
  const old = materials.get(body.id);
  if (old?.temperature === sample.temperature) { materials.delete(body.id); materials.set(body.id, old); return old; }
  const cool = sample.temperature === 'blue';
  const surface = celestialMaterial(cool ? 'neutron' : 'sun'), corona = celestialMaterial(cool ? 'cold-corona' : 'corona');
  if (!surface.ready || !corona.ready) return;
  const disc = document.createElement('canvas'), halo = document.createElement('canvas');
  disc.width = halo.width = disc.height = halo.height = TEXTURE_SIZE;
  const a = disc.getContext('2d'), b = halo.getContext('2d');
  if (!a || !b) return;
  const colors = COLORS[sample.temperature], half = TEXTURE_SIZE / 2;
  a.drawImage(surface.canvas, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  a.globalCompositeOperation = 'source-atop'; a.fillStyle = colors.tint; a.globalAlpha = cool ? .20 : sample.temperature === 'red' ? .43 : .08; a.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  a.globalAlpha = 1; a.save(); a.beginPath(); a.arc(half, half, half - .5, 0, TAU); a.clip();
  const cells = cool ? 9 : sample.temperature === 'red' ? 22 : 15;
  for (let i = 0; i < cells; i++) {
    const angle = hash(sample.seed, i + 101) * TAU, radius = Math.sqrt(hash(sample.seed, i + 141)) * half * .84;
    const x = half + Math.cos(angle) * radius, y = half + Math.sin(angle) * radius;
    const size = half * (.055 + hash(sample.seed, i + 171) * (cool ? .09 : .17));
    a.globalAlpha = .025 + hash(sample.seed, i + 151) * .035;
    a.strokeStyle = i % 3 === 0 ? colors.spot : colors.hot; a.lineWidth = size * .10;
    a.beginPath(); a.ellipse(x, y, size, size * (.25 + hash(sample.seed, i + 181) * .45), angle, .15, Math.PI * 1.7); a.stroke();
  }
  a.restore();
  b.translate(half, half); b.rotate(hash(sample.seed, 241) * TAU);
  b.drawImage(corona.canvas, -half, -half, TEXTURE_SIZE, TEXTURE_SIZE);
  b.globalCompositeOperation = 'source-atop'; b.globalAlpha = cool ? .16 : sample.temperature === 'red' ? .58 : .16; b.fillStyle = colors.corona; b.fillRect(-TEXTURE_SIZE, -TEXTURE_SIZE, TEXTURE_SIZE * 2, TEXTURE_SIZE * 2);
  // Low-alpha displaced streamers distinguish broad cool giants from compact blue stars.
  b.globalCompositeOperation = 'screen'; b.globalAlpha = cool ? .15 : .23; b.rotate(.5 + hash(sample.seed, 242));
  b.drawImage(corona.canvas, -half, -half * .86, TEXTURE_SIZE, TEXTURE_SIZE * .86);
  const result = { temperature: sample.temperature, surface: disc, corona: halo };
  materials.delete(body.id); materials.set(body.id, result);
  while (materials.size > MAX_ENDLESS_STELLAR_MATERIALS) materials.delete(materials.keys().next().value!);
  return result;
}

/** Call inside the existing world transform, in place of mission stellar art. */
export function drawEndlessStar(ctx: CanvasRenderingContext2D, body: Readonly<Body>, time: number, camera: Readonly<Camera>, quality: Quality): void {
  if (quality === 'off' || body.kind !== 'star' || body.layer === 'hidden' || body.spawnPending || body.stellarState?.status === 'exploded' || !isVisible(camera, body.position, body.radius * 2.15)) return;
  const r = body.radius, screenRadius = r * camera.zoom, sample = sampleEndlessStar(body, time), colors = COLORS[sample.temperature];
  ctx.save(); ctx.translate(body.position.x, body.position.y);
  if (screenRadius < 8) { ctx.fillStyle = colors.hot; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore(); return; }
  const cached = quality !== 'low' && screenRadius >= 16 ? material(body, sample) : undefined;
  const cool = sample.temperature === 'blue';
  const baseSurface = cached ? undefined : celestialMaterial(cool ? 'neutron' : 'sun');
  const baseCorona = cached ? undefined : celestialMaterial(cool ? 'cold-corona' : 'corona');
  const halo = cached?.corona ?? (baseCorona?.ready ? baseCorona.canvas : undefined);
  const surface = cached?.surface ?? (baseSurface?.ready ? baseSurface.canvas : undefined);
  if (halo) {
    ctx.save(); ctx.rotate(sample.rotation * .23); ctx.globalAlpha = .76 * sample.luminosity;
    ctx.drawImage(halo, -r * 2.15, -r * 2.15, r * 4.3, r * 4.3); ctx.restore();
  }
  // Opaque exact-radius limb keeps the collision edge legible beneath the corona.
  const gradient = ctx.createRadialGradient(-r * .23, -r * .19, 0, 0, 0, r);
  gradient.addColorStop(0, colors.hot); gradient.addColorStop(.55, colors.base); gradient.addColorStop(1, colors.spot);
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  if (surface) {
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip(); ctx.rotate(sample.rotation);
    ctx.drawImage(surface, -r, -r, r * 2, r * 2);
    if (quality !== 'low' && screenRadius >= 24) {
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .08 * sample.luminosity;
      ctx.rotate(-sample.rotation * .37);
      ctx.drawImage(surface, -r + r * sample.driftX, -r + r * sample.driftY, r * 2, r * 2);
    }
    ctx.restore();
  }
  if (quality !== 'low' && screenRadius >= 24) {
    const count = quality === 'high' ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const activity = sampleEndlessProminence(sample.seed, time, i), h = r * activity.height * (cool ? .75 : 1);
      ctx.save(); ctx.rotate(activity.angle); ctx.lineCap = 'round';
      for (let layer = 2; layer >= 0; layer--) {
        ctx.strokeStyle = layer ? colors.corona : colors.hot; ctx.globalAlpha = activity.alpha * (layer ? .11 : .67);
        ctx.lineWidth = r * (.009 + layer * .022); ctx.beginPath(); ctx.moveTo(r * .965, -r * .085);
        ctx.bezierCurveTo(r + h, -r * .24, r + h * .76, r * .24, r * .968, r * .11); ctx.stroke();
      }
      if (activity.flare > .001) { ctx.globalAlpha = activity.flare * .24; ctx.fillStyle = colors.hot; ctx.beginPath(); ctx.ellipse(r * .91, 0, r * .075, r * .035, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  ctx.restore();
}

export interface EndlessLight { id: string; position: Readonly<Vec2>; radius: number; range: number; temperature: Temperature; luminosity: number }
/** Only actual loaded stellar bodies can illuminate the scene. The bounded
 * nearest candidates overlap at their smooth zero-strength range boundary. */
export function collectEndlessLights(bodies: readonly Body[], camera: Readonly<Camera>, quality: Quality, time = 0): EndlessLight[] {
  const limit = ENDLESS_LIGHT_LIMIT[quality]; if (!limit) return [];
  const candidates: { light: EndlessLight; weight: number }[] = [];
  for (const body of bodies) {
    if (body.kind !== 'star' || body.layer === 'hidden' || body.spawnPending || body.stellarState?.status === 'exploded') continue;
    const range = Math.min(900, body.radius * 10);
    if (!isVisible(camera, body.position, range)) continue;
    const dx = Math.max(0, Math.abs(body.position.x - camera.position.x) - camera.width / (2 * camera.zoom));
    const dy = Math.max(0, Math.abs(body.position.y - camera.position.y) - camera.height / (2 * camera.zoom));
    const sample = sampleEndlessStar(body, time);
    candidates.push({ light: { id: body.id, position: body.position, radius: body.radius, range, temperature: sample.temperature, luminosity: sample.luminosity },
      weight: Math.hypot(dx, dy) / range + Math.hypot(body.position.x - camera.position.x, body.position.y - camera.position.y) / range * .05 });
  }
  candidates.sort((a, b) => a.weight - b.weight || a.light.id.localeCompare(b.light.id));
  return candidates.slice(0, limit).map(candidate => candidate.light);
}
export function endlessLightAt(light: Readonly<EndlessLight>, position: Readonly<Vec2>): number {
  const distance = Math.hypot(position.x - light.position.x, position.y - light.position.y);
  const u = clamp((light.range - distance) / Math.max(1, light.range - light.radius));
  return u * u * (3 - 2 * u) * light.luminosity;
}

function bodyOutline(body: Readonly<Body>, zoom: number): Vec2[] {
  if (body.kind === 'ship') {
    const scale = Math.max(1, .8 / zoom), angle = Math.atan2(body.velocity.y, body.velocity.x), c = Math.cos(angle), s = Math.sin(angle);
    return [[8, 0], [-6, -5], [-6, 5]].map(([x, y]) => ({ x: (x * c - y * s) * scale, y: (x * s + y * c) * scale }));
  }
  // Matches the existing nine-vertex asteroid silhouette exactly.
  const seed = identity(body.id) / 4294967296;
  return Array.from({ length: 9 }, (_, i) => {
    const angle = i * TAU / 9 + seed * TAU, radius = body.radius * (.78 + .2 * ((i * 17 + Math.floor(seed * 100)) % 7) / 6);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

/** Draw after world bodies, before labels/HUD if possible. No planet is touched:
 * mission and Endless planetary fixed lighting retain their existing contract. */
export function drawEndlessLighting(ctx: CanvasRenderingContext2D, game: Readonly<GameState>, camera: Readonly<Camera>, quality: Quality): void {
  if (quality === 'off' || game.level.mode !== 'exploration') return;
  const lights = collectEndlessLights(game.bodies, camera, quality, game.elapsed);
  if (!lights.length) return;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  ctx.save();
  // This pass may run after bodies. Keep diffuse environmental color strictly
  // outside opaque planets/stars and the exact black-hole capture disc.
  const width = camera.width / camera.zoom, height = camera.height / camera.zoom;
  for (const body of game.bodies) {
    if (!['planet', 'star', 'black_hole'].includes(body.kind) || body.layer === 'hidden') continue;
    const radius = body.kind === 'black_hole' ? body.captureRadius ?? body.radius : body.radius;
    if (!isVisible(camera, body.position, radius)) continue;
    ctx.beginPath(); ctx.rect(camera.position.x - width / 2, camera.position.y - height / 2, width, height);
    ctx.moveTo(body.position.x + radius, body.position.y); ctx.arc(body.position.x, body.position.y, radius, 0, TAU); ctx.clip('evenodd');
  }
  for (const light of lights) {
    const colors = COLORS[light.temperature], r = Math.min(light.range * .7, Math.hypot(camera.width, camera.height) * .34 / camera.zoom);
    ctx.globalAlpha = .024 * light.luminosity;
    const glow = ctx.createRadialGradient(light.position.x, light.position.y, light.radius * .75, light.position.x, light.position.y, Math.max(light.radius, r));
    glow.addColorStop(0, colors.light); glow.addColorStop(.42, colors.light); glow.addColorStop(1, colors.clear);
    ctx.fillStyle = glow; ctx.fillRect(light.position.x - r, light.position.y - r, r * 2, r * 2);
  }
  ctx.restore();
  for (const body of game.bodies) {
    if ((body.kind !== 'ship' && body.kind !== 'asteroid') || body.layer === 'hidden' || body.spawnPending || !isVisible(camera, body.position, body.radius + 4 / camera.zoom)) continue;
    if (body.kind === 'asteroid' && body.radius * camera.zoom < 5) continue;
    const outline = bodyOutline(body, camera.zoom);
    for (const light of lights) {
      const strength = endlessLightAt(light, body.position); if (strength < .005) continue;
      const dx = light.position.x - body.position.x, dy = light.position.y - body.position.y, distance = Math.max(1, Math.hypot(dx, dy));
      ctx.strokeStyle = COLORS[light.temperature].light; ctx.lineCap = 'round'; ctx.lineWidth = Math.min(body.radius * .13, 1.2 / camera.zoom);
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length], mx = (a.x + b.x) * .5, my = (a.y + b.y) * .5;
        // Outward edge normal selected geometrically, including the ship's clockwise winding.
        let nx = b.y - a.y, ny = a.x - b.x; if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
        const facing = Math.max(0, (nx * dx + ny * dy) / (Math.max(1, Math.hypot(nx, ny)) * distance));
        if (facing < .08) continue;
        ctx.globalAlpha = strength * facing * (body.kind === 'ship' ? .6 : .42); ctx.beginPath();
        ctx.moveTo(body.position.x + a.x, body.position.y + a.y); ctx.lineTo(body.position.x + b.x, body.position.y + b.y); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
