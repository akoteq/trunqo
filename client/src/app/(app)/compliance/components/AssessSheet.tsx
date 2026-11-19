"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { KpiSheet } from "@/components/kpi";
import { ErrorNote, btnPrimary, btnSecondary, inputClass } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";
import { recLabel, type Rec } from "./lib";

// One screen to say, for each of a client's open requirements and each suggested one, whether it
// applies. Replaces opening the full form once per requirement.

type Suggestion = { id: string; regulator: string; name: string; perSubject: boolean; reason: string };
type Choice = "APPLICABLE" | "NOT_APPLICABLE" | "UNASSESSED" | "SKIP";
type Row = { key: string; label: string; why?: string; recordId?: string; typeId?: string; perSubject?: boolean; choice: Choice; reason: string; subject: string };

const OPTIONS: [Choice, string][] = [["APPLICABLE", "Applies"], ["NOT_APPLICABLE", "Doesn't apply"]];

export function AssessSheet({ clientName, smeId, company, records, onClose, onSaved }: {
  clientName: string; smeId: string; company: string; records: Rec[]; onClose: () => void; onSaved: () => void;
}) {
  const { data: suggestions = [], isLoading } = useQuery<Suggestion[]>({
    queryKey: ["compliance-suggest", smeId, company], queryFn: () => fetcher(`/compliance/suggest?smeId=${smeId}&company=${company}`),
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Built once the suggestions arrive; edits then live in state.
  const list: Row[] = rows ?? (isLoading ? [] : [
    ...records.filter((r) => r.state === "UNASSESSED").map((r) => ({ key: r.id, label: recLabel(r), recordId: r.id, choice: "UNASSESSED" as Choice, reason: "", subject: "" })),
    ...suggestions.map((s) => ({ key: `t:${s.id}`, label: `${s.regulator} ${s.name}`, why: s.reason, typeId: s.id, perSubject: s.perSubject, choice: "SKIP" as Choice, reason: "", subject: "" })),
  ]);
  const edit = (key: string, patch: Partial<Row>) => setRows(list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const answered = list.filter((r) => r.choice === "APPLICABLE" || r.choice === "NOT_APPLICABLE");
  const missing = answered.find((r) => (r.choice === "NOT_APPLICABLE" && !r.reason.trim()) || (r.perSubject && !r.subject.trim()));

  const save = async () => {
    setSaving(true); setError("");
    try {
      const { data } = await api.post<{ saved: number; failed: { label: string; error: string }[] }>("/compliance/assess", {
        company, smeId,
        items: answered.map((r) => ({
          label: r.label, applicability: r.choice, notApplicableReason: r.reason.trim() || undefined,
          ...(r.recordId ? { recordId: r.recordId } : { requirementTypeId: r.typeId, subject: r.subject.trim() }),
        })),
      });
      if (data.failed.length) {
        setError(data.failed.map((f) => `${f.label}: ${f.error}`).join(" "));
        if (data.saved) toast.success(`${data.saved} saved`, { description: clientName });
        setRows(list.filter((r) => !answered.includes(r) || data.failed.some((f) => f.label === r.label)));
        return;
      }
      toast.success("Assessment saved", { description: `${data.saved} requirement${data.saved === 1 ? "" : "s"} · ${clientName}` });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't save the assessment.")); }
    finally { setSaving(false); }
  };

  return (
    <KpiSheet
      wide onClose={onClose} title="Assess client" subtitle={`${clientName} · say which registrations apply`}
      footer={<>
        <button onClick={onClose} className={btnSecondary}>Cancel</button>
        <button onClick={save} disabled={saving || !answered.length || !!missing} className={btnPrimary}>
          {saving ? "Saving…" : answered.length ? `Save ${answered.length}` : "Save"}
        </button>
      </>}
    >
      {isLoading && !rows ? <p className="text-sm text-muted">Loading…</p> : list.length === 0 ? (
        <p className="text-sm text-muted">Nothing left to assess for {clientName}. Use “+ Requirement” to add something else.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Leave a row blank to decide later. Suggestions come from what the client does.</p>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {list.map((r) => (
              <li key={r.key} className="p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{r.label}</p>
                    <p className="text-xs text-muted">{r.recordId ? "Not assessed yet" : `Suggested: ${r.why}`}</p>
                  </div>
                  <div role="radiogroup" aria-label={r.label} className="flex gap-1">
                    {OPTIONS.filter(([v]) => !(r.perSubject && v === "NOT_APPLICABLE")).map(([v, l]) => (
                      <button
                        key={v} type="button" role="radio" aria-checked={r.choice === v}
                        onClick={() => edit(r.key, { choice: r.choice === v ? (r.recordId ? "UNASSESSED" : "SKIP") : v })}
                        className={clsx("px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                          r.choice === v ? "bg-accent text-accent-foreground border-accent" : "bg-surface text-muted border-border hover:text-foreground")}
                      >{l}</button>
                    ))}
                  </div>
                </div>
                {r.choice === "NOT_APPLICABLE" && (
                  <input value={r.reason} onChange={(e) => edit(r.key, { reason: e.target.value })} className={inputClass} placeholder="Why doesn't it apply? e.g. They only trade, they don't process food" aria-label="Why it doesn't apply" />
                )}
                {r.perSubject && r.choice === "APPLICABLE" && (
                  <input value={r.subject} onChange={(e) => edit(r.key, { subject: e.target.value })} className={inputClass} placeholder="Which product or site? Add others one by one later" aria-label="Product or site" />
                )}
              </li>
            ))}
          </ul>
          {missing && <p className="text-xs text-amber-700">{missing.choice === "NOT_APPLICABLE" ? `Say why ${missing.label} doesn't apply.` : `Name the product or site for ${missing.label}.`}</p>}
        </>
      )}
      <ErrorNote message={error} />
    </KpiSheet>
  );
}
