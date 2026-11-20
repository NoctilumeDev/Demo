import "./styles.css";

import { achievementById, initialCareer, recordCompletedRun } from "./game/achievements";
import {
  ASSESSMENT_QUESTIONS,
  answerAssessment,
  assessmentCandidateJudgments,
  assessmentOption,
  assessmentOptionExplanation,
  assessmentQuestion,
  assessmentQuestionAttempt,
  currentAssessmentCandidate,
  emptyAssessment,
  judgeAssessmentCandidate,
  markAssessmentExplanationViewed,
  submittedAssessmentAttempts,
} from "./game/assessment";
import { FACTIONS, INCIDENTS, factionById } from "./game/content";
import {
  advanceIncident,
  applyDecision,
  canApplyDecision,
  canRetryCurrentIncident,
  completeNextCourse,
  createRun,
  currentAttempt,
  currentIncident,
  decisionPrice,
  hasPendingCourse,
  incidentEvidence,
  retryCurrentIncident,
  toggleAcademicScope,
  viewCurrentEvidence,
} from "./game/engine";
import { checkForIncident, judgeRun } from "./game/judge";
import { compareProfiles, deriveBehaviorProfile, deriveEntryProfile } from "./game/profile";
import { calculateFactionScore } from "./game/score";
import {
  clearAssessmentDraft,
  clearActiveRun,
  loadAssessmentDraft,
  loadActiveRun,
  loadCareer,
  saveAssessmentDraft,
  saveActiveRun,
  saveCareer,
} from "./game/storage";
import type {
  CareerState,
  CandidateDisposition,
  EntryAssessment,
  FactValue,
  FactionId,
  GameRun,
  IncidentId,
  ProfileReport,
  VerdictStatus,
} from "./game/types";

type Screen = "HOME" | "QUIZ" | "ENTRY_PROFILE" | "SELECT" | "GAME" | "CAREER";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app");

let career: CareerState = loadCareer(window.localStorage);
let run: GameRun | undefined = loadActiveRun(window.localStorage);
let assessment: EntryAssessment = loadAssessmentDraft(window.localStorage) ?? emptyAssessment();
let screen: Screen = run ? "GAME" : "HOME";
let notice = "";
let restartRequested = false;
let restartTriggerAction: "start" | "new-run" = "start";

const statusLabel = (status: VerdictStatus): string => ({
  PASS: "通过",
  FAIL: "失败",
  UNKNOWN: "未知",
})[status];

const statusClass = (status: VerdictStatus): string => `status status--${status.toLowerCase()}`;

const factLabels: Record<string, string> = {
  stateSum: "有效状态之和",
  storedCount: "独立计数",
  duplicateEffects: "重复业务效果",
  changedResponses: "宣称变化的响应",
  durableRequest: "持久化请求记录",
  committedEffects: "实际业务效果",
  retryReplayed: "重试恢复原结果",
  clientResultMatches: "客户端结果一致",
  finalStateCorrect: "最终状态正确",
  durableEvidence: "可靠接收证据",
  authoritativeEvidence: "权威事实明确",
  lostOperations: "丢失操作",
  processed: "已处理请求",
  rejected: "已拒绝请求",
  errors: "错误请求",
  p95Ms: "P95 延迟",
  countConsistent: "计数一致",
  measured: "保留压测证据",
  effectiveCapacity: "连续世界有效容量",
  charges: "实际扣款次数",
  reproduced: "反例已复现",
  rootCauseFound: "根因已定位",
  fixEvidence: "修复证据完整",
  neighborCasePassed: "邻近场景通过",
};

const formatFact = (key: string, value: FactValue): string => {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (key === "p95Ms") return `${value} ms`;
  return String(value);
};

const renderShell = (content: string): string => `
  <div class="app-shell">
    <header class="topbar">
      <button class="brand" data-action="home" data-testid="home-nav" aria-label="返回游戏首页">
        <span class="brand__alarm">ALARM</span>
        <span>面试官眼前一亮</span>
      </button>
      <div class="topbar__meta">
        <span class="simulation-badge">确定性游戏仿真</span>
        <button class="text-button" data-action="career" data-testid="career-nav">生涯档案</button>
      </div>
    </header>
    ${notice ? `<div class="notice" role="status">${notice}</div>` : ""}
    <main id="main-content">${content}</main>
  </div>
`;

