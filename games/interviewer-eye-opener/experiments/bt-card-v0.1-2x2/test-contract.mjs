import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedRoot = path.resolve(process.argv[2] ?? path.join(here, "generated"));
const manifestPath = path.join(generatedRoot, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const coordinate = manifest.sessions.find((session) => session.sessionId === "M01-B");
if (!coordinate) throw new Error("M01-B coordinate missing");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sampleHash = hash("pilot-message");
const valid = {
  experimentId: manifest.experimentId,
  sessionId: coordinate.sessionId,
  status: "PILOT",
  model: {
    participantId: coordinate.participantId,
    provider: coordinate.provider,
    requestedModel: coordinate.requestedModel,
    resolvedModel: coordinate.requestedModel,
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
    contextPacketSha256: null,
    promptTemplateSha256: manifest.hashes.promptTemplateSha256ByPresentation[coordinate.presentation],
    outputSchemaSha256: manifest.hashes.outputSchemaSha256,
  },
  parameters: { reasoningEffort: "fixed-by-pilot" },
  startedAt: "2026-11-20T00:00:00.000Z",
  finishedAt: "2026-11-20T00:01:00.000Z",
  questions: Object.entries(coordinate.optionOrders).map(([questionId, presentationOrder]) => ({
    questionId,
    presentationOrder,
    cardJudgments: presentationOrder.map((optionId, index) => ({
      optionId,
      decision: index % 2 === 0 ? "KEEP" : "SKIP",
      explanationViewedBeforeDecision: false,
      assumptions: [],
      reasoningSummary: `locked judgment ${index + 1}`,
    })),
    finalChoice: presentationOrder[1],
    assumptions: [],
    reasoningSummary: "locked final choice",
    rawPromptHashes: [sampleHash, sampleHash, sampleHash, sampleHash, sampleHash],
    rawResponseHashes: [sampleHash, sampleHash, sampleHash, sampleHash, sampleHash],
  })),
  errors: [],
};

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bt-card-contract-"));
const validator = path.join(here, "validate-record.mjs");
const run = (name, value, expectedOk) => {
  const file = path.join(tempRoot, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [validator, file, manifestPath], { encoding: "utf8" });
  if ((result.status === 0) !== expectedOk) {
    throw new Error(`${name}: expected ok=${expectedOk}, exit=${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  console.log(`${name}: ${expectedOk ? "ACCEPTED" : "REJECTED"}`);
};

run("valid-card-record", valid, true);

const reordered = structuredClone(valid);
reordered.questions[0].presentationOrder.reverse();
run("reordered-after-answer", reordered, false);

const fifthJudgment = structuredClone(valid);
fifthJudgment.questions[0].cardJudgments.push(structuredClone(fifthJudgment.questions[0].cardJudgments[0]));
run("fifth-card", fifthJudgment, false);

const foreignFinal = structuredClone(valid);
foreignFinal.questions[0].finalChoice = "Q2-A";
run("foreign-final-choice", foreignFinal, false);

const inventedRetainedSet = structuredClone(valid);
inventedRetainedSet.questions[0].retainedOptionIds = [inventedRetainedSet.questions[0].presentationOrder[0]];
run("second-retained-authority", inventedRetainedSet, false);

const wrongContext = structuredClone(valid);
wrongContext.hashes.contextPacketSha256 = manifest.hashes.contextPacketSha256;
run("cold-session-with-context", wrongContext, false);

console.log("contract tests passed");
