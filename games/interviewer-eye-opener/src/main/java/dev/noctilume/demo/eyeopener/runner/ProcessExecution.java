package dev.noctilume.demo.eyeopener.runner;

import dev.noctilume.demo.eyeopener.contract.BusinessResponse;

public record ProcessExecution(
        long processId,
        int exitCode,
        String startedAt,
        String exitedAt,
        BusinessResponse response
) {
}
