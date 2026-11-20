import { initialCareer } from "./achievements";
import { ASSESSMENT_QUESTIONS, legacyAssessment } from "./assessment";
import type { AchievementUnlock, CareerState, EntryAssessment, GameRun, WorldState } from "./types";

const CAREER_KEY = "eye-opener:career:v1";
const ACTIVE_RUN_KEY = "eye-opener:active-run:v1";
const ASSESSMENT_DRAFT_KEY = "eye-opener:assessment-draft:card-v0.1-rc1";

const isCardAssessment = (value: unknown): value is EntryAssessment => {
  if (!value || typeof value !== "object") return false;
  const assessment = value as Partial<EntryAssessment>;
  if (assessment.version !== "BT-v0.3.2"
      || assessment.protocolVersion !== "BT-CARD-v0.1-rc1"
      || assessment.interactionMode !== "CARD_KEEP_THEN_CHOOSE"
      || !Number.isInteger(assessment.orderSeed)
      || !Array.isArray(assessment.questionAttempts)
      || assessment.questionAttempts.length !== ASSESSMENT_QUESTIONS.length) return false;

  const attemptIds = new Set<string>();
  const questionIds = new Set<string>();
  for (const attempt of assessment.questionAttempts) {
    const question = ASSESSMENT_QUESTIONS.find((candidate) => candidate.id === attempt.questionId);
    if (!question
        || typeof attempt.attemptId !== "string"
        || attempt.attemptId.trim().length === 0
        || attemptIds.has(attempt.attemptId)
        || questionIds.has(attempt.questionId)
        || attempt.protocol !== "CARD_KEEP_THEN_CHOOSE"
        || attempt.protocolVersion !== "BT-CARD-v0.1-rc1"
        || attempt.questionVersion !== "BT-v0.3.2"
        || !["JUDGING", "CHOOSING", "SUBMITTED"].includes(attempt.phase)
        || !Array.isArray(attempt.presentationOrder)
        || !Array.isArray(attempt.cardJudgments)
        || !Array.isArray(attempt.events)) return false;
    attemptIds.add(attempt.attemptId);
    questionIds.add(attempt.questionId);

    const expectedOptionIds = question.options.map((option) => option.id).sort();
    if (attempt.presentationOrder.length !== expectedOptionIds.length
        || [...attempt.presentationOrder].sort().join("|") !== expectedOptionIds.join("|")
        || attempt.cardJudgments.length > expectedOptionIds.length) return false;

    if (attempt.cardJudgments.some((judgment, index) => (
      judgment.questionId !== attempt.questionId
      || judgment.optionId !== attempt.presentationOrder[index]
      || judgment.presentedOrder !== index + 1
      || !["KEEP", "SKIP"].includes(judgment.disposition)
      || typeof judgment.explanationViewedBeforeDecision !== "boolean"
    ))) return false;
    if (attempt.events.some((event, index) => (
      event.sequence !== index + 1
      || !["EXPLANATION_VIEWED", "CARD_JUDGED", "FINAL_CHOICE"].includes(event.kind)
      || !attempt.presentationOrder.includes(event.optionId)
    ))) return false;

    const cardEvents = attempt.events.filter((event) => event.kind === "CARD_JUDGED");
    if (cardEvents.length !== attempt.cardJudgments.length
        || cardEvents.some((event, index) => {
          const judgment = attempt.cardJudgments[index];
          if (!judgment || event.optionId !== judgment.optionId || event.disposition !== judgment.disposition) return true;
          const explanationSeenBefore = attempt.events.some((candidate) => (
            candidate.kind === "EXPLANATION_VIEWED"
            && candidate.optionId === judgment.optionId
            && candidate.sequence < event.sequence
          ));
          return judgment.explanationViewedBeforeDecision !== explanationSeenBefore;
        })) return false;
    const explanationEvents = attempt.events.filter((event) => event.kind === "EXPLANATION_VIEWED");
    if (new Set(explanationEvents.map((event) => event.optionId)).size !== explanationEvents.length
        || explanationEvents.some((event) => {
          const priorJudgments = attempt.events.filter((candidate) => (
            candidate.kind === "CARD_JUDGED" && candidate.sequence < event.sequence
          )).length;
          return attempt.presentationOrder.indexOf(event.optionId) > priorJudgments;
        })) return false;

    const finalEvents = attempt.events.filter((event) => event.kind === "FINAL_CHOICE");
    if (attempt.phase === "JUDGING"
        && (attempt.cardJudgments.length >= 4 || attempt.finalChoice !== null || finalEvents.length !== 0)) return false;
    if (attempt.phase === "CHOOSING"
        && (attempt.cardJudgments.length !== 4 || attempt.finalChoice !== null || finalEvents.length !== 0)) return false;
    if (attempt.phase === "SUBMITTED"
        && (attempt.cardJudgments.length !== 4
          || typeof attempt.finalChoice !== "string"
          || !attempt.presentationOrder.includes(attempt.finalChoice)
          || finalEvents.length !== 1
          || finalEvents[0]?.optionId !== attempt.finalChoice
          || finalEvents[0]?.sequence !== attempt.events.length)) return false;
  }
  return assessment.completed === assessment.questionAttempts.every((attempt) => attempt.phase === "SUBMITTED");
};

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const mergeHistoricalAchievements = (career: CareerState): CareerState => {
  const baseline = initialCareer();
  const known = new Set(career.achievements.map((achievement) => achievement.id));
  const missing: AchievementUnlock[] = baseline.achievements.filter(
    (achievement) => !known.has(achievement.id),
  );
  return {
    ...career,
    achievements: [...missing, ...career.achievements].map((achievement, index) => ({
      ...achievement,
      sequence: index + 1,
    })),
  };
};

