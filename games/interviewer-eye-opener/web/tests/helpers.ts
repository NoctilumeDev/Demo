import { advanceIncident, applyDecision, completeNextCourse, createRun, hasPendingCourse } from "../src/game/engine";
import type { FactionId, GameRun } from "../src/game/types";

export const WINNING_DECISIONS = [
  "db-unique",
  "transactional-request-record",
  "database-fallback",
  "measure-and-scale",
  "sql-business-key",
];

export const playDecisions = (
  factionId: FactionId,
  decisions: string[],
  completeCourses = false,
): GameRun => {
  let run = createRun(factionId, 1);
  for (const decision of decisions) {
    if (completeCourses) {
      while (hasPendingCourse(run)) run = completeNextCourse(run);
    }
    run = applyDecision(run, decision);
    run = advanceIncident(run);
  }
  return run;
};

export const playWinningRun = (factionId: FactionId, completeCourses = false): GameRun =>
  playDecisions(factionId, WINNING_DECISIONS, completeCourses);
