"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { isGroupOwner } from "@/lib/auth";
import { useCompanies } from "@/lib/companies";
import { toast } from "@/components/Toast";
import { confirmAction } from "@/components/Confirm";
import { site } from "@/lib/site";

// Help & Glossary. The entries come from the server: shared ones explain how the system works
// and everyone sees them; company ones are seen only by that company (and the Group Owner), so
// each company has its own glossary. The Group Owner edits anything and can view the page as one
// company sees it; a Business CEO edits their own company's entries; everyone else reads.

type Entry = { id: string; company: string | null; section: string; term: string; description: string; order: number; canEdit: boolean };
type GlossaryRes = { entries: Entry[]; canAddShared: boolean; canAddFor: string | null };
type Draft = { id?: string; company: string; section: string; term: string; description: string };

const SHARED = "SHARED";
const inputClass =
  "w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:bg-surface focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors";

const apiError = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Entries grouped into blocks (shared, then each company) and, inside each, sections in order.
type Block = { key: string; company: string | null; sections: { name: string; entries: Entry[] }[] };
function group(entries: Entry[]): Block[] {
  const blocks = new Map<string, Block>();
  for (const e of entries) {
    const key = e.company ?? SHARED;
    if (!blocks.has(key)) blocks.set(key, { key, company: e.company, sections: [] });
    const b = blocks.get(key)!;
    let s = b.sections.find((x) => x.name === e.section);
    if (!s) { s = { name: e.section, entries: [] }; b.sections.push(s); }
    s.entries.push(e);
  }
  return [...blocks.values()].sort((a, b) => (a.company === null ? -1 : b.company === null ? 1 : 0));
}