const renderHome = (): string => {
  const latest = career.runs.at(-1);
  return renderShell(`
    <section class="hero">
      <div class="hero__copy">
        <p class="eyebrow">工程反例游乐场 / 第一款游戏</p>
        <h1>面试官<br /><em>眼前一亮</em></h1>
        <p class="hero__subtitle">先回答七个工程困境，看看你说自己会怎么选。再把你放进真的预算和故障里，看看现场记录同不同意。</p>
        <div class="hero__actions">
          <button class="primary-button" data-action="start" data-testid="home-start">${assessment.questionAttempts.some((attempt) => attempt.events.length > 0) && !assessment.completed ? "继续入场测试" : "测测我是哪一派"}</button>
          ${run ? `<button class="secondary-button" data-action="resume" data-testid="resume-run">继续 ${factionById(run.factionId).name}</button>` : ""}
        </div>
      </div>
      <div class="hero__console" aria-label="当前实验状态">
        <div class="console__header"><span>LIVE CONTRACT</span><span>S0—S6</span></div>
        <div class="console__row"><span>真实 MySQL 基线</span><b class="ink-pass">QUALIFIED</b></div>
        <div class="console__row"><span>浏览器五派玩法</span><b>SIMULATION</b></div>
        <div class="console__row"><span>已完成周目</span><b>${career.runs.length}</b></div>
        <div class="console__row"><span>已解锁成就</span><b>${career.achievements.length}</b></div>
        <div class="console__divider"></div>
        <p>仿真负责让决策可玩。真实 MySQL 实验单独运行，二者不互相冒名。</p>
      </div>
    </section>
    <section class="contract-strip">
      <article><span>业务合同</span><strong>一个用户最多贡献一个有效点赞</strong></article>
      <article><span>独立裁判</span><strong>评分变漂亮，事实也不会跟着变</strong></article>
      <article><span>最近结果</span><strong>${latest ? `${factionById(latest.factionId).name} / ${latest.businessStatus}` : "尚未开始第一局"}</strong></article>
    </section>
  `);
};

const renderProfileFindings = (profile: ProfileReport, testId: string): string => `
  <section class="profile-card" data-testid="${testId}">
    <div class="profile-card__heading">
      <span>${profile.status === "NO_SIGNAL" ? "NO_SIGNAL" : "候选观察"}</span>
      <strong>${profile.title}</strong>
    </div>
    <p>${profile.summary}</p>
    ${profile.findings.length > 0 ? `
      <div class="profile-findings">
        ${profile.findings.map((finding) => `
          <article>
            <span>${finding.dimension}</span>
            <strong>${finding.label}</strong>
            <small>观察强度 ${finding.strength} · 不是百分比</small>
            <details><summary>为什么这么说</summary><ul>${finding.evidence.map((item) => `<li>${item}</li>`).join("")}</ul></details>
          </article>
        `).join("")}
      </div>
    ` : ""}
    <p class="profile-card__coverage">有效观察 ${profile.eligibleObservations} 条 · 无画像信号 ${profile.noSignalObservations} 条</p>
  </section>
`;

