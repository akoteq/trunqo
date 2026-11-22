"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { History, Plus, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { useAuth } from "@/components/AuthProvider";
import { accessLevel } from "@/lib/auth";
import { useCompanies } from "@/lib/companies";
import { WizardShell, useWizard } from "../../leads/components/WizardShell";
import { Chips, Disclosure, Label, inputClass, selectClass } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";
import { CATEGORIES, MIT_STATUS, label, scoreTone, type Bdo, type Indicator, type Mitigation, type Risk } from "./lib";

// Same three-step flow as adding a client or a KPI.
const STEPS = [
  { title: "What's the risk?", subtitle: "Name it, and say who is accountable for it.", nudge: "Let's start" },
  { title: "How serious is it?", subtitle: "How bad it would be, and how likely it is.", nudge: "Halfway there" },
  { title: "What are you doing about it?", subtitle: "The actions that bring it down, and when to look again.", nudge: "Last step" },
] as const;

const IMPACT_HINT = ["Minor", "Noticeable", "Serious", "Major", "Severe"];
const LIKELIHOOD_HINT = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"];

type Form = {
  company: string; title: string; category: string; description: string; impactDescription: string; financialImpactGhs: string;
  impact: number | null; likelihood: number | null; residualImpact: number | null; residualLikelihood: number | null;
  ownerBdoId: string; nextReviewDate: string; reviewStatus: string; indicators: Indicator[]; mitigations: Mitigation[];
};

