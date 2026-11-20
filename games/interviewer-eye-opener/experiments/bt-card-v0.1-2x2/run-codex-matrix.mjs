import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [generatedRootArg, outputRootArg, concurrencyArg = "2", cellsArg = "A,B,C,D"] = process.argv.slice(2);
if (!generatedRootArg || !outputRootArg) {
  throw new Error("Usage: node run-codex-matrix.mjs <generated-root> <output-root> [concurrency] [cells]");
}

const generatedRoot = path.resolve(generatedRootArg);
const outputRoot = path.resolve(outputRootArg);
const concurrency = Number.parseInt(concurrencyArg, 10);
const cells = new Set(cellsArg.split(",").map((value) => value.trim()).filter(Boolean));
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error("concurrency must be 1..3");

const manifest = JSON.parse(fs.readFileSync(path.join(generatedRoot, "manifest.json"), "utf8"));
const queue = manifest.sessions.filter((session) => session.provider === "codex" && cells.has(session.condition));
const runner = path.join(here, "run-codex-session.mjs");
const results = [];
let cursor = 0;

const runOne = (session) => new Promise((resolve) => {
  console.log(`session-start=${session.sessionId} model=${session.requestedModel} cell=${session.condition}`);
  const child = spawn(process.execPath, [runner, generatedRoot, outputRoot, session.sessionId, "FORMAL"], {
    cwd: path.resolve(here, "../../../.."),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => process.stdout.write(`[${session.sessionId}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${session.sessionId}] ${chunk}`));
  child.on("close", (code) => {
    const result = { sessionId: session.sessionId, model: session.requestedModel, condition: session.condition, exitCode: code };
    results.push(result);
    console.log(`session-end=${session.sessionId} exit=${code}`);
    resolve(result);
  });
});

const worker = async () => {
  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    await runOne(current);
  }
};

await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
results.sort((left, right) => left.sessionId.localeCompare(right.sessionId));
const summary = {
  experimentId: manifest.experimentId,
  sourceCommit: manifest.sourceCommit,
  generatedAt: new Date().toISOString(),
  requestedCells: [...cells],
  requested: queue.length,
  qualified: results.filter((result) => result.exitCode === 0).length,
  failed: results.filter((result) => result.exitCode !== 0).length,
  results,
};
fs.mkdirSync(path.join(outputRoot, "formal"), { recursive: true });
fs.writeFileSync(path.join(outputRoot, "formal", `codex-matrix-${[...cells].join("")}.json`), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exit(1);
