"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { KpiSheet } from "@/components/kpi";
import { ErrorNote, Label, btnSecondary, inputClass } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";

// Batch delete for the clients list. Asks the server what each client has and which can't be
// deleted, shows that, and needs the number typed in before deleting. The server checks again.

type Counts = { deals: number; leads: number; tasks: number; grants: number; compliance: number; documents: number; notes: number; contacts: number };
type Check = { id: string; name: string; counts: Counts; otherCompanies: string[]; blocked: string | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function BulkDeleteSheet({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: checks, isLoading, error: loadError } = useQuery<Check[]>({
    queryKey: ["sme-bulk-check", ids],
    queryFn: async () => (await api.post<Check[]>("/sme/bulk-delete/check", { ids })).data,
    gcTime: 0,
  });
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ok = (checks ?? []).filter((c) => !c.blocked);
  const blocked = (checks ?? []).filter((c) => c.blocked);
  const sum = (k: keyof Counts) => ok.reduce((n, c) => n + c.counts[k], 0);
  const removed = [
    sum("compliance") && plural(sum("compliance"), "compliance record"),
    sum("documents") && plural(sum("documents"), "document"),
    sum("notes") && plural(sum("notes"), "note"),
    sum("contacts") && `${plural(sum("contacts"), "contact link")}`,
  ].filter(Boolean) as string[];
  const kept = [
    sum("deals") && plural(sum("deals"), "deal"),
    sum("leads") && plural(sum("leads"), "lead"),
    sum("tasks") && plural(sum("tasks"), "task"),
    sum("grants") && plural(sum("grants"), "grant/loan tracker"),
  ].filter(Boolean) as string[];
  const confirmed = ok.length > 0 && typed.trim() === String(ok.length);

  const run = async () => {
    setSaving(true); setError("");
    try {
      const { data } = await api.post<{ deleted: string[]; skipped: { name: string; reason: string }[] }>("/sme/bulk-delete", { ids: ok.map((c) => c.id) });
      for (const k of ["sme", "sme-options", "compliance", "contacts", "leads"]) qc.invalidateQueries({ queryKey: [k] });
      if (data.deleted.length) toast.success(`${plural(data.deleted.length, "client")} deleted`);
      if (data.skipped.length) toast.warning(`${plural(data.skipped.length, "client")} not deleted`, { description: data.skipped.map((s) => `${s.name}: ${s.reason}`).join(" ") });
      onDone();
    } catch (e) { setError(apiError(e, "Couldn't delete the clients.")); }
    finally { setSaving(false); }
  };

  return (
    <KpiSheet
      wide onClose={onClose} title={`Delete ${plural(ids.length, "client")}?`} subtitle="Clients are shared by the group, so this removes them for every company."
      footer={<>
        <button onClick={onClose} className={btnSecondary}>Cancel</button>
        <button onClick={run} disabled={saving || !confirmed}
          className="px-5 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
          {saving ? "Deleting…" : `Delete ${plural(ok.length, "client")}`}
        </button>
      </>}
    >
      {isLoading ? <p className="text-sm text-muted">Checking what these clients have…</p> : loadError ? (
        <ErrorNote message={apiError(loadError, "Couldn't check the clients.")} />
      ) : (
        <>
          <div className="rounded-xl border border-border p-3.5 space-y-1.5 text-sm">
            <p className="font-medium text-foreground">{ok.length ? `${plural(ok.length, "client")} will be deleted.` : "None of these can be deleted."}</p>
            {ok.length > 0 && <p className="text-muted">Deleted with them: {removed.length ? removed.join(", ") : "nothing else"}.</p>}
            {kept.length > 0 && <p className="text-muted">Kept but no longer linked to a client: {kept.join(", ")}. Payments, KPIs and finance reports don&apos;t change.</p>}
          </div>

          {blocked.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
              <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={14} /> {plural(blocked.length, "client")} will be skipped</p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {blocked.map((c) => <li key={c.id}><span className="font-medium">{c.name}</span>: {c.blocked}</li>)}
              </ul>
            </div>
          )}

          {ok.length > 0 && (
            <ul className="max-h-56 overflow-y-auto divide-y divide-border rounded-xl border border-border text-sm">
              {ok.map((c) => {
                const bits = [
                  c.counts.deals && plural(c.counts.deals, "deal"), c.counts.leads && plural(c.counts.leads, "lead"),
                  c.counts.compliance && plural(c.counts.compliance, "compliance record"), c.counts.documents && plural(c.counts.documents, "doc"),
                  c.otherCompanies.length && `also ${c.otherCompanies.join(", ")}`,
                ].filter(Boolean);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate text-foreground">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">{bits.length ? bits.join(" · ") : "nothing linked"}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {ok.length > 0 && (
            <div>
              <Label hint="(this can't be undone)">Type {ok.length} to confirm</Label>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" className={inputClass} aria-label="Number of clients to delete" />
            </div>
          )}
        </>
      )}
      <ErrorNote message={error} />
    </KpiSheet>
  );
}
