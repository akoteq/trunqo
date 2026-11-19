export type Mitigation = { id?: string; action: string; ownerBdoId: string | null; ownerName?: string | null; deadline: string | null; status: string; note?: string; overdue?: boolean;
  /** Sent back on save so the server keeps a newer change made by the action's owner. */
  updatedAt?: string };
export type Indicator = { id?: string; name: string; threshold: string; triggered: boolean; note?: string };
export type Risk = {
  id: string; company: string; title: string; category: string; description: string; impactDescription: string; financialImpactGhs: number | null;
  impact: number; likelihood: number; score: number; residualImpact: number | null; residualLikelihood: number | null; residualScore: number | null;
  indicators: Indicator[]; mitigations: Mitigation[]; ownerBdoId: string | null; ownerName: string | null; reviewStatus: string; reviewState: string;
  lastReviewedAt: string | null; nextReviewDate: string | null; canEdit: boolean;
};
export type Bdo = { id: string; name: string; company: string };

export const CATEGORIES = ["FINANCIAL", "OPERATIONAL", "REGULATORY", "CREDIT", "PEOPLE", "TECHNOLOGY", "REPUTATIONAL", "MARKET"];
export const MIT_STATUS = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
export const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

// Every pair below is readable in both themes (the dark palette remaps red/amber/green 50–200 and 600–800).
export const scoreTone = (s: number) =>
  s >= 15 ? "bg-red-600 text-white" : s >= 8 ? "bg-amber-400 text-black" : "bg-green-100 text-green-800";