export default function HelpPage() {
  const { user } = useAuth();
  const owner = isGroupOwner(user);
  const { companies, byKey } = useCompanies();
  const qc = useQueryClient();
  // The Group Owner can see every company's entries, only the shared ones, or the page as one company sees it.
  const [view, setView] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<GlossaryRes>({
    queryKey: ["glossary", view],
    queryFn: () => fetcher(`/glossary${view ? `?company=${encodeURIComponent(view)}` : ""}`),
    enabled: !!user,
  });

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () => (data?.entries ?? []).filter((e) => !q || e.term.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.section.toLowerCase().includes(q)),
    [data, q],
  );
  const blocks = group(shown);
  const companyName = (key: string | null) => (key ? (byKey[key]?.name ?? key) : "");
  const ownCompany = !owner ? (user?.bdoCompany ?? null) : null;
  // A Business CEO whose company has no entries yet still gets its (empty) block, to start one.
  const ceoCompany = data?.canAddFor && data.canAddFor !== "ANY" ? data.canAddFor : null;
  if (ceoCompany && !q && !blocks.some((b) => b.company === ceoCompany)) blocks.push({ key: ceoCompany, company: ceoCompany, sections: [] });

  const canAdd = !!data && (data.canAddShared || !!data.canAddFor);
  const newDraft = (company: string | null): Draft => ({ company: company ?? (owner ? (view && view !== SHARED ? view : SHARED) : (ceoCompany ?? SHARED)), section: "", term: "", description: "" });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/glossary/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["glossary"] }); toast.success("Entry deleted"); },
    onError: (err) => toast.error("Couldn't delete that entry", { description: apiError(err, "Please try again.") }),
  });
  const askDelete = async (e: Entry) => {
    if (await confirmAction({ title: `Delete "${e.term}"?`, body: "It disappears from the glossary for everyone who sees it.", confirmLabel: "Delete" })) remove.mutate(e.id);
  };

  return (
    <div className="p-4 md:p-6 pb-24 space-y-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-foreground">Help &amp; Glossary</h1>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            What the words in {site.name} mean and how it works. The first part applies to everyone;
            {owner ? " each company also has its own terms below." : ownCompany ? ` the terms under ${companyName(ownCompany)} are your company's own.` : ""}
          </p>
        </div>
        {canAdd && (
          <button
            onClick={() => setDraft(newDraft(null))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            <Plus size={15} /> Add an entry
          </button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the glossary"
            aria-label="Search the glossary"
            className="w-full h-9 bg-surface border border-border rounded-lg pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </label>
        {owner && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Show
            <select value={view} onChange={(e) => setView(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground">
              <option value="">Every company</option>
              <option value={SHARED}>Shared entries only</option>
              {companies.map((c) => <option key={c.key} value={c.key}>As {c.name} sees it</option>)}
            </select>
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-subtle animate-pulse" />)}</div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
          We couldn&apos;t load the glossary. <button onClick={() => refetch()} className="font-medium text-accent hover:underline">Try again</button>
        </div>
      ) : blocks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
          {q ? `Nothing in the glossary matches "${search.trim()}".` : "The glossary is empty."}
        </div>
      ) : (
        <>
          <nav className="bg-surface rounded-xl border border-border shadow-card p-4">
            <p className="type-colhead mb-3">On this page</p>
            <div className="space-y-3">
              {blocks.map((b) => (
                <div key={b.key}>
                  {(b.company || blocks.length > 1) && <p className="text-xs font-semibold text-foreground mb-1">{b.company ? companyName(b.company) : "Everyone"}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                    {b.sections.map((s) => (
                      <a key={s.name} href={`#${b.key}-${slug(s.name)}`} className="text-sm text-accent hover:text-accent/80 hover:underline underline-offset-2">{s.name}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {blocks.map((b) => (
            <div key={b.key} className="space-y-4">
              {b.company && (
                <div className="pt-2">
                  <h2 className="text-lg font-semibold text-foreground">{companyName(b.company)}</h2>
                  <p className="text-sm text-muted">Only people at {companyName(b.company)}{owner ? "" : " (and the Group Owner)"} see these terms.</p>
                </div>
              )}
              {b.sections.length === 0 && (
                <div className="rounded-xl border border-dashed border-border bg-surface p-5 text-sm text-muted">
                  No terms for {companyName(b.company)} yet. Add the words your team uses: your services, what you record about clients, how you work.
                  <button onClick={() => setDraft(newDraft(b.company))} className="ml-1 font-medium text-accent hover:underline">Add the first one</button>
                </div>
              )}
              {b.sections.map((s) => (
                <section key={s.name} id={`${b.key}-${slug(s.name)}`} className="scroll-mt-4 bg-surface rounded-xl border border-border shadow-card p-5">
                  <h3 className="text-base font-semibold text-foreground mb-3">{s.name}</h3>
                  <dl className="divide-y divide-border">
                    {s.entries.map((e) => (
                      <div key={e.id} className="group grid grid-cols-1 sm:grid-cols-[220px_1fr_auto] gap-1 sm:gap-4 py-3 first:pt-0 last:pb-0">
                        <dt className="text-sm font-semibold text-foreground">{e.term}</dt>
                        <dd className="text-sm text-muted leading-relaxed whitespace-pre-line">{e.description}</dd>
                        {e.canEdit && (
                          <div className="flex items-start gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                            <button onClick={() => setDraft({ id: e.id, company: e.company ?? SHARED, section: e.section, term: e.term, description: e.description })} aria-label={`Edit ${e.term}`} className="rounded-md p-1.5 text-muted hover:bg-foreground/5 hover:text-foreground"><Pencil size={14} /></button>
                            <button onClick={() => askDelete(e)} aria-label={`Delete ${e.term}`} className="rounded-md p-1.5 text-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ))}
        </>
      )}

      <p className="text-xs text-muted pt-2">
        {canAdd ? "Something unclear or missing? Add or edit an entry above." : "Something unclear or missing? Ask your Business CEO to add it."}
      </p>

      {draft && (
        <EntryDialog
          draft={draft}
          owner={owner}
          lockedCompany={owner ? null : ceoCompany}
          sections={(data?.entries ?? []).filter((e) => (e.company ?? SHARED) === draft.company).map((e) => e.section)}
          companies={companies.map((c) => ({ key: c.key, name: c.name }))}
          onClose={() => setDraft(null)}
          onSaved={() => { setDraft(null); qc.invalidateQueries({ queryKey: ["glossary"] }); }}
        />
      )}
    </div>
  );
}

function EntryDialog({ draft, owner, lockedCompany, sections, companies, onClose, onSaved }: {
  draft: Draft;
  owner: boolean;
  lockedCompany: string | null;
  sections: string[];
  companies: { key: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [error, setError] = useState("");
  const set = (k: keyof Draft, v: string) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () => {
      const body = { section: form.section.trim(), term: form.term.trim(), description: form.description.trim(), ...(owner ? { company: form.company } : {}) };
      return draft.id ? api.put(`/glossary/${draft.id}`, body) : api.post("/glossary", body);
    },
    onSuccess: () => { toast.success(draft.id ? "Entry updated" : "Entry added", { description: form.term.trim() }); onSaved(); },
    onError: (err) => setError(apiError(err, "We couldn't save that. Please try again.")),
  });
  const ready = form.section.trim() && form.term.trim() && form.description.trim();
  const lockedName = lockedCompany ? (companies.find((c) => c.key === lockedCompany)?.name ?? lockedCompany) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog" aria-modal="true" aria-label={draft.id ? "Edit glossary entry" : "Add glossary entry"}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate(); }}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-serif text-lg text-foreground">{draft.id ? "Edit entry" : "Add an entry"}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Who sees it</p>
            {owner ? (
              <select value={form.company} onChange={(e) => set("company", e.target.value)} className={inputClass}>
                <option value={SHARED}>Everyone (shared)</option>
                {companies.map((c) => <option key={c.key} value={c.key}>Only {c.name}</option>)}
              </select>
            ) : (
              <p className="text-sm text-muted">Only people at {lockedName ?? "your company"}.</p>
            )}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Section</span>
            <input value={form.section} onChange={(e) => set("section", e.target.value)} list="glossary-sections" placeholder="e.g. Services" className={inputClass} maxLength={80} />
            <datalist id="glossary-sections">{[...new Set(sections)].map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Term</span>
            <input value={form.term} onChange={(e) => set("term", e.target.value)} placeholder="The word or phrase" className={inputClass} maxLength={120} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">What it means</span>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Explain it in plain words" className={inputClass} maxLength={2000} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted hover:text-foreground">Cancel</button>
          <button type="submit" disabled={!ready || save.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60">
            {save.isPending && <Loader2 size={14} className="animate-spin" />} {draft.id ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
