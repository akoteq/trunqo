"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Briefcase, ChevronDown, ClipboardCheck, Download, MessageSquareWarning, Phone, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { confirmAction } from "@/components/Confirm";
import { useComplianceCompanies, STATE_LABEL, STATE_STYLE } from "@/components/ClientModules";
import { useAuth } from "@/components/AuthProvider";
import { accessLevel } from "@/lib/auth";
import { clearParams, onDeepLink } from "@/lib/mentions";
import { RecordSheet } from "./components/RecordSheet";
import { RenewSheet } from "./components/RenewSheet";
import { VerifySheet, EvidenceSheet } from "./components/VerifySheet";
import { AssessSheet } from "./components/AssessSheet";
import { RecordDetail } from "./components/RecordDetail";
import { OutreachSheet, OpportunitySheet } from "./components/ClientActionSheets";
import { actionOverdue, ago, canVerify, d10, nextStep, showDate, type Rec, type ReqType } from "./components/lib";

// Regulatory compliance (GRA, FDA, GSA, EPA, ORC...) for companies that have the module on.
// One card per client, with its requirements inside, so a client with five requirements shows
// once. Client-level actions (outreach, opportunity, add a requirement) sit on the card; each
// requirement row only offers the one thing it needs next (assess, verify, renew). Clicking a
// requirement opens its details; ?record=<id> (from the bell) opens one directly.

const FILTERS: [string, string][] = [["", "All"], ["ATTENTION", "Needs action"], ["TO_VERIFY", "I can verify"], ["MINE", "Mine"], ["VERIFIED", "Verified"], ["AWAITING_VERIFICATION", "Awaiting verification"], ["NOT_REGISTERED", "Not registered"], ["UNASSESSED", "Not assessed"], ["RENEWAL", "Renewal due"], ["EXPIRED", "Expired"], ["NOT_APPLICABLE", "Not applicable"]];
const PAGE = 40;

// Lower is more urgent. Anything up to 4 needs someone to act.
function urgency(r: Rec): number {
  if (r.state === "EXPIRED" || r.state === "SUSPENDED") return 0;
  if (r.renewalDue && r.state !== "NOT_APPLICABLE") return 1;
  return ({ AWAITING_VERIFICATION: 2, NOT_REGISTERED: 3, IN_PROGRESS: 4, UNASSESSED: 5, VERIFIED: 6, NOT_APPLICABLE: 7 } as Record<string, number>)[r.state] ?? 5;
}
const needsAction = (r: Rec) => urgency(r) <= 4;
type Me = { id: string; bdoId: string | null };
const matchesState = (r: Rec, s: string, me: Me) => {
  switch (s) {
    case "": return true;
    case "RENEWAL": return r.renewalDue;
    case "ATTENTION": return needsAction(r);
    case "TO_VERIFY": return canVerify(r, me.id);
    case "MINE": return !!me.bdoId && r.responsibleBdoId === me.bdoId;
    default: return r.state === s;
  }
};

type Group = { key: string; smeId: string; company: string; clientName: string; records: Rec[]; top: number };

