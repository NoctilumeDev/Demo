package dev.noctilume.demo.eyeopener.contract;

import java.util.Objects;

public record LikeCommand(
        String requestId,
        String userId,
        long workId,
        Operation operation
) {
    public LikeCommand {
        requireText(requestId, "requestId");
        requireText(userId, "userId");
        if (workId <= 0) {
            throw new IllegalArgumentException("workId must be positive");
        }
        Objects.requireNonNull(operation, "operation");
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
    }
}
