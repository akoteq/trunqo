"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { confirmAction } from "@/components/Confirm";
import { DataTable } from "@/components/DataTable";
import { PriorityBadge, InvoiceStatusBadge } from "@/components/Badges";
import { WizardShell, useWizard } from "@/app/(app)/leads/components/WizardShell";
import { DEAL_STEPS, DealStatusBadge, DealValueFields, dealMoneyText, dealStatus, dealValueBody, dealValueOf, useNewDealLink, type NewDealLink } from "@/components/deals/dealMoney";
import { useAuth } from "@/components/AuthProvider";
import { isStaff } from "@/lib/auth";
import { ClientSelect, type ClientOption } from "@/components/ClientSelect";
import { AssigneesField } from "@/components/AssigneesField";
import Link from "next/link";
import { DealPayments } from "@/components/DealPayments";
import {
  BusinessCell, DItem, DealDrawer, DealsLayout, DealsSummary, DrawerMoney, Field, FilterSelect, FormSelect, LongField, MoneyCell, SelectField, TextArea, TierBadge, inputCls, labelCls,
} from "@/components/deals/DealsUi";

type TradelineDeal = {
  id: string;
  bizId: string | null;
  serialNo: number | null;
  businessName: string;
  smeId: string | null;
  valueChain: string | null;
  bdoId: string | null;
  bdo: { id: string; name: string } | null;
  tier: string;
  email: string | null;
  telephone: string | null;
  currentStatus: string | null;
  nextAction: string | null;
  revenuePotentialGhs: number | null;
  dueDate: string | null;
  expectedRevenueReceivedGhs: number | null;
  revenueReceivedGhs: number | null;
  balanceGhs: number | null;
  paymentStatus: string;
  invoiceStatus: string;
  currency: string | null;
  exchangeRate: number | null;
  dealStage: string;
  priority: string;
  dealHealth: string;
  dealValue?: number | null;
  expectedPaymentDate?: string | null;
};

type BdoOption = { id: string; name: string; company: string };

const TIER_OPTS = ["TIER_1", "TIER_2", "TIER_3"];
const PRIORITY_OPTS = ["HIGH", "MEDIUM", "LOW"];
const INVOICE_OPTS = ["NOT_INVOICED", "INVOICED", "PAID", "OVERDUE"];

const EMPTY_FORM = {
  businessName: "", smeId: "", valueChain: "", email: "", telephone: "",
  currentStatus: "", nextAction: "",
  bdoId: "",
  dealValue: "", expectedPaymentDate: "",
  tier: "TIER_1",
  priority: "MEDIUM", invoiceStatus: "NOT_INVOICED",
  currency: "GHS", exchangeRate: "",
};


