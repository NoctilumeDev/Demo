import { describe, expect, it } from "vitest";

import { applyDecision, createRun } from "../src/game/engine";
import { judgeRun } from "../src/game/judge";
import { playWinningRun } from "./helpers";

describe("independent simulation judge", () => {
  it("rejects a forged PASS claim when duplicate effects remain", () => {
    const run = applyDecision(createRun("simple", 1), "count-every-request");
    const verdict = judgeRun(run);
    const check = verdict.checks.find((candidate) => candidate.incidentId === "duplicate-like");

    expect(run.attempts[0]?.observation.systemClaim).toBe("PASS");
    expect(check?.status).toBe("FAIL");
    expect(verdict.status).toBe("FAIL");
  });

  it("rejects an invented client count even when the system still claims PASS", () => {
    const run = playWinningRun("simple");
    const tampered = structuredClone(run);
    const attempt = tampered.attempts.find((candidate) => candidate.incidentId === "duplicate-like");
    if (!attempt) throw new Error("missing duplicate-like attempt");
    attempt.observation.facts.storedCount = 999;
    attempt.observation.systemClaim = "PASS";

    const verdict = judgeRun(tampered);
    expect(verdict.checks.find((check) => check.incidentId === "duplicate-like")?.status).toBe("FAIL");
    expect(verdict.status).toBe("FAIL");
  });

  it("keeps reconciliation without an authority source as UNKNOWN", () => {
    let run = createRun("engineering", 1);
    run = applyDecision(run, "db-unique");
    run = { ...run, phase: "DECISION", incidentIndex: 2 };
    run = applyDecision(run, "scheduled-reconciliation");

    const check = judgeRun(run).checks.find((candidate) => candidate.incidentId === "message-outage");
    expect(check?.status).toBe("UNKNOWN");
  });
});
