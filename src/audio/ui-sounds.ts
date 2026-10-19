type ClickKind = 'hover' | 'press';

/** Delegation also covers chapter cards and device controls rebuilt at runtime. */
export function mountUISounds(root: Document = document) {
  let context: AudioContext | undefined, noise: AudioBuffer | undefined, disposed = false;
  let lastHover = -Infinity, lastPress = -Infinity, voices = 0;
  const buttonAt = (target: EventTarget | null) => {
    const button = target instanceof Element ? target.closest<HTMLElement>('button, [role="button"], summary') : null;
    return button && !button.matches(':disabled, [aria-disabled="true"]') && !button.closest('[inert]') ? button : null;
  };
  const getContext = () => {
    if (disposed) return;
    try { return context ??= new AudioContext(); }
    catch { return; } // Audio support must never block a button action.
  };
  const sound = (kind: ClickKind) => {
    if (disposed || !context || context.state !== 'running' || voices >= 4) return;
    const now = context.currentTime, press = kind === 'press';
    if (now - (press ? lastPress : lastHover) < (press ? .04 : .07)) return;
    if (press) lastPress = now; else lastHover = now;
    try {
      if (!noise) {
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .06), context.sampleRate);
        const samples = noise.getChannelData(0);
        let seed = 173;
        for (let i = 0; i < samples.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; samples[i] = seed / 2147483648; }
      }
      const duration = press ? .065 : .026, gain = context.createGain();
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(press ? .075 : .025, now + .002);
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      gain.connect(context.destination);
      const tick = context.createBufferSource(), filter = context.createBiquadFilter();
      tick.buffer = noise; filter.type = 'bandpass'; filter.frequency.value = press ? 1800 : 2600; filter.Q.value = .7;
      tick.connect(filter); filter.connect(gain);
      const body = context.createOscillator(), bodyGain = context.createGain();
      body.type = 'triangle'; body.frequency.setValueAtTime(press ? 620 : 1100, now);
      body.frequency.exponentialRampToValueAtTime(press ? 260 : 720, now + duration);
      bodyGain.gain.value = press ? .35 : .12; body.connect(bodyGain); bodyGain.connect(gain);
      voices++;
      body.onended = () => { voices--; tick.disconnect(); filter.disconnect(); body.disconnect(); bodyGain.disconnect(); gain.disconnect(); };
      tick.start(now); tick.stop(now + duration); body.start(now); body.stop(now + duration);
    } catch { /* Rendering and input continue even if the audio device fails. */ }
  };
  const unlock = () => {
    const audio = getContext();
    if (audio?.state === 'suspended') void audio.resume().catch(() => {});
    return audio;
  };
  const press = () => {
    const audio = getContext();
    if (audio?.state === 'suspended') void audio.resume().then(() => sound('press')).catch(() => {});
    else sound('press');
  };
  const over = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const button = buttonAt(event.target);
    if (button && button !== buttonAt(event.relatedTarget)) { unlock(); sound('hover'); }
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (buttonAt(event.target)) press(); else unlock();
  };
  const key = (event: KeyboardEvent) => {
    if (!event.repeat && (event.key === 'Enter' || event.key === ' ') && buttonAt(event.target)) press();
    else unlock();
  };
  root.addEventListener('pointerover', over, true); root.addEventListener('pointerdown', down, true); root.addEventListener('keydown', key, true);
  return { dispose: () => {
    disposed = true; root.removeEventListener('pointerover', over, true); root.removeEventListener('pointerdown', down, true); root.removeEventListener('keydown', key, true);
    if (context) void context.close().catch(() => {});
  } };
}
