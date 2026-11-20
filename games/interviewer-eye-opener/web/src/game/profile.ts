import { ASSESSMENT_QUESTIONS, assessmentOption, submittedAssessmentAttempts } from "./assessment";
import type {
  BehaviorEvent,
  EntryAssessment,
  ProfileComparison,
  ProfileDimension,
  ProfileFinding,
  ProfileReport,
  ProfileSignal,
} from "./types";

export const DIMENSION_LABELS: Record<ProfileDimension, string> = {
  E: "愿意先取得证据",
  C: "优先保护业务约束",
  D: "重视交付推进",
  A: "愿意购买或引入能力",
  V: "关注评价与范围",
  L: "愿意投入学习",
  R: "偏好限制风险或保留回退",
  X: "能够接受新增复杂度",
  J: "保留自己的判断权",
};

type SignalSource = { signal: ProfileSignal; evidence: string };

const reportFromSources = (
  sources: SignalSource[],
  eligibleObservations: number,
  noSignalObservations: number,
  emptySummary: string,
  populatedSummary: string,
): ProfileReport => {
  const totals = new Map<ProfileDimension, number>();
  const evidence = new Map<ProfileDimension, string[]>();
  for (const source of sources) {
    if (source.signal.status !== "OBSERVED") continue;
    for (const [dimension, value] of Object.entries(source.signal.dimensions) as [ProfileDimension, number][]) {
      if (!value) continue;
      totals.set(dimension, (totals.get(dimension) ?? 0) + value);
      evidence.set(dimension, [...(evidence.get(dimension) ?? []), source.evidence]);
    }
  }

  const findings: ProfileFinding[] = [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([dimension, strength]) => ({
      dimension,
      label: DIMENSION_LABELS[dimension],
      strength,
      evidence: evidence.get(dimension) ?? [],
    }));

  if (findings.length === 0) {
    return {
      status: "NO_SIGNAL",
      title: "暂不颁发流派称号",
      summary: emptySummary,
      findings: [],
      eligibleObservations,
      noSignalObservations,
    };
  }

  return {
    status: "LOCAL_TENDENCIES",
    title: "目前只看到几条局部倾向",
    summary: populatedSummary,
    findings,
    eligibleObservations,
    noSignalObservations,
  };
};

export const deriveEntryProfile = (assessment: EntryAssessment): ProfileReport => {
  if (assessment.version === "LEGACY-NO-ASSESSMENT") {
    return reportFromSources(
      [],
      0,
      0,
      "这是 V1 迁移周目，没有伪造七题答案。入场画像保持未知。",
      "",
    );
  }
  const sources: SignalSource[] = [];
  let noSignalObservations = 0;
  const attempts = submittedAssessmentAttempts(assessment);
  for (const attempt of attempts) {
    const question = ASSESSMENT_QUESTIONS.find((candidate) => candidate.id === attempt.questionId);
    const option = assessmentOption(attempt.finalChoice ?? "");
    if (!question || !option) continue;
    if (option.signal.status === "NO_SIGNAL") noSignalObservations += 1;
    const keptCount = attempt.cardJudgments.filter((judgment) => judgment.disposition === "KEEP").length;
    sources.push({
      signal: option.signal,
      evidence: `${question.id} 逐张留下 ${keptCount} 项，最终选择“${option.label}”`,
    });
  }
  return reportFromSources(
    sources,
    attempts.length,
    noSignalObservations,
    "七题中没有足够的候选信号支持局部倾向。系统选择承认它目前还不了解你。",
    "这些是七道候选题留下的局部观察，不是人格百分比，也不是经过真人验证的流派诊断。",
  );
};

export const deriveBehaviorProfile = (events: BehaviorEvent[]): ProfileReport => {
  const eligible = events.filter((event) => event.observationEligible);
  const sources: SignalSource[] = [];
  let noSignalObservations = 0;
  for (const event of eligible) {
    if (event.signal.status === "NO_SIGNAL") noSignalObservations += 1;
    sources.push({ signal: event.signal, evidence: event.action });
  }
  return reportFromSources(
    sources,
    eligible.length,
    noSignalObservations,
    "本局有行为记录，但没有足够的合格观察支持倾向推断。强制点击和系统自动动作没有被拿来凑分。",
    "这些是本局合格行为留下的局部观察。系统强制动作和没有真实替代方案的点击没有参与推断。",
  );
};

const dominantDimensions = (profile: ProfileReport): ProfileDimension[] => {
  const first = profile.findings[0]?.strength;
  if (first === undefined) return [];
  return profile.findings.filter((finding) => finding.strength === first).map((finding) => finding.dimension);
};

export const compareProfiles = (
  entry: ProfileReport,
  behavior: ProfileReport,
  events: BehaviorEvent[],
): ProfileComparison => {
  if (entry.status === "NO_SIGNAL" || behavior.status === "NO_SIGNAL") {
    return {
      status: "INSUFFICIENT",
      title: "现在还不足以比较你说的和你做的",
      explanation: "至少一侧没有足够观察。系统不会为了生成一句损话强行补出人格反差。",
      evidence: [
        `入场有效回答 ${entry.eligibleObservations} 条`,
        `游戏内合格行为 ${behavior.eligibleObservations} 条`,
      ],
    };
  }

  const entryTop = dominantDimensions(entry);
  const behaviorTop = dominantDimensions(behavior);
  const overlap = entryTop.some((dimension) => behaviorTop.includes(dimension));
  if (overlap) {
    return {
      status: "CONSISTENT",
      title: "入场选择和实际行为暂时指向同一类优先级",
      explanation: "这只能说明本局观察到的一部分一致，不能证明你拥有固定人格。",
      evidence: behavior.findings[0]?.evidence.slice(0, 3) ?? [],
    };
  }

  const evidenceUpdates = events.filter(
    (event) => event.observationEligible
      && event.kind === "VIEW_EVIDENCE"
      && event.signal.status === "OBSERVED",
  );
  if (evidenceUpdates.length > 0) {
    return {
      status: "EVIDENCE_UPDATE",
      title: "你改变了优先级，但现场留下了变化依据",
      explanation: "这更像拿到新证据后的调整，不自动解释成人格反差或目标漂移。",
      evidence: evidenceUpdates.map((event) => event.action).slice(0, 3),
    };
  }

  return {
    status: "INSUFFICIENT",
    title: "两份画像不一样，但原因还不够清楚",
    explanation: "实际行为出现了不同倾向，现有记录不足以区分合理更新、期限妥协或无依据漂移。",
    evidence: behavior.findings[0]?.evidence.slice(0, 3) ?? [],
  };
};
