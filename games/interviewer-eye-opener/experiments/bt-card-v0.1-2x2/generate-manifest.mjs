import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, "../../../..");
const assessmentModule = path.resolve(repositoryRoot, "games/interviewer-eye-opener/web/src/game/assessment.ts");
const outputSchemaPath = path.resolve(here, "output.schema.json");
const contextPacketPath = path.resolve(here, "context-packet.md");
const outputRoot = path.resolve(process.argv[2] ?? path.join(here, "generated"));

const { ASSESSMENT_QUESTIONS, ASSESSMENT_VERSION, ASSESSMENT_PROTOCOL_VERSION } = await import(pathToFileURL(assessmentModule));

const stable = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const write = (name, contents) => fs.writeFileSync(path.join(outputRoot, name), contents, "utf8");

const participants = [
  ["M01", "codex", "gpt-6.1-terra"],
  ["M02", "codex", "gpt-6.2-astra"],
  ["M03", "codex", "gpt-6.2-sol"],
  ["M04", "codex", "gpt-6.1-sol"],
  ["M05", "codex", "gpt-6-astra"],
  ["M06", "codex", "gpt-6-sol"],
  ["M07", "codex", "gpt-6-luna"],
  ["M08", "codex", "gpt-5.6-sol"],
  ["M09", "codex", "gpt-5.6-terra"],
  ["M10", "codex", "gpt-5.6-luna"],
  ["M11", "deepseek", "deepseek-v4-pro"],
  ["M12", "doubao", "doubao-seed-2-1-pro-260915"],
  ["M13", "qwen", "qwen3.8-max-0902"],
].map(([participantId, provider, requestedModel]) => ({ participantId, provider, requestedModel }));

const conditions = {
  A: { presentation: "FOUR_WAY", context: "COLD", protocolVersion: "BT-FOUR-WAY-v0.1" },
  B: { presentation: "CARD_KEEP_THEN_CHOOSE", context: "COLD", protocolVersion: ASSESSMENT_PROTOCOL_VERSION },
  C: { presentation: "FOUR_WAY", context: "FIXED_CONTEXT", protocolVersion: "BT-FOUR-WAY-v0.1" },
  D: { presentation: "CARD_KEEP_THEN_CHOOSE", context: "FIXED_CONTEXT", protocolVersion: ASSESSMENT_PROTOCOL_VERSION },
};

const baseOrders = [
  ["A", "B", "C", "D"],
  ["B", "C", "D", "A"],
  ["C", "D", "A", "B"],
  ["D", "A", "B", "C"],
];

const questionBank = {
  questionVersion: ASSESSMENT_VERSION,
  questions: ASSESSMENT_QUESTIONS.map((question) => ({
    id: question.id,
    title: question.title,
    knownFacts: question.knownFacts,
    unknownFacts: question.unknownFacts,
    constraint: question.constraint,
    prompt: question.prompt,
    options: question.options.map(({ id, label, knownCosts }) => ({ id, label, knownCosts })),
  })),
};

const promptTemplates = {
  FOUR_WAY: "只根据本题材料作答。四个方案同时给出；只选一个最终行动，并分别输出 finalChoice、assumptions、reasoningSummary。不要猜开发者偏好，不要生成画像。",
  CARD_KEEP_THEN_CHOOSE: "本题四张卡将逐张发送。每次只能依据已经展示的卡片输出 KEEP 或 SKIP、assumptions、reasoningSummary；不得预判未展示卡片。四张判断锁定后再选择一个 finalChoice。最终选择不得改写先前判断。",
};

fs.mkdirSync(outputRoot, { recursive: true });
const questionBankText = stable(questionBank);
const contextPacket = fs.readFileSync(contextPacketPath, "utf8").replace(/\r\n/g, "\n");
const outputSchema = fs.readFileSync(outputSchemaPath, "utf8").replace(/\r\n/g, "\n");
const promptTemplatesText = stable(promptTemplates);

write("question-bank.json", questionBankText);
write("context-packet.md", contextPacket);
write("prompt-templates.json", promptTemplatesText);
write("output.schema.json", outputSchema);

const sessions = [];
for (const [participantIndex, participant] of participants.entries()) {
  for (const [conditionIndex, conditionId] of Object.keys(conditions).entries()) {
    const condition = conditions[conditionId];
    const questionOrders = Object.fromEntries(questionBank.questions.map((question, questionIndex) => {
      const order = baseOrders[(participantIndex + conditionIndex + questionIndex) % baseOrders.length];
      return [question.id, order.map((suffix) => `${question.id}-${suffix}`)];
    }));
    sessions.push({
      sessionId: `${participant.participantId}-${conditionId}`,
      ...participant,
      condition: conditionId,
      ...condition,
      questionOrder: questionBank.questions.map((question) => question.id),
      optionOrders: questionOrders,
      formalStatus: "NOT_RUN",
    });
  }
}

const manifest = {
  experimentId: "BT-CARD-v0.1-2x2",
  generatedAt: new Date().toISOString(),
  questionVersion: ASSESSMENT_VERSION,
  cardProtocolVersion: ASSESSMENT_PROTOCOL_VERSION,
  sessionsExpected: 52,
  participants,
  conditions,
  hashes: {
    questionBankSha256: sha256(questionBankText),
    contextPacketSha256: sha256(contextPacket),
    promptTemplatesSha256: sha256(promptTemplatesText),
    promptTemplateSha256ByPresentation: Object.fromEntries(
      Object.entries(promptTemplates).map(([key, value]) => [key, sha256(value)]),
    ),
    outputSchemaSha256: sha256(outputSchema),
  },
  sessions,
};

if (sessions.length !== 52) throw new Error(`Expected 52 sessions, got ${sessions.length}`);
for (const participant of participants) {
  const own = sessions.filter((session) => session.participantId === participant.participantId);
  if (new Set(own.map((session) => session.condition)).size !== 4) {
    throw new Error(`Participant ${participant.participantId} does not have four isolated cells`);
  }
  for (const question of questionBank.questions) {
    const positions = new Map(question.options.map((option) => [option.id, new Set()]));
    for (const session of own) {
      session.optionOrders[question.id].forEach((optionId, index) => positions.get(optionId).add(index));
    }
    if ([...positions.values()].some((indices) => indices.size !== 4)) {
      throw new Error(`Order allocation is not counterbalanced for ${participant.participantId}/${question.id}`);
    }
  }
}

write("manifest.json", stable(manifest));
console.log(`generated=${outputRoot}`);
console.log(`sessions=${sessions.length}`);
console.log(`questionBankSha256=${manifest.hashes.questionBankSha256}`);
console.log(`contextPacketSha256=${manifest.hashes.contextPacketSha256}`);