const renderQuiz = (): string => {
  const index = submittedAssessmentAttempts(assessment).length;
  const question = assessmentQuestion(index);
  if (!question) return renderEntryProfile();
  const questionAttempt = assessmentQuestionAttempt(assessment, question.id);
  const judgments = assessmentCandidateJudgments(assessment, question.id);
  const candidate = currentAssessmentCandidate(assessment, question.id);
  const candidateNumber = judgments.length + 1;
  const keptIds = judgments
    .filter((judgment) => judgment.disposition === "KEEP")
    .map((judgment) => judgment.optionId);
  const orderedOptions = (questionAttempt?.presentationOrder ?? [])
    .map((optionId) => assessmentOption(optionId))
    .filter((option) => option !== undefined);
  const selectionMessage = keptIds.length === question.options.length
    ? "四个方案你都愿意考虑。很好，预算没有因此变成四份。"
    : keptIds.length === 0
      ? "四个方案你都跳过了。事故没有因此取消，现在仍然要选一条路。"
      : `你留下了 ${keptIds.length} 个候选。保留不等于执行，现在只能选一个。`;
  return renderShell(`
    <section class="quiz-page" data-testid="assessment-quiz">
      <div class="quiz-progress" aria-label="题目进度">
        <span>BT-v0.3.2 题目 · BT-CARD-v0.1-rc1 协议</span>
        <strong>第 ${index + 1} 题 / ${ASSESSMENT_QUESTIONS.length}${candidate ? ` · 候选 ${candidateNumber}/4` : " · 最终取舍"}</strong>
        <div class="meter"><i style="width:${(index / ASSESSMENT_QUESTIONS.length) * 100}%"></i></div>
      </div>
      <article class="quiz-card">
        <p class="eyebrow">工程决策题卡</p>
        <h2>${question.title}</h2>
        <div class="quiz-facts">
          <section><span>已知事实</span><p>${question.knownFacts}</p></section>
          <section><span>尚不清楚</span><p>${question.unknownFacts}</p></section>
          <section><span>限制</span><p>${question.constraint}</p></section>
        </div>
        ${candidate ? `
          <section class="candidate-stage" data-testid="candidate-stage">
            <div class="candidate-stage__counter"><span>当前方案</span><strong>${candidateNumber} / 4</strong></div>
            <article class="candidate-card" data-testid="candidate-${candidate.id}">
              <h3>${candidate.label}</h3>
              <span>你已经知道的主要代价</span>
              <ul>${candidate.knownCosts.map((cost) => `<li>${cost}</li>`).join("")}</ul>
              ${questionAttempt?.events.some((event) => event.kind === "EXPLANATION_VIEWED" && event.optionId === candidate.id) ? `
                <div class="candidate-explanation" data-testid="explanation-${candidate.id}">
                  <strong>这句话在说什么？</strong>
                  <p>${assessmentOptionExplanation(candidate.id)}</p>
                  <small>这段解释只翻译动作，不替它判对错，也不产生画像分数。</small>
                </div>
              ` : `
                <button class="text-button candidate-help" data-action="explain-assessment-option" data-option="${candidate.id}" data-testid="explain-${candidate.id}">这是什么意思？</button>
              `}
            </article>
            <p>你愿不愿意把它留到最后比较？保留不等于执行，跳过也不等于判它错误。</p>
            <div class="candidate-actions">
              <button class="secondary-button" data-action="judge-assessment-candidate" data-disposition="SKIP" data-question="${question.id}" data-option="${candidate.id}" data-testid="skip-${candidate.id}">跳过</button>
              <button class="primary-button" data-action="judge-assessment-candidate" data-disposition="KEEP" data-question="${question.id}" data-option="${candidate.id}" data-testid="keep-${candidate.id}">先留下</button>
            </div>
          </section>
        ` : `
          <section class="final-choice-stage" data-testid="final-choice-stage">
            <p class="eyebrow">真正的资源取舍</p>
            <h3>${question.prompt}</h3>
            <p>${selectionMessage}</p>
            <div class="quiz-options quiz-options--final">
              ${orderedOptions.map((option) => {
                const kept = keptIds.includes(option.id);
                return `
                  <button data-action="answer-assessment" data-question="${question.id}" data-option="${option.id}" data-testid="assessment-${option.id}">
                    <span class="candidate-disposition candidate-disposition--${kept ? "kept" : "skipped"}">${kept ? "先前留下" : "先前跳过"}</span>
                    <strong>${option.label}</strong>
                    <span>现在选它，就要承担</span>
                    <ul>${option.knownCosts.map((cost) => `<li>${cost}</li>`).join("")}</ul>
                  </button>
                `;
              }).join("")}
            </div>
            <p class="quiz-lock-note">你可以改主意。逐张判断、展示顺序和最终选择会分别保存，后面的画像不能回写它们。</p>
          </section>
        `}
      </article>
    </section>
  `);
};

const renderEntryProfile = (): string => {
  const profile = deriveEntryProfile(assessment);
  return renderShell(`
    <section class="profile-page" data-testid="entry-profile">
      <div class="section-heading">
        <p class="eyebrow">入场画像 · 你宣称如何决策</p>
        <h2>${profile.title}</h2>
        <p>这七题尚未经过真人量表验证。这里展示候选维度与原始依据，不生成“工程派 76%”。</p>
      </div>
      ${renderProfileFindings(profile, "entry-profile-report")}
      <div class="profile-challenge">
        <p>目前我们只知道你怎么回答问题。预算真的开始减少时，你还会这么选吗？</p>
        <button class="primary-button" data-action="enter-faction-select" data-testid="enter-game">不服？进场证明</button>
      </div>
    </section>
  `);
};

const renderFactionSelect = (): string => renderShell(`
  <section class="selection-page">
    <div class="section-heading">
      <p class="eyebrow">选择目标函数</p>
      <h2>你准备相信什么？</h2>
      <p>流派会改变起始组件、预算和评分方式，不会替你预定胜负。</p>
    </div>
    <div class="faction-grid">
      ${FACTIONS.map((faction) => `
        <button
          class="faction-card"
          style="--faction-accent:${faction.accent}"
          data-action="choose-faction"
          data-faction="${faction.id}"
          data-testid="faction-${faction.id}"
        >
          <span class="faction-card__short">${faction.shortName}</span>
          <strong>${faction.name}</strong>
          <q>${faction.motto}</q>
          <p>${faction.description}</p>
          <span class="faction-card__score">专属评分：${faction.scoreName}</span>
        </button>
      `).join("")}
    </div>
  </section>
`);

