"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { isStaff } from "@/lib/auth";
import { playSound } from "@/lib/sounds";

/**
 * Mounted once (AppShell). Alerts aren't pushed like messages; they're worked out on request. This
 * checks every 5 minutes (sharing the Alerts query) and plays the alert sound when something newly
 * becomes urgent: a deadline due today or overdue, or a finished task waiting for your approval.
 * What's been heard is remembered per person in this browser, so each item sounds once. The very
 * first check only remembers, so logging in doesn't set off a sound for everything already open.
 */

type AlertsResponse = {
  deadlines?: { id: string; type: string; urgency: string }[];
  approvals?: { id: string }[];
};

const MAX_REMEMBERED = 500;

export function AlertSounds() {
  const { user } = useAuth();
  const staff = isStaff(user);
  const bdoId = staff ? user?.bdoId ?? null : null;
  const { data } = useQuery<AlertsResponse>({
    queryKey: ["alerts", { bdoId }],
    queryFn: () => fetcher(bdoId ? `/alerts?bdoId=${bdoId}` : "/alerts"),
    enabled: !!user && (!staff || !!bdoId),
    refetchInterval: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!data || !user) return;
    const urgent = [
      ...(data.deadlines ?? []).filter((d) => d.urgency === "overdue" || d.urgency === "today").map((d) => `${d.type}:${d.id}:${d.urgency}`),
      ...(data.approvals ?? []).map((a) => `approval:${a.id}`),
    ];
    const key = `trunqo:alerts-heard:${user.id}`;
    let heard: string[] | null = null;
    try { const raw = localStorage.getItem(key); heard = raw ? JSON.parse(raw) : null; } catch { /* treat as first run */ }
    const fresh = heard ? urgent.filter((id) => !heard!.includes(id)) : [];
    if (fresh.length) playSound("alert", fresh.sort().join("|"));
    try { localStorage.setItem(key, JSON.stringify([...new Set([...urgent, ...(heard ?? [])])].slice(0, MAX_REMEMBERED))); } catch { /* not remembered */ }
  }, [data, user]);

  return null;
}
