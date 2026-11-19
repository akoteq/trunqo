"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { useAuth } from "@/components/AuthProvider";
import { accessLevel } from "@/lib/auth";
import { ClientSelect, type ClientOption } from "@/components/ClientSelect";
import { STATE_LABEL, STATE_STYLE } from "@/components/ClientModules";
import { WizardShell, useWizard } from "../../leads/components/WizardShell";
import { ChoiceCard, Chips, Label, inputClass, selectClass } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";
import { EvidencePicker } from "./EvidencePicker";
import { d10, renewsText, showDate, type Bdo, type Rec, type ReqType } from "./lib";

// Same three-step flow as adding a client or a KPI.
const STEPS = [
  { title: "Which client and requirement?", subtitle: "The business, and the registration or licence to track.", nudge: "Let's start" },
  { title: "Where do things stand?", subtitle: "Whether it applies, and what the certificate says.", nudge: "Halfway there" },
  { title: "Evidence and next steps", subtitle: "Proof on file, and who follows it up.", nudge: "Last step" },
] as const;

// "Expired" isn't offered: it follows from the expiry date. Older records saved as Expired still show it.
const STATUSES: [string, string][] = [["NOT_REGISTERED", "Not registered"], ["IN_PROGRESS", "In progress"], ["REGISTERED", "Registered"], ["SUSPENDED", "Suspended"]];
const APPLIES: [string, string, string][] = [
  ["APPLICABLE", "Applies", "The client needs this registration."],
  ["NOT_APPLICABLE", "Doesn't apply", "Say why, so nobody chases it later."],
  ["UNASSESSED", "Not sure yet", "Keep it on the list to check."],
];

