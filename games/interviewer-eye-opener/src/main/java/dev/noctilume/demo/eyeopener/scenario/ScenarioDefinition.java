package dev.noctilume.demo.eyeopener.scenario;

import java.util.List;

public record ScenarioDefinition(
        String scenarioId,
        String version,
        long workId,
        List<String> initialUsers,
        List<ScenarioStep> steps
) {
}
