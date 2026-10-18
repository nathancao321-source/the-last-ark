/** One simulation-time pulse train for node transport, damage and rendering.
 * The emitting body's nodeInfluence owns these values; renderers own no clocks. */
export interface JetTiming { jetPeriod: number; jetSeconds: number }
export const JET_EPS = 1e-9;
export function jetPulse(timing: JetTiming, time: number) {
  const cycle = Math.floor((time + JET_EPS) / timing.jetPeriod);
  const startedAt = cycle * timing.jetPeriod;
  const age = Math.max(0, time - startedAt);
  const firing = cycle > 0 && time + JET_EPS < startedAt + timing.jetSeconds;
  return { cycle, startedAt, age, firing, nextAt: (cycle + 1) * timing.jetPeriod,
    progress: firing ? age / timing.jetSeconds : undefined };
}