export const loadCareer = (storage: KeyValueStorage): CareerState => {
  const raw = storage.getItem(CAREER_KEY);
  if (!raw) return initialCareer();
  try {
    const parsed = JSON.parse(raw) as CareerState;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.runs) || !Array.isArray(parsed.achievements)) {
      return initialCareer();
    }
    return mergeHistoricalAchievements(parsed);
  } catch {
    return initialCareer();
  }
};

export const saveCareer = (storage: KeyValueStorage, career: CareerState): void => {
  storage.setItem(CAREER_KEY, JSON.stringify(career));
};

export const loadActiveRun = (storage: KeyValueStorage): GameRun | undefined => {
  const raw = storage.getItem(ACTIVE_RUN_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Omit<Partial<GameRun>, "schemaVersion"> & {
      schemaVersion?: number;
      attempts?: GameRun["attempts"];
    };
    const parsedAssessment = parsed.entryAssessment as unknown;
    const isLegacyAssessment = Boolean(
      parsedAssessment
      && typeof parsedAssessment === "object"
      && (parsedAssessment as { version?: unknown }).version === "LEGACY-NO-ASSESSMENT",
    );
    if (parsed.schemaVersion === 2
        && Array.isArray(parsed.behaviorLog)
        && Array.isArray(parsed.viewedEvidence)
        && (isCardAssessment(parsedAssessment) || isLegacyAssessment)
        && parsed.world) {
      return parsed as GameRun;
    }
    if (parsed.schemaVersion === 1
        && typeof parsed.runId === "string"
        && typeof parsed.incidentIndex === "number"
        && Array.isArray(parsed.attempts)) {
      const world: WorldState = {
        load: parsed.incidentIndex >= 3 ? 120 : 20,
        targetLoad: 120,
        databaseCapacity: 85,
        readShare: 0.65,
        redisAvailable: true,
        mqAvailable: parsed.incidentIndex < 2,
        reliabilityDebt: 0,
        unresolvedFailures: 0,
        responseLost: parsed.incidentIndex === 1,
      };
      return {
        ...parsed,
        schemaVersion: 2,
        entryAssessment: legacyAssessment(),
        world,
        viewedEvidence: [],
        behaviorLog: [{
          eventId: `${parsed.runId}-event-legacy`,
          sequence: 1,
          kind: "SYSTEM",
          action: "从 V1 存档迁移",
          observationEligible: false,
          eligibilityReason: "历史版本没有行为观测合同，不能事后补画像。",
          availableAlternatives: [],
          knownCosts: [],
          evidenceSeenBeforeAction: [],
          signal: { status: "NO_SIGNAL", reason: "V1 历史操作只保留运行事实，不回填画像信号。" },
        }],
        attempts: parsed.attempts.map((attempt) => ({
          ...attempt,
          worldBefore: world,
          worldAfter: world,
        })),
      } as GameRun;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

export const saveActiveRun = (storage: KeyValueStorage, run: GameRun): void => {
  storage.setItem(ACTIVE_RUN_KEY, JSON.stringify(run));
};

export const clearActiveRun = (storage: KeyValueStorage): void => {
  storage.removeItem(ACTIVE_RUN_KEY);
};

export const loadAssessmentDraft = (storage: KeyValueStorage): EntryAssessment | undefined => {
  const raw = storage.getItem(ASSESSMENT_DRAFT_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isCardAssessment(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

export const saveAssessmentDraft = (storage: KeyValueStorage, assessment: EntryAssessment): void => {
  storage.setItem(ASSESSMENT_DRAFT_KEY, JSON.stringify(assessment));
};

export const clearAssessmentDraft = (storage: KeyValueStorage): void => {
  storage.removeItem(ASSESSMENT_DRAFT_KEY);
};
