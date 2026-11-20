import { legacyAssessment } from "./assessment";
import { factionById, INCIDENTS, incidentById } from "./content";
import { checkForIncident, judgeRun } from "./judge";
import type {
  BehaviorEvent,
  DecisionDefinition,
  EntryAssessment,
  FactValue,
  FactionId,
  GameRun,
  IncidentAttempt,
  IncidentId,
  ProfileSignal,
  SimulationObservation,
  TimelineEntry,
  WorldState,
} from "./types";

const unique = (values: string[]): string[] => [...new Set(values)];

const appendHistory = (
  run: GameRun,
  entry: Omit<TimelineEntry, "sequence">,
): TimelineEntry[] => [
  ...run.history,
  { ...entry, sequence: run.history.length + 1 },
];

const observed = (dimensions: Extract<ProfileSignal, { status: "OBSERVED" }>["dimensions"]): ProfileSignal => ({
  status: "OBSERVED",
  dimensions,
});

const noSignal = (reason: string): ProfileSignal => ({ status: "NO_SIGNAL", reason });

const appendBehavior = (
  run: GameRun,
  event: Omit<BehaviorEvent, "eventId" | "sequence">,
): BehaviorEvent[] => {
  const sequence = run.behaviorLog.length + 1;
  return [
    ...run.behaviorLog,
    { ...event, sequence, eventId: `${run.runId}-event-${String(sequence).padStart(3, "0")}` },
  ];
};

const initialWorld = (): WorldState => ({
  load: 20,
  targetLoad: 120,
  databaseCapacity: 85,
  readShare: 0.65,
  redisAvailable: true,
  mqAvailable: true,
  reliabilityDebt: 0,
  unresolvedFailures: 0,
  responseLost: false,
});

const injectIncidentConditions = (world: WorldState, incidentId: IncidentId): WorldState => {
  switch (incidentId) {
    case "response-loss":
      return { ...world, responseLost: true };
    case "message-outage":
      return { ...world, mqAvailable: false };
    case "traffic-spike":
      return { ...world, load: world.targetLoad, redisAvailable: true, mqAvailable: true };
    case "duplicate-like":
    case "duplicate-charge":
      return world;
  }
};