const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function CompliancePage() {
  const companies = useComplianceCompanies();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [state, setState] = useState("");
  const [regulator, setRegulator] = useState("");
  const [company, setCompany] = useState("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Rec | "new" | { smeId: string; company: string } | null>(null);
  const [outreach, setOutreach] = useState<Group | null>(null);
  const [opportunity, setOpportunity] = useState<Group | null>(null);
  const [renewing, setRenewing] = useState<Rec | null>(null);
  const [verifying, setVerifying] = useState<Rec | null>(null);
  const [attaching, setAttaching] = useState<Rec | null>(null);
  const [assessing, setAssessing] = useState<Group | null>(null);
  // An id, so the panel shows fresh data after any change.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const owner = !!user && accessLevel(user.role) === "GROUP_OWNER";

  useEffect(() => onDeepLink((q) => {
    const s = q.get("state"); if (s) setState(s);
    const rec = q.get("record"); if (rec) { setViewingId(rec); clearParams("record"); }
  }), []);

  const { data: rows = [], isLoading } = useQuery<Rec[]>({ queryKey: ["compliance", "all"], queryFn: () => fetcher("/compliance"), enabled: companies.length > 0 });
  const { data: types = [] } = useQuery<ReqType[]>({ queryKey: ["compliance-types"], queryFn: () => fetcher("/compliance/types") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["compliance"] }); };

  const me: Me = useMemo(() => ({ id: user?.id ?? "", bdoId: user?.bdoId ?? null }), [user?.id, user?.bdoId]);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => rows.filter((r) =>
    matchesState(r, state, me) && (!regulator || r.regulator === regulator) && (!company || r.company === company)
    && (!q || [r.clientName, r.requirementName, r.regulator, r.referenceNumber, r.subject].some((v) => (v ?? "").toLowerCase().includes(q)))), [rows, state, regulator, company, q, me]);

  const groups = useMemo(() => {
    const by = new Map<string, Group>();
    for (const r of filtered) {
      const key = `${r.smeId}:${r.company}`;
      const g = by.get(key) ?? { key, smeId: r.smeId, company: r.company, clientName: r.clientName, records: [], top: 9 };
      g.records.push(r); g.top = Math.min(g.top, urgency(r));
      by.set(key, g);
    }
    for (const g of by.values()) g.records.sort((a, b) => urgency(a) - urgency(b) || a.regulator.localeCompare(b.regulator) || a.requirementName.localeCompare(b.requirementName));
    return [...by.values()].sort((a, b) => a.top - b.top || a.clientName.localeCompare(b.clientName));
  }, [filtered]);

  const count = (s: string) => rows.filter((r) => matchesState(r, s, me)).length;
  const regulators = [...new Set(types.map((t) => t.regulator))].sort();
  const narrowed = !!(state || regulator || company || q);
  // Cards that need action start open; the rest are one line until opened. Filtering opens them all.
  const isOpen = (g: Group) => open[g.key] ?? (narrowed || g.top <= 4);
  const allOpen = groups.slice(0, shown).every(isOpen);
  const setAll = (v: boolean) => setOpen(Object.fromEntries(groups.map((g) => [g.key, v])));

  const unverify = (r: Rec) => confirmAction({ title: "Mark as not verified?", body: `${r.requirementName} for ${r.clientName} goes back to awaiting verification.`, confirmLabel: "Unverify", danger: false })
    .then(async (ok) => {
      if (!ok) return;
      try {
        await api.post(`/compliance/${r.id}/verify`, { verified: false });
        toast.success("Verification removed", { description: `${r.requirementName} · ${r.clientName}` });
        refresh();
      } catch (e) { toast.failed("Couldn't change verification", e); }
    });
  const remove = (r: Rec) => confirmAction({ title: `Delete ${r.requirementName} for ${r.clientName}?`, body: "This can't be undone.", confirmLabel: "Delete" })
    .then((ok) => { if (ok) api.delete(`/compliance/${r.id}`).then(() => { toast.success("Record deleted", { description: `${r.requirementName} · ${r.clientName}` }); setViewingId(null); refresh(); }, (e) => toast.failed("Couldn't delete the record", e)); });

  const exportCsv = () => {
    const head = ["Client", "Regulator", "Requirement", "Product or site", "State", "Reference", "Expires / renews", "Responsible", "Next action"];
    const lines = filtered.map((r) => [r.clientName, r.regulator, r.requirementName, r.subject, STATE_LABEL[r.state], r.referenceNumber, d10(r.dueDate), r.responsibleName, r.nextAction].map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `compliance-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); URL.revokeObjectURL(url);
  };

  if (!user) return null;
  if (!companies.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-foreground">Compliance</h1>
        <p className="mt-2 text-sm text-muted">Compliance tracking is switched off for your company. The Group Owner can switch it on under Add a Company.</p>
      </div>
    );
  }

  const canOpportunity = (g: Group) => !!companies.find((c) => c.key === g.company)?.modules?.complianceOpportunities;
  // Gaps that could become paid work: not already a lead or deal, and not fine as it is.
  const openForOpportunity = (g: Group) => g.records.filter((r) =>
    !r.opportunityDealId && !r.opportunityLeadId && r.state !== "NOT_APPLICABLE" && (r.state !== "VERIFIED" || r.renewalDue));
  const selectCls = "text-sm bg-surface text-foreground border border-border rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-accent/30";
  const manager = accessLevel(user.role) !== "STAFF";
  const viewing = viewingId ? rows.find((r) => r.id === viewingId) ?? null : null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><ShieldCheck size={22} /> Compliance</h1>
          <p className="text-sm text-muted max-w-3xl">Registrations with GRA, FDA, GSA, EPA, ORC and other regulators for {companies.map((c) => c.name).join(", ")} clients. A record is only &quot;Verified&quot; once a colleague other than the person who entered it has checked the evidence.</p>
        </div>
        <button onClick={() => setEditing("new")} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg hover:opacity-90"><Plus size={15} /> New record</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.filter(([k]) => k !== "MINE" || !!user.bdoId).map(([k, l]) => (
          <button key={k} onClick={() => { setState(k); setShown(PAGE); }}
            className={clsx("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors", state === k ? "bg-accent text-accent-foreground border-accent" : "bg-surface text-muted border-border hover:text-foreground")}>
            {l} <span className={state === k ? "text-accent-foreground/80" : "text-muted/70"}>{count(k)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-48 max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} placeholder="Search client, requirement or reference" className={clsx(selectCls, "w-full pl-8")} aria-label="Search" />
        </label>
        <select value={regulator} onChange={(e) => setRegulator(e.target.value)} className={selectCls} aria-label="Regulator">
          <option value="">All regulators</option>{regulators.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {companies.length > 1 && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={selectCls} aria-label="Company">
            <option value="">All companies</option>{companies.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted">{groups.length} client{groups.length === 1 ? "" : "s"} · {filtered.length} record{filtered.length === 1 ? "" : "s"}</span>
          {groups.length > 0 && <button onClick={() => setAll(!allOpen)} className="text-accent hover:underline">{allOpen ? "Collapse all" : "Expand all"}</button>}
          <button onClick={exportCsv} disabled={!filtered.length} className="inline-flex items-center gap-1 text-muted hover:text-foreground disabled:opacity-50"><Download size={14} /> Export</button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-foreground/5 animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">
          {rows.length ? "No records match these filters." : "No compliance records yet. Add one, or start working with a client to get the basic requirements listed."}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.slice(0, shown).map((g) => {
            const expanded = isOpen(g);
            const gaps = canOpportunity(g) ? openForOpportunity(g) : [];
            const people = [...new Set(g.records.map((r) => r.responsibleName).filter(Boolean))] as string[];
            const tally = Object.entries(g.records.reduce<Record<string, number>>((m, r) => ({ ...m, [r.state]: (m[r.state] ?? 0) + 1 }), {}))
              .sort((a, b) => urgency({ state: a[0] } as Rec) - urgency({ state: b[0] } as Rec));
            const renewals = g.records.filter((r) => r.renewalDue && r.state !== "EXPIRED").length;
            const lastContact = g.records.map((r) => r.lastOutreachAt).filter(Boolean).sort().pop() ?? null;
            const unassessed = g.records.filter((r) => r.state === "UNASSESSED").length;
            return (
              <section key={g.key} className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <button onClick={() => setOpen({ ...open, [g.key]: !expanded })} aria-expanded={expanded} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                    <ChevronDown size={16} className={clsx("mt-1 shrink-0 text-muted transition-transform", !expanded && "-rotate-90")} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-foreground truncate">
                        {g.clientName}
                        {companies.length > 1 && <span className="ml-2 text-xs font-normal text-muted">{companies.find((c) => c.key === g.company)?.name}</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {tally.map(([s, n]) => <span key={s} className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", STATE_STYLE[s])}>{n} {STATE_LABEL[s].toLowerCase()}</span>)}
                        {renewals > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">{renewals} renewal due</span>}
                        {people.length > 0 && <span className="text-xs text-muted">· {people.join(", ")}</span>}
                        <span className="text-xs text-muted">· last contact {ago(lastContact)}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <button onClick={() => setAssessing(g)} title="Say which registrations apply to this client"
                      className={clsx("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5", unassessed ? "border-accent text-accent hover:bg-accent/10" : "border-border text-foreground hover:bg-foreground/5")}>
                      <ClipboardCheck size={12} /> Assess{unassessed ? ` (${unassessed})` : ""}
                    </button>
                    <button onClick={() => setOutreach(g)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-foreground hover:bg-foreground/5"><Phone size={12} /> Log outreach</button>
                    {gaps.length > 0 && <button onClick={() => setOpportunity(g)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-foreground hover:bg-foreground/5"><Briefcase size={12} /> Opportunity</button>}
                    <button onClick={() => setEditing({ smeId: g.smeId, company: g.company })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-accent hover:bg-accent/10" title="Add a requirement for this client"><Plus size={12} /> Requirement</button>
                  </div>
                </div>

                {expanded && (
                  <ul className="border-t border-border divide-y divide-border">
                    {g.records.map((r) => (
                      <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_170px_150px_minmax(120px,auto)] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 pl-10 hover:bg-foreground/[0.03]">
                        <button onClick={() => setViewingId(r.id)} className="min-w-0 text-left">
                          <span className="block text-sm text-foreground truncate">
                            <span className="mr-1.5 inline-block rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted">{r.regulator}</span>
                            {r.requirementName}{r.subject && <span className="text-muted"> · {r.subject}</span>}
                          </span>
                          {r.sentBack && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 truncate"><MessageSquareWarning size={11} className="shrink-0" /> Sent back: {r.sentBack.note}</span>
                          )}
                          {(r.referenceNumber || r.nextAction || r.opportunityLeadId || r.opportunityDealId) && (
                            <span className="mt-0.5 block text-xs text-muted truncate">
                              {[r.referenceNumber && `Ref ${r.referenceNumber}`, r.opportunityLeadId && "In leads", r.opportunityDealId && "In deals"].filter(Boolean).join(" · ")}
                              {r.nextAction && (
                                <span className={clsx(actionOverdue(r) && "text-red-600 font-medium")}>
                                  {r.referenceNumber || r.opportunityLeadId || r.opportunityDealId ? " · " : ""}Next: {r.nextAction}{r.nextActionDate ? ` by ${showDate(r.nextActionDate)}` : ""}{actionOverdue(r) ? " (overdue)" : ""}
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                        <span className="justify-self-end sm:justify-self-start"><span className={clsx("inline-block px-2 py-0.5 rounded-full text-xs font-medium", STATE_STYLE[r.state])}>{STATE_LABEL[r.state]}</span></span>
                        <span className={clsx("text-xs", r.daysToDue != null && r.daysToDue < 0 ? "text-red-600 font-medium" : r.renewalDue ? "text-amber-700 font-medium" : "text-muted")}>
                          {r.dueDate ? <>{showDate(r.dueDate)}{r.daysToDue != null && r.daysToDue <= 90 ? ` · ${r.daysToDue < 0 ? `${-r.daysToDue}d ago` : `in ${r.daysToDue}d`}` : ""}</> : <span className="hidden sm:inline">No expiry</span>}
                        </span>
                        <span className="flex items-center justify-end gap-3 text-xs whitespace-nowrap">
                          <RowAction r={r} userId={user.id} owner={owner} onEdit={() => setEditing(r)} onVerify={() => setVerifying(r)} onEvidence={() => setAttaching(r)} onRenew={() => setRenewing(r)}
                            onUnverify={() => unverify(r)} />
                          {manager && <button onClick={() => remove(r)} className="text-muted hover:text-red-600" aria-label={`Delete ${r.requirementName}`}>Delete</button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {groups.length > shown && (
            <button onClick={() => setShown(shown + PAGE)} className="w-full rounded-xl border border-border py-2.5 text-sm text-muted hover:text-foreground hover:bg-foreground/5">
              Show more clients ({groups.length - shown} left)
            </button>
          )}
        </div>
      )}

      {viewing && (
        <RecordDetail
          record={viewing} userId={user.id} owner={owner} onClose={() => setViewingId(null)}
          companyName={companies.length > 1 ? companies.find((c) => c.key === viewing.company)?.name : undefined}
          actions={{
            onEdit: () => setEditing(viewing), onVerify: () => setVerifying(viewing), onEvidence: () => setAttaching(viewing),
            onRenew: () => setRenewing(viewing), onUnverify: () => unverify(viewing),
            onOutreach: () => setOutreach({ key: viewing.id, smeId: viewing.smeId, company: viewing.company, clientName: viewing.clientName, records: [viewing], top: 0 }),
            onDelete: manager ? () => remove(viewing) : undefined,
          }}
        />
      )}
      {editing && (
        <RecordSheet
          record={editing !== "new" && "id" in editing ? editing : null}
          preset={editing !== "new" && !("id" in editing) ? editing : undefined}
          types={types} companies={companies.map((c) => ({ key: c.key, name: c.name }))}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {outreach && <OutreachSheet clientName={outreach.clientName} records={outreach.records} initialId={outreach.records[0].id} onClose={() => setOutreach(null)} onSaved={() => { setOutreach(null); refresh(); }} />}
      {opportunity && (() => {
        const gaps = openForOpportunity(opportunity);
        return <OpportunitySheet clientName={opportunity.clientName} company={opportunity.company} records={gaps} initialId={gaps[0]?.id ?? ""} onClose={() => setOpportunity(null)} onSaved={() => { setOpportunity(null); refresh(); }} />;
      })()}
      {renewing && <RenewSheet record={renewing} onClose={() => setRenewing(null)} onSaved={() => { setRenewing(null); refresh(); }} />}
      {verifying && <VerifySheet record={verifying} ownEntry={verifying.enteredBy === user.id} onClose={() => setVerifying(null)} onSaved={() => { setVerifying(null); refresh(); }} />}
      {attaching && <EvidenceSheet record={attaching} onClose={() => setAttaching(null)} onSaved={() => { setAttaching(null); refresh(); }} />}
      {assessing && <AssessSheet clientName={assessing.clientName} smeId={assessing.smeId} company={assessing.company} records={assessing.records} onClose={() => setAssessing(null)} onSaved={() => { setAssessing(null); refresh(); }} />}
    </div>
  );
}

// The one thing a requirement needs next. Nothing when it's in good shape.
function RowAction({ r, userId, owner, onEdit, onVerify, onEvidence, onRenew, onUnverify }: {
  r: Rec; userId: string; owner: boolean; onEdit: () => void; onVerify: () => void; onEvidence: () => void; onRenew: () => void; onUnverify: () => void;
}) {
  const link = "font-medium text-accent hover:underline";
  switch (nextStep(r, userId, owner)) {
    case "renew": return <button onClick={onRenew} className={clsx(link, "inline-flex items-center gap-1")}><RefreshCw size={11} /> Renew</button>;
    case "assess": return <button onClick={onEdit} className={link}>Assess</button>;
    case "fix": return <button onClick={onEdit} className="font-medium text-amber-700 hover:underline">Fix</button>;
    case "sentBack": return <span className="text-muted" title="Waiting for whoever entered it to fix it">Sent back</span>;
    case "evidence": return <button onClick={onEvidence} title="Attach the certificate before it can be verified" className="font-medium text-amber-700 hover:underline">Add evidence</button>;
    case "verify": case "override": return <button onClick={onVerify} className="font-semibold text-green-700 hover:underline">Verify</button>;
    case "colleague": return <span className="text-muted" title="You entered these details, so a colleague verifies them">Needs a colleague</span>;
    case "unverify": return <button onClick={onUnverify} className="text-muted hover:text-foreground">Unverify</button>;
    case "update": return <button onClick={onEdit} className={link}>Update</button>;
    default: return null;
  }
}
