"use client";

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { History, MessageSquareWarning, RefreshCw, X } from "lucide-react";
import { fetcher } from "@/lib/api";
import { STATE_LABEL, STATE_STYLE } from "@/components/ClientModules";
import { Disclosure } from "../../leads/components/fields";
import { EvidenceList } from "./EvidencePicker";
import { actionOverdue, ago, auditWord, nextStep, recLabel, showDate, type AuditRow, type Rec } from "./lib";

// Everything about one requirement, opened by clicking it. Editing, verifying and renewing start here.

export type DetailActions = {
  onEdit: () => void; onVerify: () => void; onEvidence: () => void; onRenew: () => void; onUnverify: () => void; onOutreach: () => void;
  onDelete?: () => void;
};

export function RecordDetail({ record: r, userId, owner, companyName, onClose, actions }: {
  record: Rec; userId: string; owner: boolean; companyName?: string; onClose: () => void; actions: DetailActions;
}) {
  const { data: audit = [] } = useQuery<AuditRow[]>({ queryKey: ["compliance-audit", r.id], queryFn: () => fetcher(`/compliance/${r.id}/audit`) });
  const step = nextStep(r, userId, owner);
  const applies = r.applicability === "APPLICABLE";
  const btn = "px-3 py-1.5 text-xs font-medium rounded-lg";
  const primary = clsx(btn, "bg-accent text-accent-foreground hover:opacity-90");
  const secondary = clsx(btn, "border border-border text-foreground hover:bg-foreground/5");

  const main = (() => {
    switch (step) {
      case "renew": return <button onClick={actions.onRenew} className={clsx(primary, "inline-flex items-center gap-1")}><RefreshCw size={12} /> Record renewal</button>;
      case "assess": return <button onClick={actions.onEdit} className={primary}>Assess</button>;
      case "fix": return <button onClick={actions.onEdit} className={primary}>Fix and resubmit</button>;
      case "evidence": return <button onClick={actions.onEvidence} className={primary}>Add evidence</button>;
      case "verify": case "override": return <button onClick={actions.onVerify} className={primary}>Verify…</button>;
      case "update": return <button onClick={actions.onEdit} className={primary}>Update</button>;
      default: return null;
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface text-foreground border-l border-border w-full max-w-lg h-full overflow-y-auto overscroll-contain shadow-pop flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground break-words">{recLabel(r)}</h2>
            <p className="text-xs text-muted mt-0.5">{r.clientName}{companyName ? ` · tracked by ${companyName}` : ""}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground shrink-0"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={clsx("inline-block px-2 py-0.5 rounded-full text-xs font-medium", STATE_STYLE[r.state])}>{STATE_LABEL[r.state]}</span>
              {r.verified && r.verifiedByName && <span className="text-xs text-muted">by {r.verifiedByName} on {showDate(r.verifiedAt)}</span>}
              {step === "colleague" && <span className="text-xs text-muted">You entered it, so a colleague verifies it.</span>}
            </div>
            {r.sentBack && (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <MessageSquareWarning size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Sent back by {r.sentBack.byName ?? "a colleague"} on {showDate(r.sentBack.at)}</p>
                  <p className="whitespace-pre-wrap">{r.sentBack.note}</p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {main}
              <button onClick={actions.onEdit} className={secondary}>Edit</button>
              <button onClick={actions.onOutreach} className={secondary}>Log outreach</button>
              {step === "unverify" && <button onClick={actions.onUnverify} className={secondary}>Unverify</button>}
              {actions.onDelete && <button onClick={actions.onDelete} className={clsx(btn, "text-muted hover:text-red-600 ml-auto")}>Delete</button>}
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Applies?" value={applies ? "Yes" : r.applicability === "NOT_APPLICABLE" ? `No — ${r.notApplicableReason || "no reason given"}` : "Not assessed yet"} wide={r.applicability === "NOT_APPLICABLE"} />
            {applies && <>
              <Item label="Reference number" value={r.referenceNumber || "—"} />
              <Item label="Issued on" value={showDate(r.issueDate)} />
              <Item label="Expires on" value={showDate(r.expiryDate)} />
              <Item
                label="Renewal due"
                value={r.dueDate
                  ? <span className={clsx(r.daysToDue != null && r.daysToDue < 0 ? "text-red-600 font-medium" : r.renewalDue && "text-amber-700 font-medium")}>
                      {showDate(r.dueDate)}{r.daysToDue != null ? ` · ${r.daysToDue < 0 ? `${-r.daysToDue} days ago` : `in ${r.daysToDue} days`}` : ""}
                    </span>
                  : "Doesn't renew"}
              />
            </>}
            <Item label="Who follows it up" value={r.responsibleName ?? <span className="text-amber-700">Nobody yet</span>} />
            <Item label="Last outreach" value={ago(r.lastOutreachAt)} />
            {r.nextAction && (
              <Item wide label="Next action" value={
                <span className={clsx(actionOverdue(r) && "text-red-600 font-medium")}>
                  {r.nextAction}{r.nextActionDate ? ` · by ${showDate(r.nextActionDate)}${actionOverdue(r) ? " (overdue)" : ""}` : ""}
                </span>
              } />
            )}
            {(r.opportunityLeadId || r.opportunityDealId) && <Item label="Opportunity" value={r.opportunityLeadId ? "In leads" : "In deals"} />}
          </dl>

          {applies && (
            <Block title="Evidence">
              <EvidenceList smeId={r.smeId} ids={r.evidenceDocIds} />
            </Block>
          )}

          {!!r.renewals?.length && (
            <Disclosure title={`Past certificates (${r.renewals.length})`}>
              <ul className="space-y-1.5 text-xs text-muted -mt-2">
                {[...r.renewals].reverse().map((p, i) => (
                  <li key={p.id ?? i} className="rounded-lg border border-border px-2.5 py-2">
                    <span className="text-foreground">{p.referenceNumber || "No reference"}</span>
                    {" · "}{showDate(p.issueDate)} to {showDate(p.expiryDate)}
                    {p.verified ? ` · verified${p.verifiedByName ? ` by ${p.verifiedByName}` : ""}` : " · not verified"}
                    <br />Replaced {showDate(p.replacedAt)}{p.replacedByName ? ` by ${p.replacedByName}` : ""}{p.note ? `: ${p.note}` : ""}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          <Block title="History">
            {audit.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
              <ul className="space-y-1.5 text-xs text-muted">
                {audit.map((a) => (
                  <li key={a.id} className="flex gap-1.5"><History size={11} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="text-foreground">{new Date(a.createdAt).toLocaleDateString()}</span> · {a.actorName ?? "Someone"} {auditWord(a.action)}
                      {a.changes?.length ? `: ${a.changes.map((c) => `${c.field} ${c.from || "—"} → ${c.to || "—"}`).join("; ")}` : ""}{a.note ? ` — ${a.note}` : ""}
                    </span>
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

function Item({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-muted font-medium">{label}</dt>
      <dd className="text-foreground mt-0.5 break-words">{value}</dd>
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