export const createRun = (
  factionId: FactionId,
  runNumber: number,
  entryAssessment: EntryAssessment = legacyAssessment(),
): GameRun => {
  const faction = factionById(factionId);
  const suffix = String(runNumber).padStart(3, "0");
  const runId = `run-${suffix}-${factionId}`;
  return {
    schemaVersion: 2,
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
    entryAssessment,
    world: initialWorld(),
    behaviorLog: [
      {
        eventId: `${runId}-event-001`,
        sequence: 1,
        kind: "SYSTEM",
        incidentId: "duplicate-like",
        action: "系统创建隔离仿真世界",
        observationEligible: false,
        eligibilityReason: "系统强制产生，不是玩家在可行替代方案之间作出的选择。",
        availableAlternatives: [],
        knownCosts: [],
        evidenceSeenBeforeAction: [],
        signal: noSignal("系统事件不参与画像推断。"),
      },
    ],
    viewedEvidence: [],
    components: [...faction.initialComponents],
    controls: [],
    excludedFromCourse: [],
    attempts: [],
    history: [
      {
        sequence: 1,
        kind: "SYSTEM",
        title: `${faction.name}进入独立世界`,
        detail: `世界 sim-${factionId}-${suffix} 已创建。这里是确定性游戏仿真，不冒充真实 MySQL 实验。`,
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
  if (decision.tags.includes("redis") && run.components.includes("Redis")) discount += 2;
  if (decision.tags.includes("mq") && run.components.includes("MQ")) discount += 2;
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

type DecisionOutcome = { observation: SimulationObservation; world: WorldState };

const withFailureDelta = (world: WorldState, delta: number): WorldState => ({
  ...world,
  unresolvedFailures: Math.max(0, world.unresolvedFailures + delta),
});

const effectiveCapacity = (run: GameRun, addedCapacity: number): number => {
  const componentOverhead = Math.max(0, run.components.length - 2) * 6;
  const debtOverhead = run.world.reliabilityDebt * 4;
  return Math.max(1, run.world.databaseCapacity + addedCapacity - componentOverhead - debtOverhead);
};

const trafficObservation = (
  run: GameRun,
  addedCapacity: number,
  evidence: string[],
  systemMessage: string,
): DecisionOutcome => {
  const capacity = effectiveCapacity(run, addedCapacity);
  const processed = Math.min(run.world.load, capacity);
  const rejected = Math.max(0, run.world.load - processed);
  const p95Ms = Math.round(105 + Math.max(0, run.world.load - capacity) * 7 + run.world.reliabilityDebt * 12);
  const countConsistent = run.world.unresolvedFailures === 0;
  const passed = processed >= 114 && rejected <= 6 && p95Ms <= 250 && countConsistent;
  return {
    observation: observation(
      { processed, rejected, errors: 0, p95Ms, countConsistent, measured: true, effectiveCapacity: capacity },
      passed ? "PASS" : "FAIL",
      systemMessage,
      [...evidence, `连续世界中的有效容量=${capacity}`, `此前未解决故障=${run.world.unresolvedFailures}`],
    ),
    world: withFailureDelta(run.world, passed ? 0 : 1),
  };
};

const simulateDecision = (run: GameRun, decisionId: string): DecisionOutcome => {
  const world = run.world;
  switch (decisionId) {
    case "db-unique":
      return {
        observation: observation(
          { stateSum: 1, storedCount: 1, duplicateEffects: 0, changedResponses: 1 },
          "PASS",
          "数据库只允许一个有效状态。",
          ["唯一业务键", "条件更新", "独立计数核对"],
        ),
        world,
      };
    case "redis-idempotency":
      return {
        observation: observation(
          { stateSum: 1, storedCount: 1, duplicateEffects: 0, changedResponses: 1 },
          "PASS",
          "Redis 抢到第一次写入，数据库结果正确；恢复路径也进入了后续世界。",
          ["Redis 去重键", "数据库状态核对", "新增 Redis 恢复路径"],
        ),
        world: { ...world, reliabilityDebt: world.reliabilityDebt + 1 },
      };
    case "count-every-request":
      return {
        observation: observation(
          { stateSum: 1, storedCount: 100, duplicateEffects: 99, changedResponses: 100 },
          "PASS",
          "100 个请求全部返回成功。",
          ["页面显示 100", "没有保存并发获胜证据"],
        ),
        world: withFailureDelta(world, 1),
      };
    case "transactional-request-record":
      return {
        observation: observation(
          { durableRequest: true, committedEffects: 1, retryReplayed: true, clientResultMatches: true },
          "PASS",
          "同一请求恢复原业务结果，只有 replayed 标志改变。",
          ["请求记录与业务状态同事务", "响应丢失注入", "重试读回"],
        ),
        world: { ...world, responseLost: false, reliabilityDebt: Math.max(0, world.reliabilityDebt - 1) },
      };
    case "blind-retry": {
      const guarded = run.controls.includes("unique-business-key");
      return {
        observation: observation(
          {
            durableRequest: false,
            committedEffects: guarded ? 1 : 2,
            retryReplayed: false,
            clientResultMatches: false,
          },
          "PASS",
          guarded ? "唯一约束避免了第二次业务效果，但客户端仍拿不到原结果。" : "请求重新执行，产生了第二次业务效果。",
          [guarded ? "历史唯一约束仍在生效" : "没有业务唯一约束", "没有原请求记录", "第二次重新执行"],
        ),
        world: withFailureDelta(world, 1),
      };
    }
    case "async-ack":
      return {
        observation: observation(
          { durableRequest: false, committedEffects: 0, retryReplayed: false, clientResultMatches: false },
          "PASS",
          "客户端很快收到了已受理。",
          ["消息进入可靠存储前已返回", "发布失败时没有恢复依据"],
        ),
        world: { ...withFailureDelta(world, 1), reliabilityDebt: world.reliabilityDebt + 1 },
      };
    case "database-fallback":
      return {
        observation: observation(
          { finalStateCorrect: true, durableEvidence: true, authoritativeEvidence: true, lostOperations: 0, duplicateEffects: 0 },
          "PASS",
          "关键路径退回数据库，通知延后。",
          ["数据库提交记录", "降级开关", "最终状态核对"],
        ),
        world: { ...world, mqAvailable: false, reliabilityDebt: Math.max(0, world.reliabilityDebt - 1) },
      };
    case "outbox-consumer":
      return {
        observation: observation(
          { finalStateCorrect: true, durableEvidence: true, authoritativeEvidence: true, lostOperations: 0, duplicateEffects: 0 },
          "PASS",
          "业务与 Outbox 同时提交，重复消息被幂等消费。",
          ["Outbox 行", "消息 ID", "消费记录", "顺序重放", `MQ 当前可用=${world.mqAvailable}`],
        ),
        world: { ...world, reliabilityDebt: Math.max(0, world.reliabilityDebt - 1) },
      };
    case "scheduled-reconciliation": {
      const authorityKnown = run.controls.includes("unique-business-key")
        && run.controls.includes("transactional-request-record");
      return {
        observation: observation(
          {
            finalStateCorrect: true,
            durableEvidence: authorityKnown,
            authoritativeEvidence: authorityKnown,
            lostOperations: 0,
            duplicateEffects: 0,
          },
          "PASS",
          authorityKnown
            ? "历史请求记录和唯一状态给出了权威来源，对账可以复核。"
            : "对账任务运行完成，页面暂时一致。",
          authorityKnown
            ? ["历史唯一状态", "持久化请求记录", "定时任务日志"]
            : ["定时任务成功日志", "权威数据源未定义"],
        ),
        world: authorityKnown ? world : { ...world, reliabilityDebt: world.reliabilityDebt + 1 },
      };
    }
    case "ignore-message-loss":
      return {
        observation: observation(
          { finalStateCorrect: false, durableEvidence: false, authoritativeEvidence: false, lostOperations: 1, duplicateEffects: 0 },
          "UNKNOWN",
          "本题不在当前验收范围。",
          ["课程界面已移除红灯", "业务操作仍然丢失"],
        ),
        world: withFailureDelta(world, 1),
      };
    case "measure-and-scale":
      return trafficObservation(
        run,
        55,
        ["基线曲线", "扩容前后对照", "P95/P99", "状态总和核对"],
        "保存基线后扩数据库；最终结果取决于连续世界里的组件开销和技术债。",
      );
    case "cache-with-invalidation":
      return trafficObservation(
        run,
        Math.round(run.world.targetLoad * run.world.readShare * 0.8),
        ["命中率", "失效事件", "缓存与数据库抽样核对"],
        "缓存承担读取；收益取决于真实读比例，组件开销仍然计入。",
      );
    case "reject-everything":
      return {
        observation: observation(
          { processed: 0, rejected: 120, errors: 0, p95Ms: 2, countConsistent: true, measured: true, effectiveCapacity: effectiveCapacity(run, 0) },
          "PASS",
          "系统全程稳定，没有产生错误数据。",
          ["拒绝率 100%", "业务处理量 0"],
        ),
        world: withFailureDelta(world, 1),
      };
    case "payment-idempotency":
      return {
        observation: observation(
          { charges: 1, reproduced: true, rootCauseFound: true, fixEvidence: true, neighborCasePassed: true },
          "PASS",
          "业务订单只对应一份确定扣款结果。",
          ["重复扣款反例", "业务键", "请求结果记录", "相邻重试重放"],
        ),
        world,
      };
    case "sql-business-key":
      return {
        observation: observation(
          { charges: 1, reproduced: true, rootCauseFound: true, fixEvidence: true, neighborCasePassed: true },
          "PASS",
          "只用 SQL 也完成了复现、修复和验证。",
          ["复现 SQL", "唯一业务键", "事务日志", "相邻场景查询"],
        ),
        world,
      };
    case "retry-payment":
      return {
        observation: observation(
          { charges: 2, reproduced: true, rootCauseFound: false, fixEvidence: false, neighborCasePassed: false },
          "PASS",
          "问题已经可以稳定复现。",
          ["同一订单出现两条扣款记录", "仍未定位业务幂等边界"],
        ),
        world: withFailureDelta(world, 1),
      };
    default:
      throw new Error(`Unknown decision: ${decisionId}`);
  }
};

const additionsForDecision = (decisionId: string): { components: string[]; controls: string[] } => {
  switch (decisionId) {
    case "db-unique": return { components: [], controls: ["unique-business-key"] };
    case "redis-idempotency": return { components: ["Redis"], controls: ["redis-dedupe"] };
    case "transactional-request-record": return { components: [], controls: ["transactional-request-record"] };
    case "async-ack": return { components: ["MQ"], controls: ["async-ack"] };
    case "database-fallback": return { components: [], controls: ["database-fallback"] };
    case "outbox-consumer": return { components: ["MQ", "Outbox worker"], controls: ["transactional-outbox", "idempotent-consumer"] };
    case "measure-and-scale": return { components: ["DB replica", "Load rig"], controls: ["capacity-baseline"] };
    case "cache-with-invalidation": return { components: ["Redis"], controls: ["cache-invalidation"] };
    case "payment-idempotency": return { components: [], controls: ["payment-request-record"] };
    case "sql-business-key": return { components: [], controls: ["payment-business-key"] };
    default: return { components: [], controls: [] };
  }
};

const behaviorSignalForDecision = (decision: DecisionDefinition): ProfileSignal => {
  const dimensions: Extract<ProfileSignal, { status: "OBSERVED" }>["dimensions"] = {};
  if (decision.tags.includes("evidence")) dimensions.E = 1;
  if (decision.tags.includes("correctness")) dimensions.C = 1;
  if (decision.tags.includes("capacity")) dimensions.A = 1;
  if (decision.tags.includes("component")) {
    dimensions.A = Math.max(dimensions.A ?? 0, 1);
    dimensions.X = 1;
  }
  if (decision.tags.includes("scope")) dimensions.V = 1;
  return Object.keys(dimensions).length > 0
    ? observed(dimensions)
    : noSignal("该操作已记录，但本身不足以支持某个画像维度。 ");
};

export const incidentEvidence = (run: GameRun): string[] => {
  const incident = currentIncident(run);
  if (!incident) return [];
  switch (incident.id) {
    case "duplicate-like":
      return ["D 当前未点赞", "100 个不同请求 ID", `现有组件：${run.components.join("、")}`];
    case "response-loss":
      return ["第一次提交已经发生", "成功响应在客户端边界丢失", `历史控制：${run.controls.join("、") || "无"}`];
    case "message-outage":
      return [`MQ 当前可用=${run.world.mqAvailable}`, `可靠性债务=${run.world.reliabilityDebt}`, `历史控制：${run.controls.join("、") || "无"}`];
    case "traffic-spike":
      return [`目标请求=${run.world.targetLoad}`, `数据库基础容量=${run.world.databaseCapacity}`, `读取占比=${Math.round(run.world.readShare * 100)}%`, `未解决故障=${run.world.unresolvedFailures}`];
    case "duplicate-charge":
      return ["两个请求 ID 指向同一业务订单", `本局已查看证据场景=${run.viewedEvidence.length}`, `剩余预算=${run.budget}`];
  }
};

export const viewCurrentEvidence = (run: GameRun): GameRun => {
  if (run.phase !== "DECISION") throw new Error("只能在作出决定前查看现场证据。 ");
  const incident = currentIncident(run);
  if (!incident) throw new Error("当前没有事故。 ");
  if (run.viewedEvidence.includes(incident.id)) return run;
  if (run.timeRemaining < 1) throw new Error("剩余时间不足，不能假装已经完成取证。 ");
  const evidence = incidentEvidence(run);
  const updated: GameRun = {
    ...run,
    timeRemaining: run.timeRemaining - 1,
    evidenceScore: run.evidenceScore + 1,
    viewedEvidence: [...run.viewedEvidence, incident.id],
  };
  return {
    ...updated,
    behaviorLog: appendBehavior(updated, {
      kind: "VIEW_EVIDENCE",
      incidentId: incident.id,
      action: `主动查看“${incident.title}”的现场证据`,
      observationEligible: true,
      eligibilityReason: "玩家可以直接行动，也可以花费时间查看证据；主要代价在行动前已显示。",
      availableAlternatives: ["不查看证据，直接选择方案"],
      knownCosts: ["消耗 1 时间"],
      evidenceSeenBeforeAction: [],
      signal: observed({ E: 1 }),
    }),
    history: appendHistory(updated, {
      kind: "SYSTEM",
      title: "现场证据已展开",
      detail: `${evidence.join("；")}。取证消耗 1 时间。`,
      incidentId: incident.id,
    }),
  };
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
  const newComponentCount = components.length - run.components.length;
  const prepared: GameRun = {
    ...run,
    components,
    controls,
    complexity: run.complexity + newComponentCount,
  };
  const outcome = simulateDecision(prepared, decision.id);
  const attemptNumber = run.attempts.filter((attempt) => attempt.incidentId === incident.id).length + 1;
  const attempt: IncidentAttempt = {
    attempt: attemptNumber,
    incidentId: incident.id,
    decisionId: decision.id,
    decisionTitle: decision.title,
    budgetSpent: price.budget,
    timeSpent: price.time,
    worldBefore: structuredClone(run.world),
    worldAfter: structuredClone(outcome.world),
    observation: outcome.observation,
  };
  const evidenceGain = decision.tags.includes("evidence") ? (incident.id === "duplicate-charge" ? 3 : 2) : 0;
  const affordableAlternatives = incident.decisions
    .filter((candidate) => candidate.id !== decision.id && canApplyDecision(run, candidate))
    .map((candidate) => candidate.title);
  const evidenceSeenBeforeAction = run.viewedEvidence.includes(incident.id) ? incidentEvidence(run) : [];
  const next: GameRun = {
    ...prepared,
    phase: "REVIEW",
    budget: run.budget - price.budget,
    timeRemaining: run.timeRemaining - price.time,
    evidenceScore: run.evidenceScore + evidenceGain,
    world: outcome.world,
    attempts: [...run.attempts, attempt],
    behaviorLog: appendBehavior(run, {
      kind: "DECISION",
      incidentId: incident.id,
      action: `在“${incident.title}”选择“${decision.title}”`,
      observationEligible: affordableAlternatives.length > 0,
      eligibilityReason: affordableAlternatives.length > 0
        ? "存在可负担的替代方案，且预算、时间和主要代价在行动前可见。"
        : "当时没有其他可负担方案，不能把被迫选择解释为倾向。",
      availableAlternatives: affordableAlternatives,
      knownCosts: [`预算 ${price.budget}`, `时间 ${price.time}`, decision.description],
      evidenceSeenBeforeAction,
      signal: behaviorSignalForDecision(decision),
    }),
    history: appendHistory(run, {
      kind: "DECISION",
      title: decision.title,
      detail: `消耗 ${price.budget} 预算、${price.time} 时间。系统宣称 ${outcome.observation.systemClaim}。连续世界：复杂度 ${prepared.complexity}，可靠性债务 ${outcome.world.reliabilityDebt}。`,
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

export const canRetryCurrentIncident = (run: GameRun): boolean => run.phase === "REVIEW" && run.timeRemaining >= 1;

export const retryCurrentIncident = (run: GameRun): GameRun => {
  if (!canRetryCurrentIncident(run)) throw new Error("调整方案需要 1 时间，当前资源不足。 ");
  const incident = currentIncident(run);
  const attempt = currentAttempt(run);
  if (!incident || !attempt) throw new Error("No current incident");
  const updated: GameRun = {
    ...run,
    phase: "DECISION",
    timeRemaining: run.timeRemaining - 1,
    world: structuredClone(attempt.worldBefore),
  };
  return {
    ...updated,
    behaviorLog: appendBehavior(updated, {
      kind: "RETRY",
      incidentId: incident.id,
      action: `保留失败记录，回退“${attempt.decisionTitle}”造成的世界变化并重新选择`,
      observationEligible: true,
      eligibilityReason: "玩家可以接受当前结果继续，也可以支付时间回退后重选。",
      availableAlternatives: ["接受当前结果，进入下一场事故"],
      knownCosts: ["消耗 1 时间", "上一轮证据仍保留"],
      evidenceSeenBeforeAction: attempt.observation.evidence,
      signal: observed({ R: 1 }),
    }),
    history: appendHistory(updated, {
      kind: "SYSTEM",
      title: "保留本次结果，重新选择",
      detail: "上一轮观察仍在事故记录里；连续世界已恢复到本次行动以前，回退消耗 1 时间。",
      incidentId: incident.id,
    }),
  };
};

const trainingStandardForIndex = (index: number): { course: string; maximum: number } | undefined => {
  switch (index) {
    case 1: return { course: "Python", maximum: 120 };
    case 2: return { course: "Agent", maximum: 150 };
    case 3: return { course: "大模型微调", maximum: 180 };
    default: return undefined;
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
  const incident = currentIncident(run);
  const advancedBehavior = appendBehavior(run, {
    kind: "ADVANCE",
    incidentId: incident?.id,
    action: "进入下一阶段",
    observationEligible: false,
    eligibilityReason: "流程导航是系统要求，不代表决策倾向。",
    availableAlternatives: [],
    knownCosts: [],
    evidenceSeenBeforeAction: [],
    signal: noSignal("强制流程不参与画像推断。"),
  });
  if (run.incidentIndex >= INCIDENTS.length - 1) {
    const withBehavior = { ...run, behaviorLog: advancedBehavior };
    const verdict = judgeRun(withBehavior);
    return {
      ...withBehavior,
      phase: "SETTLED",
      finalVerdict: verdict,
      history: appendHistory(withBehavior, {
        kind: "SYSTEM",
        title: `最终业务裁决：${verdict.status}`,
        detail: `${verdict.passed} 项通过，${verdict.failed} 项失败，${verdict.unknown} 项未知。`,
      }),
    };
  }

  const nextIndex = run.incidentIndex + 1;
  const nextIncident = INCIDENTS[nextIndex]!;
  const advanced: GameRun = {
    ...run,
    behaviorLog: advancedBehavior,
    incidentIndex: nextIndex,
    phase: "DECISION",
    world: injectIncidentConditions(run.world, nextIncident.id),
    history: appendHistory(run, {
      kind: "SYSTEM",
      title: incidentById(nextIncident.id).title,
      detail: "新的事实边界已经注入。上一场事故不会被改写，留下的组件、控制和技术债会继续生效。",
      incidentId: nextIncident.id,
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
    behaviorLog: appendBehavior(updated, {
      kind: "SCOPE_CHANGE",
      incidentId: incident.id,
      action: excluded ? `恢复“${incident.title}”的课程验收` : `将“${incident.title}”移出课程验收`,
      observationEligible: true,
      eligibilityReason: "玩家可以保留或修改课程范围，业务裁决不会随按钮改变。",
      availableAlternatives: [excluded ? "继续排除该项" : "保留该项课程验收"],
      knownCosts: ["只改变课程评分范围", `业务裁决保持 ${checkForIncident(run, incident.id).status}`],
      evidenceSeenBeforeAction: checkForIncident(run, incident.id).evidence,
      signal: excluded ? observed({ R: 1 }) : observed({ V: 2 }),
    }),
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
    behaviorLog: appendBehavior(updated, {
      kind: "COURSE",
      incidentId: currentIncident(run)?.id,
      action: `投入资源完成课程“${course}”`,
      observationEligible: true,
      eligibilityReason: "玩家可以继续处理事故，也可以支付预算和时间学习课程。",
      availableAlternatives: ["不购买本期课程，继续处理当前事故"],
      knownCosts: ["预算 5", "时间 1", "课程完成不自动通过陌生任务"],
      evidenceSeenBeforeAction: [],
      signal: observed({ L: 2 }),
    }),
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
