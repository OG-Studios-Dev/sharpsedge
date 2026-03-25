import type { AIPick } from "@/lib/types";

export type SandboxReviewStatus = "pending" | "reviewed" | "approved" | "rejected";
export type SandboxSlateStatus = "draft" | "locked" | "archived";
export type SandboxOutcome = "pending" | "win" | "loss" | "push" | "void";

export type SandboxReviewDecision = {
  status: SandboxReviewStatus;
  reviewer: string | null;
  reviewed_at: string | null;
};

export type SandboxLearningNotes = {
  pregame: string | null;
  postmortem: string | null;
  model_adjustment: string | null;
};

export type SandboxReviewChecklist = {
  home_away: string | null;
  travel_rest: string | null;
  injuries_news: string | null;
  matchup_context: string | null;
  price_discipline: string | null;
};

export type SandboxReviewSnapshot = {
  separation: "sandbox_only";
  visibility: "admin_only";
  checklist: SandboxReviewChecklist;
  learnings: SandboxLearningNotes;
  decision: SandboxReviewDecision;
  outcome: SandboxOutcome;
  outcome_notes: string | null;
};

export type SandboxPickRecord = {
  id: string;
  sandbox_key: string;
  date: string;
  league: string;
  pick_type: AIPick["type"];
  player_name: string | null;
  team: string;
  opponent: string | null;
  pick_label: string;
  hit_rate: number | null;
  edge: number | null;
  odds: number | null;
  book: string | null;
  result: AIPick["result"];
  game_id: string | null;
  reasoning: string | null;
  confidence: number | null;
  units: number;
  pick_snapshot: AIPick | null;
  experiment_tag: string | null;
  review_status: SandboxReviewStatus;
  review_notes: string | null;
  review_snapshot: SandboxReviewSnapshot;
  created_at: string;
  updated_at: string | null;
};

export type SandboxSlateRecord = {
  sandbox_key: string;
  date: string;
  league: string;
  experiment_tag: string | null;
  status: SandboxSlateStatus;
  pick_count: number;
  expected_pick_count: number;
  review_status: SandboxReviewStatus;
  review_notes: string | null;
  review_snapshot: SandboxReviewSnapshot;
  created_at: string;
  updated_at: string | null;
};

export type SandboxSlateBundle = {
  slate: SandboxSlateRecord | null;
  picks: SandboxPickRecord[];
};

export type SandboxCreateInput = {
  sandboxKey: string;
  date: string;
  league: string;
  experimentTag?: string | null;
  reviewNotes?: string | null;
  picks: AIPick[];
};
