"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { confirmAction } from "@/components/Confirm";
import { DataTable, type Column } from "@/components/DataTable";
import { X, Contact as ContactIcon, Lock } from "lucide-react";
import { ContactSheet } from "./components/ContactSheet";
import { STAGES, type ContactRow } from "./components/lib";

// The group's shared contact book. Everyone sees who we know; phone and email show only to the
// relationship owner and leaders (others ask the owner for an introduction).

type Full = ContactRow & {
  clients: { id: string; name: string }[];
  interactions: { id: string; date: string; type: string; summary: string; attendees: string; loggedByName: string | null }[];
  commitments: { id: string; description: string; owedBy: string; ownerName: string | null; dueDate: string | null; status: string }[];
};

const t = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
const showDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
// Theme-aware: bg-surface / text-foreground / border-border / text-muted all flip with data-theme.
const inputCls = "w-full border border-border bg-surface text-foreground placeholder:text-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";
// DORMANT uses the gray scale (not slate) so it flips with the dark theme.
const STAGE_STYLE: Record<string, string> = { NEW: "bg-gray-100 text-gray-600", DEVELOPING: "bg-blue-100 text-blue-700", ACTIVE: "bg-green-100 text-green-700", STRONG: "bg-emerald-100 text-emerald-800", DORMANT: "bg-gray-100 text-gray-500" };

