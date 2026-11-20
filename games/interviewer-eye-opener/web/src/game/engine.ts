import { factionById, INCIDENTS, incidentById } from "./content";
import { checkForIncident, judgeRun } from "./judge";
import type {
  DecisionDefinition,
  FactValue,
  FactionId,
  GameRun,
  IncidentAttempt,
  IncidentId,
  SimulationObservation,
  TimelineEntry,
} from "./types";

const unique = (values: string[]): string[] => [...new Set(values)];

const appendHistory = (
  run: GameRun,
  entry: Omit<TimelineEntry, "sequence">,
): TimelineEntry[] => [
  ...run.history,
  { ...entry, sequence: run.history.length + 1 },
];

export const createRun = (factionId: FactionId, runNumber: number): GameRun => {
  const faction = factionById(factionId);
  const suffix = String(runNumber).padStart(3, "0");
  const runId = `run-${suffix}-${factionId}`;
  return {
    schemaVersion: 1,
    runId,
    worldId: `sim-${factionId}-${suffix}`,
    runNumber,
    factionId,
    phase: "DECISION",
    incidentIndex: 0,
    budget: faction.initialBudget,
    timeRemaining: faction.initialTime,
    complexity: faction.initialComponents.length,
    evidenceScore: factionId === "engineering" ? 2 : 0,
    components: [...faction.initialComponents],
    controls: [],
    excludedFromCourse: [],
    attempts: [],
    history: [
      {
        sequence: 1,
        kind: "SYSTEM",
        title: `${faction.name}进入独立世界`,
        detail: `世界 ${`sim-${factionId}-${suffix}`} 已创建。这里是确定性游戏仿真，不冒充真实 MySQL 实验。`,
      },
    ],
    training: factionId === "training"
      ? {
          score: 80,
          maximum: 100,
          offeredCourses: [],
          completedCourses: ["Java"],
        }
      : undefined,
    unlockedAchievementIds: [],
  };
};

export const currentIncident = (run: GameRun) => INCIDENTS[run.incidentIndex];

export const currentAttempt = (run: GameRun): IncidentAttempt | undefined => {
  const incident = currentIncident(run);
  return incident
    ? run.attempts.filter((attempt) => attempt.incidentId === incident.id).at(-1)
    : undefined;
};

const decisionCost = (run: GameRun, decision: DecisionDefinition): number => {
  let discount = 0;
  if (run.factionId === "simple" && decision.tags.includes("database")) discount += 2;
  if (run.factionId === "buzzword" && decision.tags.includes("component")) discount += 2;
  if (run.factionId === "engineering" && decision.tags.includes("evidence")) discount += 2;
  return Math.max(0, decision.cost - discount);
};

const decisionTime = (run: GameRun, decision: DecisionDefinition): number =>
  Math.max(0, decision.time - (run.factionId === "engineering" && decision.tags.includes("evidence") ? 1 : 0));

export const decisionPrice = (run: GameRun, decision: DecisionDefinition) => ({
  budget: decisionCost(run, decision),
  time: decisionTime(run, decision),
});

export const canApplyDecision = (run: GameRun, decision: DecisionDefinition): boolean => {
  const price = decisionPrice(run, decision);
  return run.phase === "DECISION" && run.budget >= price.budget && run.timeRemaining >= price.time;
};

const observation = (
  facts: Record<string, FactValue>,
  systemClaim: SimulationObservation["systemClaim"],
  systemMessage: string,
  evidence: string[],
): SimulationObservation => ({ facts, systemClaim, systemMessage, evidence });

