import { calculateFactionScore } from "./score";
import type {
  AchievementDefinition,
  AchievementUnlock,
  CareerState,
  GameRun,
  RunSummary,
  RunVerdict,
} from "./types";

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "day-one-runs",
    title: "开工第一天，居然真的能运行",
    description: "页面和答辩动画出现以前，真实 MySQL 已经跑通 S0—S6。",
    hint: "一种在课程设计中偶尔出现的特殊现象。",
    historical: true,
  },
  {
    id: "judge-was-judged",
    title: "考官被考了一次",
    description: "独立裁判把合法的并发非确定性判成失败，保留证据后修正并重放通过。",
    hint: "裁判也得接受反例。",
    historical: true,
  },
  {
    id: "markdown-scaling",
    title: "文档驱动扩容",
    description: "本地草稿把两个已运行世界写成五个已交付世界，审查后纠正。",
    hint: "本次扩容由 Markdown 提供技术支持。",
    historical: true,
  },
  {
    id: "one-index",
    title: "一把索引走天下",
    description: "朴素派不引入 Redis 与 MQ，通过完整业务验收。",
    hint: "一张表，一条约束，先把事情做对。",
  },
  {
    id: "stack-done-right",
    title: "八股文写对了",
    description: "八股派带着复杂组件通过完整故障集。",
    hint: "复杂得有证据，也复杂得有价值。",
  },
  {
    id: "evidence-please",
    title: "瓶颈证据拿来",
    description: "工程派保留足够实验依据并通过最终验收。",
    hint: "先看它到底慢在哪里。",
  },
  {
    id: "excellent-thesis",
    title: "优秀毕业设计",
    description: "课程成绩达到 100，业务硬性验收仍然失败。",
    hint: "指导教师对本系统给予了高度评价。",
  },
  {
    id: "paper-with-evidence",
    title: "论文不是问题，没有证据才是",
    description: "学院派没有排除失败项，修复后通过全部业务验收。",
    hint: "这篇论文真的解决了一个问题。",
  },
  {
    id: "permanent-fresher",
    title: "永久应届生",
    description: "完成全部新增课程，陌生业务问题仍未解决。",
    hint: "学无止境，学费也是。",
  },
  {
    id: "training-nightmare",
    title: "培训机构的噩梦",
    description: "没有购买下一期课程，直接解决陌生业务问题。",
    hint: "本机构暂未开设这门课程。",
  },
  {
    id: "course-transferred",
    title: "这门课真有用",
    description: "培训派完成课程后，独立解决陌生任务并通过迁移验证。",
    hint: "能力增长得到了课程表以外的证据。",
  },
  {
    id: "high-availability",
    title: "高可用",
    description: "在流量事故中拒绝全部请求。",
    hint: "系统一直在线，业务从未进入。",
  },
  {
    id: "unknown-is-a-result",
    title: "承认不知道",
    description: "最终业务裁决保留了至少一项 UNKNOWN。",
    hint: "不知道，也是一条合格结论。",
  },
];

const historicalUnlocks = (): AchievementUnlock[] => [
  {
    id: "day-one-runs",
    title: "开工第一天，居然真的能运行",
    runId: "project-history/pr-1",
    evidence: "Demo PR #1：真实 MySQL S0—S6 资格报告。",
    sequence: 1,
  },
  {
    id: "judge-was-judged",
    title: "考官被考了一次",
    runId: "project-history/pr-1",
    evidence: "第一次隔离裁判误判被保留、修正并复验。",
    sequence: 2,
  },
  {
    id: "markdown-scaling",
    title: "文档驱动扩容",
    runId: "project-history/pr-2",
    evidence: "错误只存在于本地草稿；PR #2 保留了审查与纠正过程。",
    sequence: 3,
  },
];

export const initialCareer = (): CareerState => ({
  schemaVersion: 1,
  nextRunNumber: 1,
  achievements: historicalUnlocks(),
  runs: [],
});

