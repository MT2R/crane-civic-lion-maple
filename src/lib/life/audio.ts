import type { NotifyMode, SoundId } from "./types";

let ctx: AudioContext | null = null;
let timer = 0;
let stopFlag = false;
const live: OscillatorNode[] = [];

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function primeAudio(): void {
  context();
}

export function installAudioUnlock(): void {
  const go = () => {
    primeAudio();
    window.removeEventListener("pointerdown", go);
  };
  window.addEventListener("pointerdown", go);
}

export function stopSound(): void {
  stopFlag = true;
  if (timer) window.clearInterval(timer);
  timer = 0;
  for (const node of live) {
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
  }
  live.length = 0;
}

function blip(kind: SoundId, gainValue: number, harsh: boolean): void {
  const audio = context();
  if (!audio || stopFlag) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.connect(gain);
  gain.connect(audio.destination);
  if (harsh || kind === "alarm") {
    osc.type = "square";
    osc.frequency.value = 740;
  } else if (kind === "bell") {
    osc.type = "triangle";
    osc.frequency.value = 660;
  } else if (kind === "soft") {
    osc.type = "sine";
    osc.frequency.value = 494;
  } else {
    osc.type = "sine";
    osc.frequency.value = 880;
  }
  const now = audio.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.02, gainValue), now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (harsh ? 0.45 : 0.32));
  osc.start(now);
  osc.stop(now + 0.5);
  live.push(osc);
  osc.onended = () => {
    const i = live.indexOf(osc);
    if (i >= 0) live.splice(i, 1);
  };
}

export function playSound(kind: SoundId, mode: NotifyMode): void {
  stopSound();
  stopFlag = false;
  const loop = mode !== "normal";
  const gain = mode === "alarm" ? 0.2 : mode === "loud" ? 0.14 : 0.07;
  const harsh = mode === "alarm";
  blip(kind, gain, harsh);
  if (loop) {
    timer = window.setInterval(() => blip(kind, gain, harsh), mode === "alarm" ? 850 : 1400);
  }
}

export function vibrateFor(mode: NotifyMode): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  const pattern = mode === "alarm" ? [400, 120, 400, 120, 700] : mode === "loud" ? [180, 80, 180] : [30];
  navigator.vibrate(pattern);
}