export default function TradelinePipelinePage() {
  const { user } = useAuth();
  const isBdoRole = isStaff(user);
  const [filters, setFilters] = useState({ bdo: "", tier: "", priority: "" });
  const [prefill, setPrefill] = useState<NewDealLink | null>(null);
  useNewDealLink(useCallback((link: NewDealLink) => { setPrefill(link); setEditing(null); setShowForm(true); }, []));
  const [editing, setEditing] = useState<TradelineDeal | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<TradelineDeal | null>(null);
  const qc = useQueryClient();

  // Scope to the logged-in BDO's own deals; otherwise pick up a ?bdo= link from elsewhere in the app.
  useEffect(() => {
    if (isBdoRole && user?.bdoName) {
      setFilters((f) => ({ ...f, bdo: user.bdoName as string }));
    } else {
      const bdo = new URLSearchParams(window.location.search).get("bdo");
      if (bdo) setFilters((f) => ({ ...f, bdo }));
    }
  }, [isBdoRole, user?.bdoName]);

  const { data: bdos = [] } = useQuery<BdoOption[]>({
    queryKey: ["bdos"],
    queryFn: () => fetcher("/bdo"),
    enabled: !isBdoRole,
  });
  const tradelineBdos = bdos.filter((b) => b.company === "TRADELINE");

  const { data: smeRes } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["sme-options"],
    queryFn: () => fetcher("/sme"),
  });
  const clients = smeRes?.data ?? [];

  const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
  const { data = [], isLoading } = useQuery<TradelineDeal[]>({
    queryKey: ["tradeline", filters],
    queryFn: () => fetcher(`/tradeline?${params}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tradeline/${id}`),
    onSuccess: () => { toast.success("Deal deleted"); qc.invalidateQueries({ queryKey: ["tradeline"] }); },
    onError: (err) => toast.failed("Couldn't delete this deal", err),
  });

  const live = data.filter((d) => d.dealStage !== "CLOSED_LOST");
  const totalValue = live.reduce((s, d) => s + (d.expectedRevenueReceivedGhs ?? d.revenuePotentialGhs ?? 0), 0);
  const totalRevenue = data.reduce((s, d) => s + (d.revenueReceivedGhs ?? 0), 0);
  const totalOutstanding = live.reduce((s, d) => s + (d.balanceGhs ?? 0), 0);

  const openNew = () => { setEditing(null); setShowForm(true); };

  const columns = [
    { key: "serialNo", label: "#", sortable: true, width: "50px", render: (r: TradelineDeal) => <span className="tabular-nums text-muted">{r.serialNo ?? "—"}</span> },
    { key: "businessName", label: "Business", sortable: true, render: (r: TradelineDeal) => <BusinessCell name={r.businessName} onOpen={() => setDetail(r)} /> },
    { key: "valueChain", label: "Value Chain", render: (r: TradelineDeal) => r.valueChain ?? "—" },
    { key: "bdo", label: "BDO", render: (r: TradelineDeal) => r.bdo?.name ?? "—" },
    { key: "tier", label: "Tier", sortable: true, render: (r: TradelineDeal) => <TierBadge tier={r.tier} /> },
    { key: "priority", label: "Priority", render: (r: TradelineDeal) => <PriorityBadge value={r.priority} />, sortable: true },
    { key: "dealValue", label: "Deal value", sortable: true, render: (r: TradelineDeal) => <MoneyCell text={dealValueOf(r) ? `${r.currency ?? "GHS"} ${Number(dealValueOf(r)).toLocaleString()}` : "—"} /> },
    { key: "revenueReceivedGhs", label: "Received", sortable: true, render: (r: TradelineDeal) => <MoneyCell strong text={dealMoneyText(r.revenueReceivedGhs ?? 0, r)} /> },
    { key: "balanceGhs", label: "Balance", sortable: true, render: (r: TradelineDeal) => <MoneyCell highlight={!!r.balanceGhs && r.balanceGhs > 0} text={dealStatus(r) === "CANCELLED" ? "—" : dealMoneyText(r.balanceGhs, r)} /> },
    { key: "paymentStatus", label: "Status", render: (r: TradelineDeal) => <DealStatusBadge deal={r} /> },
    { key: "invoiceStatus", label: "Invoice", sortable: true, render: (r: TradelineDeal) => <InvoiceStatusBadge value={r.invoiceStatus ?? "NOT_INVOICED"} /> },
    { key: "nextAction", label: "Next action", render: (r: TradelineDeal) => <span className="block max-w-[160px] truncate text-muted">{r.nextAction ?? "—"}</span> },
  ];

  return (
    <DealsLayout
      title="Tradeline deals"
      subtitle={isBdoRole ? "Your won work: what each deal is worth, the money received and the balance still to come in." : "Won work: what each deal is worth, the money received and the balance still to come in."}
      onAdd={openNew}
    >
      <DealsSummary count={data.length} value={totalValue} received={totalRevenue} balance={totalOutstanding} />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        title={`${data.length} deal${data.length === 1 ? "" : "s"}`}
        onAdd={openNew}
        onEdit={(row) => { setEditing(row); setShowForm(true); }}
        onDelete={(row) => {
          confirmAction({ title: `Delete the deal for ${row.businessName}?`, body: "This can't be undone.", confirmLabel: "Delete deal" }).then((ok) => { if (ok) deleteMutation.mutate(row.id); });
        }}
        filterBar={
          <div className="flex gap-2 flex-wrap">
            {!isBdoRole && (
              <FilterSelect label="BDO" value={filters.bdo} options={[{ value: "", label: "All BDOs" }, ...tradelineBdos.map((b) => ({ value: b.name, label: b.name }))]} onChange={(v) => setFilters((f) => ({ ...f, bdo: v }))} />
            )}
            <FilterSelect label="Tier" value={filters.tier} options={[{ value: "", label: "All tiers" }, ...TIER_OPTS.map((t) => ({ value: t, label: t.replace("_", " ") }))]} onChange={(v) => setFilters((f) => ({ ...f, tier: v }))} />
            <FilterSelect label="Priority" value={filters.priority} options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTS.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))]} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))} />
          </div>
        }
      />

      {showForm && (
        <DealFormModal
          deal={editing}
          prefill={prefill}
          bdos={tradelineBdos}
          clients={clients}
          isBdoRole={isBdoRole}
          currentBdoId={user?.bdoId ?? null}
          onClose={() => { setShowForm(false); setPrefill(null); }}
          onSaved={() => { setShowForm(false); setPrefill(null); qc.invalidateQueries({ queryKey: ["tradeline"] }); }}
        />
      )}

      {detail && (
        <DetailDrawer
          deal={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); setShowForm(true); }}
          onChanged={() => { setDetail(null); qc.invalidateQueries({ queryKey: ["tradeline"] }); }}
        />
      )}
    </DealsLayout>
  );
}

