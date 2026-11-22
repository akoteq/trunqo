"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Lock, UserRound, X } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { useAuth } from "@/components/AuthProvider";
import { accessLevel } from "@/lib/auth";
import { WizardShell, useWizard } from "../../leads/components/WizardShell";
import { Chips, Disclosure, Label, inputClass, selectClass } from "../../leads/components/fields";
import { useDebounced } from "../../leads/components/DuplicateMatches";
import { apiError, inDays } from "../../leads/components/lib";
import { MET, STAGES, label, type ContactRow } from "./lib";

// Same three-step flow as adding a client or a KPI.
const STEPS = [
  { title: "Who is it?", subtitle: "The person, where they work and how to reach them.", nudge: "Let's start" },
  { title: "How do you know them?", subtitle: "How you met, and what they care about.", nudge: "Halfway there" },
  { title: "Last step", subtitle: "Who keeps the relationship, and when to get back in touch.", nudge: "Almost done" },
] as const;

const QUICK_DAYS: [string, string][] = [["", "No follow-up"], ["7", "Next week"], ["30", "In a month"], ["custom", "Pick a date"]];

type Similar = { id: string; name: string; organisation: string };

export function ContactSheet({ contact, onClose, onSaved, onOpen }: {
  contact: ContactRow | null; onClose: () => void; onSaved: () => void;
  /** Opens an existing contact from the "may already be a contact" list. */
  onOpen: (id: string) => void;
}) {
  const { user } = useAuth();
  const isEdit = !!contact;
  const staff = !!user && accessLevel(user.role) === "STAFF";
  const canSeePrivate = !contact || contact.privateNotes !== undefined;
  const detailsHidden = !!contact?.contactDetailsHidden;
  const { step, dir, reached, go, last } = useWizard(STEPS.length, isEdit ? STEPS.length - 1 : 0);
  const [form, setForm] = useState({
    name: contact?.name ?? "", organisation: contact?.organisation ?? "", role: contact?.role ?? "", sector: contact?.sector ?? "",
    interests: (contact?.interests ?? []).join(", "), phone: contact?.phone ?? "", email: contact?.email ?? "", howMet: contact?.howMet ?? "MEETING",
    howMetDetails: contact?.howMetDetails ?? "", introducedBy: contact?.introducedBy ?? "", ownerBdoId: contact?.ownerBdoId ?? user?.bdoId ?? "",
    stage: contact?.stage ?? "NEW", nextFollowUpDate: contact?.nextFollowUpDate?.slice(0, 10) ?? "", smeIds: contact?.smeIds ?? [] as string[],
    consentNote: contact?.consentNote ?? "", privateNotes: contact?.privateNotes ?? "",
  });
  type Form = typeof form;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [blocked, setBlocked] = useState<Similar[] | null>(null);
  const [customDate, setCustomDate] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: bdos = [] } = useQuery<{ id: string; name: string }[]>({ queryKey: ["bdos"], queryFn: () => fetcher("/bdo") });
  const { data: clientRes } = useQuery<{ data: { id: string; companyName: string }[] }>({ queryKey: ["sme-options"], queryFn: () => fetcher("/sme") });
  const clients = clientRes?.data ?? [];

  // Check the name against the contact book as it's typed. When editing, only once the name changes.
  const nameChanged = !isEdit || form.name.trim() !== contact.name;
  const q = useDebounced(nameChanged ? form.name.trim() : "", 350);
  const org = useDebounced(form.organisation.trim(), 350);
  const { data: live = [] } = useQuery<Similar[]>({
    queryKey: ["contacts-similar", q, org],
    queryFn: () => fetcher(`/contacts/similar?name=${encodeURIComponent(q)}&organisation=${encodeURIComponent(org)}`),
    enabled: q.length >= 3, staleTime: 30_000,
  });
  const matches = (q.length >= 3 ? live : []).filter((m) => m.id !== contact?.id);

  const hasName = form.name.trim() !== "";
  const quick = ["7", "30"].find((n) => inDays(Number(n)) === form.nextFollowUpDate);
  const quickValue = customDate || (form.nextFollowUpDate && !quick) ? "custom" : quick ?? "";
  const clientMatches = clientSearch.trim() ? clients.filter((c) => c.companyName.toLowerCase().includes(clientSearch.toLowerCase()) && !form.smeIds.includes(c.id)).slice(0, 6) : [];
  const setWho = (k: "name" | "organisation", v: string) => { set(k, v); setBlocked(null); };

  const save = async (force = false) => {
    if (!hasName) { setError("Add the person's name first."); go(0); return; }
    setSaving(true); setError("");
    // A new contact is checked against the book first, so nobody adds the same person twice.
    if (!isEdit && !force) {
      try {
        const found = await fetcher(`/contacts/similar?name=${encodeURIComponent(form.name)}&organisation=${encodeURIComponent(form.organisation)}`) as Similar[];
        if (found.length) { setBlocked(found); setSaving(false); return; }
      } catch { /* the check is a convenience; carry on */ }
    }
    const body: Record<string, unknown> = {
      ...form, interests: form.interests.split(",").map((x) => x.trim()).filter(Boolean),
      nextFollowUpDate: form.nextFollowUpDate || null, ownerBdoId: form.ownerBdoId || null,
    };
    if (detailsHidden) { delete body.phone; delete body.email; }
    if (!canSeePrivate) delete body.privateNotes;
    try {
      if (contact) await api.put(`/contacts/${contact.id}`, body); else await api.post("/contacts", body);
      toast.success(isEdit ? "Contact updated" : "Contact added", { description: form.name.trim() });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't save this contact. Please try again.")); }
    finally { setSaving(false); }
  };

  return (
    <WizardShell
      steps={STEPS} step={step} dir={dir} reached={reached} onGo={go} onClose={onClose} error={error}
      primary={last
        ? { label: saving ? "Saving…" : isEdit ? "Save changes" : "Add contact", disabled: saving || !hasName || !!blocked, onClick: () => save() }
        : { label: "Continue", disabled: !hasName, onClick: () => go(step + 1) }}
    >
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <input
              autoFocus value={form.name} onChange={(e) => setWho("name", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && hasName) go(1); }}
              className={inputClass} placeholder="e.g. Ama Mensah"
            />
          </div>
          <div aria-live="polite"><SimilarContacts matches={matches} onOpen={onOpen} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Organisation</Label>
              <input value={form.organisation} onChange={(e) => setWho("organisation", e.target.value)} className={inputClass} placeholder="e.g. GEA" />
            </div>
            <div>
              <Label>Role</Label>
              <input value={form.role} onChange={(e) => set("role", e.target.value)} className={inputClass} placeholder="e.g. Regional director" />
            </div>
          </div>
          {detailsHidden ? (
            <p className="flex items-center gap-2 text-xs text-muted rounded-lg border border-border p-2.5"><Lock size={12} /> Phone and email are visible to {contact?.ownerName ?? "the relationship owner"} and leaders.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} placeholder="024 000 0000" />
              </div>
              <div>
                <Label>Email</Label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} placeholder="name@organisation.com" />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label>How did you meet?</Label>
            <Chips label="How we met" value={form.howMet} onChange={(v) => set("howMet", v)} options={MET.map((m) => [m, label(m)] as [string, string])} />
          </div>
          <div>
            <Label hint="(optional)">Details</Label>
            <input value={form.howMetDetails} onChange={(e) => set("howMetDetails", e.target.value)} className={inputClass} placeholder="e.g. AGI breakfast meeting, March" />
          </div>
          <div>
            <Label hint="(optional)">Introduced by</Label>
            <input value={form.introducedBy} onChange={(e) => set("introducedBy", e.target.value)} className={inputClass} />
          </div>
          <div>
            <Label hint="(optional)">Sector</Label>
            <input value={form.sector} onChange={(e) => set("sector", e.target.value)} className={inputClass} placeholder="e.g. Agribusiness finance" />
          </div>
          <div>
            <Label hint="(comma-separated)">Interests</Label>
            <input value={form.interests} onChange={(e) => set("interests", e.target.value)} className={inputClass} placeholder="e.g. SME lending, export, youth jobs" />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {blocked && (
            <div className="space-y-2.5">
              <SimilarContacts matches={blocked} onOpen={onOpen} title={`${blocked[0].name} may already be in the contact book`} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setBlocked(null); go(0); }} className="px-3.5 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-foreground/5">Change the details</button>
                <button type="button" onClick={() => save(true)} disabled={saving} className="px-3.5 py-2 text-sm font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50">
                  {saving ? "Saving…" : "It's a different person, add anyway"}
                </button>
              </div>
            </div>
          )}
          <div>
            <Label>Who keeps this relationship?</Label>
            <select value={form.ownerBdoId} disabled={staff} onChange={(e) => set("ownerBdoId", e.target.value)} className={selectClass}>
              <option value="">Nobody yet</option>
              {bdos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <Label>How strong is it?</Label>
            <Chips label="Stage" value={form.stage} onChange={(v) => set("stage", v)} options={STAGES.map((s) => [s, label(s)] as [string, string])} />
          </div>
          <div>
            <Label>When will you get back in touch?</Label>
            <Chips
              label="Follow-up" value={quickValue}
              onChange={(v) => {
                if (v === "custom") setCustomDate(true);
                else { setCustomDate(false); set("nextFollowUpDate", v ? inDays(Number(v)) : ""); }
              }}
              options={QUICK_DAYS}
            />
            {quickValue === "custom" && (
              <input type="date" value={form.nextFollowUpDate} onChange={(e) => set("nextFollowUpDate", e.target.value)} className={inputClass + " mt-2"} aria-label="Follow-up date" />
            )}
          </div>
          <Disclosure title={`Linked clients${form.smeIds.length ? ` (${form.smeIds.length})` : ""}`} defaultOpen={form.smeIds.length > 0}>
            {form.smeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 -mt-2">
                {form.smeIds.map((id) => (
                  <span key={id} className="text-xs bg-accent/10 text-foreground px-2 py-1 rounded-full flex items-center gap-1">
                    {clients.find((c) => c.id === id)?.companyName ?? "Client"}
                    <button type="button" onClick={() => set("smeIds", form.smeIds.filter((x) => x !== id))} aria-label="Unlink client" className="text-muted hover:text-foreground"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div>
              <input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Search clients to link…" className={inputClass} aria-label="Search clients" />
              {clientMatches.length > 0 && (
                <div className="mt-1 rounded-lg border border-border overflow-hidden">
                  {clientMatches.map((c) => (
                    <button key={c.id} type="button" onClick={() => { set("smeIds", [...form.smeIds, c.id]); setClientSearch(""); }} className="block w-full text-left text-sm px-3 py-2 text-foreground hover:bg-foreground/5">{c.companyName}</button>
                  ))}
                </div>
              )}
            </div>
          </Disclosure>
          <Disclosure title="Consent and private notes" defaultOpen={!!(form.consentNote || form.privateNotes)}>
            <div>
              <Label hint="(Data Protection Act, 2012)">Consent note</Label>
              <input value={form.consentNote} onChange={(e) => set("consentNote", e.target.value)} className={inputClass} placeholder="e.g. Agreed to be contacted by phone, 12 Nov" />
            </div>
            {canSeePrivate && (
              <div>
                <Label hint="(you and the Group Owner only)">Private notes</Label>
                <textarea value={form.privateNotes} onChange={(e) => set("privateNotes", e.target.value)} rows={2} className={inputClass + " resize-none"} />
              </div>
            )}
          </Disclosure>
        </div>
      )}
    </WizardShell>
  );
}

// Contacts that look like the one being added. Each opens the existing record.
function SimilarContacts({ matches, onOpen, title }: { matches: Similar[]; onOpen: (id: string) => void; title?: string }) {
  if (!matches.length) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50/70 px-3.5 py-3" role={title ? "alert" : undefined}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800"><AlertTriangle size={13} />{title ?? "This person may already be in the contact book"}</p>
      <ul className="space-y-1.5">
        {matches.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onOpen(m.id)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-surface">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-muted border border-border"><UserRound size={13} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{m.name}</span>
                {m.organisation && <span className="block truncate text-xs text-muted">{m.organisation}</span>}
              </span>
              <ChevronRight size={14} className="shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
