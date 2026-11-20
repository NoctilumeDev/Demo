import { describe, expect, it } from "vitest";

import {
  ASSESSMENT_QUESTIONS,
  answerAssessment,
  currentAssessmentCandidate,
  emptyAssessment,
  judgeAssessmentCandidate,
} from "../src/game/assessment";
import { advanceIncident, applyDecision, createRun, viewCurrentEvidence } from "../src/game/engine";
import { compareProfiles, deriveBehaviorProfile, deriveEntryProfile } from "../src/game/profile";

const completeAssessment = (options: string[]) => options.reduce((assessment, optionId, index) => {
  const questionId = ASSESSMENT_QUESTIONS[index]!.id;
  let judged = assessment;
  for (let card = currentAssessmentCandidate(judged, questionId); card; card = currentAssessmentCandidate(judged, questionId)) {
    judged = judgeAssessmentCandidate(judged, questionId, card.id, "KEEP");
  }
  return answerAssessment(judged, questionId, optionId);
}, emptyAssessment(20261120));

describe("candidate profiles", () => {
  it("preserves a legal NO_SIGNAL answer without turning it into a low score", () => {
    const assessment = completeAssessment([
      "Q1-A", "Q2-A", "Q3-C", "Q4-A", "Q5-A", "Q6-A", "Q7-A",
    ]);
    const profile = deriveEntryProfile(assessment);

    expect(profile.noSignalObservations).toBe(1);
    expect(profile.findings.some((finding) => finding.dimension === "C")).toBe(true);
    expect(profile.summary).not.toContain("%");
  });

  it("does not count system-forced events as behavior observations", () => {
    const run = createRun("simple", 1);
    const profile = deriveBehaviorProfile(run.behaviorLog);

    expect(profile.status).toBe("NO_SIGNAL");
    expect(profile.eligibleObservations).toBe(0);
  });

  it("explains a changed tendency as evidence update when the player actually inspected evidence", () => {
    const assessment = completeAssessment([
      "Q1-A", "Q2-A", "Q3-A", "Q4-A", "Q5-A", "Q6-C", "Q7-A",
    ]);
    let run = createRun("engineering", 1, assessment);
    run = viewCurrentEvidence(run);
    run = advanceIncident(applyDecision(run, "db-unique"));
    run = viewCurrentEvidence(run);
    run = applyDecision(run, "transactional-request-record");

    const entry = deriveEntryProfile(assessment);
    const behavior = deriveBehaviorProfile(run.behaviorLog);
    const comparison = compareProfiles(entry, behavior, run.behaviorLog);

    expect(behavior.findings.some((finding) => finding.dimension === "E")).toBe(true);
    expect(comparison.status).toBe("EVIDENCE_UPDATE");
    expect(comparison.evidence.length).toBeGreaterThan(0);
  });
});
