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

export type ProfileDimension = "E" | "C" | "D" | "A" | "V" | "L" | "R" | "X" | "J";

export type ProfileSignal =
  | { status: "OBSERVED"; dimensions: Partial<Record<ProfileDimension, number>> }
  | { status: "NO_SIGNAL"; reason: string };

export interface AssessmentOption {
  id: string;
  label: string;
  knownCosts: string[];
  signal: ProfileSignal;
}

export interface AssessmentQuestion {
  id: string;
  title: string;
  knownFacts: string;
  unknownFacts: string;
  constraint: string;
  prompt: string;
  options: AssessmentOption[];
}

export type CandidateDisposition = "KEEP" | "SKIP";

export interface AssessmentCandidateJudgment {
  questionId: string;
  optionId: string;
  disposition: CandidateDisposition;
  presentedOrder: number;
  explanationViewedBeforeDecision: boolean;
}

export type QuestionAttemptPhase = "JUDGING" | "CHOOSING" | "SUBMITTED";

export type QuestionAttemptEvent =
  | { sequence: number; kind: "EXPLANATION_VIEWED"; optionId: string }
  | { sequence: number; kind: "CARD_JUDGED"; optionId: string; disposition: CandidateDisposition }
  | { sequence: number; kind: "FINAL_CHOICE"; optionId: string };

export interface AssessmentQuestionAttempt {
  attemptId: string;
  protocol: "CARD_KEEP_THEN_CHOOSE";
  protocolVersion: "BT-CARD-v0.1-rc1";
  questionVersion: "BT-v0.3.2";
  questionId: string;
  presentationOrder: string[];
  cardJudgments: AssessmentCandidateJudgment[];
  finalChoice: string | null;
  phase: QuestionAttemptPhase;
  events: QuestionAttemptEvent[];
}

export interface EntryAssessment {
  version: "BT-v0.3.2" | "LEGACY-NO-ASSESSMENT";
  protocolVersion: "BT-CARD-v0.1-rc1" | "LEGACY-NO-ASSESSMENT";
  interactionMode: "CARD_KEEP_THEN_CHOOSE" | "LEGACY";
  orderSeed: number;
  questionAttempts: AssessmentQuestionAttempt[];
  completed: boolean;
}

export type BehaviorEventKind =
  | "SYSTEM"
  | "VIEW_EVIDENCE"
  | "DECISION"
  | "RETRY"
  | "SCOPE_CHANGE"
  | "COURSE"
  | "ADVANCE";

export interface BehaviorEvent {
  eventId: string;
  sequence: number;
  kind: BehaviorEventKind;
  incidentId?: IncidentId;
  action: string;
  observationEligible: boolean;
  eligibilityReason: string;
  availableAlternatives: string[];
  knownCosts: string[];
  evidenceSeenBeforeAction: string[];
  signal: ProfileSignal;
}

export interface WorldState {
  load: number;
  targetLoad: number;
  databaseCapacity: number;
  readShare: number;
  redisAvailable: boolean;
  mqAvailable: boolean;
  reliabilityDebt: number;
  unresolvedFailures: number;
  responseLost: boolean;
}

export interface ProfileFinding {
  dimension: ProfileDimension;
  label: string;
  strength: number;
  evidence: string[];
}

export interface ProfileReport {
  status: "LOCAL_TENDENCIES" | "NO_SIGNAL";
  title: string;
  summary: string;
  findings: ProfileFinding[];
  eligibleObservations: number;
  noSignalObservations: number;
}

export interface ProfileComparison {
  status: "CONSISTENT" | "EVIDENCE_UPDATE" | "INSUFFICIENT";
  title: string;
  explanation: string;
  evidence: string[];
}

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
  worldBefore: WorldState;
  worldAfter: WorldState;
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
  schemaVersion: 2;
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
  entryAssessment: EntryAssessment;
  world: WorldState;
  behaviorLog: BehaviorEvent[];
  viewedEvidence: IncidentId[];
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
  profileComparisonStatus?: ProfileComparison["status"];
}

export interface CareerState {
  schemaVersion: 1;
  nextRunNumber: number;
  achievements: AchievementUnlock[];
  runs: RunSummary[];
}
