export type Rec = {
  id: string; smeId: string; clientName: string; company: string; requirementTypeId: string; regulator: string; requirementName: string; subject: string;
  applicability: string; notApplicableReason?: string; status: string; referenceNumber?: string; issueDate?: string | null; expiryDate?: string | null;
  nextRenewalDate?: string | null; evidenceDocIds: string[]; verified: boolean; verifiedByName?: string | null; verifiedAt?: string | null;
  responsibleBdoId?: string | null; responsibleName?: string | null; nextAction?: string; nextActionDate?: string | null;
  opportunityDealId?: string | null; opportunityLeadId?: string | null; state: string; renewalDue: boolean; dueDate: string | null; daysToDue: number | null; lastOutreachAt?: string | null;
  /** The user who last entered the key facts; someone else verifies. */
  enteredBy?: string | null;
  /** The verifier found a problem; cleared when the facts or evidence change. */
  sentBack?: { note: string; byUserId?: string | null; byName?: string | null; at: string } | null;
  renewals?: Renewal[];
};
export type Renewal = {
  id?: string; referenceNumber: string; issueDate: string | null; expiryDate: string | null; verified: boolean;
  verifiedByName: string | null; replacedAt: string; replacedByName: string | null; note: string;
};
export type ReqType = { id: string; code: string; regulator: string; name: string; perSubject: boolean; renewal: { kind: string; intervalMonths?: number | null } };
export type Bdo = { id: string; name: string; company: string };
export type ClientDoc = { id: string; fileName: string; fileUrl: string; fileType?: string | null; createdAt?: string };
export type AuditRow = { id: string; action: string; actorName: string | null; createdAt: string; note?: string; changes?: { field: string; from: string; to: string }[] };

export const d10 = (s?: string | null) => (s ? s.slice(0, 10) : "");
export const showDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
export const recLabel = (r: Pick<Rec, "regulator" | "requirementName" | "subject">) => `${r.regulator} ${r.requirementName}${r.subject ? ` (${r.subject})` : ""}`;

/** Days since a date, or null. */
export const daysSince = (s?: string | null) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 864e5) : null);
export const ago = (s?: string | null) => {
  const d = daysSince(s);
  return d == null ? "never" : d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/** A next action whose date has passed. */
export const actionOverdue = (r: Rec) => !!r.nextActionDate && d10(r.nextActionDate) < new Date().toISOString().slice(0, 10);

/** Evidence on file and entered by someone else: this user can verify it now. */
export const canVerify = (r: Rec, userId: string) => r.state === "AWAITING_VERIFICATION" && r.evidenceDocIds.length > 0 && !r.sentBack && r.enteredBy !== userId;

/** The one thing a requirement needs next, for this user. Null when it's in good shape. */
export type NextStep = "renew" | "assess" | "fix" | "sentBack" | "evidence" | "verify" | "override" | "colleague" | "unverify" | "update";
export function nextStep(r: Rec, userId: string, owner: boolean): NextStep | null {
  if (r.applicability === "APPLICABLE" && (r.renewalDue || r.state === "EXPIRED")) return "renew";
  if (r.state === "UNASSESSED") return "assess";
  if (r.state === "AWAITING_VERIFICATION") {
    if (r.sentBack) return r.enteredBy === userId ? "fix" : "sentBack";
    if (!r.evidenceDocIds?.length) return "evidence";
    if (r.enteredBy && r.enteredBy === userId) return owner ? "override" : "colleague";
    return "verify";
  }
  if (r.state === "VERIFIED") return "unverify";
  if (r.state === "NOT_REGISTERED" || r.state === "IN_PROGRESS") return "update";
  return null;
}

/** Renewal rule in words. */
export const renewsText = (t?: ReqType) =>
  !t ? "" : t.renewal.kind === "NONE" ? "never" : t.renewal.kind === "INTERVAL" ? `every ${t.renewal.intervalMonths} months from the issue date` : "on the expiry date on the certificate";

const AUDIT_WORDS: Record<string, string> = {
  create: "added it", update: "edited it", verify: "verified it", unverify: "removed verification", renew: "recorded a renewal",
  send_back: "sent it back", outreach: "logged outreach", opportunity: "created a lead", delete: "deleted it",
};
export const auditWord = (a: string) => AUDIT_WORDS[a] ?? a;
