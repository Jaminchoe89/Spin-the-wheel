// Wheel sounds, synthesised in the browser: no audio files or external services.
// Browsers keep audio locked until the page is clicked, so call unlock() from a click.

const wheelSounds = (() => {
  let context = null;
  let master = null;
  let noise = null;
  let lastTickAt = 0;

  function ensureContext() {
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.8;
      master.connect(context.destination);

      // A short burst of white noise gives each tick its "clack".
      noise = context.createBuffer(1, Math.round(context.sampleRate * 0.05), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = Math.random() * 2 - 1;
      }
    }
    return context;
  }

  function isUnlocked() {
    return Boolean(context) && context.state === "running";
  }

  async function unlock() {
    const ctx = ensureContext();
    if (ctx && ctx.state !== "running") {
      await ctx.resume().catch(() => {});
    }
    return isUnlocked();
  }

  // One peg passing the pointer. Speed (0 to 1) makes fast ticks lighter and higher.
  function tick(speed = 0.5) {
    if (!isUnlocked()) {
      return;
    }
    const now = context.currentTime;
    // Above ~30 ticks a second the clicks blur into a buzz, so skip some.
    if (now - lastTickAt < 0.033) {
      return;
    }
    lastTickAt = now;

    const level = 0.35 + 0.35 * (1 - speed);

    const click = context.createBufferSource();
    click.buffer = noise;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2400 + speed * 1600;
    band.Q.value = 3;
    const clickGain = context.createGain();
    clickGain.gain.setValueAtTime(level, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    click.connect(band).connect(clickGain).connect(master);
    click.start(now);
    click.stop(now + 0.05);

    const body = context.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(900 + speed * 500, now);
    body.frequency.exponentialRampToValueAtTime(500, now + 0.03);
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(level * 0.5, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    body.connect(bodyGain).connect(master);
    body.start(now);
    body.stop(now + 0.04);
  }

  function note(frequency, start, duration, { type = "triangle", level = 0.2, attack = 0.01 } = {}) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  // A rising arpeggio into a held major chord, with a little sparkle on top.
  function fanfare() {
    if (!isUnlocked()) {
      return;
    }
    const now = context.currentTime + 0.02;
    const arpeggio = [523.25, 659.25, 783.99, 1046.5];
    arpeggio.forEach((frequency, index) => {
      note(frequency, now + index * 0.09, 0.35, { level: 0.22 });
    });

    const chordStart = now + arpeggio.length * 0.09;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency) => {
      note(frequency, chordStart, 1.8, { level: 0.12, attack: 0.02 });
      note(frequency * 2, chordStart, 1.2, { type: "sine", level: 0.05, attack: 0.02 });
    });

    for (let i = 0; i < 10; i += 1) {
      const frequency = 2093 * Math.pow(2, Math.floor(Math.random() * 12) / 12);
      note(frequency, chordStart + 0.05 + i * 0.07, 0.25, { type: "sine", level: 0.04 });
    }
  }

  return { unlock, isUnlocked, tick, fanfare };
})();