// ─── Add / Edit modal ──────────────────────────────────────────────────────────

function DealFormModal({ deal, prefill, bdos, clients, isBdoRole, currentBdoId, onClose, onSaved }: { deal: TradelineDeal | null; prefill: NewDealLink | null; bdos: BdoOption[]; clients: ClientOption[]; isBdoRole: boolean; currentBdoId: string | null; onClose: () => void; onSaved: () => void }) {
  const dCur = deal?.currency ?? "GHS";
  const dRate = deal?.exchangeRate ?? 1;
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ...(isBdoRole && currentBdoId ? { bdoId: currentBdoId } : {}),
    ...(deal ? {
      businessName: deal.businessName,
      smeId: deal.smeId ?? "",
      valueChain: deal.valueChain ?? "",
      email: deal.email ?? "",
      telephone: deal.telephone ?? "",
      currentStatus: deal.currentStatus ?? "",
      nextAction: deal.nextAction ?? "",
      bdoId: deal.bdoId ?? "",
      dealValue: dealValueOf(deal),
      expectedPaymentDate: (deal.expectedPaymentDate ?? deal.dueDate ?? "").slice(0, 10),
      currency: dCur,
      exchangeRate: dCur === "GHS" ? "" : String(dRate),
      tier: deal.tier,
      priority: deal.priority,
      invoiceStatus: deal.invoiceStatus ?? "NOT_INVOICED",
    } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [assigned, setAssigned] = useState<string[]>((deal as { assignedBdoIds?: string[] } | null)?.assignedBdoIds ?? []);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const { step, dir, reached, go, last } = useWizard(DEAL_STEPS.length, deal ? DEAL_STEPS.length - 1 : 0);
  const hasClient = !!form.businessName.trim();

  // Coming from a converted lead: the client and estimated value are filled in.
  useEffect(() => {
    if (!prefill || form.smeId) return;
    const m = clients.find((c) => c.id === prefill.smeId);
    if (m) setForm((f) => ({ ...f, smeId: m.id, businessName: m.companyName, valueChain: m.valueChain ?? "", email: m.email ?? "", telephone: m.phone ?? "", dealValue: prefill.value || f.dealValue }));
  }, [prefill, clients, form.smeId]);

  const save = async () => {
    if (!deal && !form.smeId) { setError("Please select a client."); return; }
    if (!form.businessName.trim()) { setError("Please select a client."); return; }
    setSaving(true); setError("");
    const body = {
      ...form,
      ...dealValueBody(form),
      smeId: form.smeId || null,
      bdoId: form.bdoId || null,
      valueChain: form.valueChain || null,
      email: form.email || null,
      telephone: form.telephone || null,
      currentStatus: form.currentStatus || null,
      nextAction: form.nextAction || null,
      assignedBdoIds: assigned,
    };
    try {
      if (deal) await api.put(`/tradeline/${deal.id}`, body);
      else await api.post("/tradeline", body);
      toast.success(deal ? "Deal updated" : "Deal added", { description: form.businessName.trim() || undefined });
      onSaved();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "We couldn't save this deal. Please try again.");
    }
    finally { setSaving(false); }
  };

  return (
    <WizardShell
      steps={DEAL_STEPS} step={step} dir={dir} reached={reached} onGo={go} onClose={onClose} error={error}
      primary={last
        ? { label: saving ? "Saving…" : deal ? "Update deal" : "Add deal", disabled: saving || !hasClient, onClick: save }
        : { label: "Continue", disabled: !hasClient, onClick: () => go(step + 1) }}
    >
      {step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
              <ClientSelect
                label="Client *"
                value={form.smeId}
                options={clients}
                fallbackLabel={form.businessName || undefined}
                onChange={(id) => {
                  const match = clients.find((c) => c.id === id);
                  setForm((f) => ({
                    ...f,
                    smeId: id,
                    businessName: match?.companyName ?? "",
                    valueChain: match?.valueChain ?? f.valueChain,
                    email: match?.email ?? f.email,
                    telephone: match?.phone ?? f.telephone,
                  }));
                }}
              />
              <p className="text-[11px] text-muted mt-1">
                Picking a client fills in their details. Don&apos;t see them? <Link href="/sme" className="text-accent hover:underline">Add them on the Clients page first →</Link>
              </p>
          </div>
          <Field wide label="Value chain / sector" value={form.valueChain} onChange={(v) => set("valueChain", v)} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
          <Field label="Telephone" value={form.telephone} onChange={(v) => set("telephone", v)} />
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          {!isBdoRole && (
            <SelectField label="Who owns this deal?" value={form.bdoId} onChange={(v) => set("bdoId", v)}>
              <option value="">— Unassigned —</option>
              {bdos.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </SelectField>
          )}
          <AssigneesField value={assigned} onChange={setAssigned} people={bdos} ownerId={form.bdoId} />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="Tier" value={form.tier} options={TIER_OPTS} onChange={(v) => set("tier", v)} />
            <FormSelect label="Priority" value={form.priority} options={PRIORITY_OPTS} onChange={(v) => set("priority", v)} />
          </div>
          <TextArea label="Current status / updates" value={form.currentStatus} onChange={(v) => set("currentStatus", v)} rows={3} />
          <TextArea label="Next action required" value={form.nextAction} onChange={(v) => set("nextAction", v)} />
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <DealValueFields form={form} set={(k, v) => set(k, v)} inputClass={inputCls} labelClass={labelCls} />
          <FormSelect label="Invoice status" value={form.invoiceStatus} options={INVOICE_OPTS} onChange={(v) => set("invoiceStatus", v)} />
        </div>
      )}
    </WizardShell>
  );
}

