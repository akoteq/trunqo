"use client";

import { clsx } from "clsx";
import { CircleDollarSign, Layers, Plus, TrendingUp, Wallet, X } from "lucide-react";

// The look shared by every company's Deals page (BAPX, Tradeline and the companies added later):
// page header, summary tiles, filters, form fields and the detail drawer. Theme colours only, so
// the pages follow light and dark mode like the rest of the app.

export const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30";
export const labelCls = "text-xs font-medium text-muted block mb-1";
const filterCls = "text-sm rounded-lg border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

export const fmtGhs = (n: number | null | undefined) =>
  n != null ? n.toLocaleString("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }) : "—";

// ─── Page ────────────────────────────────────────────────────────────────────

// Same shape as Leads, Finance and the company Dashboard: title and description on the left, the
// main action on the right, full width with the standard page padding.
export function DealsLayout({ title, subtitle, onAdd, children }: { title: string; subtitle: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl text-foreground md:text-4xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-base text-muted">{subtitle}</p>
        </div>
        {onAdd && (
          <button onClick={onAdd} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
            <Plus size={16} /> New deal
          </button>
        )}
      </header>
      {children}
    </div>
  );
}

/** Totals in GHS. Pass cancelled deals in `count` but leave them out of value and balance. */
export function DealsSummary({ count, value, received, balance }: { count: number; value: number; received: number; balance: number }) {
  const collected = value > 0 ? Math.round((received / value) * 100) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Layers} label="Deals" value={count.toLocaleString()} />
      <StatCard icon={Wallet} label="Deal value" value={fmtGhs(value)} />
      <StatCard icon={CircleDollarSign} label="Received" value={fmtGhs(received)} note={collected != null ? `${Math.min(collected, 100)}% collected` : undefined} />
      <StatCard icon={TrendingUp} label="Balance" value={fmtGhs(balance)} note={balance > 0 ? "Still to come in" : undefined} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, note }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-2xl font-semibold leading-none tabular-nums text-foreground">{value}</span>
        <span className="mt-1 block truncate text-sm font-medium text-muted">{label}</span>
        {note && <span className="block truncate text-[11px] text-muted">{note}</span>}
      </span>
    </div>
  );
}

// ─── Table cells ─────────────────────────────────────────────────────────────

export function BusinessCell({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="block max-w-[180px] truncate text-left font-semibold text-accent hover:underline">{name}</button>
  );
}

export function MoneyCell({ text, strong, highlight }: { text: string; strong?: boolean; highlight?: boolean }) {
  return <span className={clsx("tabular-nums", highlight ? "font-medium text-accent" : strong ? "font-medium text-foreground" : "text-foreground")}>{text}</span>;
}

export function TierBadge({ tier }: { tier?: string | null }) {
  if (!tier) return <>—</>;
  return <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{tier.replace("_", " ")}</span>;
}

// ─── Filters and form fields ─────────────────────────────────────────────────

export function FilterSelect({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={filterCls}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Field({ label, value, onChange, type = "text", wide }: { label: string; value: string; onChange: (v: string) => void; type?: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

export function TextArea({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={`${inputCls} resize-none`} />
    </div>
  );
}

/** A select with free-form children (e.g. a "— Unassigned —" option first). */
export function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>{children}</select>
    </div>
  );
}

/** A select over fixed codes, shown with underscores as spaces. */
export function FormSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <SelectField label={label} value={value} onChange={onChange}>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
    </SelectField>
  );
}

// ─── Detail drawer ───────────────────────────────────────────────────────────

export function DealDrawer({ title, subtitle, onClose, onEdit, children }: {
  title: string; subtitle?: string | null; onClose: () => void; onEdit: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-foreground/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="break-words font-serif text-lg text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={onEdit} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90">Edit</button>
            <button onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground"><X size={18} /></button>
          </div>
        </div>
        <div className="space-y-5 p-5">{children}</div>
      </div>
    </div>
  );
}

/** Deal value, received and balance as three small tiles at the top of the drawer. */
export function DrawerMoney({ value, received, balance }: { value: string; received: string; balance: string }) {
  const tile = (label: string, v: string, accent?: boolean) => (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={clsx("mt-1 text-sm font-semibold tabular-nums", accent ? "text-accent" : "text-foreground")}>{v}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      {tile("Deal value", value)}
      {tile("Received", received)}
      {tile("Balance", balance, balance !== "—")}
    </div>
  );
}

export function DItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{value || "—"}</dd>
    </div>
  );
}

export function LongField({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? "rounded-lg bg-accent/10 p-3" : ""}>
      <p className={clsx("mb-1.5 text-xs font-semibold", accent ? "text-accent" : "text-muted")}>{label}</p>
      <p className={clsx("whitespace-pre-wrap text-sm leading-relaxed text-foreground", !accent && "rounded-lg bg-background p-3")}>{value}</p>
    </div>
  );
}
