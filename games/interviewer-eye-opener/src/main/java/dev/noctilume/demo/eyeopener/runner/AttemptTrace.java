package dev.noctilume.demo.eyeopener.runner;

import dev.noctilume.demo.eyeopener.contract.BusinessResponse;
import dev.noctilume.demo.eyeopener.contract.LikeCommand;

public record AttemptTrace(
        String label,
        int applicationGeneration,
        long processId,
        Integer processExitCode,
        long completionOrder,
        String startedAt,
        String completedAt,
        LikeCommand command,
        BusinessResponse systemResponse,
        BusinessResponse clientResponse,
        Delivery delivery
) {
}
