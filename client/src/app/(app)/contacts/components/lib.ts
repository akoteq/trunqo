export type ContactRow = {
  id: string; name: string; organisation: string; role: string; sector: string; interests: string[]; phone?: string; email?: string;
  contactDetailsHidden?: boolean; howMet: string; howMetDetails: string; introducedBy: string; ownerBdoId: string | null; ownerName: string | null;
  company: string | null; stage: string; nextFollowUpDate: string | null; smeIds: string[]; consentNote: string; privateNotes?: string;
  lastInteractionAt: string | null; canEdit: boolean;
};

export const STAGES = ["NEW", "DEVELOPING", "ACTIVE", "STRONG", "DORMANT"];
export const MET = ["MEETING", "REFERRAL", "EVENT", "PARTNERSHIP", "OTHER"];
export const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
