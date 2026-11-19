"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { KpiSheet } from "@/components/kpi";
import { ErrorNote, Label, btnPrimary, btnSecondary, inputClass } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";
import { EvidencePicker } from "./EvidencePicker";
import { recLabel, showDate, type Rec } from "./lib";

// Records a renewed certificate. The old one is kept in the record's renewal history, and the
// record goes back to awaiting verification with fresh reminders.
export function RenewSheet({ record, onClose, onSaved }: { record: Rec; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ referenceNumber: record.referenceNumber ?? "", issueDate: "", expiryDate: "", evidenceDocIds: [] as string[], note: "" });
  type Form = typeof form;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const backwards = !!form.issueDate && !!form.expiryDate && form.expiryDate < form.issueDate;
  const ready = (!!form.issueDate || !!form.expiryDate) && !backwards;

  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.post(`/compliance/${record.id}/renew`, { ...form, issueDate: form.issueDate || null, expiryDate: form.expiryDate || null });
      toast.success("Renewal recorded", { description: `${record.requirementName} · ${record.clientName}. A colleague needs to verify it.` });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't record the renewal.")); }
    finally { setSaving(false); }
  };

  return (
    <KpiSheet
      onClose={onClose} title="Record a renewal" subtitle={`${recLabel(record)} · ${record.clientName}`}
      footer={<>
        <button onClick={onClose} className={btnSecondary}>Cancel</button>
        <button onClick={save} disabled={saving || !ready} className={btnPrimary}>{saving ? "Saving…" : "Save renewal"}</button>
      </>}
    >
      <p className="text-xs text-muted">
        The current certificate{record.referenceNumber ? ` (${record.referenceNumber})` : ""}{record.dueDate ? `, due ${showDate(record.dueDate)},` : ""} is kept in the history.
      </p>
      <div>
        <Label hint="(on the new certificate)">Reference number</Label>
        <input value={form.referenceNumber} onChange={(e) => set("referenceNumber", e.target.value)} className={inputClass} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Issued on</Label>
          <input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} className={inputClass} />
        </div>
        <div>
          <Label>Expires on</Label>
          <input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} className={inputClass} />
        </div>
      </div>
      {backwards && <p className="text-xs text-red-600">The expiry date is before the issue date.</p>}
      <EvidencePicker
        smeId={record.smeId} value={form.evidenceDocIds} onChange={(ids) => set("evidenceDocIds", ids)} onError={setError}
        hint="(the new certificate)" warning="It can't be verified until the new certificate is attached."
      />
      <div>
        <Label hint="(optional)">Note</Label>
        <input value={form.note} onChange={(e) => set("note", e.target.value)} className={inputClass} placeholder="e.g. Renewed at FDA Accra office" />
      </div>
      <ErrorNote message={error} />
    </KpiSheet>
  );
}