const renderProgress = (activeRun: GameRun): string => `
  <ol class="progress" aria-label="事故进度">
    ${INCIDENTS.map((incident, index) => {
      const attempted = activeRun.attempts.some((attempt) => attempt.incidentId === incident.id);
      const current = index === activeRun.incidentIndex && activeRun.phase !== "SETTLED";
      const check = attempted ? checkForIncident(activeRun, incident.id) : undefined;
      return `
        <li class="progress__item ${current ? "is-current" : ""} ${attempted ? "is-seen" : ""}">
          <span>${index + 1}</span>
          <div>
            <small>${incident.chapter}</small>
            <strong>${incident.title}</strong>
          </div>
          ${check ? `<b class="${statusClass(check.status)}">${check.status}</b>` : ""}
        </li>
      `;
    }).join("")}
  </ol>
`;

const renderDecisionPanel = (activeRun: GameRun): string => {
  const incident = currentIncident(activeRun);
  if (!incident) return "";
  const evidenceViewed = activeRun.viewedEvidence.includes(incident.id);
  const evidence = incidentEvidence(activeRun);
  return `
    <div class="incident-card incident-card--decision">
      <div class="incident-card__topline">
        <span>${incident.chapter}</span>
        <span>世界：${activeRun.worldId}</span>
      </div>
      <h2>${incident.title}</h2>
      <p class="incident-card__brief">${incident.brief}</p>
      <div class="signal-box"><span>现场信号</span><p>${incident.signal}</p></div>
      <section class="world-evidence" data-testid="world-evidence">
        <div>
          <span>可选取证</span>
          <strong>${evidenceViewed ? "已经查看，证据进入行为记录" : "花 1 时间，看看连续世界留下了什么"}</strong>
        </div>
        ${evidenceViewed ? `
          <ul>${evidence.map((item) => `<li>${item}</li>`).join("")}</ul>
        ` : `
          <button class="secondary-button" data-action="view-evidence" data-testid="view-evidence" ${activeRun.timeRemaining < 1 ? "disabled" : ""}>查看现场证据 · 时间 1</button>
        `}
      </section>
      <h3>${incident.question}</h3>
      <div class="decision-list">
        ${incident.decisions.map((decision) => {
          const price = decisionPrice(activeRun, decision);
          const affordable = canApplyDecision(activeRun, decision);
          return `
            <button
              class="decision-card"
              data-action="apply-decision"
              data-decision="${decision.id}"
              data-testid="decision-${decision.id}"
              ${affordable ? "" : "disabled"}
            >
              <span class="decision-card__price">预算 ${price.budget} · 时间 ${price.time}</span>
              <strong>${decision.title}</strong>
              <p>${decision.description}</p>
              ${affordable ? "" : `<em>资源不够，不能假装已经实施</em>`}
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
};

const renderReviewPanel = (activeRun: GameRun): string => {
  const incident = currentIncident(activeRun);
  const attempt = currentAttempt(activeRun);
  if (!incident || !attempt) return "";
  const check = checkForIncident(activeRun, incident.id);
  const isExcluded = activeRun.excludedFromCourse.includes(incident.id);
  const finalIncident = activeRun.incidentIndex === INCIDENTS.length - 1;
  const academicVerdict = activeRun.factionId === "academic" ? judgeRun(activeRun) : undefined;
  const academicScore = academicVerdict ? calculateFactionScore(activeRun, academicVerdict) : undefined;
  return `
    <div class="incident-card incident-card--review" data-testid="review-panel">
      <div class="incident-card__topline">
        <span>${incident.chapter} / 第 ${attempt.attempt} 次执行</span>
        <span>系统与裁判分开记账</span>
      </div>
      <h2>${incident.title}</h2>
      <div class="verdict-comparison">
        <section>
          <span>系统自述</span>
          <strong class="${statusClass(attempt.observation.systemClaim)}">${attempt.observation.systemClaim}</strong>
          <p>${attempt.observation.systemMessage}</p>
        </section>
        <section class="judge-result">
          <span>独立裁判</span>
          <strong class="${statusClass(check.status)}" data-testid="review-status">${check.status}</strong>
          <p>${check.summary}</p>
        </section>
      </div>
      <div class="facts-grid">
        ${Object.entries(attempt.observation.facts).map(([key, value]) => `
          <div><span>${factLabels[key] ?? key}</span><strong>${formatFact(key, value)}</strong></div>
        `).join("")}
      </div>
      <details class="evidence-box" open>
        <summary>本次证据</summary>
        <ul>${attempt.observation.evidence.map((item) => `<li>${item}</li>`).join("")}</ul>
      </details>
      <div class="review-actions">
        <button class="secondary-button" data-action="retry" data-testid="retry-incident" ${canRetryCurrentIncident(activeRun) ? "" : "disabled"}>保留记录，回退重选 · 时间 1</button>
        ${activeRun.factionId === "academic" ? `
          <button class="secondary-button academic-button" data-action="toggle-scope" data-testid="toggle-scope">
            ${isExcluded ? "恢复课程验收" : "本题暂不讨论"}
          </button>
        ` : ""}
        <button class="primary-button" data-action="advance" data-testid="advance-incident">
          ${finalIncident ? "进入最终结算" : "接受结果，继续"}
        </button>
      </div>
      ${isExcluded && academicScore && academicVerdict ? `
        <div class="scope-warning" data-testid="academic-scope-result">
          <strong>${academicScore.value === 100 ? "恭喜！当前纳入考核的项目全部通过。" : `课程成绩现在是 ${academicScore.value}/${academicScore.maximum}。`}</strong>
          <span>${academicScore.note}</span>
          <b>业务验收：${academicVerdict.status}</b>
        </div>
      ` : ""}
    </div>
  `;
};

