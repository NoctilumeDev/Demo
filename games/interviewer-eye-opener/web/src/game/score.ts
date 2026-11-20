import { factionById } from "./content";
import { judgeRun } from "./judge";
import type { FactionScore, GameRun, RunVerdict } from "./types";

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export const calculateFactionScore = (
  run: GameRun,
  verdict: RunVerdict = judgeRun(run),
): FactionScore => {
  const faction = factionById(run.factionId);
  switch (run.factionId) {
    case "simple": {
      const extraComponents = run.components.filter((component) => component !== "MySQL").length;
      const value = clamp(100 - extraComponents * 12 - Math.max(0, run.complexity - 1) * 3
        + (verdict.status === "PASS" ? 10 : 0));
      return {
        label: faction.scoreName,
        value,
        maximum: 100,
        note: `${extraComponents} 个额外组件；简单只在满足业务以后才算优点。`,
      };
    }
    case "buzzword": {
      const value = clamp(run.components.length * 13 + run.controls.length * 6
        + (verdict.status === "PASS" ? 12 : 0));
      return {
        label: faction.scoreName,
        value,
        maximum: 100,
        note: `${run.components.length} 个组件，${run.controls.length} 条配套控制。`,
      };
    }
    case "engineering": {
      const value = clamp(run.evidenceScore * 11 + verdict.passed * 9);
      return {
        label: faction.scoreName,
        value,
        maximum: 100,
        note: `保存了 ${run.evidenceScore} 份关键证据；实验也消耗预算。`,
      };
    }
    case "academic": {
      const included = verdict.checks.filter(
        (check) => !run.excludedFromCourse.includes(check.incidentId),
      );
      const passed = included.filter((check) => check.status === "PASS").length;
      const value = included.length === 0 ? 100 : Math.round((passed / included.length) * 100);
      return {
        label: faction.scoreName,
        value,
        maximum: 100,
        note: `${run.excludedFromCourse.length} 项未纳入课程验收；业务裁决没有随之变化。`,
      };
    }
    case "training": {
      const training = run.training ?? {
        score: 80,
        maximum: 100,
        offeredCourses: [],
        completedCourses: ["Java"],
      };
      const transfer = verdict.checks.find((check) => check.incidentId === "duplicate-charge");
      return {
        label: faction.scoreName,
        value: training.score,
        maximum: training.maximum,
        note: `技能标签 ${training.completedCourses.join("、")}；陌生任务 ${transfer?.status ?? "UNKNOWN"}。`,
      };
    }
  }
};
