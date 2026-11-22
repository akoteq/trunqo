"use client";

import { useSyncExternalStore } from "react";

/**
 * Notification sounds. The tones are made in the browser with the Web Audio API, so there are no
 * audio files to load. Three kinds, each with its own sound and switch:
 *   message       a chat message (not for muted chats, or the chat you're looking at)
 *   notification  the bell: mentions, tasks given to you, compliance to verify / sent back
 *   alert         something newly urgent: a deadline due today or overdue, a task to approve
 * Settings are per browser (sound is a device thing). With several tabs open only one plays.
 */

export type SoundKind = "message" | "notification" | "alert";
export type SoundSettings = { enabled: boolean; volume: number; kinds: Record<SoundKind, boolean> };

const KEY = "trunqo:sounds";
const DEFAULTS: SoundSettings = { enabled: true, volume: 0.6, kinds: { message: true, notification: true, alert: true } };
export const SOUND_LABEL: Record<SoundKind, string> = { message: "Messages", notification: "Notifications", alert: "Urgent alerts" };

// ── Settings store ──────────────────────────────────────────────────────────
let settings: SoundSettings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load(): SoundSettings {
  if (loaded) return settings;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<SoundSettings>;
      settings = { ...DEFAULTS, ...s, kinds: { ...DEFAULTS.kinds, ...(s.kinds ?? {}) } };
    }
  } catch { /* private mode or bad JSON: defaults */ }
  return settings;
}

export function setSoundSettings(patch: Partial<SoundSettings>) {
  settings = { ...load(), ...patch, kinds: { ...load().kinds, ...(patch.kinds ?? {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* not saved, still applies */ }
  listeners.forEach((l) => l());
}

// Other tabs changing the settings.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => { if (e.key === KEY) { loaded = false; load(); listeners.forEach((l) => l()); } });
}

export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    load,
    () => DEFAULTS,
  );
}

// ── Audio ───────────────────────────────────────────────────────────────────
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Browsers only allow sound after the person has clicked or typed on the page once.
if (typeof window !== "undefined") {
  const unlock = () => { audio()?.resume().catch(() => {}); };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, { passive: true });
}

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number };

const TUNES: Record<SoundKind, Note[]> = {
  // Soft rising two-note "pop".
  message: [{ freq: 660, at: 0, dur: 0.09 }, { freq: 880, at: 0.08, dur: 0.14 }],
  // Gentle chime: two notes ringing together.
  notification: [{ freq: 784, at: 0, dur: 0.5, type: "triangle" }, { freq: 1175, at: 0.06, dur: 0.6, type: "triangle", gain: 0.6 }],
  // Three quick, brighter beeps.
  alert: [0, 0.16, 0.32].map((at) => ({ freq: 988, at, dur: 0.1, type: "square" as OscillatorType, gain: 0.35 })),
};

function playTune(kind: SoundKind, volume: number) {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const start = ac.currentTime + 0.02;
  const master = ac.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume)) * 0.35;   // keep it polite even at full volume
  master.connect(ac.destination);
  for (const n of TUNES[kind]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.freq;
    const t = start + n.at, peak = n.gain ?? 1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + n.dur + 0.05);
  }
}

// ── Playing ─────────────────────────────────────────────────────────────────
const lastPlayed: Partial<Record<SoundKind, number>> = {};
const GAP_MS = 1500;   // a burst of events makes one sound, not ten

// Fallback for browsers without Web Locks: the first tab to write the key plays.
function firstTabByStorage(id: string): boolean {
  try {
    const k = `trunqo:snd:${id}`;
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, "1");
    setTimeout(() => { try { localStorage.removeItem(k); } catch { /* ignore */ } }, 5000);
  } catch { /* storage blocked: just play */ }
  return true;
}

/**
 * Plays the sound for `kind` if the person has it switched on. `id` identifies the event (a
 * message or notification id) so several open tabs make one sound between them.
 */
export function playSound(kind: SoundKind, id: string) {
  const s = load();
  if (!s.enabled || !s.kinds[kind] || s.volume <= 0) return;
  const now = Date.now();
  if (now - (lastPlayed[kind] ?? 0) < GAP_MS) return;
  lastPlayed[kind] = now;
  // With several tabs open, each gets the same event; the first to take the lock plays it and
  // holds the lock a few seconds so the others see it's taken.
  let played = false;
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks) {
    locks.request(`trunqo-sound:${id}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      played = true;
      playTune(kind, s.volume);
      await new Promise((r) => setTimeout(r, 3000));
    }).catch(() => { if (!played) playTune(kind, s.volume); });
    return;
  }
  if (firstTabByStorage(id)) playTune(kind, s.volume);
}

/** For the settings "Test" buttons: always plays, ignores the switches. */
export function previewSound(kind: SoundKind, volume = load().volume) {
  playTune(kind, volume);
}