const renderTrainingAction = (activeRun: GameRun): string => {
  if (activeRun.factionId !== "training" || !activeRun.training || !hasPendingCourse(activeRun)) return "";
  const pending = activeRun.training.offeredCourses.find(
    (course) => !activeRun.training!.completedCourses.includes(course),
  );
  if (!pending) return "";
  return `
    <section class="goalpost-card" data-testid="training-goalpost">
      <span>招生宣传已更新</span>
      <strong>新增必学：${pending}</strong>
      <p>你的能力没有缩水，满分线已经升到 ${activeRun.training.maximum}。</p>
      <button
        class="secondary-button"
        data-action="complete-course"
        data-testid="complete-course"
        ${activeRun.budget >= 5 && activeRun.timeRemaining >= 1 ? "" : "disabled"}
      >完成本期课程 · 预算 5 · 时间 1</button>
    </section>
  `;
};

const renderLedger = (activeRun: GameRun): string => {
  const verdict = judgeRun(activeRun);
  const score = calculateFactionScore(activeRun, verdict);
  const faction = factionById(activeRun.factionId);
  return `
    <aside class="ledger">
      <div class="ledger__heading">
        <span style="--faction-accent:${faction.accent}">${faction.name}</span>
        <q>${faction.motto}</q>
      </div>
      <section class="ledger-block">
        <div class="ledger-block__title"><span>业务账</span><b class="${statusClass(verdict.status)}">${verdict.status}</b></div>
        <div class="meter"><i style="width:${verdict.businessScore}%"></i></div>
        <p>${verdict.passed}/5 通过 · ${verdict.failed} 失败 · ${verdict.unknown} 未知</p>
      </section>
      <section class="ledger-block">
        <div class="ledger-block__title"><span>${score.label}</span><b>${score.value}/${score.maximum}</b></div>
        <div class="meter meter--faction" style="--faction-accent:${faction.accent}">
          <i style="width:${Math.min(100, (score.value / score.maximum) * 100)}%"></i>
        </div>
        <p>${score.note}</p>
      </section>
      <section class="ledger-block resource-grid">
        <div><span>预算</span><strong>${activeRun.budget}</strong></div>
        <div><span>时间</span><strong>${activeRun.timeRemaining}</strong></div>
        <div><span>复杂度</span><strong>${activeRun.complexity}</strong></div>
        <div><span>证据</span><strong>${activeRun.evidenceScore}</strong></div>
        <div><span>当前负载</span><strong>${activeRun.world.load}</strong></div>
        <div><span>可靠性债</span><strong>${activeRun.world.reliabilityDebt}</strong></div>
      </section>
      <section class="ledger-block">
        <span class="ledger-label">行为观测</span>
        <p>${activeRun.behaviorLog.filter((event) => event.observationEligible).length} 条合格 · ${activeRun.behaviorLog.filter((event) => !event.observationEligible).length} 条只记录不推断</p>
      </section>
      <section class="ledger-block">
        <span class="ledger-label">当前组件</span>
        <div class="chip-list">${activeRun.components.map((component) => `<span>${component}</span>`).join("")}</div>
      </section>
      <section class="ledger-block">
        <span class="ledger-label">已建立控制</span>
        <div class="chip-list chip-list--controls">
          ${activeRun.controls.length > 0 ? activeRun.controls.map((control) => `<span>${control}</span>`).join("") : "<em>还没有</em>"}
        </div>
      </section>
    </aside>
  `;
};

const renderTimeline = (activeRun: GameRun): string => `
  <section class="timeline-panel">
    <div class="panel-heading"><span>事故记录</span><b>${activeRun.history.length} 条</b></div>
    <ol class="timeline">
      ${activeRun.history.slice(-9).reverse().map((entry) => `
        <li class="timeline__${entry.kind.toLowerCase()}">
          <span>${String(entry.sequence).padStart(2, "0")}</span>
          <div><strong>${entry.title}</strong><p>${entry.detail}</p></div>
        </li>
      `).join("")}
    </ol>
  </section>
`;

