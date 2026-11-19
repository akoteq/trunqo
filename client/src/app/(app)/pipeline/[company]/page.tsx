"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, fetcher } from "@/lib/api";
import { toast } from "@/components/Toast";
import { confirmAction } from "@/components/Confirm";
import { useCompanies } from "@/lib/companies";
import { DataTable } from "@/components/DataTable";
import { PriorityBadge, InvoiceStatusBadge } from "@/components/Badges";
import { WizardShell, useWizard } from "@/app/(app)/leads/components/WizardShell";
import { DEAL_STEPS, DealStatusBadge, DealValueFields, dealMoneyText, dealStatus, dealValueBody, dealValueOf, useNewDealLink, type NewDealLink } from "@/components/deals/dealMoney";
import { ClientSelect, type ClientOption } from "@/components/ClientSelect";
import { AssigneesField } from "@/components/AssigneesField";
import { GHANA_REGIONS } from "@/lib/regions";
import Link from "next/link";
import { DealPayments } from "@/components/DealPayments";
import {
  BusinessCell, DItem, DealDrawer, DealsLayout, DealsSummary, DrawerMoney, Field, FilterSelect, LongField, MoneyCell, SelectField, TextArea, inputCls, labelCls,
} from "@/components/deals/DealsUi";

// ─── Types ─────────────────────────────────────────────────────────────────────
// A deal is won work: a lead becomes a client, and the client gets a deal. Sales stages live on
// leads. A deal holds its value, and its status comes from the money the CEO has added.

type Deal = {
  id: string;
  company: string;
  smeId?: string | null;
  businessName: string;
  clientName?: string | null;
  email?: string | null;
  telephone?: string | null;
  region?: string | null;
  industry?: string | null;
  valueChain?: string | null;
  product?: string | null;
  bdoId?: string | null;
  bdo?: { id: string; name: string } | null;
  dealStage: string;
  dealHealth: string;
  priority: string;
  paymentStatus?: string | null;
  invoiceStatus?: string | null;
  revenuePotentialGhs?: number | null;
  revenueReceivedGhs?: number | null;
  balanceGhs?: number | null;
  currency?: string | null;
  exchangeRate?: number | null;
  dealValue?: number | null;
  expectedPaymentDate?: string | null;
  nextSteps?: string | null;
  nextCallDate?: string | null;
  notes?: string | null;
};

type BdoOption = { id: string; name: string; company: string };

