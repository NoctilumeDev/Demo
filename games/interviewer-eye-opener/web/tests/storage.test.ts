import { describe, expect, it } from "vitest";

import { initialCareer } from "../src/game/achievements";
import {
  currentAssessmentCandidate,
  emptyAssessment,
  judgeAssessmentCandidate,
  markAssessmentExplanationViewed,
} from "../src/game/assessment";
import { createRun } from "../src/game/engine";
import {
  loadActiveRun,
  loadAssessmentDraft,
  loadCareer,
  saveActiveRun,
  saveAssessmentDraft,
  saveCareer,
  type KeyValueStorage,
} from "../src/game/storage";

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("career storage", () => {
  it("falls back to project history when stored data is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem("eye-opener:career:v1", "not-json");
    expect(loadCareer(storage)).toEqual(initialCareer());
  });

  it("round-trips a valid career", () => {
    const storage = new MemoryStorage();
    const career = initialCareer();
    saveCareer(storage, career);
    expect(loadCareer(storage)).toEqual(career);
  });

  it("round-trips the assessment draft without inventing answers", () => {
    const storage = new MemoryStorage();
    const assessment = emptyAssessment();
    saveAssessmentDraft(storage, assessment);
    expect(loadAssessmentDraft(storage)).toEqual(assessment);
  });

  it("restores the same presentation order and next card after a refresh", () => {
    const storage = new MemoryStorage();
    let assessment = emptyAssessment(20261120);
    for (const disposition of ["KEEP", "SKIP"] as const) {
      const option = currentAssessmentCandidate(assessment, "Q1")!;
      assessment = judgeAssessmentCandidate(assessment, "Q1", option.id, disposition);
    }
    const nextBefore = currentAssessmentCandidate(assessment, "Q1")?.id;
    saveAssessmentDraft(storage, assessment);

    const restored = loadAssessmentDraft(storage);
    expect(restored).toEqual(assessment);
    expect(restored && currentAssessmentCandidate(restored, "Q1")?.id).toBe(nextBefore);
  });

  it("restores a draft that viewed an explanation before judging the card", () => {
    const storage = new MemoryStorage();
    let assessment = emptyAssessment(31);
    const option = currentAssessmentCandidate(assessment, "Q1")!;
    assessment = markAssessmentExplanationViewed(assessment, option.id);
    assessment = judgeAssessmentCandidate(assessment, "Q1", option.id, "SKIP");
    saveAssessmentDraft(storage, assessment);

    expect(loadAssessmentDraft(storage)).toEqual(assessment);
  });

  it("does not reinterpret a legacy four-way draft as a card attempt", () => {
    const storage = new MemoryStorage();
    const legacyDraft = JSON.stringify({
      version: "BT-v0.3.2",
      answers: [{ questionId: "Q2", optionId: "Q2-D" }],
      completed: false,
    });
    storage.setItem("eye-opener:assessment-draft:v0.3.2", legacyDraft);
    storage.setItem("eye-opener:assessment-draft:card-v0.1-rc1", legacyDraft);

    expect(loadAssessmentDraft(storage)).toBeUndefined();
    expect(storage.getItem("eye-opener:assessment-draft:v0.3.2")).toBe(legacyDraft);
  });

  it("rejects a draft whose presentation order or event history was rewritten", () => {
    const storage = new MemoryStorage();
    let assessment = emptyAssessment(37);
    const option = currentAssessmentCandidate(assessment, "Q1")!;
    assessment = judgeAssessmentCandidate(assessment, "Q1", option.id, "SKIP");

    const forgedOrder = structuredClone(assessment);
    forgedOrder.questionAttempts[0]!.presentationOrder.push(option.id);
    storage.setItem("eye-opener:assessment-draft:card-v0.1-rc1", JSON.stringify(forgedOrder));
    expect(loadAssessmentDraft(storage)).toBeUndefined();

    const forgedTiming = structuredClone(assessment);
    forgedTiming.questionAttempts[0]!.cardJudgments[0]!.explanationViewedBeforeDecision = true;
    storage.setItem("eye-opener:assessment-draft:card-v0.1-rc1", JSON.stringify(forgedTiming));
    expect(loadAssessmentDraft(storage)).toBeUndefined();

    const forgedPhase = structuredClone(assessment) as unknown as {
      questionAttempts: Array<{ phase: string }>;
    };
    forgedPhase.questionAttempts[0]!.phase = "RECOVERED_BY_GUESSING";
    storage.setItem("eye-opener:assessment-draft:card-v0.1-rc1", JSON.stringify(forgedPhase));
    expect(loadAssessmentDraft(storage)).toBeUndefined();
  });

  it("round-trips a V1.1 active run", () => {
    const storage = new MemoryStorage();
    const run = createRun("simple", 1);
    saveActiveRun(storage, run);
    expect(loadActiveRun(storage)).toEqual(run);
  });

  it("migrates a V1 active run without backfilling profile evidence", () => {
    const storage = new MemoryStorage();
    const current = createRun("simple", 1);
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.entryAssessment;
    delete legacy.world;
    delete legacy.behaviorLog;
    delete legacy.viewedEvidence;
    storage.setItem("eye-opener:active-run:v1", JSON.stringify(legacy));

    const migrated = loadActiveRun(storage);
    expect(migrated?.schemaVersion).toBe(2);
    expect(migrated?.entryAssessment.version).toBe("LEGACY-NO-ASSESSMENT");
    expect(migrated?.behaviorLog[0]?.observationEligible).toBe(false);
  });
});
