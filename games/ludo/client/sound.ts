const MUTE_KEY = "cbr-ludo-sound-off";

let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, on ? "0" : "1");
  } catch {
    // Ignore
  }
}

function tone(freq: number, start: number, length: number, volume: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

function play(notes: [number, number, number, OscillatorType?][]) {
  if (!soundEnabled()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    notes.forEach(([freq, start, length, type]) =>
      tone(freq, start, length, 0.18, type ?? "sine"),
    );
  } catch {
    // Silent
  }
}

/** It is the player's turn: a rising two-note chime. */
export const playTurn = () =>
  play([
    [659.25, 0, 0.18],
    [880, 0.16, 0.3],
  ]);

/** Somebody wrote in the chat: one soft blip. */
export const playChat = () => play([[1046.5, 0, 0.14]]);

/** Dice rolling sound. */
export const playRoll = () =>
  play([
    [320, 0, 0.05, "triangle"],
    [440, 0.06, 0.05, "triangle"],
    [380, 0.12, 0.06, "triangle"],
  ]);

/** Capture sound: sharp descending tone. */
export const playCapture = () =>
  play([
    [520, 0, 0.08, "square"],
    [260, 0.07, 0.14, "triangle"],
  ]);

/** Pawn reaching home. */
export const playHome = () =>
  play([
    [523.25, 0, 0.12],
    [659.25, 0.1, 0.12],
    [783.99, 0.2, 0.22],
  ]);

/** Victory fanfare. */
export const playVictory = () =>
  play([
    [523.25, 0, 0.12],
    [659.25, 0.1, 0.12],
    [783.99, 0.2, 0.14],
    [1046.5, 0.32, 0.35],
  ]);
