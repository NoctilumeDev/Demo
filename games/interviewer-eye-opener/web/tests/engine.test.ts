import { describe, expect, it } from "vitest";

import { calculateFactionScore } from "../src/game/score";
import {
  advanceIncident,
  applyDecision,
  completeNextCourse,
  createRun,
  retryCurrentIncident,
  toggleAcademicScope,
  viewCurrentEvidence,
} from "../src/game/engine";
import { checkForIncident } from "../src/game/judge";
import { judgeRun } from "../src/game/judge";
import type { FactionId } from "../src/game/types";
import { playDecisions, playWinningRun, WINNING_DECISIONS } from "./helpers";

describe("game engine", () => {
  it.each<FactionId>(["simple", "buzzword", "engineering", "academic", "training"])(
    "allows %s to pass the same business contract",
    (factionId) => {
      const run = playWinningRun(factionId);
      expect(run.phase).toBe("SETTLED");
      expect(run.finalVerdict?.status).toBe("PASS");
      expect(run.finalVerdict?.passed).toBe(5);
    },
  );

  it("moves the training maximum before the player completes each course", () => {
    let run = createRun("training", 1);
    expect(run.training).toMatchObject({ score: 80, maximum: 100 });

    run = applyDecision(run, WINNING_DECISIONS[0]!);
    run = advanceIncident(run);
    expect(run.training).toMatchObject({ score: 80, maximum: 120 });

    run = completeNextCourse(run);
    expect(run.training).toMatchObject({ score: 110, maximum: 120 });

    run = applyDecision(run, WINNING_DECISIONS[1]!);
    run = advanceIncident(run);
    expect(run.training).toMatchObject({ score: 110, maximum: 150 });

    run = completeNextCourse(run);
    expect(run.training).toMatchObject({ score: 140, maximum: 150 });

    run = applyDecision(run, WINNING_DECISIONS[2]!);
    run = advanceIncident(run);
    expect(run.training).toMatchObject({ score: 140, maximum: 180 });

    run = completeNextCourse(run);
    expect(run.training).toMatchObject({ score: 170, maximum: 180 });
  });

  it("lets the academic score reach 100 without changing a failed business verdict", () => {
    const run = playDecisions("academic", [
      "db-unique",
      "transactional-request-record",
      "database-fallback",
      "reject-everything",
      "sql-business-key",
    ]);
    expect(run.finalVerdict?.status).toBe("FAIL");

    const reopened = { ...run, phase: "REVIEW" as const, incidentIndex: 3, finalVerdict: undefined };
    const excluded = toggleAcademicScope(reopened);
    const score = calculateFactionScore(excluded, judgeRun(excluded));

    expect(score.value).toBe(100);
    expect(judgeRun(excluded).status).toBe("FAIL");
  });

  it("scores only executed academic checks and exposes zero coverage", () => {
    let run = createRun("academic", 1);
    run = applyDecision(run, "count-every-request");

    const before = calculateFactionScore(run, judgeRun(run));
    expect(before.value).toBe(0);
    expect(before.note).toContain("有效考核 1 项");

    run = toggleAcademicScope(run);
    const after = calculateFactionScore(run, judgeRun(run));
    expect(after.value).toBe(100);
    expect(after.note).toContain("有效考核 0 项");
    expect(after.note).toContain("已排除 1 项");
    expect(judgeRun(run).status).toBe("FAIL");
  });

  it("uses neutral retry history for both passing and failing results", () => {
    const reviewed = applyDecision(createRun("simple", 1), "db-unique");
    const retried = retryCurrentIncident(reviewed);

    expect(retried.history.at(-1)?.title).toBe("保留本次结果，重新选择");
  });

  it("keeps deterministic facts for the same decisions", () => {
    const first = playWinningRun("simple");
    const second = playWinningRun("simple");
    expect(first.attempts.map((attempt) => attempt.observation.facts)).toEqual(
      second.attempts.map((attempt) => attempt.observation.facts),
    );
  });

  it("lets history change the outcome of the same capacity decision", () => {
    const clean = playDecisions("simple", [
      "db-unique",
      "transactional-request-record",
      "database-fallback",
      "measure-and-scale",
    ]);
    const dirty = playDecisions("simple", [
      "redis-idempotency",
      "async-ack",
      "ignore-message-loss",
      "measure-and-scale",
    ]);

    expect(checkForIncident(clean, "traffic-spike").status).toBe("PASS");
    expect(checkForIncident(dirty, "traffic-spike").status).toBe("FAIL");
    expect(clean.attempts.at(-1)?.decisionId).toBe(dirty.attempts.at(-1)?.decisionId);
    expect(clean.attempts.at(-1)?.observation.facts.effectiveCapacity)
      .not.toBe(dirty.attempts.at(-1)?.observation.facts.effectiveCapacity);
  });

  it("uses earlier controls to decide whether reconciliation has an authority source", () => {
    let evidenced = createRun("simple", 1);
    evidenced = advanceIncident(applyDecision(evidenced, "db-unique"));
    evidenced = advanceIncident(applyDecision(evidenced, "transactional-request-record"));
    evidenced = applyDecision(evidenced, "scheduled-reconciliation");

    let unevidenced = createRun("simple", 2);
    unevidenced = advanceIncident(applyDecision(unevidenced, "redis-idempotency"));
    unevidenced = advanceIncident(applyDecision(unevidenced, "blind-retry"));
    unevidenced = applyDecision(unevidenced, "scheduled-reconciliation");

    expect(checkForIncident(evidenced, "message-outage").status).toBe("PASS");
    expect(checkForIncident(unevidenced, "message-outage").status).toBe("UNKNOWN");
  });

  it("records optional evidence views but excludes forced navigation from profiling", () => {
    let run = createRun("engineering", 1);
    const initialTime = run.timeRemaining;
    run = viewCurrentEvidence(run);
    run = applyDecision(run, "db-unique");
    run = advanceIncident(run);

    const evidenceEvent = run.behaviorLog.find((event) => event.kind === "VIEW_EVIDENCE");
    const advanceEvent = run.behaviorLog.find((event) => event.kind === "ADVANCE");
    expect(evidenceEvent?.observationEligible).toBe(true);
    expect(evidenceEvent?.signal).toMatchObject({ status: "OBSERVED", dimensions: { E: 1 } });
    expect(advanceEvent?.observationEligible).toBe(false);
    expect(run.timeRemaining).toBe(initialTime - 2);
  });

  it("keeps failed evidence while rolling the simulated world back before a retry", () => {
    let run = applyDecision(createRun("simple", 1), "count-every-request");
    expect(run.world.unresolvedFailures).toBe(1);
    const timeBefore = run.timeRemaining;
    run = retryCurrentIncident(run);

    expect(run.world.unresolvedFailures).toBe(0);
    expect(run.timeRemaining).toBe(timeBefore - 1);
    expect(run.attempts).toHaveLength(1);
    expect(run.behaviorLog.at(-1)?.kind).toBe("RETRY");
  });
});
