package dev.noctilume.demo.eyeopener.runner;

import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.world.WorldSnapshot;

import java.util.List;

public record ScenarioTrace(
        WorldCoordinate coordinate,
        String scenarioId,
        String scenarioSha256,
        String startedAt,
        String completedAt,
        List<StepTrace> steps,
        WorldSnapshot finalSnapshot
) {
}
