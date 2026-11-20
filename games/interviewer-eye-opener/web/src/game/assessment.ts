import type {
  AssessmentCandidateJudgment,
  AssessmentQuestionAttempt,
  AssessmentQuestion,
  CandidateDisposition,
  EntryAssessment,
  ProfileDimension,
  ProfileSignal,
} from "./types";

const observed = (dimensions: Partial<Record<ProfileDimension, number>>): ProfileSignal => ({
  status: "OBSERVED",
  dimensions,
});

const noSignal = (reason: string): ProfileSignal => ({ status: "NO_SIGNAL", reason });

export const ASSESSMENT_VERSION = "BT-v0.3.2" as const;
export const ASSESSMENT_PROTOCOL_VERSION = "BT-CARD-v0.1-rc1" as const;

export const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  {
    id: "Q1",
    title: "明天发布，今天发现偶发重复扣款",
    knownFacts: "某支付路径已出现偶发重复扣款；该路径目前已隔离，不会继续造成用户损失，但支付功能在隔离期间不可用。隔离至少还能安全维持二十四小时。支付改动可以从明天的其他发布内容中单独撤出。",
    unknownFacts: "重复发生在什么执行边界、影响多大范围，以及第三方支付平台现成的幂等能力是否适用。",
    constraint: "一位工程师只剩四小时。若要撤出支付改动，必须在一小时内提交申请；准备申请和拆分影响说明会占用约四十五分钟，审批结果会在四小时内给出。只能把剩余时间优先投入一条路线。",
    prompt: "你优先做哪件事？",
    options: [
      {
        id: "Q1-A",
        label: "先为已识别的重复扣款入口增加数据库业务唯一约束。",
        knownCosts: ["留给完整根因追查的时间很少", "当前只覆盖已经识别的入口"],
        signal: observed({ C: 2 }),
      },
      {
        id: "Q1-B",
        label: "维持隔离，优先复现扣款的提交过程并收集记录。",
        knownCosts: ["四小时内可能来不及交付修复", "支付功能继续不可用"],
        signal: observed({ E: 2 }),
      },
      {
        id: "Q1-C",
        label: "立即申请撤出支付改动，只按原计划发布其他已验证功能。",
        knownCosts: ["先消耗四十五分钟准备申请与拆分说明", "支付功能延期", "审批不保证通过"],
        signal: observed({ D: 1, C: 1 }),
      },
      {
        id: "Q1-D",
        label: "优先研究支付服务商提供的幂等接口是否可供接入。",
        knownCosts: ["集成与兼容性评估会占用大部分时间", "效果仍不确定"],
        signal: observed({ A: 1 }),
      },
    ],
  },
  {
    id: "Q2",
    title: "流量将增长，容量还没真正见底",
    knownFacts: "当前负载下 P95 延迟为 185ms，业务正确性检查通过。下周活动已经确定，目标峰值约为当前请求量的两倍；容量合同要求在该负载下 P95 不超过 250ms。现有测量工具一天内最多稳定重放到当前负载的 1.4 倍，可以给出读写比例和数据库资源变化，但不能直接证明两倍负载下的容量合同。",
    unknownFacts: "两倍负载下先出现读瓶颈还是写瓶颈，以及三种施工方案的实际收益。",
    constraint: "最多三天、30 单位预算。数据库升配预计需要三天和 24 单位；读取缓存预计需要两天和 18 单位；写入队列预计需要三天和 26 单位。以上工期均包含最低验收，但不代表一定达到容量合同。",
    prompt: "你优先选哪条路？",
    options: [
      {
        id: "Q2-A",
        label: "把三天和主要预算用于提升数据库实例容量。",
        knownCosts: ["用完施工窗口", "真正瓶颈不在数据库时可能无法达标"],
        signal: observed({ A: 2 }),
      },
      {
        id: "Q2-B",
        label: "用两天在读取链路接入缓存，并用剩余一天做最低验收。",
        knownCosts: ["只直接缓解读取压力", "新增缓存状态、更新与故障处理"],
        signal: observed({ A: 2, X: 1 }),
      },
      {
        id: "Q2-C",
        label: "用三天为高峰写请求引入队列并完成最低验收。",
        knownCosts: ["只直接缓解写入高峰", "新增受理承诺、延迟与消息恢复"],
        signal: observed({ A: 2, X: 1 }),
      },
      {
        id: "Q2-D",
        label: "先用一天和 8 单位预算做现有能力范围内的容量测量，再根据结果决定。",
        knownCosts: ["不能直接证明两倍负载合同", "只剩两天和 22 单位", "部分施工路线将来不及完成"],
        signal: observed({ E: 2 }),
      },
    ],
  },
  {
    id: "Q3",
    title: "两份数据互相矛盾",
    knownFacts: "缓存显示点赞数 501，数据库有效点赞状态之和为 498。现存的请求受理记录和数据库提交记录使用同一种请求 ID，可以只读导出；受理日志中有一段十一分钟的缺口，恰好可能覆盖这三条差异。热日志将在七十分钟后轮转，导出约需二十分钟，直接核对约需六十分钟。",
    unknownFacts: "差异来自重复还是丢失，以及缺失时段里是否存在已可靠受理、但尚未落库的请求。",
    constraint: "两小时内必须作出处理决策。业务仍在运行，误操作可能进一步损坏现场。",
    prompt: "你优先怎么处理？",
    options: [
      {
        id: "Q3-A",
        label: "暂停展示有争议的计数，先导出并保留当前数据和日志现场。",
        knownCosts: ["相关页面能力暂时受限", "留给后续核对的时间减少二十分钟"],
        signal: observed({ R: 1, C: 1 }),
      },
      {
        id: "Q3-B",
        label: "立即核对可关联的请求受理记录和数据库提交记录。",
        knownCosts: ["恢复正常展示的时间推迟", "日志缺口可能让核对仍无定论"],
        signal: observed({ E: 2 }),
      },
      {
        id: "Q3-C",
        label: "先按数据库里的当前状态刷新缓存。",
        knownCosts: ["可能遗漏尚未落库的有效承诺"],
        signal: noSignal("这个动作可以被记录，但题面不足以区分交付倾向与权威性假设。"),
      },
      {
        id: "Q3-D",
        label: "请值班 DBA 协助研判，再依据建议决定下一步。",
        knownCosts: ["需要协调与等待", "热日志接近轮转", "最终执行责任仍需明确"],
        signal: observed({ E: 1 }),
      },
    ],
  },
  {
    id: "Q4",
    title: "新的评分要求，旧的业务目标",
    knownFacts: "项目原定必须通过故障恢复验收才能正式上线；目前其中一项恢复测试失败，而且两小时内无法完成修复。一份可以运行但尚未完善的课程演示已经存在，失败也留下了可复现记录。答辩组允许展示未上线版本，但材料必须明确标注‘仅完成课程范围，不代表通过正式上线验收’。原始业务上线合同并未取消。",
    unknownFacts: "延期答辩或缩小正式发布范围能否获批。两项申请都可以现在提交，但不保证在答辩前得到结果。",
    constraint: "剩余两小时，只够优先完成一件事：申请与协调、整理完整失败报告，或完善课程演示。",
    prompt: "你会优先做什么？",
    options: [
      {
        id: "Q4-A",
        label: "保留原来的业务验收要求，用剩余时间申请延期答辩。",
        knownCosts: ["没有时间完善演示或整理完整失败报告", "延期可能来不及获批"],
        signal: observed({ C: 1 }),
      },
      {
        id: "Q4-B",
        label: "整理失败复现、影响范围和未完成事项，沿用现有演示参加答辩。",
        knownCosts: ["演示不再完善", "课程展示分数可能受影响", "正式上线仍受阻"],
        signal: observed({ V: 2, D: 1 }),
      },
      {
        id: "Q4-C",
        label: "用剩余时间与业务方协商缩小本次正式发布范围。",
        knownCosts: ["没有时间完善演示或整理完整失败报告", "授权结果不确定"],
        signal: observed({ D: 1 }),
      },
      {
        id: "Q4-D",
        label: "完善课程演示，明确标注它不代表正式上线验收；完整失败报告之后再补。",
        knownCosts: ["本轮不再梳理故障影响与恢复依据", "正式上线仍受阻"],
        signal: observed({ V: 2, D: 1 }),
      },
    ],
  },
  {
    id: "Q5",
    title: "新技术据说能救场",
    knownFacts: "系统当前 P95 为 310ms，目标为 250ms；团队熟悉一种扩容办法，同时发现一个此前没用过的新组件，宣传资料称其可以改善性能。",
    unknownFacts: "新组件在本业务上的真实性能、维护成本和故障边界；熟悉的扩容方法是否足够。",
    constraint: "十二小时，只能集中投入一条主要路线。",
    prompt: "你优先选择？",
    options: [
      { id: "Q5-A", label: "先实施团队已有经验的扩容方案。", knownCosts: ["可能错过新组件的潜在收益"], signal: observed({ A: 1, D: 1 }) },
      { id: "Q5-B", label: "先用一部分时间做新组件与现有方案的对照试用。", knownCosts: ["可用于最终施工的时间减少"], signal: observed({ E: 2, A: 1 }) },
      { id: "Q5-C", label: "投入半天研究新组件解决这类问题的原理与使用边界。", knownCosts: ["当天能用于工程交付的时间明显减少"], signal: observed({ L: 2 }) },
      { id: "Q5-D", label: "寻找成熟的第三方性能模块并尝试接入。", knownCosts: ["新增外部依赖与适配工作", "实际效果还需确认"], signal: observed({ A: 2, X: 1 }) },
    ],
  },
  {
    id: "Q6",
    title: "AI 给出了一份完整架构方案",
    knownFacts: "AI 建议引入 Redis 和 MQ，并给出一份可以启动的候选实现。隔离环境、当前方案基线、同一批回放请求、Redis/MQ 服务和 1% 小流量发布通道都已准备；装入隔离环境或发布到小流量均约需二十五分钟。剩余时间只够重放一轮正常路径，或者注入一个消息故障。",
    unknownFacts: "建议依赖哪些前提、业务是否需要这些组件，以及未被本轮覆盖的消息故障如何恢复。",
    constraint: "剩余九十分钟，无法对所有候选方案完成全面评估。",
    prompt: "你优先做什么？",
    options: [
      { id: "Q6-A", label: "让 AI 列出方案依赖的关键假设和可能失效的边界，再决定是否继续。", knownCosts: ["得到的是待核对说明，不是运行证据", "实验或施工时间减少"], signal: observed({ E: 2 }) },
      { id: "Q6-B", label: "把候选实现放进隔离环境，选择正常路径或一个消息故障做有限对照。", knownCosts: ["只能得到局部运行证据", "其他故障边界仍然未知"], signal: observed({ E: 2, R: 1 }) },
      { id: "Q6-C", label: "先在 1% 真实流量范围内尝试该方案。", knownCosts: ["跳过现成隔离对照", "承担实际部署风险和额外运维成本", "观察窗口很短"], signal: observed({ D: 1, A: 1 }) },
      { id: "Q6-D", label: "继续委托 AI 做方案细化与实施准备。", knownCosts: ["自己对过程的直接可见性减少", "本轮不产生独立运行证据"], signal: observed({ A: 1 }) },
    ],
  },
  {
    id: "Q7",
    title: "已投入很多，距离上线只剩一步",
    knownFacts: "Redis/MQ 方案已消耗 65 单位预算，当前性能仍未达标，也还没有定位到可直接实施的低成本修复。简化方案在局部对照中表现不错。切回简化方案需三小时和 8 单位，最低剩余合同测试还需三小时和 10 单位；顺利完成后刚好赶上原发布时间。业务方和发布负责人都能在两小时内答复申请，但不保证批准。",
    unknownFacts: "简化方案能否一次通过剩余测试，复杂方案能否及时找到有效修复，以及两种申请是否会获批。",
    constraint: "预算剩余 20 单位，距离发布只有六小时。",
    prompt: "你优先选择？",
    options: [
      { id: "Q7-A", label: "立即切回较简化的方案，并连续完成迁移和最低剩余合同测试。", knownCosts: ["六小时和 18 单位几乎全部用完", "没有返工余量"], signal: observed({ R: 2 }) },
      { id: "Q7-B", label: "集中学习当前组件的故障处理机制，继续寻找复杂方案的修复办法。", knownCosts: ["尚无已定位的低成本修复", "可能耗尽最后窗口"], signal: observed({ L: 2, A: 1 }) },
      { id: "Q7-C", label: "立即向业务方申请分阶段验收和交付。", knownCosts: ["等待最多两小时", "申请可能被拒", "当前版本无法提供完整能力"], signal: observed({ V: 1, D: 1 }) },
      { id: "Q7-D", label: "再用两小时和 4 单位做一轮关键对照，同时申请延期后再决定。", knownCosts: ["延期可能被拒", "之后再切回将失去原六小时窗口"], signal: observed({ E: 2, R: 1 }) },
    ],
  },
];

