import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [generatedRootArg, outputRootArg, sessionId, mode = "PILOT"] = process.argv.slice(2);
if (!generatedRootArg || !outputRootArg || !sessionId || !["PILOT", "FORMAL"].includes(mode)) {
  throw new Error("Usage: node run-codex-session.mjs <generated-root> <output-root> <session-id> <PILOT|FORMAL>");
}

const generatedRoot = path.resolve(generatedRootArg);
const outputRoot = path.resolve(outputRootArg);
const manifestPath = path.join(generatedRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const questionBank = JSON.parse(fs.readFileSync(path.join(generatedRoot, "question-bank.json"), "utf8"));
const contextPacket = fs.readFileSync(path.join(generatedRoot, "context-packet.md"), "utf8").replace(/\r\n/g, "\n");
const coordinate = manifest.sessions.find((session) => session.sessionId === sessionId);
if (!coordinate) throw new Error(`Unknown locked session: ${sessionId}`);
if (coordinate.provider !== "codex") throw new Error(`${sessionId} is not a Codex session`);

const cardSchema = path.join(here, "card-response.schema.json");
const finalSchema = path.join(here, "final-response.schema.json");
const validator = path.join(here, "validate-record.mjs");
const sessionRoot = path.join(outputRoot, mode.toLowerCase(), sessionId);
const rawRoot = path.join(sessionRoot, "raw");
const emptyWorkdir = path.join(outputRoot, "empty-workdir");
fs.mkdirSync(rawRoot, { recursive: true });
fs.mkdirSync(emptyWorkdir, { recursive: true });

if (mode === "FORMAL" && fs.existsSync(path.join(sessionRoot, "record.json"))) {
  throw new Error(`Formal record already exists: ${sessionId}`);
}

const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const normalize = (value) => value.replace(/\r\n/g, "\n");
const fixedBackground = "固定技术背景：3 年后端经验；日常使用 Java/MySQL；用过 Redis；了解基础 MQ，但没有独立处理过大型生产事故；必须兼顾正确性、截止时间和可维护性。";
const commonRules = `你正在参加 BT-CARD-v0.1 2×2 工程决策实验。${fixedBackground}\n不要搜索网络，不要调用工具，不要读取本机文件，不要猜开发者偏好，不要生成画像。只根据当前会话中已经给出的材料作答。`;
const contextText = coordinate.context === "FIXED_CONTEXT" ? `\n\n${contextPacket}` : "";

const questionText = (question) => [
  `题目 ${question.id}：${question.title}`,
  `已知事实：${question.knownFacts}`,
  `未知事实：${question.unknownFacts}`,
  `资源约束：${question.constraint}`,
  question.prompt,
].join("\n");

const optionText = (option) => [
  `optionId: ${option.id}`,
  `方案：${option.label}`,
  `已知代价：${option.knownCosts.join("；")}`,
].join("\n");

const questionById = Object.fromEntries(questionBank.questions.map((question) => [question.id, question]));
const optionById = Object.fromEntries(questionBank.questions.flatMap((question) => question.options.map((option) => [option.id, option])));

let threadId = null;
let turnNumber = 0;
const usageByTurn = [];
const sessionStartedAt = new Date().toISOString();

const parseJsonLines = (text) => normalize(text).split("\n").filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});

