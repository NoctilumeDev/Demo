package dev.noctilume.demo.eyeopener.report;

import dev.noctilume.demo.eyeopener.judge.CheckResult;
import dev.noctilume.demo.eyeopener.judge.WorldVerdict;

public final class TerminalReport {
    private TerminalReport() {
    }

    public static void print(QualificationReport report) {
        System.out.println();
        System.out.println("============================================================");
        System.out.println(report.scope() + " / " + report.status());
        System.out.println("scenario sha256: " + report.scenarioSha256());
        System.out.println("MySQL image: " + report.environment().mysqlImage());
        System.out.println("MySQL server: " + report.environment().mysqlServerVersion());
        System.out.println("Java: " + report.environment().javaVersion()
                + " (" + report.environment().javaHome() + ")");
        for (WorldEvidence world : report.worlds()) {
            WorldVerdict verdict = world.verdict();
            System.out.println("world: " + verdict.coordinate() + " -> " + status(verdict.qualified()));
            printCheck("  request replay", verdict.checks().get("request-replay"));
            printCheck("  request conflict", verdict.checks().get("request-conflict"));
            printCheck("  S2 concurrent transition", verdict.checks().get("concurrent-state-transition"));
            printCheck("  response loss + restart", verdict.checks().get("response-loss-and-restart"));
            printCheck("  count vs state sum", verdict.checks().get("independent-count-invariant"));
        }
        System.out.println("world isolation: " + status(report.isolation().qualified()));
        for (StrategySlot strategy : report.strategies()) {
            System.out.println("strategy " + strategy.strategy() + ": " + strategy.status());
        }
        System.out.println("evidence: target/qualification/{scenario.json,scenario.sha256,run-report.json}");
        System.out.println("boundary: " + report.qualificationBoundary());
        System.out.println("============================================================");
    }

    private static void printCheck(String label, CheckResult check) {
        System.out.println(label + ": " + status(check != null && check.passed())
                + (check == null ? "" : " - " + check.detail()));
    }

    private static String status(boolean passed) {
        return passed ? "PASS" : "FAIL";
    }
}
