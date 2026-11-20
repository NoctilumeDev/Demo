import { describe, expect, it } from "vitest";

import { initialCareer, recordCompletedRun } from "../src/game/achievements";
import { playDecisions, playWinningRun } from "./helpers";

describe("achievements", () => {
  it("starts with the three evidence-backed project-history achievements", () => {
    const career = initialCareer();
    expect(career.achievements.map((achievement) => achievement.id)).toEqual([
      "day-one-runs",
      "judge-was-judged",
      "markdown-scaling",
    ]);
  });

  it("unlocks the training nightmare when existing skills solve the unfamiliar task", () => {
    const run = playWinningRun("training");
    const recorded = recordCompletedRun(initialCareer(), run);
    expect(recorded.newUnlocks.map((unlock) => unlock.id)).toContain("training-nightmare");
  });

  it("unlocks permanent fresher after all courses but a failed transfer task", () => {
    const run = playDecisions("training", [
      "db-unique",
      "transactional-request-record",
      "database-fallback",
      "measure-and-scale",
      "retry-payment",
    ], true);
    const recorded = recordCompletedRun(initialCareer(), run);
    expect(recorded.newUnlocks.map((unlock) => unlock.id)).toContain("permanent-fresher");
    expect(recorded.run.finalVerdict?.status).toBe("FAIL");
  });
});