export default function ContactsPage() {
  const qc = useQueryClient();
  const [stage, setStage] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  const { data: rows = [], isLoading } = useQuery<ContactRow[]>({ queryKey: ["contacts"], queryFn: () => fetcher("/contacts") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts"] });
  const filtered = rows.filter((r) => (!stage || r.stage === stage) && (!dueOnly || (r.nextFollowUpDate && new Date(r.nextFollowUpDate) <= new Date())));

  const columns: Column<ContactRow>[] = [
    { key: "name", label: "Name", sortable: true, render: (r) => <button onClick={() => setOpenId(r.id)} className="text-left font-semibold text-accent hover:underline">{r.name}</button>, exportValue: (r) => r.name },
    { key: "organisation", label: "Organisation", sortable: true, render: (r) => [r.role, r.organisation].filter(Boolean).join(", ") || "—" },
    { key: "sector", label: "Sector", render: (r) => r.sector || "—" },
    { key: "ownerName", label: "Relationship owner", render: (r) => r.ownerName ?? "—" },
    { key: "stage", label: "Stage", sortable: true, render: (r) => <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_STYLE[r.stage]}`}>{t(r.stage)}</span> },
    { key: "nextFollowUpDate", label: "Next follow-up", sortable: true, render: (r) => r.nextFollowUpDate ? <span className={new Date(r.nextFollowUpDate) < new Date() ? "text-red-600 font-medium" : ""}>{showDate(r.nextFollowUpDate)}</span> : "—", exportValue: (r) => r.nextFollowUpDate?.slice(0, 10) ?? "" },
    { key: "lastInteractionAt", label: "Last contact", sortable: true, render: (r) => showDate(r.lastInteractionAt) },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><ContactIcon size={22} /> Strategic contacts</h1>
        <p className="text-sm text-gray-500">Shared across the group. Phone numbers and emails are visible to the relationship owner and leaders; ask the owner for an introduction.</p>
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        title={`${filtered.length} contacts`}
        onAdd={() => setEditing("new")}
        onEdit={(r) => setEditing(r)}
        canEditRow={(r) => r.canEdit}
        onDelete={(r) => confirmAction({ title: `Delete ${r.name}?`, body: "Their interactions and commitments go with them.", confirmLabel: "Delete contact" }).then((ok) => { if (ok) api.delete(`/contacts/${r.id}`).then(() => { toast.success("Contact deleted", { description: r.name }); refresh(); }, (e) => toast.failed("Couldn't delete the contact", e)); })}
        filterBar={
          <div className="flex gap-3 flex-wrap items-center">
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="text-sm border border-border text-foreground rounded-lg px-2 py-1.5"><option value="">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
            <label className="flex items-center gap-1.5 text-sm text-gray-600"><input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Follow-up due</label>
          </div>
        }
      />
      {openId && <ContactDrawer id={openId} onClose={() => setOpenId(null)} onEdit={(c) => { setOpenId(null); setEditing(c); }} />}
      {editing && <ContactSheet contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} onOpen={(id) => { setEditing(null); setOpenId(id); }} />}
    </div>
  );
}

function ContactDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (c: ContactRow) => void }) {
  const qc = useQueryClient();
  const { data: c } = useQuery<Full>({ queryKey: ["contacts", id], queryFn: () => fetcher(`/contacts/${id}`) });
  const [note, setNote] = useState({ summary: "", type: "MEETING", date: new Date().toISOString().slice(0, 10) });
  const [commit, setCommit] = useState({ description: "", owedBy: "US", dueDate: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts"] });
  const add = async (path: string, body: unknown, reset: () => void) => {
    try {
      await api.post(`/contacts/${id}/${path}`, body);
      toast.success(path === "commitments" ? "Commitment added" : "Interaction logged");
      reset(); refresh();
    } catch (e) { toast.failed("Couldn't save that", e); }
  };
  const setStatus = async (cid: string, status: string) => {
    try { await api.put(`/contacts/commitments/${cid}`, { status }); toast.success("Commitment updated"); refresh(); }
    catch (e) { toast.failed("Couldn't update the commitment", e); }
  };
  if (!c) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface text-foreground w-full max-w-lg h-full overflow-y-auto shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div><h2 className="font-semibold text-gray-900">{c.name}</h2><p className="text-xs text-gray-500">{[c.role, c.organisation].filter(Boolean).join(", ")}</p></div>
          <div className="flex items-center gap-2">
            {c.canEdit && <button onClick={() => onEdit(c)} className="px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-lg">Edit</button>}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>
        <div className="p-5 space-y-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {c.contactDetailsHidden ? (
              <div className="col-span-2 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2"><Lock size={12} /> Phone and email are visible to {c.ownerName ?? "the relationship owner"} and leaders. Ask them for an introduction.</div>
            ) : <><Item l="Phone" v={c.phone} /><Item l="Email" v={c.email} /></>}
            <Item l="Sector" v={c.sector} /><Item l="Interests" v={c.interests.join(", ")} />
            <Item l="Relationship owner" v={c.ownerName} /><Item l="Stage" v={t(c.stage)} />
            <Item l="How we met" v={`${t(c.howMet)}${c.howMetDetails ? ` — ${c.howMetDetails}` : ""}`} /><Item l="Introduced by" v={c.introducedBy} />
            <Item l="Next follow-up" v={showDate(c.nextFollowUpDate)} /><Item l="Linked clients" v={c.clients.map((x) => x.name).join(", ")} />
            {c.consentNote && <div className="col-span-2"><Item l="Consent (Data Protection Act)" v={c.consentNote} /></div>}
            {c.privateNotes !== undefined && <div className="col-span-2"><Item l="Private notes" v={c.privateNotes} /></div>}
          </dl>

          <div>
            <p className="text-xs font-semibold text-gray-400 mb-1.5">Commitments</p>
            {c.commitments.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 border-l-2 border-accent/30 pl-3 py-1">
                <div><p className={m.status === "DONE" ? "line-through text-gray-400" : "text-gray-800"}>{m.description}</p>
                  <p className="text-xs text-gray-400">{m.owedBy === "US" ? `We owe it${m.ownerName ? ` (${m.ownerName})` : ""}` : "They owe it"}{m.dueDate ? ` · by ${showDate(m.dueDate)}` : ""}{m.status === "OPEN" && m.dueDate && new Date(m.dueDate) < new Date() ? " · overdue" : ""}</p></div>
                <select value={m.status} onChange={(e) => setStatus(m.id, e.target.value)} className="text-xs border border-border text-foreground rounded px-1 py-1">{["OPEN", "DONE", "CANCELLED"].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 mt-2">
              <input value={commit.description} onChange={(e) => setCommit({ ...commit, description: e.target.value })} placeholder="Something agreed…" className={`${inputCls} flex-1 min-w-40`} />
              <select value={commit.owedBy} onChange={(e) => setCommit({ ...commit, owedBy: e.target.value })} className="text-sm border border-border bg-surface text-foreground rounded-lg px-2"><option value="US">We owe</option><option value="THEM">They owe</option></select>
              <input type="date" value={commit.dueDate} onChange={(e) => setCommit({ ...commit, dueDate: e.target.value })} className="text-sm border border-border bg-surface text-foreground rounded-lg px-2" />
              <button disabled={!commit.description.trim()} onClick={() => add("commitments", { ...commit, dueDate: commit.dueDate || null }, () => setCommit({ description: "", owedBy: "US", dueDate: "" }))} className="px-3 py-1.5 text-sm bg-accent text-accent-foreground rounded-lg disabled:opacity-50">Add</button>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 mb-1.5">Conversations</p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-3">
              <textarea value={note.summary} onChange={(e) => setNote({ ...note, summary: e.target.value })} rows={2} placeholder="What was discussed?" className={`${inputCls} resize-none`} />
              <div className="flex gap-2">
                <select value={note.type} onChange={(e) => setNote({ ...note, type: e.target.value })} className="text-sm border border-border bg-surface text-foreground rounded-lg px-2">{["MEETING", "CALL", "EMAIL", "EVENT", "OTHER"].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select>
                <input type="date" value={note.date} onChange={(e) => setNote({ ...note, date: e.target.value })} className="text-sm border border-border bg-surface text-foreground rounded-lg px-2" />
                <button disabled={!note.summary.trim()} onClick={() => add("interactions", note, () => setNote({ ...note, summary: "" }))} className="ml-auto px-3 py-1.5 text-sm bg-accent text-accent-foreground rounded-lg disabled:opacity-50">Log</button>
              </div>
            </div>
            {c.interactions.map((i) => (
              <div key={i.id} className="border-l-2 border-gray-200 pl-3 py-1 mb-2">
                <p className="text-xs text-gray-400">{t(i.type)} · {showDate(i.date)}{i.loggedByName ? ` · ${i.loggedByName}` : ""}</p>
                <p className="text-gray-700 whitespace-pre-wrap">{i.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ l, v }: { l: string; v?: string | null }) {
  return <div><dt className="text-xs text-gray-400">{l}</dt><dd className="text-gray-800 mt-0.5 whitespace-pre-wrap">{v || "—"}</dd></div>;
}
