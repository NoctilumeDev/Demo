package dev.noctilume.demo.eyeopener.report;

import dev.noctilume.demo.eyeopener.judge.CrossWorldVerdict;

import java.util.List;

public record QualificationReport(
        String generatedAt,
        String scope,
        String status,
        String scenarioId,
        String scenarioVersion,
        String scenarioSha256,
        String qualificationBoundary,
        EnvironmentEvidence environment,
        List<StrategySlot> strategies,
        List<WorldEvidence> worlds,
        CrossWorldVerdict isolation
) {
}
