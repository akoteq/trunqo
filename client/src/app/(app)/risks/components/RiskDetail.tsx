"use client";

import { useQuery } from "@tanstack/react-query";
import { X, AlertTriangle } from "lucide-react";
import { fetcher } from "@/lib/api";
import { useCompanies } from "@/lib/companies";
import { MIT_STATUS, label, scoreTone, type Mitigation, type Risk } from "./lib";

// Read-only view of one risk, opened by clicking its name. Editing and reviewing start from here.

const showDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

const REVIEW_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  REVIEW_DUE: "bg-amber-100 text-amber-800",
  DRAFT: "bg-gray-100 text-gray-600",
  CLOSED: "bg-gray-200 text-gray-500",
};

const MIT_STYLE: Record<string, string> = {
  OPEN: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  DONE: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-200 text-gray-500",
};

type Review = { id: string; at: string; reviewerName: string | null; score: number; residualScore: number | null; note: string; kind?: string };

export function RiskDetail({ risk, onClose, onEdit, onReview, onSetMitigation }: {
  risk: Risk;
  onClose: () => void;
  onEdit: () => void;
  onReview: () => void;
  onSetMitigation: (m: Mitigation, status: string) => void;
}) {
  const { byKey } = useCompanies();
  const { data: history = [] } = useQuery<Review[]>({ queryKey: ["risk-reviews", risk.id], queryFn: () => fetcher(`/risks/${risk.id}/reviews`) });
  const triggered = risk.indicators.filter((i) => i.triggered).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface text-foreground border-l border-border w-full max-w-lg h-full overflow-y-auto overscroll-contain shadow-pop flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground break-words">{risk.title}</h2>
            <p className="text-xs text-muted mt-0.5">{byKey[risk.company]?.name ?? risk.company} · {label(risk.category)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {risk.canEdit && <button onClick={onReview} className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-subtle">Review</button>}
            {risk.canEdit && <button onClick={onEdit} className="px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-lg hover:opacity-90">Edit</button>}
            <button onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Scores */}
          <div className="grid grid-cols-2 gap-3">
            <ScoreCard title="Score" score={risk.score} sub={`Impact ${risk.impact} × likelihood ${risk.likelihood}`} />
            <ScoreCard
              title="After mitigation" score={risk.residualScore}
              sub={risk.residualScore != null ? `Impact ${risk.residualImpact} × likelihood ${risk.residualLikelihood}` : "Not scored yet"}
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${REVIEW_STYLE[risk.reviewState] ?? "bg-gray-100"}`}>{label(risk.reviewState)}</span>
            {triggered > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                <AlertTriangle size={12} /> {triggered} warning sign{triggered > 1 ? "s" : ""} triggered
              </span>
            )}
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Owner" value={risk.ownerName ?? <span className="text-amber-700">Nobody</span>} />
            <Item label="Financial impact" value={risk.financialImpactGhs != null ? `GHS ${risk.financialImpactGhs.toLocaleString()}` : "—"} />
            <Item label="Last reviewed" value={showDate(risk.lastReviewedAt)} />
            <Item label="Next review" value={risk.reviewState === "CLOSED" ? "—" : showDate(risk.nextReviewDate)} />
          </dl>

          {risk.description && <Block title="Description"><p className="text-sm whitespace-pre-wrap">{risk.description}</p></Block>}
          {risk.impactDescription && <Block title="What would happen"><p className="text-sm whitespace-pre-wrap">{risk.impactDescription}</p></Block>}

          <Block title={`Actions (${risk.mitigations.length})`}>
            {risk.mitigations.length === 0 ? <p className="text-sm text-amber-700">No actions yet.</p> : (
              <ul className="space-y-2">
                {risk.mitigations.map((m) => (
                  <li key={m.id ?? m.action} className="border border-border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground break-words">{m.action}</p>
                      {risk.canEdit && m.id ? (
                        <select
                          value={m.status} onChange={(e) => onSetMitigation(m, e.target.value)} aria-label="Action status"
                          className="text-xs bg-surface text-foreground border border-border rounded-md px-1.5 py-1 shrink-0"
                        >
                          {MIT_STATUS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${MIT_STYLE[m.status] ?? "bg-gray-100"}`}>{label(m.status)}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-1">
                      {m.ownerName ?? "No owner"} · due {showDate(m.deadline)}
                      {m.overdue && <span className="text-red-600 font-medium"> · overdue</span>}
                    </p>
                    {m.note && <p className="text-xs text-muted mt-1 whitespace-pre-wrap">{m.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {risk.indicators.length > 0 && (
            <Block title="Warning signs">
              <ul className="space-y-2">
                {risk.indicators.map((i) => (
                  <li key={i.id ?? i.name} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{i.name}</p>
                      {i.threshold && <p className="text-xs text-muted">Threshold: {i.threshold}</p>}
                      {i.note && <p className="text-xs text-muted">{i.note}</p>}
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${i.triggered ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                      {i.triggered ? "Triggered" : "OK"}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Score history">
            {history.length === 0 ? <p className="text-sm text-muted">No reviews yet.</p> : (
              <ul className="space-y-1.5 text-xs text-muted">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="text-foreground">{showDate(h.at)}</span> · {h.reviewerName ?? "—"} · {h.kind === "EDIT" ? "edited, " : h.kind === "CREATE" ? "added, " : ""}
                    score {h.score}{h.residualScore != null ? ` → ${h.residualScore}` : ""}{h.note ? ` — ${h.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ title, score, sub }: { title: string; score: number | null; sub: string }) {
  return (
    <div className="border border-border rounded-xl p-3">
      <p className="text-xs text-muted font-medium">{title}</p>
      <div className="mt-1">
        {score != null
          ? <span className={`inline-block min-w-10 text-center px-2 py-0.5 rounded text-lg font-bold ${scoreTone(score)}`}>{score}</span>
          : <span className="text-lg font-bold text-muted">—</span>}
      </div>
      <p className="text-xs text-muted mt-1">{sub}</p>
    </div>
  );
}

function Item({ label: name, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted font-medium">{name}</dt>
      <dd className="text-foreground mt-0.5">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{title}</h3>
      {children}
    </section>
  );
}
