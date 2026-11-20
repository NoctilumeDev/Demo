export type FactionId = "simple" | "buzzword" | "engineering" | "academic" | "training";

export type RunPhase = "DECISION" | "REVIEW" | "SETTLED";

export type VerdictStatus = "PASS" | "FAIL" | "UNKNOWN";

export type IncidentId =
  | "duplicate-like"
  | "response-loss"
  | "message-outage"
  | "traffic-spike"
  | "duplicate-charge";

export type FactValue = boolean | number | string;

export interface FactionDefinition {
  id: FactionId;
  name: string;
  shortName: string;
  motto: string;
  description: string;
  scoreName: string;
  accent: string;
  initialBudget: number;
  initialTime: number;
  initialComponents: string[];
}

export interface DecisionDefinition {
  id: string;
  incidentId: IncidentId;
  title: string;
  description: string;
  cost: number;
  time: number;
  tags: string[];
}

export interface IncidentDefinition {
  id: IncidentId;
  chapter: string;
  title: string;
  brief: string;
  signal: string;
  question: string;
  decisions: DecisionDefinition[];
}

export interface SimulationObservation {
  facts: Record<string, FactValue>;
  systemClaim: VerdictStatus;
  systemMessage: string;
  evidence: string[];
}

export interface IncidentAttempt {
  attempt: number;
  incidentId: IncidentId;
  decisionId: string;
  decisionTitle: string;
  budgetSpent: number;
  timeSpent: number;
  observation: SimulationObservation;
}

export interface TimelineEntry {
  sequence: number;
  kind: "SYSTEM" | "DECISION" | "INCIDENT" | "SCORE" | "ACHIEVEMENT";
  title: string;
  detail: string;
  incidentId?: IncidentId;
}

export interface TrainingState {
  score: number;
  maximum: number;
  offeredCourses: string[];
  completedCourses: string[];
}

export interface JudgeCheck {
  incidentId: IncidentId;
  title: string;
  status: VerdictStatus;
  summary: string;
  evidence: string[];
}

export interface RunVerdict {
  status: VerdictStatus;
  checks: JudgeCheck[];
  passed: number;
  failed: number;
  unknown: number;
  businessScore: number;
}

export interface FactionScore {
  label: string;
  value: number;
  maximum: number;
  note: string;
}

export interface GameRun {
  schemaVersion: 1;
  runId: string;
  worldId: string;
  runNumber: number;
  factionId: FactionId;
  phase: RunPhase;
  incidentIndex: number;
  budget: number;
  timeRemaining: number;
  complexity: number;
  evidenceScore: number;
  components: string[];
  controls: string[];
  excludedFromCourse: IncidentId[];
  attempts: IncidentAttempt[];
  history: TimelineEntry[];
  training?: TrainingState;
  finalVerdict?: RunVerdict;
  unlockedAchievementIds: string[];
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  hint: string;
  historical?: boolean;
}

export interface AchievementUnlock {
  id: string;
  title: string;
  runId: string;
  evidence: string;
  sequence: number;
}

export interface RunSummary {
  runId: string;
  worldId: string;
  runNumber: number;
  factionId: FactionId;
  businessStatus: VerdictStatus;
  businessScore: number;
  factionScore: FactionScore;
  budgetRemaining: number;
  timeRemaining: number;
  complexity: number;
}

export interface CareerState {
  schemaVersion: 1;
  nextRunNumber: number;
  achievements: AchievementUnlock[];
  runs: RunSummary[];
}
