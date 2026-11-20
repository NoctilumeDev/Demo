package dev.noctilume.demo.eyeopener.scenario;

import dev.noctilume.demo.eyeopener.contract.Operation;

public record ScenarioRequest(String requestId, String userId, Operation operation) {
}
