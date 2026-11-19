package dev.noctilume.demo.eyeopener.scenario;

import dev.noctilume.demo.eyeopener.contract.Operation;

import java.util.List;

public record ScenarioStep(
        String id,
        StepKind kind,
        String requestId,
        String requestIdPrefix,
        String userId,
        Operation operation,
        Operation conflictOperation,
        int attempts,
        List<ScenarioRequest> requests,
        String fault,
        StepExpectation expected
) {
}