export function RiskSheet({ risk, onClose, onSaved }: { risk: Risk | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { companies } = useCompanies();
  const isEdit = !!risk;
  const groupOwner = !!user && accessLevel(user.role) === "GROUP_OWNER";
  const readOnly = !!risk && !risk.canEdit;
  const { step, dir, reached, go, last } = useWizard(STEPS.length, isEdit ? STEPS.length - 1 : 0);
  const [form, setForm] = useState<Form>({
    company: risk?.company ?? (groupOwner ? "" : user?.bdoCompany ?? ""), title: risk?.title ?? "", category: risk?.category ?? "FINANCIAL",
    description: risk?.description ?? "", impactDescription: risk?.impactDescription ?? "",
    financialImpactGhs: risk?.financialImpactGhs != null ? String(risk.financialImpactGhs) : "",
    impact: risk?.impact ?? null, likelihood: risk?.likelihood ?? null,
    residualImpact: risk?.residualImpact ?? null, residualLikelihood: risk?.residualLikelihood ?? null,
    ownerBdoId: risk?.ownerBdoId ?? "", nextReviewDate: risk?.nextReviewDate?.slice(0, 10) ?? "", reviewStatus: risk?.reviewStatus ?? "ACTIVE",
    indicators: risk?.indicators ?? [], mitigations: risk?.mitigations ?? [],
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: bdos = [] } = useQuery<Bdo[]>({ queryKey: ["bdos", form.company], queryFn: () => fetcher(`/bdo?company=${form.company}`), enabled: !!form.company });
  const { data: audit = [] } = useQuery<{ id: string; action: string; actorName: string | null; createdAt: string; note?: string }[]>({
    queryKey: ["risk-audit", risk?.id], queryFn: () => fetcher(`/risks/${risk!.id}/audit`), enabled: isEdit,
  });

  const hasBasics = form.title.trim() !== "" && !!form.company;
  const scored = !!form.impact && !!form.likelihood;
  const residualHigher = !!form.impact && !!form.likelihood && !!form.residualImpact && !!form.residualLikelihood
    && form.residualImpact * form.residualLikelihood > form.impact * form.likelihood;
  const canContinue = step === 0 ? hasBasics : step === 1 ? scored : true;

  const setMit = (i: number, patch: Partial<Mitigation>) => set("mitigations", form.mitigations.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const setInd = (i: number, patch: Partial<Indicator>) => set("indicators", form.indicators.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (!hasBasics) { setError("Give the risk a title first."); go(0); return; }
    if (!scored) { setError("Choose the impact and the likelihood."); go(1); return; }
    setSaving(true); setError("");
    const body = {
      ...form, financialImpactGhs: form.financialImpactGhs === "" ? null : Number(form.financialImpactGhs), ownerBdoId: form.ownerBdoId || null,
      nextReviewDate: form.nextReviewDate || null,
      mitigations: form.mitigations.map((m) => ({ ...m, ownerBdoId: m.ownerBdoId || null, deadline: m.deadline || null })),
    };
    try {
      if (risk) {
        const { data } = await api.put<{ warning?: string | null }>(`/risks/${risk.id}`, body);
        toast.success("Risk updated", { description: form.title.trim() });
        if (data.warning) toast.warning("Someone else updated an action", { description: data.warning });
      } else {
        const { data } = await api.post<{ warning?: string | null }>("/risks", body);
        toast.success("Risk added", { description: form.title.trim() });
        if (data.warning) toast.warning("The register is getting long", { description: data.warning });
      }
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't save this risk. Please try again.")); }
    finally { setSaving(false); }
  };

  const primary = readOnly
    ? { label: last ? "Close" : "Next", onClick: last ? onClose : () => go(step + 1) }
    : last
      ? { label: saving ? "Saving…" : isEdit ? "Save changes" : "Add risk", disabled: saving || !hasBasics || !scored, onClick: save }
      : { label: "Continue", disabled: !canContinue, onClick: () => go(step + 1) };

  return (
    <WizardShell steps={STEPS} step={step} dir={dir} reached={reached} onGo={go} onClose={onClose} error={error} primary={primary}>
      <fieldset disabled={readOnly} className="min-w-0">
        {step === 0 && (
          <div className="space-y-4">
            {!isEdit && groupOwner && (
              <div>
                <Label>Which company&apos;s register?</Label>
                <select value={form.company} onChange={(e) => { set("company", e.target.value); set("ownerBdoId", ""); }} className={selectClass}>
                  <option value="">Choose a company…</option>
                  {companies.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label>What could go wrong?</Label>
              <input
                autoFocus value={form.title} onChange={(e) => set("title", e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && hasBasics) go(1); }}
                className={inputClass} placeholder="e.g. Clients pay late and cash runs short"
              />
            </div>
            <div>
              <Label>Category</Label>
              <Chips label="Category" value={form.category} onChange={(v) => set("category", v)} options={CATEGORIES.map((c) => [c, label(c)] as [string, string])} />
            </div>
            <div>
              <Label>Who is accountable?</Label>
              <select value={form.ownerBdoId} onChange={(e) => set("ownerBdoId", e.target.value)} className={selectClass} disabled={!form.company}>
                <option value="">Nobody yet</option>
                {bdos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <Disclosure title="Describe it in more detail" defaultOpen={!!form.description}>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} className={inputClass + " resize-none"} placeholder="What causes it, and where it shows up" aria-label="Description" />
            </Disclosure>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label hint={form.impact ? `· ${IMPACT_HINT[form.impact - 1]}` : "(1–5)"}>How bad would it be?</Label>
              <Scale value={form.impact} onChange={(n) => set("impact", n)} hints={IMPACT_HINT} label="Impact" />
            </div>
            <div>
              <Label hint={form.likelihood ? `· ${LIKELIHOOD_HINT[form.likelihood - 1]}` : "(1–5)"}>How likely is it?</Label>
              <Scale value={form.likelihood} onChange={(n) => set("likelihood", n)} hints={LIKELIHOOD_HINT} label="Likelihood" />
            </div>
            {scored && (
              <p className="text-sm text-muted flex items-center gap-2">
                Score <span className={clsx("px-2 py-0.5 rounded text-sm font-bold", scoreTone(form.impact! * form.likelihood!))}>{form.impact! * form.likelihood!}</span>
                <span className="text-xs">out of 25{form.impact! * form.likelihood! >= 15 ? " · high" : form.impact! * form.likelihood! >= 8 ? " · medium" : " · low"}</span>
              </p>
            )}
            <div>
              <Label hint="(optional)">What would happen?</Label>
              <textarea value={form.impactDescription} onChange={(e) => set("impactDescription", e.target.value)} rows={2} className={inputClass + " resize-none"} placeholder="e.g. Salaries paid late, a supplier stops deliveries" />
            </div>
            <div>
              <Label hint="(GHS, optional)">Estimated cost if it happens</Label>
              <input type="number" inputMode="decimal" min={0} value={form.financialImpactGhs} onChange={(e) => set("financialImpactGhs", e.target.value)} className={inputClass} />
            </div>
            <Disclosure title="Score after mitigation" defaultOpen={!!(form.residualImpact || form.residualLikelihood)}>
              <p className="text-xs text-muted -mt-2">How serious it will be once the actions are done.</p>
              <div>
                <Label>Impact after mitigation</Label>
                <Scale value={form.residualImpact} onChange={(n) => set("residualImpact", n)} hints={IMPACT_HINT} label="Residual impact" />
              </div>
              <div>
                <Label>Likelihood after mitigation</Label>
                <Scale value={form.residualLikelihood} onChange={(n) => set("residualLikelihood", n)} hints={LIKELIHOOD_HINT} label="Residual likelihood" />
              </div>
              {residualHigher && <p className="text-xs text-amber-700">The score after mitigation is higher than before. Check the numbers.</p>}
            </Disclosure>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Mitigation actions</Label>
                <button type="button" onClick={() => set("mitigations", [...form.mitigations, { action: "", ownerBdoId: null, deadline: null, status: "OPEN" }])} className="text-xs text-accent flex items-center gap-1 hover:underline"><Plus size={12} /> Add action</button>
              </div>
              {form.mitigations.length === 0 && <p className="text-xs text-muted">No actions yet. A risk without actions only gets watched, not reduced.</p>}
              <div className="space-y-2">
                {form.mitigations.map((m, i) => (
                  <div key={m.id ?? `n${i}`} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex gap-2 items-start">
                      <input value={m.action} placeholder="What will be done?" onChange={(e) => setMit(i, { action: e.target.value })} className={inputClass} aria-label="Action" />
                      <button type="button" onClick={() => set("mitigations", form.mitigations.filter((_, j) => j !== i))} className="text-muted hover:text-red-600 mt-2.5" aria-label="Remove action"><Trash2 size={14} /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select value={m.ownerBdoId ?? ""} onChange={(e) => setMit(i, { ownerBdoId: e.target.value || null })} className={selectClass} aria-label="Owner">
                        <option value="">Owner</option>{bdos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <input type="date" value={m.deadline?.slice(0, 10) ?? ""} onChange={(e) => setMit(i, { deadline: e.target.value || null })} className={inputClass} aria-label="Deadline" />
                      <select value={m.status} onChange={(e) => setMit(i, { status: e.target.value })} className={selectClass} aria-label="Status">
                        {MIT_STATUS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label hint="(default: in 90 days)">Next review</Label>
              <input type="date" value={form.nextReviewDate} onChange={(e) => set("nextReviewDate", e.target.value)} className={inputClass} />
            </div>
            <div>
              <Label>Status</Label>
              <Chips label="Status" value={form.reviewStatus} onChange={(v) => set("reviewStatus", v)}
                options={(isEdit ? ["DRAFT", "ACTIVE", "CLOSED"] : ["DRAFT", "ACTIVE"]).map((s) => [s, label(s)] as [string, string])} />
            </div>

            <Disclosure title={`Warning signs${form.indicators.length ? ` (${form.indicators.length})` : ""}`} defaultOpen={form.indicators.length > 0}>
              <p className="text-xs text-muted -mt-2">Early signals that the risk is getting closer.</p>
              {form.indicators.map((ind, i) => (
                <div key={ind.id ?? `n${i}`} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex gap-2 items-start">
                    <input value={ind.name} placeholder="What to watch" onChange={(e) => setInd(i, { name: e.target.value })} className={inputClass} aria-label="Warning sign" />
                    <button type="button" onClick={() => set("indicators", form.indicators.filter((_, j) => j !== i))} className="text-muted hover:text-red-600 mt-2.5" aria-label="Remove warning sign"><Trash2 size={14} /></button>
                  </div>
                  <input value={ind.threshold} placeholder="When it counts, e.g. 3+ payments 30 days late" onChange={(e) => setInd(i, { threshold: e.target.value })} className={inputClass} aria-label="Threshold" />
                  <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" className="accent-accent" checked={ind.triggered} onChange={(e) => setInd(i, { triggered: e.target.checked })} /> This has happened</label>
                </div>
              ))}
              <button type="button" onClick={() => set("indicators", [...form.indicators, { name: "", threshold: "", triggered: false }])} className="text-xs text-accent flex items-center gap-1 hover:underline"><Plus size={12} /> Add warning sign</button>
            </Disclosure>

            {isEdit && audit.length > 0 && (
              <details className="text-xs text-muted border-t border-border pt-3">
                <summary className="cursor-pointer flex items-center gap-1"><History size={12} /> History ({audit.length})</summary>
                <ul className="mt-2 space-y-1">{audit.map((a) => <li key={a.id}>{new Date(a.createdAt).toLocaleString()} · {a.actorName ?? "Someone"} · {a.action}{a.note ? ` — ${a.note}` : ""}</li>)}</ul>
              </details>
            )}
          </div>
        )}
      </fieldset>
    </WizardShell>
  );
}

// 1–5 buttons; tapping the chosen one again clears it.
export function Scale({ value, onChange, hints, label: name }: { value: number | null; onChange: (n: number | null) => void; hints?: string[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button" key={n} role="radio" aria-checked={value === n} title={hints?.[n - 1]}
          onClick={() => onChange(value === n ? null : n)}
          className={clsx(
            "flex-1 h-10 rounded-lg text-sm font-semibold border transition-colors",
            value === n ? "bg-accent text-accent-foreground border-accent" : "bg-surface text-muted border-border hover:border-accent hover:text-foreground",
          )}
        >{n}</button>
      ))}
    </div>
  );
}
