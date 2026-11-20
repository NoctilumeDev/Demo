import fs from "node:fs";

const [recordPath, manifestPath] = process.argv.slice(2);
if (!recordPath || !manifestPath) {
  throw new Error("Usage: node validate-record.mjs <record.json> <manifest.json>");
}

const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const fail = (message) => errors.push(message);

const coordinate = manifest.sessions.find((session) => session.sessionId === record.sessionId);
if (!coordinate) fail("sessionId is not allocated in the locked manifest");
if (record.experimentId !== manifest.experimentId) fail("experimentId mismatch");
if (coordinate && record.condition !== coordinate.condition) fail("condition mismatch");
if (coordinate && record.model?.participantId !== coordinate.participantId) fail("participantId mismatch");
if (coordinate && record.model?.provider !== coordinate.provider) fail("provider mismatch");
if (coordinate && record.model?.requestedModel !== coordinate.requestedModel) fail("requestedModel mismatch");
if (coordinate && record.coordinates?.presentation !== coordinate.presentation) fail("presentation coordinate mismatch");
if (coordinate && record.coordinates?.context !== coordinate.context) fail("context coordinate mismatch");
if (record.coordinates?.questionVersion !== manifest.questionVersion) fail("questionVersion mismatch");
if (coordinate && record.coordinates?.protocolVersion !== coordinate.protocolVersion) fail("protocolVersion mismatch");
if (record.coordinates?.sourceCommit !== manifest.sourceCommit) fail("sourceCommit mismatch");
if (record.hashes?.questionBankSha256 !== manifest.hashes.questionBankSha256) fail("question bank hash mismatch");
if (record.hashes?.outputSchemaSha256 !== manifest.hashes.outputSchemaSha256) fail("output schema hash mismatch");
const expectedContextHash = coordinate?.context === "FIXED_CONTEXT" ? manifest.hashes.contextPacketSha256 : null;
if (record.hashes?.contextPacketSha256 !== expectedContextHash) fail("context packet hash mismatch");
const expectedPromptHash = manifest.hashes.promptTemplateSha256ByPresentation?.[coordinate?.presentation];
if (record.hashes?.promptTemplateSha256 !== expectedPromptHash) fail("prompt template hash mismatch");
if (!Array.isArray(record.questions) || record.questions.length !== 7) fail("exactly seven question records are required");

const seenQuestions = new Set();
for (const question of record.questions ?? []) {
  if (seenQuestions.has(question.questionId)) fail(`duplicate question ${question.questionId}`);
  seenQuestions.add(question.questionId);
  const expected = coordinate?.optionOrders?.[question.questionId];
  if (!expected || JSON.stringify(question.presentationOrder) !== JSON.stringify(expected)) {
    fail(`${question.questionId}: presentation order differs from locked allocation`);
    continue;
  }
  if (!expected.includes(question.finalChoice)) fail(`${question.questionId}: final choice is not one of the four cards`);
  if (!Array.isArray(question.assumptions) || typeof question.reasoningSummary !== "string") {
    fail(`${question.questionId}: first-round assumptions and reasoning summary are required`);
  }
  if (!Array.isArray(question.rawPromptHashes) || question.rawPromptHashes.length === 0) {
    fail(`${question.questionId}: raw prompt hashes are required`);
  }
  if (!Array.isArray(question.rawResponseHashes) || question.rawResponseHashes.length === 0) {
    fail(`${question.questionId}: raw response hashes are required`);
  }
  if (Object.hasOwn(question, "retainedOptionIds")) {
    fail(`${question.questionId}: retainedOptionIds must be derived, not stored as a second authority`);
  }

  const cardCondition = coordinate?.presentation === "CARD_KEEP_THEN_CHOOSE";
  if (cardCondition) {
    if (!Array.isArray(question.cardJudgments) || question.cardJudgments.length !== 4) {
      fail(`${question.questionId}: card condition requires four judgments`);
    } else {
      const judgedOrder = question.cardJudgments.map((judgment) => judgment.optionId);
      if (JSON.stringify(judgedOrder) !== JSON.stringify(expected)) fail(`${question.questionId}: judgments do not follow presentation order`);
      if (question.cardJudgments.some((judgment) => !["KEEP", "SKIP"].includes(judgment.decision))) {
        fail(`${question.questionId}: invalid card decision`);
      }
      if (question.cardJudgments.some((judgment) => judgment.explanationViewedBeforeDecision !== false)) {
        fail(`${question.questionId}: AI experiment does not expose explanations`);
      }
      if (question.cardJudgments.some((judgment) => !Array.isArray(judgment.assumptions) || typeof judgment.reasoningSummary !== "string")) {
        fail(`${question.questionId}: each card requires its own locked assumptions and reasoning summary`);
      }
      if (question.rawPromptHashes.length !== 5 || question.rawResponseHashes.length !== 5) {
        fail(`${question.questionId}: card condition requires four judgment turns and one final turn`);
      }
    }
  } else if (question.cardJudgments !== null) {
    fail(`${question.questionId}: FOUR_WAY record must not invent card judgments`);
  } else if (question.rawPromptHashes.length !== 1 || question.rawResponseHashes.length !== 1) {
    fail(`${question.questionId}: FOUR_WAY condition requires exactly one turn`);
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, sessionId: record.sessionId, condition: record.condition }, null, 2));