// ─── Detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ deal, onClose, onEdit, onChanged }: { deal: TradelineDeal; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  return (
    <DealDrawer title={deal.businessName} subtitle={deal.bizId ?? `Serial #${deal.serialNo ?? "—"}`} onClose={onClose} onEdit={onEdit}>
      <div className="flex flex-wrap gap-2">
        <DealStatusBadge deal={deal} />
        <PriorityBadge value={deal.priority} />
        <TierBadge tier={deal.tier} />
        <InvoiceStatusBadge value={deal.invoiceStatus ?? "NOT_INVOICED"} />
      </div>
      <DrawerMoney
        value={dealValueOf(deal) ? `${deal.currency ?? "GHS"} ${Number(dealValueOf(deal)).toLocaleString()}` : "—"}
        received={dealMoneyText(deal.revenueReceivedGhs ?? 0, deal)}
        balance={dealStatus(deal) === "CANCELLED" ? "—" : dealMoneyText(deal.balanceGhs, deal)}
      />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <DItem label="Value chain" value={deal.valueChain} />
        <DItem label="BDO" value={deal.bdo?.name} />
        <DItem label="Email" value={deal.email} />
        <DItem label="Telephone" value={deal.telephone} />
        <DItem label="Expected payment" value={deal.expectedPaymentDate || deal.dueDate ? new Date((deal.expectedPaymentDate ?? deal.dueDate) as string).toLocaleDateString() : null} />
      </dl>
      <DealPayments source="TRADELINE" dealId={deal.id} company="TRADELINE" dealName={deal.businessName} cancelled={deal.dealStage === "CLOSED_LOST"} endpoint={`/tradeline/${deal.id}`} onChanged={onChanged} />
      {deal.nextAction && <LongField label="Next action required" value={deal.nextAction} accent />}
      {deal.currentStatus && <LongField label="Current status / updates" value={deal.currentStatus} />}
    </DealDrawer>
  );
}
