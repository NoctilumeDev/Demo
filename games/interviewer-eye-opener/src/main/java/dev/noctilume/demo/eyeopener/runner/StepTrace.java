package dev.noctilume.demo.eyeopener.runner;

import dev.noctilume.demo.eyeopener.scenario.StepKind;
import dev.noctilume.demo.eyeopener.world.WorldSnapshot;

import java.util.List;

public record StepTrace(
        String stepId,
        StepKind kind,
        boolean applicationRestarted,
        List<AttemptTrace> attempts,
        WorldSnapshot snapshotAfter
) {
}
