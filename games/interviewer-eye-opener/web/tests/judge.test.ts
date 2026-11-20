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

  it("does not let faction scoring or profile evidence rewrite business facts", () => {
    const failed = applyDecision(createRun("academic", 1), "count-every-request");
    const decorated = structuredClone(failed);
    decorated.excludedFromCourse = ["duplicate-like"];
    decorated.behaviorLog.push({
      eventId: "forged-profile-event",
      sequence: decorated.behaviorLog.length + 1,
      kind: "VIEW_EVIDENCE",
      incidentId: "duplicate-like",
      action: "宣称已经看过全部证据",
      observationEligible: true,
      eligibilityReason: "对抗性测试中的伪造画像记录",
      availableAlternatives: ["保留失败"],
      knownCosts: [],
      evidenceSeenBeforeAction: ["并不存在的证明"],
      signal: { status: "OBSERVED", dimensions: { E: 99, V: 99 } },
    });
    decorated.finalVerdict = {
      status: "PASS",
      checks: [],
      passed: 5,
      failed: 0,
      unknown: 0,
      businessScore: 100,
    };

    const verdict = judgeRun(decorated);
    expect(verdict.status).toBe("FAIL");
    expect(verdict.checks.find((check) => check.incidentId === "duplicate-like")?.status).toBe("FAIL");
  });

  it("judges the observed traffic contract instead of the stored world narrative", () => {
    const run = playWinningRun("simple");
    const tampered = structuredClone(run);
    const attempt = tampered.attempts.find((candidate) => candidate.incidentId === "traffic-spike");
    if (!attempt) throw new Error("missing traffic-spike attempt");
    attempt.worldAfter.databaseCapacity = 9999;
    attempt.worldAfter.unresolvedFailures = 0;
    attempt.observation.facts.processed = 10;
    attempt.observation.facts.rejected = 110;
    attempt.observation.systemClaim = "PASS";

    const check = judgeRun(tampered).checks.find((candidate) => candidate.incidentId === "traffic-spike");
    expect(check?.status).toBe("FAIL");
  });
});