const renderGame = (activeRun: GameRun): string => {
  if (activeRun.phase === "SETTLED") return renderSettlement(activeRun);
  return renderShell(`
    <section class="game-layout">
      <div class="game-main">
        ${renderProgress(activeRun)}
        ${renderTrainingAction(activeRun)}
        ${activeRun.phase === "DECISION" ? renderDecisionPanel(activeRun) : renderReviewPanel(activeRun)}
        ${renderTimeline(activeRun)}
      </div>
      ${renderLedger(activeRun)}
    </section>
  `);
};

const renderSettlement = (activeRun: GameRun): string => {
  const verdict = activeRun.finalVerdict ?? judgeRun(activeRun);
  const score = calculateFactionScore(activeRun, verdict);
  const faction = factionById(activeRun.factionId);
  const entryProfile = deriveEntryProfile(activeRun.entryAssessment);
  const behaviorProfile = deriveBehaviorProfile(activeRun.behaviorLog);
  const comparison = compareProfiles(entryProfile, behaviorProfile, activeRun.behaviorLog);
  const unlocked = activeRun.unlockedAchievementIds
    .map((id) => achievementById(id))
    .filter((achievement) => achievement !== undefined);
  return renderShell(`
    <section class="settlement" data-testid="settlement">
      <header class="settlement__hero" style="--faction-accent:${faction.accent}">
        <p class="eyebrow">周目 ${activeRun.runNumber} / ${faction.name}</p>
        <h1>最终业务裁决<br /><em class="settlement-status settlement-status--${verdict.status.toLowerCase()}" data-testid="settlement-verdict">${verdict.status}</em></h1>
        <p>${verdict.passed} 项通过，${verdict.failed} 项失败，${verdict.unknown} 项仍然不知道。</p>
      </header>
      <div class="settlement-ledgers">
        <article><span>业务账</span><strong>${verdict.businessScore}/100</strong><p>独立裁判只读运行事实。</p></article>
        <article><span>${score.label}</span><strong>${score.value}/${score.maximum}</strong><p>${score.note}</p></article>
        <article><span>资源账</span><strong>${activeRun.budget} 预算</strong><p>剩余时间 ${activeRun.timeRemaining}，复杂度 ${activeRun.complexity}。</p></article>
      </div>
      <section class="profile-comparison" data-testid="profile-comparison">
        <div class="section-heading section-heading--compact">
          <p class="eyebrow">双画像 · 分开记账</p>
          <h2>${comparison.title}</h2>
          <p>${comparison.explanation}</p>
        </div>
        <div class="profile-comparison__grid">
          <div><span>入场画像</span>${renderProfileFindings(entryProfile, "settlement-entry-profile")}</div>
          <div><span>行为画像</span>${renderProfileFindings(behaviorProfile, "settlement-behavior-profile")}</div>
        </div>
        <div class="comparison-evidence">
          <strong>变化依据</strong>
          ${comparison.evidence.length > 0 ? `<ul>${comparison.evidence.map((item) => `<li>${item}</li>`).join("")}</ul>` : `<p>当前证据不足，不强行解释。</p>`}
        </div>
      </section>
      <section class="final-checks">
        <div class="section-heading section-heading--compact"><p class="eyebrow">完整事实剧本</p><h2>裁判逐项结论</h2></div>
        ${verdict.checks.map((check) => `
          <article>
            <b class="${statusClass(check.status)}">${check.status}</b>
            <div><strong>${check.title}</strong><p>${check.summary}</p></div>
            <details><summary>查看证据</summary><ul>${check.evidence.map((item) => `<li>${item}</li>`).join("")}</ul></details>
          </article>
        `).join("")}
      </section>
      <section class="achievement-results">
        <div class="section-heading section-heading--compact"><p class="eyebrow">本周目</p><h2>成就结算</h2></div>
        ${unlocked.length > 0 ? `
          <div class="achievement-grid">
            ${unlocked.map((achievement) => `
              <article class="achievement-card is-new" data-testid="achievement-${achievement.id}">
                <span>新成就</span><strong>《${achievement.title}》</strong><p>${achievement.hint}</p>
              </article>
            `).join("")}
          </div>
        ` : `<p class="empty-state">这次没有新奖杯。事故记录仍然保留。</p>`}
      </section>
      <section class="settlement-actions">
        <button class="primary-button" data-action="new-run" data-testid="new-run">开始新周目</button>
        <button class="secondary-button" data-action="career">查看生涯档案</button>
      </section>
    </section>
  `);
};