const OPTION_EXPLANATIONS: Record<string, string> = {
  "Q1-A": "让数据库拒绝同一笔业务被重复记账。它先封住已经找到的入口，但不等于已经查清全部根因。",
  "Q1-B": "先保留现场并重放故障，弄清两次扣款究竟在哪一步发生。代价是修复可能赶不上窗口。",
  "Q1-C": "把支付改动从本次发布中撤出，其他已验证功能照常发布。它保护发布边界，但支付会延期。",
  "Q1-D": "先确认支付平台是否已经提供可复用的防重复能力。现成能力可能省事，也可能并不适用。",
  "Q2-A": "直接增加数据库可用资源，希望现有结构在更高负载下继续工作。瓶颈不在数据库时，投入可能落空。",
  "Q2-B": "让重复读取先由缓存承担，减轻数据库读压力。与此同时，要处理缓存更新和故障恢复。",
  "Q2-C": "把高峰写请求先排队，再逐步处理。它能削峰，但会新增受理承诺、延迟和消息恢复问题。",
  "Q2-D": "先在工具能力范围内测一次，换取读写比例和瓶颈线索。它提供信息，但不能直接证明两倍负载合同。",
  "Q3-A": "先停止展示有争议的数字，并把当前数据和日志保存下来，避免现场继续变化。",
  "Q3-B": "用共同的请求 ID 对照受理与提交记录，查找差异从哪里出现。日志缺口可能让调查没有结论。",
  "Q3-C": "暂时把缓存改成数据库当前数值。页面会一致，但尚未落库的可靠承诺可能被漏掉。",
  "Q3-D": "让值班 DBA 参与判断，再决定是否执行恢复。求助能带来经验，但不会自动转移最终责任。",
  "Q4-A": "不降低原业务验收要求，尝试把答辩往后延。延期是否获批仍不确定。",
  "Q4-B": "不再润色演示，优先把失败、影响和未完成事项整理清楚，再如实参加答辩。",
  "Q4-C": "请求业务方明确授权缩小这次正式发布的范围。授权前，原合同仍然有效。",
  "Q4-D": "把剩余时间用在课程演示，并明确它不代表正式上线通过；完整事故材料留到之后。",
  "Q5-A": "使用团队已经做过的扩容办法，减少学习和接入风险，但可能错过更合适的新能力。",
  "Q5-B": "拿一部分时间做新旧方案对照，先看真实差异。对照本身会吃掉最终施工时间。",
  "Q5-C": "先弄懂新组件解决什么、在哪些边界会失效。当天直接用于交付的时间会明显减少。",
  "Q5-D": "接入已有第三方模块，购买现成能力。它会带来新的依赖、适配和后续维护。",
  "Q6-A": "先让 AI 把前提和失效边界说清楚。得到的是待核对的说明，还不是运行证据。",
  "Q6-B": "把 AI 方案放进隔离环境，重放一条路径或一个故障。能得到局部证据，覆盖不了全部边界。",
  "Q6-C": "让 AI 方案进入 1% 真实流量，直接观察现场表现。它跳过了现成隔离对照，也把风险带进生产。",
  "Q6-D": "继续让 AI 细化并准备实施。推进会更快，但这一轮不会产生独立运行证据。",
  "Q7-A": "放弃已经投入很多的复杂方案，切回较简单路线并立刻补测。时间和预算刚好，几乎没有返工余量。",
  "Q7-B": "继续学习复杂组件并寻找修复，希望救回已有投入。当前还没有已经定位的低成本修复。",
  "Q7-C": "请求把能力拆成几阶段验收和交付。申请可能被拒，当前版本也仍然不完整。",
  "Q7-D": "再做一次关键对照，同时申请延期。它能减少一点不确定性，但可能错过原来的回退窗口。",
};

