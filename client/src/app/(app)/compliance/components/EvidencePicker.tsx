"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { Label } from "../../leads/components/fields";
import { apiError } from "../../leads/components/lib";
import type { ClientDoc } from "./lib";

export const useClientDocs = (smeId: string) =>
  useQuery<ClientDoc[]>({ queryKey: ["client-documents", smeId], queryFn: () => fetcher(`/client-documents?smeId=${smeId}`), enabled: !!smeId });

// Pick the client's documents that prove a record, or upload a new one (it's ticked straight away).
// Used by the record form, the renewal sheet and the quick "Add evidence" sheet.
export function EvidencePicker({ smeId, value, onChange, onError, hint = "(certificate, receipt, letter)", warning }: {
  smeId: string; value: string[]; onChange: (ids: string[]) => void; onError: (msg: string) => void; hint?: string;
  /** Shown under the list while nothing is ticked. */
  warning?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const { data: docs = [] } = useClientDocs(smeId);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !smeId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("smeId", smeId); fd.append("category", "COMPLIANCE_EVIDENCE");
    if (user?.email) fd.append("uploadedBy", user.email);
    try {
      const { data } = await api.post<{ id: string }>("/client-documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange([...value, data.id]);
      qc.invalidateQueries({ queryKey: ["client-documents", smeId] });
    } catch (err) { onError(apiError(err, "Upload failed.")); }
    finally { setUploading(false); e.target.value = ""; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label hint={hint}>Evidence</Label>
        <label className="text-xs font-medium text-accent cursor-pointer flex items-center gap-1 hover:underline">
          <Paperclip size={12} /> {uploading ? "Uploading…" : "Upload"}
          <input type="file" className="hidden" onChange={upload} disabled={uploading} />
        </label>
      </div>
      {docs.length === 0 ? <p className="text-xs text-muted">No documents for this client yet.</p> : (
        <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-xl border border-border p-2.5">
          {docs.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-accent" checked={value.includes(d.id)}
                onChange={(e) => onChange(e.target.checked ? [...value, d.id] : value.filter((x) => x !== d.id))} />
              <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate text-foreground hover:underline">{d.fileName}</a>
            </label>
          ))}
        </div>
      )}
      {warning && value.length === 0 && <p className="text-xs text-amber-700 mt-1.5">{warning}</p>}
    </div>
  );
}

/** The record's evidence files, with image previews, for reading rather than picking. */
export function EvidenceList({ smeId, ids, previews = false }: { smeId: string; ids: string[]; previews?: boolean }) {
  const { data: docs = [], isLoading } = useClientDocs(smeId);
  const files = docs.filter((d) => ids.includes(d.id));
  if (!ids.length) return <p className="text-sm text-amber-700">No evidence attached.</p>;
  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (!files.length) return <p className="text-sm text-muted">The attached files are no longer on the client&apos;s documents.</p>;
  return (
    <ul className="space-y-2">
      {files.map((d) => {
        const image = previews && (d.fileType?.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(d.fileName));
        return (
          <li key={d.id} className="rounded-lg border border-border overflow-hidden">
            {image && (
              <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="block bg-foreground/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.fileUrl} alt={d.fileName} className="max-h-72 w-full object-contain" />
              </a>
            )}
            <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm text-accent hover:underline">
              <Paperclip size={13} className="shrink-0" /><span className="truncate">{d.fileName}</span><span className="ml-auto text-xs text-muted shrink-0">Open</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