const simulateDecision = (run: GameRun, decisionId: string): SimulationObservation => {
  switch (decisionId) {
    case "db-unique":
      return observation(
        { stateSum: 1, storedCount: 1, duplicateEffects: 0, changedResponses: 1 },
        "PASS",
        "数据库只允许一个有效状态。",
        ["唯一业务键", "条件更新", "独立计数核对"],
      );
    case "redis-idempotency":
      return observation(
        { stateSum: 1, storedCount: 1, duplicateEffects: 0, changedResponses: 1 },
        "PASS",
        "Redis 抢到第一次写入，数据库结果正确。",
        ["Redis 去重键", "数据库状态核对", "新增 Redis 恢复路径"],
      );
    case "count-every-request":
      return observation(
        { stateSum: 1, storedCount: 100, duplicateEffects: 99, changedResponses: 100 },
        "PASS",
        "100 个请求全部返回成功。",
        ["页面显示 100", "没有保存并发获胜证据"],
      );
    case "transactional-request-record":
      return observation(
        { durableRequest: true, committedEffects: 1, retryReplayed: true, clientResultMatches: true },
        "PASS",
        "同一请求恢复原业务结果，只有 replayed 标志改变。",
        ["请求记录与业务状态同事务", "响应丢失注入", "重试读回"],
      );
    case "blind-retry":
      return observation(
        {
          durableRequest: false,
          committedEffects: run.controls.includes("unique-business-key") ? 1 : 2,
          retryReplayed: false,
          clientResultMatches: false,
        },
        "PASS",
        "最终数值看起来没有变化。",
        ["没有原请求记录", "第二次重新执行"],
      );
    case "async-ack":
      return observation(
        { durableRequest: false, committedEffects: 0, retryReplayed: false, clientResultMatches: false },
        "PASS",
        "客户端很快收到了已受理。",
        ["消息进入可靠存储前已返回", "发布失败时没有恢复依据"],
      );
    case "database-fallback":
      return observation(
        {
          finalStateCorrect: true,
          durableEvidence: true,
          authoritativeEvidence: true,
          lostOperations: 0,
          duplicateEffects: 0,
        },
        "PASS",
        "关键路径退回数据库，通知延后。",
        ["数据库提交记录", "降级开关", "最终状态核对"],
      );
    case "outbox-consumer":
      return observation(
        {
          finalStateCorrect: true,
          durableEvidence: true,
          authoritativeEvidence: true,
          lostOperations: 0,
          duplicateEffects: 0,
        },
        "PASS",
        "业务与 Outbox 同时提交，重复消息被幂等消费。",
        ["Outbox 行", "消息 ID", "消费记录", "顺序重放"],
      );
    case "scheduled-reconciliation":
      return observation(
        {
          finalStateCorrect: true,
          durableEvidence: false,
          authoritativeEvidence: false,
          lostOperations: 0,
          duplicateEffects: 0,
        },
        "PASS",
        "对账任务运行完成，页面暂时一致。",
        ["定时任务成功日志", "权威数据源未定义"],
      );
    case "ignore-message-loss":
      return observation(
        {
          finalStateCorrect: false,
          durableEvidence: false,
          authoritativeEvidence: false,
          lostOperations: 1,
          duplicateEffects: 0,
        },
        "UNKNOWN",
        "本题不在当前验收范围。",
        ["课程界面已移除红灯", "业务操作仍然丢失"],
      );
    case "measure-and-scale":
      return observation(
        { processed: 120, rejected: 0, errors: 0, p95Ms: 118, countConsistent: true, measured: true },
        "PASS",
        "压测定位连接瓶颈，扩容后重新跑过完整场景。",
        ["基线曲线", "扩容前后对照", "P95/P99", "状态总和核对"],
      );
    case "cache-with-invalidation":
      return observation(
        { processed: 120, rejected: 0, errors: 0, p95Ms: 76, countConsistent: true, measured: true },
        "PASS",
        "缓存承担读取，更新路径同步失效。",
        ["命中率", "失效事件", "缓存与数据库抽样核对"],
      );
    case "reject-everything":
      return observation(
        { processed: 0, rejected: 120, errors: 0, p95Ms: 2, countConsistent: true, measured: true },
        "PASS",
        "系统全程稳定，没有产生错误数据。",
        ["拒绝率 100%", "业务处理量 0"],
      );
    case "payment-idempotency":
      return observation(
        { charges: 1, reproduced: true, rootCauseFound: true, fixEvidence: true, neighborCasePassed: true },
        "PASS",
        "业务订单只对应一份确定扣款结果。",
        ["重复扣款反例", "业务键", "请求结果记录", "相邻重试重放"],
      );
    case "sql-business-key":
      return observation(
        { charges: 1, reproduced: true, rootCauseFound: true, fixEvidence: true, neighborCasePassed: true },
        "PASS",
        "只用 SQL 也完成了复现、修复和验证。",
        ["复现 SQL", "唯一业务键", "事务日志", "相邻场景查询"],
      );
    case "retry-payment":
      return observation(
        { charges: 2, reproduced: true, rootCauseFound: false, fixEvidence: false, neighborCasePassed: false },
        "PASS",
        "问题已经可以稳定复现。",
        ["同一订单出现两条扣款记录", "仍未定位业务幂等边界"],
      );
    default:
      throw new Error(`Unknown decision: ${decisionId}`);
  }
};