const seededShuffle = (values: string[], seed: number): string[] => {
  let state = seed >>> 0;
  const random = (): number => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
};

const optionOrdersFor = (seed: number): Record<string, string[]> => Object.fromEntries(
  ASSESSMENT_QUESTIONS.map((question, index) => [
    question.id,
    seededShuffle(question.options.map((option) => option.id), seed + (index + 1) * 7919),
  ]),
);

const newSeed = (): number => (
  (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0
);

const questionAttemptsFor = (seed: number): AssessmentQuestionAttempt[] => {
  const orders = optionOrdersFor(seed);
  return ASSESSMENT_QUESTIONS.map((question) => ({
    attemptId: `bt-card-${seed}-${question.id.toLowerCase()}`,
    protocol: "CARD_KEEP_THEN_CHOOSE",
    protocolVersion: ASSESSMENT_PROTOCOL_VERSION,
    questionVersion: ASSESSMENT_VERSION,
    questionId: question.id,
    presentationOrder: orders[question.id] ?? [],
    cardJudgments: [],
    finalChoice: null,
    phase: "JUDGING",
    events: [],
  }));
};

export const emptyAssessment = (seed: number = newSeed()): EntryAssessment => ({
  version: ASSESSMENT_VERSION,
  protocolVersion: ASSESSMENT_PROTOCOL_VERSION,
  interactionMode: "CARD_KEEP_THEN_CHOOSE",
  orderSeed: seed,
  questionAttempts: questionAttemptsFor(seed),
  completed: false,
});

export const legacyAssessment = (): EntryAssessment => ({
  version: "LEGACY-NO-ASSESSMENT",
  protocolVersion: "LEGACY-NO-ASSESSMENT",
  interactionMode: "LEGACY",
  orderSeed: 0,
  questionAttempts: [],
  completed: true,
});

const questionById = (questionId: string): AssessmentQuestion | undefined =>
  ASSESSMENT_QUESTIONS.find((candidate) => candidate.id === questionId);

export const assessmentCandidateJudgments = (
  assessment: EntryAssessment,
  questionId: string,
): AssessmentCandidateJudgment[] => assessment.questionAttempts
  .find((attempt) => attempt.questionId === questionId)
  ?.cardJudgments
  .slice()
  .sort((left, right) => left.presentedOrder - right.presentedOrder) ?? [];

export const assessmentQuestionAttempt = (
  assessment: EntryAssessment,
  questionId: string,
): AssessmentQuestionAttempt | undefined => assessment.questionAttempts
  .find((attempt) => attempt.questionId === questionId);

export const submittedAssessmentAttempts = (assessment: EntryAssessment): AssessmentQuestionAttempt[] =>
  assessment.questionAttempts
    .filter((attempt) => attempt.phase === "SUBMITTED" && attempt.finalChoice !== null)
    .sort((left, right) => (
      ASSESSMENT_QUESTIONS.findIndex((question) => question.id === left.questionId)
      - ASSESSMENT_QUESTIONS.findIndex((question) => question.id === right.questionId)
    ));

export const currentAssessmentCandidate = (
  assessment: EntryAssessment,
  questionId: string,
) => {
  const attempt = assessmentQuestionAttempt(assessment, questionId);
  const seen = attempt?.cardJudgments.length ?? 0;
  return assessmentOption(attempt?.presentationOrder[seen] ?? "");
};

export const assessmentOptionExplanation = (optionId: string): string =>
  OPTION_EXPLANATIONS[optionId] ?? "这条路线的具体边界还需要结合题面事实判断。";

export const markAssessmentExplanationViewed = (
  assessment: EntryAssessment,
  optionId: string,
): EntryAssessment => {
  const questionId = optionId.slice(0, 2);
  const attempt = assessmentQuestionAttempt(assessment, questionId);
  if (!attempt || !attempt.presentationOrder.includes(optionId) || attempt.phase === "SUBMITTED") {
    throw new Error("当前题目不能记录这次解释查看。");
  }
  const presentedOptionIds = [
    ...attempt.cardJudgments.map((judgment) => judgment.optionId),
    attempt.presentationOrder[attempt.cardJudgments.length],
  ].filter((candidate): candidate is string => typeof candidate === "string");
  if (!presentedOptionIds.includes(optionId)) {
    throw new Error("这张卡还没有展示，不能提前查看解释。");
  }
  if (attempt.events.some((event) => event.kind === "EXPLANATION_VIEWED" && event.optionId === optionId)) {
    return assessment;
  }
  const updated: AssessmentQuestionAttempt = {
    ...attempt,
    events: [
      ...attempt.events,
      { sequence: attempt.events.length + 1, kind: "EXPLANATION_VIEWED", optionId },
    ],
  };
  return {
    ...assessment,
    questionAttempts: assessment.questionAttempts.map((candidate) => (
      candidate.attemptId === updated.attemptId ? updated : candidate
    )),
  };
};

export const judgeAssessmentCandidate = (
  assessment: EntryAssessment,
  questionId: string,
  optionId: string,
  disposition: CandidateDisposition,
): EntryAssessment => {
  const question = questionById(questionId);
  const expected = currentAssessmentCandidate(assessment, questionId);
  const attempt = assessmentQuestionAttempt(assessment, questionId);
  if (!question || !attempt || attempt.phase !== "JUDGING" || !expected || expected.id !== optionId) {
    throw new Error("当前卡片不属于这一步的随机展示顺序。");
  }
  const presentedOrder = attempt.cardJudgments.length + 1;
  const explanationViewedBeforeDecision = attempt.events.some(
    (event) => event.kind === "EXPLANATION_VIEWED" && event.optionId === optionId,
  );
  const updatedJudgments = [
    ...attempt.cardJudgments,
    {
      questionId,
      optionId,
      disposition,
      presentedOrder,
      explanationViewedBeforeDecision,
    },
  ];
  const updatedAttempt: AssessmentQuestionAttempt = {
    ...attempt,
    cardJudgments: updatedJudgments,
    phase: updatedJudgments.length === question.options.length ? "CHOOSING" : "JUDGING",
    events: [
      ...attempt.events,
      { sequence: attempt.events.length + 1, kind: "CARD_JUDGED", optionId, disposition },
    ],
  };
  return {
    ...assessment,
    questionAttempts: assessment.questionAttempts.map((candidate) => (
      candidate.attemptId === updatedAttempt.attemptId ? updatedAttempt : candidate
    )),
  };
};

export const answerAssessment = (
  assessment: EntryAssessment,
  questionId: string,
  optionId: string,
): EntryAssessment => {
  const question = ASSESSMENT_QUESTIONS.find((candidate) => candidate.id === questionId);
  if (!question || !question.options.some((option) => option.id === optionId)) {
    throw new Error("题目或选项不属于 BT-v0.3.2。");
  }
  const attempt = assessmentQuestionAttempt(assessment, questionId);
  if (!attempt || attempt.phase === "SUBMITTED") {
    throw new Error("第一轮原始选择已经锁定。");
  }
  if (attempt.phase !== "CHOOSING" || attempt.cardJudgments.length !== question.options.length) {
    throw new Error("四张候选卡还没有逐张判断完。");
  }
  const updatedAttempt: AssessmentQuestionAttempt = {
    ...attempt,
    finalChoice: optionId,
    phase: "SUBMITTED",
    events: [
      ...attempt.events,
      { sequence: attempt.events.length + 1, kind: "FINAL_CHOICE", optionId },
    ],
  };
  const questionAttempts = assessment.questionAttempts.map((candidate) => (
    candidate.attemptId === updatedAttempt.attemptId ? updatedAttempt : candidate
  ));
  return {
    ...assessment,
    questionAttempts,
    completed: questionAttempts.every((candidate) => candidate.phase === "SUBMITTED"),
  };
};

export const assessmentQuestion = (index: number): AssessmentQuestion | undefined =>
  ASSESSMENT_QUESTIONS[index];

export const assessmentOption = (optionId: string) => {
  for (const question of ASSESSMENT_QUESTIONS) {
    const option = question.options.find((candidate) => candidate.id === optionId);
    if (option) return option;
  }
  return undefined;
};
