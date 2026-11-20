import { INCIDENTS } from "./content";
import type {
  FactValue,
  GameRun,
  IncidentAttempt,
  IncidentId,
  JudgeCheck,
  RunVerdict,
  VerdictStatus,
} from "./types";

const latestAttempt = (run: GameRun, incidentId: IncidentId): IncidentAttempt | undefined =>
  run.attempts.filter((attempt) => attempt.incidentId === incidentId).at(-1);

const fact = (attempt: IncidentAttempt, name: string): FactValue | undefined =>
  attempt.observation.facts[name];

const numberFact = (attempt: IncidentAttempt, name: string): number => {
  const value = fact(attempt, name);
  return typeof value === "number" ? value : Number.NaN;
};

const booleanFact = (attempt: IncidentAttempt, name: string): boolean =>
  fact(attempt, name) === true;

const result = (
  incidentId: IncidentId,
  status: VerdictStatus,
  summary: string,
  evidence: string[],
): JudgeCheck => ({
  incidentId,
  title: INCIDENTS.find((incident) => incident.id === incidentId)?.title ?? incidentId,
  status,
  summary,
  evidence,
});

const judgeDuplicateLike = (attempt: IncidentAttempt): JudgeCheck => {
  const stateSum = numberFact(attempt, "stateSum");
  const storedCount = numberFact(attempt, "storedCount");
  const duplicateEffects = numberFact(attempt, "duplicateEffects");
  const changedResponses = numberFact(attempt, "changedResponses");
  const passed = stateSum === 1 && storedCount === 1 && duplicateEffects === 0 && changedResponses === 1;
  return result(
    "duplicate-like",
    passed ? "PASS" : "FAIL",
    passed
      ? "100 个不同请求只产生了一次 0 → 1。"
      : "并发请求破坏了唯一状态、独立计数或响应合同。",
    [
      `有效状态之和=${stateSum}`,
      `独立计数=${storedCount}`,
      `重复业务效果=${duplicateEffects}`,
      `宣称发生变化的响应=${changedResponses}`,
    ],
  );
};

const judgeResponseLoss = (attempt: IncidentAttempt): JudgeCheck => {
  const durableRequest = booleanFact(attempt, "durableRequest");
  const committedEffects = numberFact(attempt, "committedEffects");
  const retryReplayed = booleanFact(attempt, "retryReplayed");
  const clientResultMatches = booleanFact(attempt, "clientResultMatches");
  const passed = durableRequest && committedEffects === 1 && retryReplayed && clientResultMatches;
  return result(
    "response-loss",
    passed ? "PASS" : "FAIL",
    passed
      ? "响应丢失后，从持久化请求记录恢复了原结果。"
      : "系统没有证据证明重试恢复的是原请求结果。",
    [
      `持久化请求记录=${durableRequest}`,
      `实际业务效果=${committedEffects}`,
      `重试标记=${retryReplayed}`,
      `客户端结果一致=${clientResultMatches}`,
    ],
  );
};

const judgeMessageOutage = (attempt: IncidentAttempt): JudgeCheck => {
  const finalStateCorrect = booleanFact(attempt, "finalStateCorrect");
  const durableEvidence = booleanFact(attempt, "durableEvidence");
  const authoritativeEvidence = booleanFact(attempt, "authoritativeEvidence");
  const lostOperations = numberFact(attempt, "lostOperations");
  const duplicateEffects = numberFact(attempt, "duplicateEffects");

  if (finalStateCorrect && durableEvidence && authoritativeEvidence && lostOperations === 0 && duplicateEffects === 0) {
    return result(
      "message-outage",
      "PASS",
      "故障边界内仍有可靠事实，最终状态能够恢复。",
      ["可靠接收=是", "权威事实=明确", "丢失操作=0", "重复业务效果=0"],
    );
  }

  if (finalStateCorrect && (!durableEvidence || !authoritativeEvidence)) {
    return result(
      "message-outage",
      "UNKNOWN",
      "当前数值看起来正确，但没有足够证据证明能够恢复。",
      [
        `可靠接收=${durableEvidence}`,
        `权威事实=${authoritativeEvidence}`,
        `丢失操作=${lostOperations}`,
      ],
    );
  }

  return result(
    "message-outage",
    "FAIL",
    "系统作出的承诺与最终业务事实不一致。",
    [`最终状态正确=${finalStateCorrect}`, `丢失操作=${lostOperations}`, `重复业务效果=${duplicateEffects}`],
  );
};