const additionsForDecision = (decisionId: string): { components: string[]; controls: string[] } => {
  switch (decisionId) {
    case "db-unique":
      return { components: [], controls: ["unique-business-key"] };
    case "redis-idempotency":
      return { components: ["Redis"], controls: ["redis-dedupe"] };
    case "transactional-request-record":
      return { components: [], controls: ["transactional-request-record"] };
    case "async-ack":
      return { components: ["MQ"], controls: ["async-ack"] };
    case "database-fallback":
      return { components: [], controls: ["database-fallback"] };
    case "outbox-consumer":
      return { components: ["MQ", "Outbox worker"], controls: ["transactional-outbox", "idempotent-consumer"] };
    case "measure-and-scale":
      return { components: ["DB replica", "Load rig"], controls: ["capacity-baseline"] };
    case "cache-with-invalidation":
      return { components: ["Redis"], controls: ["cache-invalidation"] };
    case "payment-idempotency":
      return { components: [], controls: ["payment-request-record"] };
    case "sql-business-key":
      return { components: [], controls: ["payment-business-key"] };
    default:
      return { components: [], controls: [] };
  }
};

export const applyDecision = (run: GameRun, decisionId: string): GameRun => {
  const incident = currentIncident(run);
  if (!incident) throw new Error("No current incident");
  const decision = incident.decisions.find((candidate) => candidate.id === decisionId);
  if (!decision) throw new Error(`Decision ${decisionId} does not belong to ${incident.id}`);
  if (!canApplyDecision(run, decision)) throw new Error("Decision cannot be afforded or the run is not awaiting a decision");

  const price = decisionPrice(run, decision);
  const additions = additionsForDecision(decision.id);
  const components = unique([...run.components, ...additions.components]);
  const controls = unique([...run.controls, ...additions.controls]);
  const attemptNumber = run.attempts.filter((attempt) => attempt.incidentId === incident.id).length + 1;
  const attempt: IncidentAttempt = {
    attempt: attemptNumber,
    incidentId: incident.id,
    decisionId: decision.id,
    decisionTitle: decision.title,
    budgetSpent: price.budget,
    timeSpent: price.time,
    observation: simulateDecision(run, decision.id),
  };
  const newComponentCount = components.length - run.components.length;
  const evidenceGain = decision.tags.includes("evidence") ? (incident.id === "duplicate-charge" ? 3 : 2) : 0;
  const next: GameRun = {
    ...run,
    phase: "REVIEW",
    budget: run.budget - price.budget,
    timeRemaining: run.timeRemaining - price.time,
    complexity: run.complexity + newComponentCount,
    evidenceScore: run.evidenceScore + evidenceGain,
    components,
    controls,
    attempts: [...run.attempts, attempt],
    history: appendHistory(run, {
      kind: "DECISION",
      title: decision.title,
      detail: `消耗 ${price.budget} 预算、${price.time} 时间。系统宣称 ${attempt.observation.systemClaim}。`,
      incidentId: incident.id,
    }),
  };
  const check = checkForIncident(next, incident.id);
  return {
    ...next,
    history: appendHistory(next, {
      kind: "INCIDENT",
      title: `独立裁判：${check.status}`,
      detail: check.summary,
      incidentId: incident.id,
    }),
  };
};

export const retryCurrentIncident = (run: GameRun): GameRun => {
  if (run.phase !== "REVIEW") throw new Error("Only a reviewed incident can be retried");
  const incident = currentIncident(run);
  if (!incident) throw new Error("No current incident");
  return {
    ...run,
    phase: "DECISION",
    history: appendHistory(run, {
      kind: "SYSTEM",
      title: "保留失败，重新选择",
      detail: "上一轮观察仍在事故记录里；最终裁判读取本场景最新一次重放。",
      incidentId: incident.id,
    }),
  };
};