const renderCareer = (): string => renderShell(`
  <section class="career-page">
    <div class="section-heading">
      <p class="eyebrow">跨周目保留</p>
      <h2>生涯档案</h2>
      <p>奖杯记录真实发生过的事件。不同流派的分数不能互相覆盖。</p>
    </div>
    <section class="career-stats">
      <article><span>完成周目</span><strong>${career.runs.length}</strong></article>
      <article><span>累计成就</span><strong>${career.achievements.length}</strong></article>
      <article><span>通过业务验收</span><strong>${career.runs.filter((item) => item.businessStatus === "PASS").length}</strong></article>
    </section>
    <section class="career-section">
      <div class="panel-heading"><span>成就陈列室</span><b>${career.achievements.length}</b></div>
      <div class="achievement-grid">
        ${career.achievements.map((unlock) => {
          const definition = achievementById(unlock.id);
          return `
            <article class="achievement-card">
              <span>${unlock.runId.startsWith("project-history") ? "项目历史" : unlock.runId}</span>
              <strong>《${unlock.title}》</strong>
              <p>${definition?.hint ?? unlock.evidence}</p>
              <small>${unlock.evidence}</small>
            </article>
          `;
        }).join("")}
      </div>
    </section>
    <section class="career-section">
      <div class="panel-heading"><span>周目对照</span><b>${career.runs.length}</b></div>
      ${career.runs.length === 0 ? `<p class="empty-state">还没有完成的周目。三枚项目历史成就已经在等你了。</p>` : `
        <div class="run-table-wrap"><table class="run-table">
          <thead><tr><th>周目</th><th>流派</th><th>业务</th><th>流派评分</th><th>画像对照</th><th>预算</th><th>复杂度</th></tr></thead>
          <tbody>${career.runs.map((item) => `
            <tr>
              <td>${item.runNumber}</td>
              <td>${factionById(item.factionId).name}</td>
              <td><b class="${statusClass(item.businessStatus)}">${item.businessStatus}</b></td>
              <td>${item.factionScore.value}/${item.factionScore.maximum}</td>
              <td>${item.profileComparisonStatus ?? "历史版本未记录"}</td>
              <td>${item.budgetRemaining}</td>
              <td>${item.complexity}</td>
            </tr>
          `).join("")}</tbody>
        </table></div>
      `}
    </section>
    <div class="settlement-actions">
      <button class="primary-button" data-action="new-run" data-testid="career-new-run">开始新周目</button>
      <button class="secondary-button" data-action="home">返回首页</button>
    </div>
  </section>
`);

const renderRestartDialog = (): string => {
  if (!restartRequested || !run || run.phase === "SETTLED") return "";
  return `
    <dialog class="restart-dialog" data-testid="restart-dialog" aria-labelledby="restart-dialog-title">
      <p class="eyebrow">进行中的周目</p>
      <h2 id="restart-dialog-title">这局还没结束</h2>
      <p>现在开始新局，会放弃当前${factionById(run.factionId).name}的未完成进度。已经结算的历史周目不会受影响。</p>
      <div class="restart-dialog__actions">
        <button class="primary-button" data-action="cancel-restart" data-testid="cancel-restart">继续当前周目</button>
        <button class="danger-button" data-action="confirm-restart" data-testid="confirm-restart">放弃并开始新局</button>
      </div>
    </dialog>
  `;
};

const currentViewKey = (): string => {
  if (screen === "QUIZ") {
    const submitted = submittedAssessmentAttempts(assessment).length;
    const question = assessmentQuestion(submitted);
    const candidateCount = question
      ? assessmentCandidateJudgments(assessment, question.id).length
      : 0;
    return `QUIZ:${submitted}:${candidateCount}`;
  }
  if (screen !== "GAME" || !run) return screen;
  if (run.phase === "SETTLED") return `SETTLEMENT:${run.runId}`;
  return `INCIDENT:${run.runId}:${run.incidentIndex}`;
};

const focusViewStart = (): void => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  const heading = app.querySelector<HTMLElement>("main h1, main h2");
  const target = heading ?? app.querySelector<HTMLElement>("main");
  if (!target) return;
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
};

const focusRestartDialog = (): void => {
  const dialog = app.querySelector<HTMLDialogElement>("[data-testid='restart-dialog']");
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  app.querySelector<HTMLButtonElement>("[data-testid='cancel-restart']")?.focus();
};

const focusRestartTrigger = (): void => {
  app.querySelector<HTMLButtonElement>(`button[data-action='${restartTriggerAction}']`)?.focus();
};

const render = (): void => {
  notice = notice.trim();
  if (screen === "HOME") app.innerHTML = renderHome();
  if (screen === "QUIZ") app.innerHTML = renderQuiz();
  if (screen === "ENTRY_PROFILE") app.innerHTML = renderEntryProfile();
  if (screen === "SELECT") app.innerHTML = renderFactionSelect();
  if (screen === "CAREER") app.innerHTML = renderCareer();
  if (screen === "GAME") app.innerHTML = run ? renderGame(run) : renderHome();
  if (restartRequested) {
    app.insertAdjacentHTML("beforeend", renderRestartDialog());
    focusRestartDialog();
  }
};

