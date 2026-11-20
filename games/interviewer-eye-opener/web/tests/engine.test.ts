import { describe, expect, it } from "vitest";

import { calculateFactionScore } from "../src/game/score";
import {
  advanceIncident,
  applyDecision,
  completeNextCourse,
  createRun,
  retryCurrentIncident,
  toggleAcademicScope,
} from "../src/game/engine";
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
      "count-every-request",
      "transactional-request-record",
      "database-fallback",
      "measure-and-scale",
      "sql-business-key",
    ]);
    expect(run.finalVerdict?.status).toBe("FAIL");

    const reopened = { ...run, phase: "REVIEW" as const, incidentIndex: 0, finalVerdict: undefined };
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
});
