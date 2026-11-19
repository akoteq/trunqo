"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Volume2, VolumeX } from "lucide-react";
import { previewSound, setSoundSettings, useSoundSettings, SOUND_LABEL, type SoundKind } from "@/lib/sounds";

const KINDS: [SoundKind, string][] = [
  ["message", "A new chat message"],
  ["notification", "Mentions, tasks given to you, compliance"],
  ["alert", "Deadlines due today or overdue, approvals"],
];

/** Speaker button for the notifications panel header, opening the sound settings below it. */
export function SoundSettingsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const s = useSoundSettings();
  const Icon = s.enabled ? Volume2 : VolumeX;
  return (
    <button
      onClick={onToggle} aria-expanded={open} aria-label="Sound settings" title="Sound settings"
      className={clsx("rounded-lg p-1.5 transition-colors hover:bg-foreground/5", open ? "text-foreground" : "text-muted hover:text-foreground")}
    >
      <Icon size={16} />
    </button>
  );
}

export function SoundSettingsPanel() {
  const s = useSoundSettings();
  return (
    <div className="space-y-3 border-b border-border bg-foreground/[0.02] px-4 py-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span className="font-medium text-foreground">Play sounds</span>
        <Switch checked={s.enabled} onChange={(v) => setSoundSettings({ enabled: v })} label="Play sounds" />
      </label>
      <div className={clsx("space-y-3", !s.enabled && "pointer-events-none opacity-50")}>
        <label className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs text-muted">Volume</span>
          <input
            type="range" min={0} max={1} step={0.05} value={s.volume} aria-label="Volume" className="flex-1 accent-accent"
            onChange={(e) => setSoundSettings({ volume: Number(e.target.value) })}
            onPointerUp={() => previewSound("notification")} onKeyUp={() => previewSound("notification")}
          />
        </label>
        <ul className="space-y-2">
          {KINDS.map(([k, hint]) => (
            <li key={k} className="flex items-center gap-3">
              <Switch checked={s.kinds[k]} onChange={(v) => setSoundSettings({ kinds: { ...s.kinds, [k]: v } })} label={SOUND_LABEL[k]} />
              <span className="min-w-0 flex-1">
                <span className="block text-foreground">{SOUND_LABEL[k]}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <button onClick={() => previewSound(k)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10">Test</button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted">Saved for this browser. Muted chats never make a sound.</p>
      </div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-foreground/20")}
    >
      <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}