const judgeTrafficSpike = (attempt: IncidentAttempt): JudgeCheck => {
  const processed = numberFact(attempt, "processed");
  const rejected = numberFact(attempt, "rejected");
  const errors = numberFact(attempt, "errors");
  const p95 = numberFact(attempt, "p95Ms");
  const countConsistent = booleanFact(attempt, "countConsistent");
  const measured = booleanFact(attempt, "measured");
  const passed = processed >= 114
    && rejected <= 6
    && errors === 0
    && p95 <= 250
    && countConsistent
    && measured;
  return result(
    "traffic-spike",
    passed ? "PASS" : "FAIL",
    passed
      ? "固定预算下满足吞吐、延迟、可用性和一致性目标。"
      : "正确性、性能或可用性至少有一项没有达到合同。",
    [
      `处理=${processed}/120`,
      `拒绝=${rejected}`,
      `错误=${errors}`,
      `P95=${p95}ms`,
      `计数一致=${countConsistent}`,
      `有压测证据=${measured}`,
    ],
  );
};

const judgeDuplicateCharge = (attempt: IncidentAttempt): JudgeCheck => {
  const charges = numberFact(attempt, "charges");
  const reproduced = booleanFact(attempt, "reproduced");
  const rootCauseFound = booleanFact(attempt, "rootCauseFound");
  const fixEvidence = booleanFact(attempt, "fixEvidence");
  const neighborCasePassed = booleanFact(attempt, "neighborCasePassed");

  if (charges === 1 && reproduced && rootCauseFound && fixEvidence && neighborCasePassed) {
    return result(
      "duplicate-charge",
      "PASS",
      "陌生问题完成了复现、归因、修复和邻近场景验证。",
      ["最终扣款=1", "反例已固定", "根因已定位", "修复证据完整", "邻近重试通过"],
    );
  }

  if (charges === 1 && (!reproduced || !rootCauseFound || !fixEvidence || !neighborCasePassed)) {
    return result(
      "duplicate-charge",
      "UNKNOWN",
      "这次没有重复扣款，但能力迁移证据不完整。",
      [
        `反例复现=${reproduced}`,
        `根因定位=${rootCauseFound}`,
        `修复证据=${fixEvidence}`,
        `邻近场景=${neighborCasePassed}`,
      ],
    );
  }

  return result(
    "duplicate-charge",
    "FAIL",
    "同一业务订单产生了多次扣款。",
    [`实际扣款次数=${charges}`, `反例复现=${reproduced}`, `根因定位=${rootCauseFound}`],
  );
};

const judgeAttempt = (attempt: IncidentAttempt): JudgeCheck => {
  switch (attempt.incidentId) {
    case "duplicate-like":
      return judgeDuplicateLike(attempt);
    case "response-loss":
      return judgeResponseLoss(attempt);
    case "message-outage":
      return judgeMessageOutage(attempt);
    case "traffic-spike":
      return judgeTrafficSpike(attempt);
    case "duplicate-charge":
      return judgeDuplicateCharge(attempt);
  }
};

export const judgeRun = (run: GameRun): RunVerdict => {
  const checks = INCIDENTS.map((incident): JudgeCheck => {
    const attempt = latestAttempt(run, incident.id);
    return attempt
      ? judgeAttempt(attempt)
      : result(incident.id, "UNKNOWN", "该场景尚未执行。", ["没有运行证据"]);
  });
  const passed = checks.filter((check) => check.status === "PASS").length;
  const failed = checks.filter((check) => check.status === "FAIL").length;
  const unknown = checks.filter((check) => check.status === "UNKNOWN").length;
  const status: VerdictStatus = failed > 0 ? "FAIL" : unknown > 0 ? "UNKNOWN" : "PASS";
  return {
    status,
    checks,
    passed,
    failed,
    unknown,
    businessScore: Math.round((passed / checks.length) * 100),
  };
};

export const checkForIncident = (run: GameRun, incidentId: IncidentId): JudgeCheck =>
  judgeRun(run).checks.find((check) => check.incidentId === incidentId)
    ?? result(incidentId, "UNKNOWN", "该场景尚未执行。", ["没有运行证据"]);