const runTurn = (prompt, schemaPath, label) => {
  turnNumber += 1;
  const prefix = `${String(turnNumber).padStart(2, "0")}-${label}`;
  const promptPath = path.join(rawRoot, `${prefix}.prompt.txt`);
  const responsePath = path.join(rawRoot, `${prefix}.response.json`);
  const eventsPath = path.join(rawRoot, `${prefix}.events.jsonl`);
  const stderrPath = path.join(rawRoot, `${prefix}.stderr.log`);
  fs.writeFileSync(promptPath, `${prompt}\n`, "utf8");

  const baseArgs = [
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "-m", coordinate.requestedModel,
    "-c", "model_reasoning_effort=\"high\"",
    "--output-schema", schemaPath,
    "--json",
    "-o", responsePath,
  ];
  const args = threadId === null
    ? [...baseArgs, "-C", emptyWorkdir, "-s", "read-only", "-"]
    : ["exec", "resume", "--all", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check", "-m", coordinate.requestedModel, "-c", "model_reasoning_effort=\"high\"", "--output-schema", schemaPath, "--json", "-o", responsePath, threadId, "-"];

  const result = spawnSync("codex", args, {
    cwd: emptyWorkdir,
    input: prompt,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      HTTP_PROXY: "http://127.0.0.1:7897",
      HTTPS_PROXY: "http://127.0.0.1:7897",
      NO_PROXY: "127.0.0.1,localhost",
    },
  });
  fs.writeFileSync(eventsPath, normalize(result.stdout ?? ""), "utf8");
  fs.writeFileSync(stderrPath, normalize(result.stderr ?? ""), "utf8");
  if (result.status !== 0) throw new Error(`${label}: codex exit ${result.status}; see ${stderrPath}`);

  const events = parseJsonLines(result.stdout ?? "");
  const started = events.find((event) => event.type === "thread.started");
  if (threadId === null) threadId = started?.thread_id ?? null;
  if (!threadId) throw new Error(`${label}: thread id missing`);
  const completed = [...events].reverse().find((event) => event.type === "turn.completed");
  usageByTurn.push({ turn: turnNumber, label, usage: completed?.usage ?? null });

  const rawResponse = fs.readFileSync(responsePath, "utf8");
  let response;
  try { response = JSON.parse(rawResponse); } catch { throw new Error(`${label}: final response is not JSON`); }
  console.log(`progress=${sessionId} turn=${turnNumber} label=${label}`);
  return {
    response,
    promptHash: sha256(fs.readFileSync(promptPath, "utf8")),
    responseHash: sha256(rawResponse),
  };
};

