/**
 * Efek suara orisinal RT-43: disintesis via WebAudio (tidak ada berkas
 * audio pihak ketiga). Semua bunyi adalah osilator sederhana buatan sendiri.
 * Status bisu disimpan di localStorage. Preferensi reduced-motion (RT-52)
 * berlaku untuk animasi visual, bukan untuk efek suara ini.
 */

const MUTE_KEY = "riot-muted";

let ctx: AudioContext | null = null;
let muted = false;

export function isMuted(): boolean {
  if (typeof localStorage !== "undefined") {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  }
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* storage mungkin tidak tersedia */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  durationMs: number,
  type: OscillatorType = "sine",
  gain = 0.08,
  delayMs = 0,
): void {
  if (isMuted()) return;
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + delayMs / 1000;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export const sfx = {
  click(): void {
    tone(660, 60, "triangle", 0.05);
  },
  taskDone(): void {
    tone(523, 90, "sine", 0.07);
    tone(784, 120, "sine", 0.07, 90);
  },
  meetingStart(): void {
    tone(392, 140, "square", 0.05);
    tone(311, 160, "square", 0.05, 140);
  },
  voteCast(): void {
    tone(587, 70, "triangle", 0.05);
  },
  ejected(): void {
    tone(220, 200, "sawtooth", 0.06);
    tone(165, 260, "sawtooth", 0.06, 180);
  },
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 160, "sine", 0.07, i * 120));
  },
  lose(): void {
    [392, 330, 262].forEach((f, i) => tone(f, 200, "sine", 0.06, i * 140));
  },
};
