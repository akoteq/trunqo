"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { KpiSheet } from "@/components/kpi";
import { STATE_LABEL } from "@/components/ClientModules";
import { Chips, ErrorNote, Label, btnPrimary, btnSecondary, inputClass, selectClass } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";
import type { Bdo, Rec } from "./lib";

// Client-level actions on the compliance page. Both are still saved against one requirement,
// which the person picks here (the most urgent one is chosen for them).

const reqLabel = (r: Rec) => `${r.regulator} ${r.requirementName}${r.subject ? ` (${r.subject})` : ""} · ${STATE_LABEL[r.state]}`;

function RequirementPicker({ records, value, onChange, label }: { records: Rec[]; value: string; onChange: (id: string) => void; label: string }) {
  if (records.length === 1) return <p className="text-sm text-muted">About {reqLabel(records[0])}</p>;
  return (
    <div>
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {records.map((r) => <option key={r.id} value={r.id}>{reqLabel(r)}</option>)}
      </select>
    </div>
  );
}

const TYPES: [string, string][] = [["CALL", "Call"], ["VISIT", "Visit"], ["MEETING", "Meeting"], ["EMAIL", "Email"], ["OTHER", "Other"]];

export function OutreachSheet({ clientName, records, initialId, onClose, onSaved }: {
  clientName: string; records: Rec[]; initialId: string; onClose: () => void; onSaved: () => void;
}) {
  const [recordId, setRecordId] = useState(initialId);
  const [type, setType] = useState("CALL");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.post(`/compliance/${recordId}/outreach`, { type, note });
      toast.success("Outreach logged", { description: clientName });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't save the outreach.")); }
    finally { setSaving(false); }
  };
  return (
    <KpiSheet
      onClose={onClose} title="Log outreach" subtitle={`${clientName} · it goes on the client's follow-up log`}
      footer={<>
        <button onClick={onClose} className={btnSecondary}>Cancel</button>
        <button onClick={save} disabled={saving || !note.trim()} className={btnPrimary}>{saving ? "Saving…" : "Log outreach"}</button>
      </>}
    >
      <RequirementPicker records={records} value={recordId} onChange={setRecordId} label="Which requirement was it about?" />
      <div>
        <Label>How did you reach them?</Label>
        <Chips label="Type" value={type} onChange={setType} options={TYPES} />
      </div>
      <div>
        <Label>What happened?</Label>
        <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass + " resize-none"} placeholder="e.g. Spoke to the owner; they'll bring the TIN certificate on Friday" />
      </div>
      <ErrorNote message={error} />
    </KpiSheet>
  );
}

export function OpportunitySheet({ clientName, company, records, initialId, onClose, onSaved }: {
  clientName: string; company: string; records: Rec[]; initialId: string; onClose: () => void; onSaved: () => void;
}) {
  const { data: bdos = [] } = useQuery<Bdo[]>({ queryKey: ["bdos", company], queryFn: () => fetcher(`/bdo?company=${company}`) });
  const serviceFor = (r?: Rec) => (r && ["VERIFIED", "AWAITING_VERIFICATION"].includes(r.state) && r.renewalDue ? "Renewal support" : "Registration assistance");
  const first = records.find((r) => r.id === initialId) ?? records[0];
  const [recordId, setRecordId] = useState(first?.id ?? "");
  const [form, setForm] = useState({ ownerBdoId: first?.responsibleBdoId ?? "", potentialFeeGhs: "", nextAction: "", nextActionDate: "", serviceType: serviceFor(first) });
  const [touchedService, setTouchedService] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const pick = (id: string) => {
    setRecordId(id);
    const r = records.find((x) => x.id === id);
    setForm((f) => ({ ...f, ownerBdoId: f.ownerBdoId || r?.responsibleBdoId || "", serviceType: touchedService ? f.serviceType : serviceFor(r) }));
  };

  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.post(`/compliance/${recordId}/opportunity`, { ...form, potentialFeeGhs: form.potentialFeeGhs || null, nextActionDate: form.nextActionDate || null });
      setDone(true);
    } catch (e) { setError(apiError(e, "Couldn't create the opportunity.")); }
    finally { setSaving(false); }
  };

  return (
    <KpiSheet
      onClose={done ? onSaved : onClose} title={done ? "Opportunity created" : "New opportunity"} subtitle={clientName}
      footer={done
        ? <>
            <Link href={`/leads?q=${encodeURIComponent(clientName)}`} className={btnSecondary}>Open in leads</Link>
            <button onClick={onSaved} className={btnPrimary}>Done</button>
          </>
        : <>
            <button onClick={onClose} className={btnSecondary}>Cancel</button>
            <button onClick={save} disabled={saving || !form.ownerBdoId || !recordId} className={btnPrimary}>{saving ? "Creating…" : "Create lead"}</button>
          </>}
    >
      {done ? (
        <p className="text-sm text-foreground">This is now a lead, linked to {clientName}. When it is won, convert it and add a deal.</p>
      ) : (
        <>
          <RequirementPicker records={records} value={recordId} onChange={pick} label="Which gap is the work for?" />
          <div>
            <Label>Service</Label>
            <input value={form.serviceType} onChange={(e) => { setTouchedService(true); setForm({ ...form, serviceType: e.target.value }); }} className={inputClass} />
          </div>
          <div>
            <Label>Who owns the lead?</Label>
            <select value={form.ownerBdoId} onChange={(e) => setForm({ ...form, ownerBdoId: e.target.value })} className={selectClass}>
              <option value="">Choose someone…</option>
              {bdos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <Label hint="(GHS, optional)">Potential fee</Label>
            <input type="number" inputMode="decimal" min={0} value={form.potentialFeeGhs} onChange={(e) => setForm({ ...form, potentialFeeGhs: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label hint="(optional)">Next action</Label>
              <input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} className={inputClass} />
            </div>
            <div>
              <Label hint="(optional)">By when?</Label>
              <input type="date" value={form.nextActionDate} onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })} className={inputClass} />
            </div>
          </div>
          <ErrorNote message={error} />
        </>
      )}
    </KpiSheet>
  );
}
