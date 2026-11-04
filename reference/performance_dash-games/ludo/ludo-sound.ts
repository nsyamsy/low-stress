// Short notification sounds of the Ludo room, made with the Web Audio API so no files are needed.
// Browsers only start audio after the player touched the page, which always happened by the time a room is open.

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
    // the choice just is not remembered
  }
}

function tone(freq: number, start: number, length: number, volume: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

function play(notes: [number, number, number][]) {
  if (!soundEnabled()) return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AudioCtx();
    if (ctx.state === "suspended") void ctx.resume();
    notes.forEach(([freq, start, length]) => tone(freq, start, length, 0.18));
  } catch {
    // no audio available: stay silent
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