const trainingStandardForIndex = (index: number): { course: string; maximum: number } | undefined => {
  switch (index) {
    case 1:
      return { course: "Python", maximum: 120 };
    case 2:
      return { course: "Agent", maximum: 150 };
    case 3:
      return { course: "大模型微调", maximum: 180 };
    default:
      return undefined;
  }
};

const moveTrainingGoalpost = (run: GameRun, nextIndex: number): GameRun => {
  if (run.factionId !== "training" || !run.training) return run;
  const update = trainingStandardForIndex(nextIndex);
  if (!update || run.training.offeredCourses.includes(update.course)) return run;
  const training = {
    ...run.training,
    maximum: update.maximum,
    offeredCourses: [...run.training.offeredCourses, update.course],
  };
  const moved = { ...run, training };
  return {
    ...moved,
    history: appendHistory(moved, {
      kind: "SCORE",
      title: `就业标准新增：${update.course}`,
      detail: `玩家能力没有缩水，满分线先涨到 ${update.maximum}。`,
    }),
  };
};

export const advanceIncident = (run: GameRun): GameRun => {
  if (run.phase !== "REVIEW") throw new Error("Only a reviewed incident can advance");
  if (run.incidentIndex >= INCIDENTS.length - 1) {
    const verdict = judgeRun(run);
    return {
      ...run,
      phase: "SETTLED",
      finalVerdict: verdict,
      history: appendHistory(run, {
        kind: "SYSTEM",
        title: `最终业务裁决：${verdict.status}`,
        detail: `${verdict.passed} 项通过，${verdict.failed} 项失败，${verdict.unknown} 项未知。`,
      }),
    };
  }

  const nextIndex = run.incidentIndex + 1;
  const advanced: GameRun = {
    ...run,
    incidentIndex: nextIndex,
    phase: "DECISION",
    history: appendHistory(run, {
      kind: "SYSTEM",
      title: incidentById(INCIDENTS[nextIndex]!.id).title,
      detail: "新的事实边界已经注入。上一场事故不会被改写。",
      incidentId: INCIDENTS[nextIndex]!.id,
    }),
  };
  return moveTrainingGoalpost(advanced, nextIndex);
};

export const toggleAcademicScope = (run: GameRun): GameRun => {
  if (run.factionId !== "academic" || run.phase !== "REVIEW") {
    throw new Error("Only the academic faction can change course scope during review");
  }
  const incident = currentIncident(run);
  if (!incident) throw new Error("No current incident");
  const excluded = run.excludedFromCourse.includes(incident.id);
  const excludedFromCourse = excluded
    ? run.excludedFromCourse.filter((id) => id !== incident.id)
    : [...run.excludedFromCourse, incident.id];
  const updated = { ...run, excludedFromCourse };
  return {
    ...updated,
    history: appendHistory(updated, {
      kind: "SCORE",
      title: excluded ? "恢复课程验收" : "本题暂不讨论",
      detail: excluded
        ? `${incident.title} 重新影响课程分数。`
        : `${incident.title} 不再影响课程分数；业务裁决保持 ${checkForIncident(run, incident.id).status}。`,
      incidentId: incident.id,
    }),
  };
};

export const completeNextCourse = (run: GameRun): GameRun => {
  if (run.factionId !== "training" || !run.training || run.phase === "SETTLED") {
    throw new Error("No training course can be completed now");
  }
  const course = run.training.offeredCourses.find(
    (offered) => !run.training!.completedCourses.includes(offered),
  );
  if (!course) throw new Error("No pending course");
  if (run.budget < 5 || run.timeRemaining < 1) throw new Error("Not enough resources for the next course");
  const training = {
    ...run.training,
    score: run.training.score + 30,
    completedCourses: [...run.training.completedCourses, course],
  };
  const updated = {
    ...run,
    budget: run.budget - 5,
    timeRemaining: run.timeRemaining - 1,
    training,
  };
  return {
    ...updated,
    history: appendHistory(updated, {
      kind: "SCORE",
      title: `完成课程：${course}`,
      detail: `就业竞争力升至 ${training.score}/${training.maximum}，真实招聘任务仍由独立裁判决定。`,
    }),
  };
};

export const hasPendingCourse = (run: GameRun): boolean => Boolean(
  run.training?.offeredCourses.some((course) => !run.training!.completedCourses.includes(course)),
);
