package dev.noctilume.demo.eyeopener.scenario;

import java.util.Map;

public record StepExpectation(
        long countAfter,
        int responsesApplied,
        int responsesRejected,
        int newStateChanges,
        int newNoChanges,
        int replayedResponses,
        Map<String, Boolean> liked
) {
}