const records = [];
let failure = null;
try {
  for (const questionId of coordinate.questionOrder) {
    const question = questionById[questionId];
    const presentationOrder = coordinate.optionOrders[questionId];
    if (!question || !Array.isArray(presentationOrder)) throw new Error(`${questionId}: locked input missing`);
    const rawPromptHashes = [];
    const rawResponseHashes = [];

    if (coordinate.presentation === "FOUR_WAY") {
      const prompt = `${commonRules}${contextText}\n\n${questionText(question)}\n\n四个方案按本会话锁定顺序同时展示：\n\n${presentationOrder.map((optionId) => optionText(optionById[optionId])).join("\n\n")}\n\n只能最终选择一个。严格按输出结构返回 finalChoice、assumptions、reasoningSummary。`;
      const turn = runTurn(prompt, finalSchema, `${questionId}-four-way`);
      if (!presentationOrder.includes(turn.response.finalChoice)) throw new Error(`${questionId}: foreign final choice ${turn.response.finalChoice}`);
      rawPromptHashes.push(turn.promptHash);
      rawResponseHashes.push(turn.responseHash);
      records.push({
        questionId,
        presentationOrder,
        cardJudgments: null,
        finalChoice: turn.response.finalChoice,
        assumptions: turn.response.assumptions,
        reasoningSummary: turn.response.reasoningSummary,
        rawPromptHashes,
        rawResponseHashes,
      });
      continue;
    }

    const cardJudgments = [];
    for (const [cardIndex, optionId] of presentationOrder.entries()) {
      const locked = cardJudgments.length === 0
        ? ""
        : `\n此前逐张判断已锁定：${cardJudgments.map((item) => `${item.optionId}=${item.decision}`).join("，")}。不得修改。`;
      const questionPrefix = cardIndex === 0 ? `${questionText(question)}\n\n` : "";
      const prompt = `${commonRules}${contextText}\n\n本题采用逐张协议。每次只能判断当前卡片，不得要求或猜测未展示卡片。KEEP 只表示值得留到最终比较；SKIP 不表示方案错误。四张判断锁定后会另行要求最终选择，最终选择不能改写先前判断。${locked}\n\n${questionPrefix}当前卡 ${cardIndex + 1}/4：\n${optionText(optionById[optionId])}\n\n现在只判断当前卡，返回 optionId、decision、assumptions、reasoningSummary。`;
      const turn = runTurn(prompt, cardSchema, `${questionId}-card-${cardIndex + 1}`);
      if (turn.response.optionId !== optionId) throw new Error(`${questionId}: expected ${optionId}, got ${turn.response.optionId}`);
      rawPromptHashes.push(turn.promptHash);
      rawResponseHashes.push(turn.responseHash);
      cardJudgments.push({
        optionId,
        decision: turn.response.decision,
        explanationViewedBeforeDecision: false,
        assumptions: turn.response.assumptions,
        reasoningSummary: turn.response.reasoningSummary,
      });
    }

    const finalPrompt = `${commonRules}${contextText}\n\n${question.id} 的四张判断已经锁定：${cardJudgments.map((item) => `${item.optionId}=${item.decision}`).join("，")}。现在同一资源约束下只能最终执行一条；先前判断不会因最终选择而改写。\n\n${presentationOrder.map((optionId) => optionText(optionById[optionId])).join("\n\n")}\n\n返回 finalChoice、assumptions、reasoningSummary。`;
    const finalTurn = runTurn(finalPrompt, finalSchema, `${questionId}-final`);
    if (!presentationOrder.includes(finalTurn.response.finalChoice)) throw new Error(`${questionId}: foreign final choice ${finalTurn.response.finalChoice}`);
    rawPromptHashes.push(finalTurn.promptHash);
    rawResponseHashes.push(finalTurn.responseHash);
    records.push({
      questionId,
      presentationOrder,
      cardJudgments,
      finalChoice: finalTurn.response.finalChoice,
      assumptions: finalTurn.response.assumptions,
      reasoningSummary: finalTurn.response.reasoningSummary,
      rawPromptHashes,
      rawResponseHashes,
    });
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}

const sessionFinishedAt = new Date().toISOString();
const metadata = {
  experimentId: manifest.experimentId,
  logicalSessionId: sessionId,
  codexThreadId: threadId,
  mode,
  startedAt: sessionStartedAt,
  finishedAt: sessionFinishedAt,
  turnsCompleted: turnNumber,
  usageByTurn,
  failure,
};
fs.writeFileSync(path.join(sessionRoot, "session-meta.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

if (failure) {
  fs.writeFileSync(path.join(sessionRoot, "failure.json"), `${JSON.stringify({ ...metadata, records }, null, 2)}\n`, "utf8");
  console.error(failure);
  process.exit(1);
}

const record = {
  experimentId: manifest.experimentId,
  sessionId,
  status: mode,
  model: {
    participantId: coordinate.participantId,
    provider: coordinate.provider,
    requestedModel: coordinate.requestedModel,
    resolvedModel: null,
  },
  condition: coordinate.condition,
  coordinates: {
    presentation: coordinate.presentation,
    context: coordinate.context,
    questionVersion: manifest.questionVersion,
    protocolVersion: coordinate.protocolVersion,
  },
  hashes: {
    questionBankSha256: manifest.hashes.questionBankSha256,
    contextPacketSha256: coordinate.context === "FIXED_CONTEXT" ? manifest.hashes.contextPacketSha256 : null,
    promptTemplateSha256: manifest.hashes.promptTemplateSha256ByPresentation[coordinate.presentation],
    outputSchemaSha256: manifest.hashes.outputSchemaSha256,
  },
  parameters: {
    reasoningEffort: "high",
    sandbox: "read-only",
    ignoredUserConfig: true,
    ignoredRules: true,
    explicitProxy: "http://127.0.0.1:7897",
    codexThreadId: threadId,
    usageByTurn,
  },
  startedAt: sessionStartedAt,
  finishedAt: sessionFinishedAt,
  questions: records,
  errors: [],
};

const recordPath = path.join(sessionRoot, "record.json");
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
const validation = spawnSync(process.execPath, [validator, recordPath, manifestPath], { encoding: "utf8" });
fs.writeFileSync(path.join(sessionRoot, "validation.log"), `${validation.stdout}${validation.stderr}`, "utf8");
if (validation.status !== 0) {
  console.error(validation.stdout);
  console.error(validation.stderr);
  process.exit(1);
}

if (threadId) {
  const archived = spawnSync("codex", ["archive", threadId], {
    cwd: emptyWorkdir,
    encoding: "utf8",
    env: {
      ...process.env,
      HTTP_PROXY: "http://127.0.0.1:7897",
      HTTPS_PROXY: "http://127.0.0.1:7897",
      NO_PROXY: "127.0.0.1,localhost",
    },
  });
  fs.writeFileSync(path.join(sessionRoot, "archive.log"), `${archived.stdout}${archived.stderr}`, "utf8");
}

console.log(`qualified=${sessionId}`);
console.log(`mode=${mode}`);
console.log(`turns=${turnNumber}`);
console.log(`record=${recordPath}`);
