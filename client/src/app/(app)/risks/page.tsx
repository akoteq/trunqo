"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fetcher } from "@/lib/api";
import { DataTable, type Column } from "@/components/DataTable";
import { useAuth } from "@/components/AuthProvider";
import { accessLevel } from "@/lib/auth";
import { useCompanies } from "@/lib/companies";
import { toast } from "@/components/Toast";
import { confirmAction } from "@/components/Confirm";
import { X, AlertTriangle } from "lucide-react";
import { RiskSheet, Scale } from "./components/RiskSheet";
import { RiskDetail } from "./components/RiskDetail";
import { MIT_STATUS, scoreTone, type Mitigation, type Risk } from "./components/lib";

// Company risk registers. The Business CEO (own company) and the Group Owner add, edit and review
// risks; staff see the risks where they own an action and update those actions.

const t = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
const showDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
const errText = (e: unknown, f: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;

const REVIEW_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  REVIEW_DUE: "bg-amber-100 text-amber-800",
  DRAFT: "bg-gray-100 text-gray-600",
  CLOSED: "bg-gray-200 text-gray-500",
};

const selectCls = "text-sm bg-surface text-foreground border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function RisksPage() {
  const { user } = useAuth();
  const { byKey } = useCompanies();
  const qc = useQueryClient();
  const level = user ? accessLevel(user.role) : "STAFF";
  const manager = level !== "STAFF";
  const [company, setCompany] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [editing, setEditing] = useState<Risk | "new" | null>(null);
  const [reviewing, setReviewing] = useState<Risk | null>(null);
  // Kept as an id so the panel shows fresh data after an action or review is saved.
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: risks = [], isLoading } = useQuery<Risk[]>({ queryKey: ["risks", includeClosed], queryFn: () => fetcher(`/risks${includeClosed ? "?includeClosed=1" : ""}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["risks"] });
  const rows = risks.filter((r) => !company || r.company === company);
  const viewing = viewingId ? risks.find((r) => r.id === viewingId) ?? null : null;

  const setMitigation = async (r: Risk, m: Mitigation, status: string) => {
    try { await api.patch(`/risks/${r.id}/mitigations/${m.id}`, { status }); toast.success("Action updated", { description: m.action }); refresh(); } catch (e) { toast.failed("Couldn't update the action", e); }
  };

  if (!user) return null;

  // Staff: only the actions assigned to them.
  if (!manager) {
    const mine = risks.flatMap((r) => r.mitigations.filter((m) => m.ownerBdoId === user.bdoId).map((m) => ({ r, m })));
    return (
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><AlertTriangle size={22} /> My risk actions</h1>
        <p className="text-sm text-muted">Actions you own on your company&apos;s risk register. Update them as you go.</p>
        {mine.length === 0 ? <p className="text-sm text-muted">Nothing assigned to you.</p> : (
          <div className="space-y-2">
            {mine.map(({ r, m }) => (
              <div key={m.id} className="bg-surface border border-border shadow-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{m.action}</p>
                  <p className="text-xs text-muted">Risk: {r.title} · due {showDate(m.deadline)}{m.overdue && <span className="text-red-600 font-medium"> · overdue</span>}</p>
                </div>
                <select value={m.status} onChange={(e) => setMitigation(r, m, e.target.value)} className={selectCls}>
                  {MIT_STATUS.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const columns: Column<Risk>[] = [
    { key: "title", label: "Risk", sortable: true, render: (r) => <button onClick={() => setViewingId(r.id)} className="text-left font-semibold text-accent hover:underline">{r.title}</button>, exportValue: (r) => r.title },
    ...(level === "GROUP_OWNER" ? [{ key: "company", label: "Company", sortable: true, render: (r: Risk) => byKey[r.company]?.name ?? r.company }] : []),
    { key: "category", label: "Category", render: (r) => t(r.category) },
    { key: "score", label: "Score", sortable: true, render: (r) => <span className={`inline-block min-w-8 text-center px-1.5 py-0.5 rounded text-xs font-bold ${scoreTone(r.score)}`}>{r.score}</span> },
    { key: "residualScore", label: "After mitigation", render: (r) => r.residualScore != null ? <span className={`inline-block min-w-8 text-center px-1.5 py-0.5 rounded text-xs font-bold ${scoreTone(r.residualScore)}`}>{r.residualScore}</span> : "—" },
    { key: "ownerName", label: "Owner", render: (r) => r.ownerName ?? <span className="text-amber-700">Nobody</span> },
    {
      key: "mitigations", label: "Actions",
      render: (r) => { const open = r.mitigations.filter((m) => !["DONE", "CANCELLED"].includes(m.status)).length; const late = r.mitigations.filter((m) => m.overdue).length;
        return r.mitigations.length ? <span className="text-xs">{open} open{late ? <span className="text-red-600"> · {late} overdue</span> : ""}</span> : <span className="text-xs text-amber-700">None</span>; },
      exportValue: (r) => r.mitigations.length,
    },
    { key: "reviewState", label: "Review", render: (r) => <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${REVIEW_STYLE[r.reviewState]}`}>{t(r.reviewState)}{r.nextReviewDate && r.reviewState !== "CLOSED" ? ` · ${showDate(r.nextReviewDate)}` : ""}</span> },
    { key: "review", label: "", render: (r) => r.canEdit ? <button onClick={() => setReviewing(r)} className="text-xs text-accent hover:underline">Review</button> : null },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><AlertTriangle size={22} /> Risk register</h1>
        <p className="text-sm text-muted">Each company&apos;s top 10–15 material risks. Score = impact × likelihood (1–25).</p>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        title={`${rows.length} risks`}
        onAdd={() => setEditing("new")}
        onEdit={(r) => setEditing(r)}
        canEditRow={(r) => r.canEdit}
        onDelete={(r) => confirmAction({ title: `Delete "${r.title}"?`, body: "Its reviews and history go with it. To keep the record, set its status to Closed instead.", confirmLabel: "Delete" }).then((ok) => { if (ok) api.delete(`/risks/${r.id}`).then(() => { toast.success("Risk deleted", { description: r.title }); refresh(); }, (e) => toast.failed("Couldn't delete the risk", e)); })}
        filterBar={
          <div className="flex gap-3 flex-wrap items-center">
            {level === "GROUP_OWNER" && (
              <select value={company} onChange={(e) => setCompany(e.target.value)} className={selectCls}>
                <option value="">All companies</option>{[...new Set(risks.map((r) => r.company))].map((k) => <option key={k} value={k}>{byKey[k]?.name ?? k}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" className="accent-accent" checked={includeClosed} onChange={(e) => setIncludeClosed(e.target.checked)} /> Show closed</label>
          </div>
        }
      />

      {viewing && (
        <RiskDetail
          risk={viewing}
          onClose={() => setViewingId(null)}
          onEdit={() => { setEditing(viewing); setViewingId(null); }}
          onReview={() => setReviewing(viewing)}
          onSetMitigation={(m, status) => setMitigation(viewing, m, status)}
        />
      )}
      {editing && <RiskSheet risk={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {reviewing && <ReviewModal risk={reviewing} onClose={() => setReviewing(null)} onSaved={() => { setReviewing(null); refresh(); }} />}
    </div>
  );
}

const inputCls = "w-full bg-surface text-foreground placeholder:text-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent disabled:opacity-60";
const cancelBtn = "px-4 py-2 text-sm border border-border text-foreground rounded-lg hover:bg-subtle";

function L({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <div className={span ? "sm:col-span-2" : ""}><label className="text-xs font-medium text-muted block mb-1">{label}</label>{children}</div>;
}
function ReviewModal({ risk, onClose, onSaved }: { risk: Risk; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ impact: risk.impact as number | null, likelihood: risk.likelihood as number | null, residualImpact: risk.residualImpact, residualLikelihood: risk.residualLikelihood, note: "", nextReviewDate: "" });
  const { data: history = [] } = useQuery<{ id: string; at: string; reviewerName: string | null; score: number; residualScore: number | null; note: string; kind?: string }[]>({ queryKey: ["risk-reviews", risk.id], queryFn: () => fetcher(`/risks/${risk.id}/reviews`) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setSaving(true); setError("");
    try { await api.post(`/risks/${risk.id}/review`, { ...form, nextReviewDate: form.nextReviewDate || undefined }); onSaved(); } catch (e) { setError(errText(e, "Failed to save the review.")); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border text-foreground rounded-xl shadow-pop w-full max-w-md max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-foreground">Review: {risk.title}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{error}</div>}
          <L label="Impact"><Scale label="Impact" value={form.impact} onChange={(n) => setForm({ ...form, impact: n })} /></L>
          <L label="Likelihood"><Scale label="Likelihood" value={form.likelihood} onChange={(n) => setForm({ ...form, likelihood: n })} /></L>
          <L label="Residual impact"><Scale label="Residual impact" value={form.residualImpact} onChange={(n) => setForm({ ...form, residualImpact: n })} /></L>
          <L label="Residual likelihood"><Scale label="Residual likelihood" value={form.residualLikelihood} onChange={(n) => setForm({ ...form, residualLikelihood: n })} /></L>
          <L label="What changed?"><textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className={`${inputCls} resize-none`} /></L>
          <L label="Next review (default: in 90 days)"><input type="date" value={form.nextReviewDate} onChange={(e) => setForm({ ...form, nextReviewDate: e.target.value })} className={inputCls} /></L>
          {history.length > 0 && (
            <div className="text-xs text-muted"><p className="font-semibold text-foreground mb-1">Score history</p>
              {history.map((h) => <p key={h.id}>{showDate(h.at)} · {h.reviewerName ?? "—"} · {h.kind === "EDIT" ? "edited, " : h.kind === "CREATE" ? "added, " : ""}score {h.score}{h.residualScore != null ? ` → ${h.residualScore}` : ""}{h.note ? ` — ${h.note}` : ""}</p>)}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className={cancelBtn}>Cancel</button>
          <button onClick={save} disabled={saving || !form.impact || !form.likelihood} className="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save review"}</button>
        </div>
      </div>
    </div>
  );
}