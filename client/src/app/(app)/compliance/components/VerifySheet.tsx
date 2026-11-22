"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/Toast";
import { KpiSheet } from "@/components/kpi";
import { ErrorNote, Label, btnPrimary, btnSecondary, inputClass } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";
import { EvidenceList, EvidencePicker } from "./EvidencePicker";
import { recLabel, showDate, type Rec } from "./lib";

// The second-person check: the evidence next to what was entered, so the verifier compares them.
// Verify, or send it back with a note for the person who entered it. The Group Owner verifying
// their own entry gives a reason instead (it goes in the history).
export function VerifySheet({ record, ownEntry, onClose, onSaved }: { record: Rec; ownEntry: boolean; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"check" | "sendBack">("check");
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const subtitle = `${recLabel(record)} · ${record.clientName}`;

  const verify = async () => {
    setSaving(true); setError("");
    try {
      await api.post(`/compliance/${record.id}/verify`, ownEntry ? { verified: true, override: true, note } : { verified: true });
      toast.success("Marked as verified", { description: subtitle });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't verify.")); }
    finally { setSaving(false); }
  };
  const sendBack = async () => {
    setSaving(true); setError("");
    try {
      await api.post(`/compliance/${record.id}/send-back`, { note });
      toast.success("Sent back", { description: "Whoever entered it has been told what to fix." });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't send it back.")); }
    finally { setSaving(false); }
  };

  if (mode === "sendBack") {
    return (
      <KpiSheet
        onClose={onClose} title="Send it back" subtitle={subtitle}
        footer={<>
          <button onClick={() => { setMode("check"); setNote(""); setError(""); }} className={btnSecondary}>Back</button>
          <button onClick={sendBack} disabled={saving || !note.trim()} className={btnPrimary}>{saving ? "Sending…" : "Send back"}</button>
        </>}
      >
        <p className="text-sm text-muted">It stays awaiting verification. The person who entered it gets your note in their notifications.</p>
        <div>
          <Label>What needs fixing?</Label>
          <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputClass + " resize-none"} placeholder="e.g. The certificate says FDA/11, not FDA/1, and it expires in March" />
        </div>
        <ErrorNote message={error} />
      </KpiSheet>
    );
  }

  return (
    <KpiSheet
      wide onClose={onClose} title={ownEntry ? "Verify your own entry?" : "Verify this record"} subtitle={subtitle}
      footer={<>
        {!ownEntry && <button onClick={() => { setMode("sendBack"); setError(""); }} className={btnSecondary + " mr-auto"}>Send back…</button>}
        <button onClick={onClose} className={btnSecondary}>Cancel</button>
        <button onClick={verify} disabled={saving || !checked || (ownEntry && !note.trim())} className={btnPrimary}>{saving ? "Saving…" : "Verify"}</button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Evidence</h3>
          <EvidenceList smeId={record.smeId} ids={record.evidenceDocIds} previews />
        </section>
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">What was entered</h3>
          <dl className="space-y-2 text-sm">
            <Fact label="Requirement" value={recLabel(record)} />
            <Fact label="Reference number" value={record.referenceNumber || "—"} />
            <Fact label="Issued on" value={showDate(record.issueDate)} />
            <Fact label="Expires on" value={showDate(record.expiryDate)} />
            {record.nextRenewalDate && record.nextRenewalDate !== record.expiryDate && <Fact label="Next renewal" value={showDate(record.nextRenewalDate)} />}
          </dl>
        </section>
      </div>
      {ownEntry && (
        <div>
          <p className="text-sm text-muted mb-2">You entered these details. Normally a colleague checks them. As Group Owner you can verify anyway; your reason goes in the record&apos;s history.</p>
          <Label>Why are you verifying it yourself?</Label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. Saw the original certificate at the client's office" />
        </div>
      )}
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="accent-accent mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I&apos;ve opened the evidence, and the reference and dates match what was entered.
      </label>
      <ErrorNote message={error} />
    </KpiSheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="text-foreground">{value}</dd></div>;
}

// Attach the certificate without going through the whole form.
export function EvidenceSheet({ record, onClose, onSaved }: { record: Rec; onClose: () => void; onSaved: () => void }) {
  const [ids, setIds] = useState<string[]>(record.evidenceDocIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.put(`/compliance/${record.id}`, { evidenceDocIds: ids });
      toast.success("Evidence saved", { description: `${recLabel(record)} · ${record.clientName}` });
      onSaved();
    } catch (e) { setError(apiError(e, "Couldn't save the evidence.")); }
    finally { setSaving(false); }
  };
  return (
    <KpiSheet
      onClose={onClose} title="Add evidence" subtitle={`${recLabel(record)} · ${record.clientName}`}
      footer={<>
        <button onClick={onClose} className={btnSecondary}>Cancel</button>
        <button onClick={save} disabled={saving || !ids.length} className={btnPrimary}>{saving ? "Saving…" : "Save"}</button>
      </>}
    >
      <p className="text-sm text-muted">Upload or tick the certificate. Once it&apos;s attached, a colleague is asked to verify the record.</p>
      <EvidencePicker smeId={record.smeId} value={ids} onChange={setIds} onError={setError} />
      <ErrorNote message={error} />
    </KpiSheet>
  );
}