const INVOICE_OPTS = ["NOT_INVOICED", "INVOICED", "PAID", "OVERDUE"];
// Deal status follows the money (dealStatus in components/deals/dealMoney).
const STATUS_OPTS = [
  { value: "UNPAID", label: "Unpaid" }, { value: "PARTIAL", label: "Part paid" }, { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" }, { value: "CANCELLED", label: "Cancelled" },
];

const EMPTY_FORM = {
  smeId: "", businessName: "", clientName: "", email: "", telephone: "", region: "",
  industry: "", valueChain: "", product: "", bdoId: "",
  priority: "MEDIUM", invoiceStatus: "NOT_INVOICED",
  dealValue: "", expectedPaymentDate: "",
  currency: "GHS", exchangeRate: "",
  nextSteps: "", nextCallDate: "", notes: "",
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CompanyPipelinePage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = use(params);
  // The company comes from the live list, so any company added in the admin screen gets a
  // pipeline here. Built-ins resolve instantly from the static fallback; added ones once loaded.
  const { bySlug } = useCompanies();
  const co = bySlug[slug];
  const companyKey = co?.key ?? "";
  const label = co?.name ?? "Deals";

  const qc = useQueryClient();
  const [editing, setEditing]           = useState<Deal | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [detail, setDetail]             = useState<Deal | null>(null);
  const [prefill, setPrefill]           = useState<NewDealLink | null>(null);
  const [filters, setFilters]           = useState({ bdo: "", priority: "", status: "" });
  useNewDealLink(useCallback((link: NewDealLink) => { setPrefill(link); setEditing(null); setShowForm(true); }, []));

  const { data: bdos = [] } = useQuery<BdoOption[]>({
    queryKey: ["bdos"],
    queryFn: () => fetcher("/bdo"),
  });

  const { data: smeRes } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["sme-options"],
    queryFn: () => fetcher("/sme"),
  });
  const clients = smeRes?.data ?? [];

  const qp = new URLSearchParams({ company: companyKey });

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["company-deals", companyKey],
    queryFn: () => fetcher(`/company-deals?${qp}`),
    enabled: !!companyKey,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["company-deals", companyKey] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/company-deals/${id}`),
    onSuccess: () => { toast.success("Deal deleted"); invalidate(); },
    onError: (err) => toast.failed("Couldn't delete this deal", err),
  });

  const companyBdos = bdos.filter((b) => b.company === companyKey);
  // Filters run here: the company's deals are already loaded in one go.
  const shown = deals.filter((d) =>
    (!filters.bdo || d.bdoId === filters.bdo) && (!filters.priority || d.priority === filters.priority) && (!filters.status || dealStatus(d) === filters.status));
  const totalRevenue  = deals.reduce((s, d) => s + (d.revenueReceivedGhs ?? 0), 0);
  const live = deals.filter((d) => d.dealStage !== "CLOSED_LOST");
  const totalValue = live.reduce((s, d) => s + (d.revenuePotentialGhs ?? 0), 0);
  const totalBalance = live.reduce((s, d) => s + (d.balanceGhs ?? 0), 0);

  const columns = [
    { key: "businessName", label: "Business", sortable: true, render: (r: Deal) => <BusinessCell name={r.businessName} onOpen={() => setDetail(r)} /> },
    { key: "clientName", label: "Client",   render: (r: Deal) => r.clientName ?? "—" },
    { key: "industry",   label: "Industry", render: (r: Deal) => r.industry   ?? "—" },
    { key: "paymentStatus", label: "Status", render: (r: Deal) => <DealStatusBadge deal={r} /> },
    { key: "priority",   label: "Priority", sortable: true, render: (r: Deal) => <PriorityBadge  value={r.priority} /> },
    { key: "dealValue", label: "Deal value", render: (r: Deal) => <MoneyCell text={dealValueOf(r) ? `${r.currency ?? "GHS"} ${Number(dealValueOf(r)).toLocaleString()}` : "—"} /> },
    { key: "revenueReceivedGhs", label: "Received", render: (r: Deal) => <MoneyCell strong text={dealMoneyText(r.revenueReceivedGhs ?? 0, r)} /> },
    { key: "balanceGhs", label: "Balance", render: (r: Deal) => <MoneyCell highlight={!!r.balanceGhs && r.balanceGhs > 0} text={dealStatus(r) === "CANCELLED" ? "—" : dealMoneyText(r.balanceGhs, r)} /> },
    { key: "invoiceStatus", label: "Invoice", sortable: true, render: (r: Deal) => <InvoiceStatusBadge value={r.invoiceStatus ?? "NOT_INVOICED"} /> },
    { key: "bdo", label: "BDO", render: (r: Deal) => r.bdo?.name ?? "—" },
  ];

  return (
    <DealsLayout title={`${label} deals`} subtitle="Won work: what each deal is worth, the money received and the balance still to come in." onAdd={() => { setEditing(null); setShowForm(true); }}>
        <DealsSummary count={deals.length} value={totalValue} received={totalRevenue} balance={totalBalance} />

        <DataTable
          columns={columns}
          data={shown}
          isLoading={isLoading}
          title={`${shown.length} deal${shown.length !== 1 ? "s" : ""}`}
          onAdd={() => { setEditing(null); setShowForm(true); }}
          onEdit={(row) => { setEditing(row); setShowForm(true); }}
          onDelete={(row) => {
            confirmAction({ title: `Delete the deal for ${row.businessName}?`, body: "This can't be undone.", confirmLabel: "Delete deal" }).then((ok) => { if (ok) deleteMutation.mutate(row.id); });
          }}
          filterBar={
            <div className="flex flex-wrap gap-2">
              {companyBdos.length > 0 && (
                <FilterSelect label="BDO" value={filters.bdo} onChange={(v) => setFilters((f) => ({ ...f, bdo: v }))}
                  options={[{ value: "", label: "All BDOs" }, ...companyBdos.map((b) => ({ value: b.id, label: b.name }))]} />
              )}
              <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                options={[{ value: "", label: "All statuses" }, ...STATUS_OPTS]} />
              <FilterSelect label="Priority" value={filters.priority} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
                options={[{ value: "", label: "All priorities" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
            </div>
          }
        />

        {showForm && (
          <DealFormModal
            deal={editing}
            prefill={prefill}
            companyKey={companyKey}
            bdos={bdos}
            clients={clients}
            onClose={() => { setShowForm(false); setPrefill(null); }}
            onSaved={() => { setShowForm(false); setPrefill(null); invalidate(); }}
          />
        )}

        {detail && (
          <DetailDrawer
            deal={detail}
            onClose={() => setDetail(null)}
            onEdit={() => { setEditing(detail); setDetail(null); setShowForm(true); }}
            onChanged={() => { setDetail(null); invalidate(); }}
          />
        )}
    </DealsLayout>
  );
}

// ─── Add / Edit modal ──────────────────────────────────────────────────────────

function DealFormModal({
  deal, prefill, companyKey, bdos, clients, onClose, onSaved,
}: {
  deal: Deal | null;
  prefill: NewDealLink | null;
  companyKey: string;
  bdos: BdoOption[];
  clients: ClientOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dCur = deal?.currency ?? "GHS";
  const dRate = deal?.exchangeRate ?? 1;
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    ...(deal ? {
      smeId:               deal.smeId               ?? "",
      businessName:        deal.businessName,
      clientName:          deal.clientName          ?? "",
      email:               deal.email               ?? "",
      telephone:           deal.telephone           ?? "",
      region:              deal.region              ?? "",
      industry:            deal.industry            ?? "",
      valueChain:          deal.valueChain          ?? "",
      product:             deal.product             ?? "",
      bdoId:               deal.bdoId               ?? "",
      priority:            deal.priority,
      invoiceStatus:       deal.invoiceStatus       ?? "NOT_INVOICED",
      dealValue:           dealValueOf(deal),
      expectedPaymentDate: (deal.expectedPaymentDate ?? "").slice(0, 10),
      currency:            dCur,
      exchangeRate:        dCur === "GHS" ? "" : String(dRate),
      nextSteps:           deal.nextSteps           ?? "",
      nextCallDate:        deal.nextCallDate        ? deal.nextCallDate.slice(0, 10) : "",
      notes:               deal.notes              ?? "",
    } : {}),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [assigned, setAssigned] = useState<string[]>((deal as { assignedBdoIds?: string[] } | null)?.assignedBdoIds ?? []);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const { step, dir, reached, go, last } = useWizard(DEAL_STEPS.length, deal ? DEAL_STEPS.length - 1 : 0);
  const hasClient = !!form.businessName.trim();

  // Coming from a converted lead: the client and estimated value are filled in.
  useEffect(() => {
    if (!prefill || form.smeId) return;
    const m = clients.find((c) => c.id === prefill.smeId);
    if (m) setForm((f) => ({ ...f, smeId: m.id, businessName: m.companyName, clientName: m.contactName ?? "", email: m.email ?? "", telephone: m.phone ?? "", valueChain: m.valueChain ?? "", region: m.region ?? "", dealValue: prefill.value || f.dealValue }));
  }, [prefill, clients, form.smeId]);

  const save = async () => {
    if (!deal && !form.smeId) { setError("Please select a client."); return; }
    if (!form.businessName.trim()) { setError("Please select a client."); return; }
    setSaving(true); setError("");
    const body = {
      company: companyKey,
      ...form,
      ...dealValueBody(form),
      smeId:               form.smeId               || null,
      bdoId:               form.bdoId               || null,
      clientName:          form.clientName           || null,
      email:               form.email                || null,
      telephone:           form.telephone            || null,
      region:              form.region               || null,
      industry:            form.industry             || null,
      valueChain:          form.valueChain           || null,
      product:             form.product              || null,
      nextSteps:           form.nextSteps            || null,
      nextCallDate:        form.nextCallDate         || null,
      notes:               form.notes               || null,
      assignedBdoIds:      assigned,
    };
    try {
      deal ? await api.put(`/company-deals/${deal.id}`, body) : await api.post("/company-deals", body);
      toast.success(deal ? "Deal updated" : "Deal added", { description: form.businessName.trim() || undefined });
      onSaved();
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "We couldn't save this deal. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WizardShell
      steps={DEAL_STEPS} step={step} dir={dir} reached={reached} onGo={go} onClose={onClose} error={error}
      primary={last
        ? { label: saving ? "Saving…" : deal ? "Update deal" : "Add deal", disabled: saving || !hasClient, onClick: save }
        : { label: "Continue", disabled: !hasClient, onClick: () => go(step + 1) }}
    >
      {step === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    clientName: match?.contactName ?? f.clientName,
                    email: match?.email ?? f.email,
                    telephone: match?.phone ?? f.telephone,
                    valueChain: match?.valueChain ?? f.valueChain,
                    region: match?.region ?? f.region,
                  }));
                }}
              />
              <p className="text-[11px] text-muted mt-1">
                Picking a client fills in their details. Don&apos;t see them? <Link href="/sme" className="text-accent hover:underline">Add them on the Clients page first →</Link>
              </p>
          </div>
          <Field label="Client contact" value={form.clientName} onChange={(v) => set("clientName", v)} />
          <Field label="Industry" value={form.industry} onChange={(v) => set("industry", v)} />
          <Field label="Email" value={form.email} onChange={(v) => set("email", v)} type="email" />
          <Field label="Telephone" value={form.telephone} onChange={(v) => set("telephone", v)} />
          <SelectField label="Region" value={form.region} onChange={(v) => set("region", v)}>
            <option value="">— Select region —</option>
            {form.region && !GHANA_REGIONS.includes(form.region) && <option value={form.region}>{form.region}</option>}
            {GHANA_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </SelectField>
          <Field label="Value chain" value={form.valueChain} onChange={(v) => set("valueChain", v)} />
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField label="Who owns this deal?" value={form.bdoId} onChange={(v) => set("bdoId", v)}>
              <option value="">— Unassigned —</option>
              {bdos.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.company})</option>)}
            </SelectField>
            <AssigneesField value={assigned} onChange={setAssigned} people={bdos.filter((b) => b.company === companyKey)} ownerId={form.bdoId} />
            <Field label="Product" value={form.product} onChange={(v) => set("product", v)} />
            <SelectField label="Priority" value={form.priority} onChange={(v) => set("priority", v)}>
              {["HIGH", "MEDIUM", "LOW"].map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectField>
            <Field label="Next call date" value={form.nextCallDate} onChange={(v) => set("nextCallDate", v)} type="date" />
          </div>
          <TextArea label="Next steps" value={form.nextSteps} onChange={(v) => set("nextSteps", v)} />
          <TextArea label="Notes" value={form.notes} onChange={(v) => set("notes", v)} />
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <DealValueFields form={form} set={(k, v) => set(k, v)} inputClass={inputCls} labelClass={labelCls} />
          <SelectField label="Invoice status" value={form.invoiceStatus} onChange={(v) => set("invoiceStatus", v)}>
            {INVOICE_OPTS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </SelectField>
        </div>
      )}
    </WizardShell>
  );
}

// ─── Detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ deal, onClose, onEdit, onChanged }: { deal: Deal; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  return (
    <DealDrawer title={deal.businessName} subtitle={deal.clientName ?? "No client contact"} onClose={onClose} onEdit={onEdit}>
      <div className="flex flex-wrap gap-2">
        <DealStatusBadge deal={deal} />
        <PriorityBadge value={deal.priority} />
        <InvoiceStatusBadge value={deal.invoiceStatus ?? "NOT_INVOICED"} />
      </div>
      <DrawerMoney
        value={dealValueOf(deal) ? `${deal.currency ?? "GHS"} ${Number(dealValueOf(deal)).toLocaleString()}` : "—"}
        received={dealMoneyText(deal.revenueReceivedGhs ?? 0, deal)}
        balance={dealStatus(deal) === "CANCELLED" ? "—" : dealMoneyText(deal.balanceGhs, deal)}
      />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <DItem label="Email" value={deal.email} />
        <DItem label="Telephone" value={deal.telephone} />
        <DItem label="Region" value={deal.region} />
        <DItem label="Industry" value={deal.industry} />
        <DItem label="Value chain" value={deal.valueChain} />
        <DItem label="Product" value={deal.product} />
        <DItem label="BDO" value={deal.bdo?.name} />
        <DItem label="Expected payment" value={deal.expectedPaymentDate ? new Date(deal.expectedPaymentDate).toLocaleDateString() : null} />
        <DItem label="Next call" value={deal.nextCallDate ? new Date(deal.nextCallDate).toLocaleDateString() : null} />
      </dl>
      <DealPayments source="COMPANY" dealId={deal.id} company={deal.company} dealName={deal.businessName} cancelled={deal.dealStage === "CLOSED_LOST"} endpoint={`/company-deals/${deal.id}`} onChanged={onChanged} />
      {deal.nextSteps && <LongField label="Next steps" value={deal.nextSteps} accent />}
      {deal.notes && <LongField label="Notes" value={deal.notes} />}
    </DealDrawer>
  );
}