export function RecordSheet({ record, preset, types, companies, onClose, onSaved }: {
  record: Rec | null; types: ReqType[]; companies: { key: string; name: string }[]; onClose: () => void; onSaved: () => void;
  /** A new record for a client already chosen (from that client's card). */
  preset?: { smeId: string; company: string };
}) {
  const { user } = useAuth();
  const isEdit = !!record;
  const groupOwner = !!user && accessLevel(user.role) === "GROUP_OWNER";
  const { step, dir, reached, go, last } = useWizard(STEPS.length, isEdit ? STEPS.length - 1 : 0);
  const [form, setForm] = useState({
    company: record?.company ?? preset?.company ?? (groupOwner ? companies[0]?.key ?? "" : user?.bdoCompany ?? ""),
    smeId: record?.smeId ?? preset?.smeId ?? "", requirementTypeId: record?.requirementTypeId ?? "", subject: record?.subject ?? "",
    applicability: record?.applicability ?? "APPLICABLE", notApplicableReason: record?.notApplicableReason ?? "",
    status: record?.status ?? "NOT_REGISTERED", referenceNumber: record?.referenceNumber ?? "",
    issueDate: d10(record?.issueDate), expiryDate: d10(record?.expiryDate), responsibleBdoId: record?.responsibleBdoId ?? "",
    nextAction: record?.nextAction ?? "", nextActionDate: d10(record?.nextActionDate), evidenceDocIds: record?.evidenceDocIds ?? [],
  });
  type Form = typeof form;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: clients = [] } = useQuery<{ data: ClientOption[] }, Error, ClientOption[]>({ queryKey: ["sme-options"], queryFn: () => fetcher("/sme"), select: (r) => r.data, enabled: !isEdit });
  const { data: bdos = [] } = useQuery<Bdo[]>({ queryKey: ["bdos", form.company], queryFn: () => fetcher(`/bdo${groupOwner && form.company ? `?company=${form.company}` : ""}`) });
  const { data: suggestions = [] } = useQuery<{ id: string; regulator: string; name: string; reason: string }[]>({
    queryKey: ["compliance-suggest", form.smeId, form.company],
    queryFn: () => fetcher(`/compliance/suggest?smeId=${form.smeId}${groupOwner ? `&company=${form.company}` : ""}`),
    enabled: !isEdit && !!form.smeId && !!form.company,
  });

  const type = types.find((t) => t.id === form.requirementTypeId);
  const byRegulator = useMemo(() => [...new Set(types.map((t) => t.regulator))].sort().map((r) => [r, types.filter((t) => t.regulator === r)] as const), [types]);

  // What each step needs before moving on. The server checks the same rules.
  const step0Ok = isEdit || (!!form.company && !!form.smeId && !!form.requirementTypeId && (!type?.perSubject || form.subject.trim() !== ""));
  const datesBackwards = !!form.issueDate && !!form.expiryDate && form.expiryDate < form.issueDate;
  const step1Ok = (form.applicability !== "NOT_APPLICABLE" || form.notApplicableReason.trim() !== "") && !datesBackwards;
  const canContinue = step === 0 ? step0Ok : step === 1 ? step1Ok : true;
  const applies = form.applicability !== "NOT_APPLICABLE";

  const save = async () => {
    if (!step0Ok) { setError("Choose the client and the requirement first."); go(0); return; }
    if (!step1Ok) { setError(datesBackwards ? "The expiry date is before the issue date." : "Say why it doesn't apply."); go(1); return; }
    setSaving(true); setError("");
    const body: Record<string, unknown> = {
      ...form, issueDate: form.issueDate || null, expiryDate: form.expiryDate || null, nextActionDate: form.nextActionDate || null,
      responsibleBdoId: form.responsibleBdoId || null, notApplicableReason: form.notApplicableReason || undefined,
    };
    try {
      if (record) { delete body.company; delete body.smeId; delete body.requirementTypeId; await api.put(`/compliance/${record.id}`, body); }
      else await api.post("/compliance", body);
      toast.success(isEdit ? "Record updated" : "Record added", { description: type ? `${type.regulator} ${type.name}` : undefined });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't save this record. Please try again.")); }
    finally { setSaving(false); }
  };

  return (
    <WizardShell
      steps={STEPS} step={step} dir={dir} reached={reached} onGo={go} onClose={onClose} error={error}
      primary={last
        ? { label: saving ? "Saving…" : isEdit ? "Save changes" : "Add record", disabled: saving || !step0Ok || !step1Ok, onClick: save }
        : { label: "Continue", disabled: !canContinue, onClick: () => go(step + 1) }}
    >
      {step === 0 && (
        <div className="space-y-4">
          {isEdit ? (
            <div className="rounded-xl border border-border p-3.5 space-y-1.5">
              <p className="text-sm font-medium text-foreground">{record.clientName}</p>
              <p className="text-sm text-muted">{record.regulator} · {record.requirementName}</p>
              <span className={clsx("inline-block px-2 py-0.5 rounded-full text-xs font-medium", STATE_STYLE[record.state])}>
                {STATE_LABEL[record.state]}{record.verified && record.verifiedByName ? ` by ${record.verifiedByName} on ${showDate(record.verifiedAt)}` : ""}
              </span>
              <p className="text-xs text-muted">Changing the reference, dates or status of a verified record sends it back to awaiting verification.</p>
              {record.sentBack && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  <span className="font-medium">{record.sentBack.byName ?? "A colleague"} sent it back:</span> {record.sentBack.note}
                </p>
              )}
            </div>
          ) : (
            <>
              {groupOwner && companies.length > 1 && (
                <div>
                  <Label>Tracked by</Label>
                  <Chips label="Tracked by" value={form.company} onChange={(v) => set("company", v)} options={companies.map((c) => [c.key, c.name] as [string, string])} />
                </div>
              )}
              <ClientSelect label="Client" value={form.smeId} options={clients} onChange={(id) => set("smeId", id)} />
              <div>
                <Label>Requirement</Label>
                <select value={form.requirementTypeId} onChange={(e) => set("requirementTypeId", e.target.value)} className={selectClass}>
                  <option value="">Choose a requirement…</option>
                  {byRegulator.map(([reg, ts]) => <optgroup key={reg} label={reg}>{ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
                </select>
                {suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Suggested for this client:</span>
                    {suggestions.map((s) => (
                      <button key={s.id} type="button" title={s.reason} onClick={() => set("requirementTypeId", s.id)}
                        className={clsx("text-xs px-2 py-1 rounded-full border transition-colors", form.requirementTypeId === s.id ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted hover:text-foreground")}>
                        {s.regulator} {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {(type?.perSubject || form.subject) && (
            <div>
              <Label hint={type?.perSubject ? "(recorded one by one)" : undefined}>Which product or site?</Label>
              <input value={form.subject} onChange={(e) => set("subject", e.target.value)} className={inputClass} placeholder="e.g. Shea butter 250g jar" />
            </div>
          )}
          {type && (
            <p className="text-xs text-muted">
              Renews: {renewsText(type)}.
            </p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label>Does it apply to this client?</Label>
            <div role="radiogroup" aria-label="Does it apply" className="grid grid-cols-1 gap-2">
              {APPLIES.map(([v, title, text]) => <ChoiceCard key={v} selected={form.applicability === v} title={title} text={text} onClick={() => set("applicability", v)} />)}
            </div>
          </div>
          {!applies ? (
            <div>
              <Label>Why doesn&apos;t it apply?</Label>
              <input autoFocus value={form.notApplicableReason} onChange={(e) => set("notApplicableReason", e.target.value)} className={inputClass} placeholder="e.g. They only trade, they don't process food" />
            </div>
          ) : (
            <>
              <div>
                <Label>Status</Label>
                <Chips label="Status" value={form.status} onChange={(v) => set("status", v)} options={form.status === "EXPIRED" ? [...STATUSES, ["EXPIRED", "Expired"]] : STATUSES} />
              </div>
              <div>
                <Label hint="(on the certificate)">Reference number</Label>
                <input value={form.referenceNumber} onChange={(e) => set("referenceNumber", e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Issued on</Label>
                  <input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <Label hint={type?.renewal?.kind === "NONE" ? "(if any)" : undefined}>Expires on</Label>
                  <input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} className={inputClass} />
                </div>
              </div>
              {datesBackwards && <p className="text-xs text-red-600">The expiry date is before the issue date.</p>}
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {form.smeId && (
            <EvidencePicker
              smeId={form.smeId} value={form.evidenceDocIds} onChange={(ids) => set("evidenceDocIds", ids)} onError={setError}
              warning={applies && form.status === "REGISTERED" ? "Attach the certificate. It can't be verified without evidence." : undefined}
            />
          )}
          <div>
            <Label>Who follows it up?</Label>
            <select value={form.responsibleBdoId} onChange={(e) => set("responsibleBdoId", e.target.value)} className={selectClass}>
              <option value="">Nobody yet</option>
              {bdos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <Label hint="(optional)">Next action</Label>
            <input value={form.nextAction} onChange={(e) => set("nextAction", e.target.value)} className={inputClass} placeholder="e.g. Collect the renewal form from the client" />
          </div>
          <div>
            <Label hint="(optional)">By when?</Label>
            <input type="date" value={form.nextActionDate} onChange={(e) => set("nextActionDate", e.target.value)} className={inputClass} />
          </div>
        </div>
      )}
    </WizardShell>
  );
}