const persistRun = (): void => {
  if (run) saveActiveRun(window.localStorage, run);
};

const settleAndRecord = (settled: GameRun): void => {
  const recorded = recordCompletedRun(career, settled);
  career = recorded.career;
  run = recorded.run;
  saveCareer(window.localStorage, career);
  persistRun();
};

app.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const previousViewKey = currentViewKey();
  let restoreRestartTrigger = false;
  notice = "";
  try {
    switch (action) {
      case "home":
        screen = "HOME";
        break;
      case "start":
      case "new-run":
        if (run && run.phase !== "SETTLED") {
          restartTriggerAction = action;
          restartRequested = true;
        } else {
          const resetAssessment = action === "new-run" || run?.phase === "SETTLED";
          clearActiveRun(window.localStorage);
          run = undefined;
          if (resetAssessment) {
            assessment = emptyAssessment();
            saveAssessmentDraft(window.localStorage, assessment);
          }
          screen = assessment.completed ? "ENTRY_PROFILE" : "QUIZ";
        }
        break;
      case "cancel-restart":
        restartRequested = false;
        restoreRestartTrigger = true;
        break;
      case "confirm-restart":
        restartRequested = false;
        clearActiveRun(window.localStorage);
        run = undefined;
        assessment = emptyAssessment();
        saveAssessmentDraft(window.localStorage, assessment);
        screen = "QUIZ";
        break;
      case "resume":
        screen = "GAME";
        break;
      case "career":
        screen = "CAREER";
        break;
      case "answer-assessment":
        if (button.dataset.question && button.dataset.option) {
          assessment = answerAssessment(assessment, button.dataset.question, button.dataset.option);
          saveAssessmentDraft(window.localStorage, assessment);
          screen = assessment.completed ? "ENTRY_PROFILE" : "QUIZ";
        }
        break;
      case "explain-assessment-option":
        if (button.dataset.option) {
          assessment = markAssessmentExplanationViewed(assessment, button.dataset.option);
          saveAssessmentDraft(window.localStorage, assessment);
        }
        break;
      case "judge-assessment-candidate":
        if (button.dataset.question && button.dataset.option && button.dataset.disposition) {
          assessment = judgeAssessmentCandidate(
            assessment,
            button.dataset.question,
            button.dataset.option,
            button.dataset.disposition as CandidateDisposition,
          );
          saveAssessmentDraft(window.localStorage, assessment);
        }
        break;
      case "enter-faction-select":
        if (!assessment.completed) throw new Error("七道题还没有完成。 ");
        screen = "SELECT";
        break;
      case "choose-faction": {
        if (!assessment.completed) throw new Error("先完成入场测试。 ");
        const factionId = button.dataset.faction as FactionId;
        run = createRun(factionId, career.nextRunNumber, assessment);
        clearAssessmentDraft(window.localStorage);
        persistRun();
        screen = "GAME";
        break;
      }
      case "view-evidence":
        if (run) {
          run = viewCurrentEvidence(run);
          persistRun();
        }
        break;
      case "apply-decision":
        if (run && button.dataset.decision) {
          run = applyDecision(run, button.dataset.decision);
          persistRun();
        }
        break;
      case "retry":
        if (run) {
          run = retryCurrentIncident(run);
          persistRun();
        }
        break;
      case "advance":
        if (run) {
          const advanced = advanceIncident(run);
          if (advanced.phase === "SETTLED") settleAndRecord(advanced);
          else {
            run = advanced;
            persistRun();
          }
        }
        break;
      case "toggle-scope":
        if (run) {
          run = toggleAcademicScope(run);
          persistRun();
        }
        break;
      case "complete-course":
        if (run) {
          run = completeNextCourse(run);
          persistRun();
        }
        break;
      default:
        break;
    }
  } catch (error) {
    notice = error instanceof Error ? error.message : "操作没有完成。";
  }
  const nextViewKey = currentViewKey();
  render();
  if (restoreRestartTrigger) focusRestartTrigger();
  else if (!restartRequested && previousViewKey !== nextViewKey) focusViewStart();
});

app.addEventListener("cancel", (event) => {
  const dialog = (event.target as HTMLElement).closest<HTMLDialogElement>("[data-testid='restart-dialog']");
  if (!dialog) return;
  event.preventDefault();
  restartRequested = false;
  render();
  focusRestartTrigger();
});

if (career.schemaVersion !== 1) career = initialCareer();
render();
