import { describe, expect, it } from "vitest";

import {
  answerAssessment,
  assessmentCandidateJudgments,
  assessmentQuestionAttempt,
  currentAssessmentCandidate,
  emptyAssessment,
  judgeAssessmentCandidate,
  markAssessmentExplanationViewed,
} from "../src/game/assessment";

const permutations = (values: string[]): string[][] => {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index),
    ...values.slice(index + 1),
  ]).map((tail) => [value, ...tail]));
};

describe("BT-CARD-v0.1-rc1 assessment protocol", () => {
  it("records a reproducible random order instead of displaying all four options together", () => {
    const first = emptyAssessment(20261120);
    const second = emptyAssessment(20261120);
    const another = emptyAssessment(20261121);

    expect(first.questionAttempts.map((attempt) => attempt.presentationOrder))
      .toEqual(second.questionAttempts.map((attempt) => attempt.presentationOrder));
    expect(first.questionAttempts[0]?.presentationOrder).toHaveLength(4);
    expect(new Set(first.questionAttempts[0]!.presentationOrder)).toEqual(new Set(["Q1-A", "Q1-B", "Q1-C", "Q1-D"]));
    expect(first.questionAttempts.map((attempt) => attempt.presentationOrder))
      .not.toEqual(another.questionAttempts.map((attempt) => attempt.presentationOrder));
  });

  it("keeps candidate judgments, explanation views and final choice as separate records", () => {
    let assessment = emptyAssessment(42);
    const first = currentAssessmentCandidate(assessment, "Q1");
    if (!first) throw new Error("missing first candidate");
    assessment = markAssessmentExplanationViewed(assessment, first.id);
    assessment = judgeAssessmentCandidate(assessment, "Q1", first.id, "SKIP");

    while (currentAssessmentCandidate(assessment, "Q1")) {
      const option = currentAssessmentCandidate(assessment, "Q1")!;
      assessment = judgeAssessmentCandidate(assessment, "Q1", option.id, "KEEP");
    }
    assessment = answerAssessment(assessment, "Q1", first.id);

    const judgments = assessmentCandidateJudgments(assessment, "Q1");
    expect(judgments).toHaveLength(4);
    expect(judgments[0]).toMatchObject({
      optionId: first.id,
      disposition: "SKIP",
      explanationViewedBeforeDecision: true,
      presentedOrder: 1,
    });
    const attempt = assessmentQuestionAttempt(assessment, "Q1");
    expect(attempt?.finalChoice).toBe(first.id);
    expect(attempt?.cardJudgments.filter((judgment) => judgment.disposition === "KEEP").map((judgment) => judgment.optionId))
      .not.toContain(first.id);
    expect(attempt?.presentationOrder).toEqual(judgments.map((item) => item.optionId));
    expect(attempt?.phase).toBe("SUBMITTED");
  });

  it("allows all candidates to be skipped but still requires one final action", () => {
    let assessment = emptyAssessment(7);
    while (currentAssessmentCandidate(assessment, "Q1")) {
      const option = currentAssessmentCandidate(assessment, "Q1")!;
      assessment = judgeAssessmentCandidate(assessment, "Q1", option.id, "SKIP");
    }
    const finalOption = assessmentQuestionAttempt(assessment, "Q1")!.presentationOrder[0]!;
    assessment = answerAssessment(assessment, "Q1", finalOption);

    const attempt = assessmentQuestionAttempt(assessment, "Q1");
    expect(attempt?.cardJudgments.filter((judgment) => judgment.disposition === "KEEP")).toEqual([]);
    expect(attempt?.finalChoice).toBe(finalOption);
  });

  it("allows all candidates to be kept without inventing the final action", () => {
    let assessment = emptyAssessment(8);
    while (currentAssessmentCandidate(assessment, "Q1")) {
      const option = currentAssessmentCandidate(assessment, "Q1")!;
      assessment = judgeAssessmentCandidate(assessment, "Q1", option.id, "KEEP");
    }

    const attempt = assessmentQuestionAttempt(assessment, "Q1");
    expect(attempt?.cardJudgments).toHaveLength(4);
    expect(attempt?.cardJudgments.every((judgment) => judgment.disposition === "KEEP")).toBe(true);
    expect(attempt?.phase).toBe("CHOOSING");
    expect(attempt?.finalChoice).toBeNull();
  });

  it("refuses to finalize before all four cards were judged", () => {
    const assessment = emptyAssessment(9);
    expect(() => answerAssessment(assessment, "Q1", "Q1-A"))
      .toThrow("四张候选卡还没有逐张判断完");
  });

  it("completes all 24 presentation permutations without losing card identity", () => {
    for (const order of permutations(["Q1-A", "Q1-B", "Q1-C", "Q1-D"])) {
      let assessment = emptyAssessment(11);
      assessment.questionAttempts[0]!.presentationOrder = order;
      for (const optionId of order) {
        assessment = judgeAssessmentCandidate(assessment, "Q1", optionId, "KEEP");
      }
      assessment = answerAssessment(assessment, "Q1", order[2]!);
      const attempt = assessmentQuestionAttempt(assessment, "Q1")!;
      expect(attempt.presentationOrder).toEqual(order);
      expect(attempt.cardJudgments.map((item) => item.optionId)).toEqual(order);
      expect(attempt.finalChoice).toBe(order[2]);
    }
  });

  it("does not rewrite a judgment when its explanation is opened later", () => {
    let assessment = emptyAssessment(13);
    const first = currentAssessmentCandidate(assessment, "Q1")!;
    assessment = judgeAssessmentCandidate(assessment, "Q1", first.id, "SKIP");
    assessment = markAssessmentExplanationViewed(assessment, first.id);

    const attempt = assessmentQuestionAttempt(assessment, "Q1")!;
    expect(attempt.cardJudgments[0]?.explanationViewedBeforeDecision).toBe(false);
    expect(attempt.events.map((event) => event.kind)).toEqual(["CARD_JUDGED", "EXPLANATION_VIEWED"]);
  });

  it("does not allow an unseen future card to receive an explanation event", () => {
    const assessment = emptyAssessment(15);
    const attempt = assessmentQuestionAttempt(assessment, "Q1")!;
    const futureOption = attempt.presentationOrder[2]!;

    expect(() => markAssessmentExplanationViewed(assessment, futureOption))
      .toThrow("这张卡还没有展示");
  });

  it("rejects double judgment and double final submission", () => {
    let assessment = emptyAssessment(17);
    const first = currentAssessmentCandidate(assessment, "Q1")!;
    assessment = judgeAssessmentCandidate(assessment, "Q1", first.id, "KEEP");
    expect(() => judgeAssessmentCandidate(assessment, "Q1", first.id, "KEEP"))
      .toThrow("当前卡片不属于这一步");

    while (currentAssessmentCandidate(assessment, "Q1")) {
      const option = currentAssessmentCandidate(assessment, "Q1")!;
      assessment = judgeAssessmentCandidate(assessment, "Q1", option.id, "SKIP");
    }
    assessment = answerAssessment(assessment, "Q1", first.id);
    expect(() => answerAssessment(assessment, "Q1", first.id))
      .toThrow("第一轮原始选择已经锁定");
  });

  it("keeps question attempts isolated", () => {
    let assessment = emptyAssessment(19);
    const q1Before = structuredClone(assessmentQuestionAttempt(assessment, "Q1"));
    const q2Before = structuredClone(assessmentQuestionAttempt(assessment, "Q2"));
    const q1Card = currentAssessmentCandidate(assessment, "Q1")!;
    assessment = judgeAssessmentCandidate(assessment, "Q1", q1Card.id, "KEEP");

    expect(assessmentQuestionAttempt(assessment, "Q1")).not.toEqual(q1Before);
    expect(assessmentQuestionAttempt(assessment, "Q2")).toEqual(q2Before);
    expect(assessmentQuestionAttempt(assessment, "Q1")?.attemptId)
      .not.toBe(assessmentQuestionAttempt(assessment, "Q2")?.attemptId);
  });
});