const latestDecisionFor = (run: GameRun, incidentId: string): string | undefined =>
  run.attempts.filter((attempt) => attempt.incidentId === incidentId).at(-1)?.decisionId;

const definitionsForRun = (run: GameRun, verdict: RunVerdict): AchievementDefinition[] => {
  const score = calculateFactionScore(run, verdict);
  const duplicateCharge = verdict.checks.find((check) => check.incidentId === "duplicate-charge");
  const definitions: AchievementDefinition[] = [];

  if (run.factionId === "simple"
      && verdict.status === "PASS"
      && !run.components.includes("Redis")
      && !run.components.includes("MQ")) {
    definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "one-index")!);
  }
  if (run.factionId === "buzzword" && verdict.status === "PASS") {
    definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "stack-done-right")!);
  }
  if (run.factionId === "engineering" && verdict.status === "PASS" && run.evidenceScore >= 8) {
    definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "evidence-please")!);
  }
  if (run.factionId === "academic" && score.value === 100 && verdict.status === "FAIL") {
    definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "excellent-thesis")!);
  }
  if (run.factionId === "academic"
      && verdict.status === "PASS"
      && run.excludedFromCourse.length === 0) {
    definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "paper-with-evidence")!);
  }
  if (run.factionId === "training") {
    const completed = run.training?.completedCourses.length ?? 1;
    if (completed >= 4 && duplicateCharge?.status !== "PASS") {
      definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "permanent-fresher")!);
    }
    if (completed === 1 && duplicateCharge?.status === "PASS") {
      definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "training-nightmare")!);
    }
    if (completed >= 2 && duplicateCharge?.status === "PASS") {
      definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "course-transferred")!);
    }
  }
  if (latestDecisionFor(run, "traffic-spike") === "reject-everything") {
    definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "high-availability")!);
  }
  if (verdict.status === "UNKNOWN") {
    definitions.push(ACHIEVEMENTS.find((achievement) => achievement.id === "unknown-is-a-result")!);
  }
  return definitions;
};

export const recordCompletedRun = (
  career: CareerState,
  run: GameRun,
): { career: CareerState; run: GameRun; newUnlocks: AchievementUnlock[] } => {
  const verdict = run.finalVerdict;
  if (run.phase !== "SETTLED" || !verdict) {
    throw new Error("Only a settled run can be recorded");
  }
  const existingIds = new Set(career.achievements.map((achievement) => achievement.id));
  const newDefinitions = definitionsForRun(run, verdict).filter(
    (definition) => !existingIds.has(definition.id),
  );
  const newUnlocks = newDefinitions.map((definition, index): AchievementUnlock => ({
    id: definition.id,
    title: definition.title,
    runId: run.runId,
    evidence: definition.description,
    sequence: career.achievements.length + index + 1,
  }));
  const factionScore = calculateFactionScore(run, verdict);
  const summary: RunSummary = {
    runId: run.runId,
    worldId: run.worldId,
    runNumber: run.runNumber,
    factionId: run.factionId,
    businessStatus: verdict.status,
    businessScore: verdict.businessScore,
    factionScore,
    budgetRemaining: run.budget,
    timeRemaining: run.timeRemaining,
    complexity: run.complexity,
  };
  const updatedRun: GameRun = {
    ...run,
    unlockedAchievementIds: newUnlocks.map((unlock) => unlock.id),
    history: [
      ...run.history,
      ...newUnlocks.map((unlock, index): GameRun["history"][number] => ({
        sequence: run.history.length + index + 1,
        kind: "ACHIEVEMENT",
        title: `成就解锁：${unlock.title}`,
        detail: unlock.evidence,
      })),
    ],
  };
  return {
    career: {
      ...career,
      nextRunNumber: Math.max(career.nextRunNumber, run.runNumber + 1),
      achievements: [...career.achievements, ...newUnlocks],
      runs: [...career.runs, summary],
    },
    run: updatedRun,
    newUnlocks,
  };
};

export const achievementById = (id: string): AchievementDefinition | undefined =>
  ACHIEVEMENTS.find((achievement) => achievement.id === id);
