package dev.noctilume.demo.eyeopener.world;

import dev.noctilume.demo.eyeopener.contract.Decision;
import dev.noctilume.demo.eyeopener.contract.Effect;
import dev.noctilume.demo.eyeopener.contract.Operation;
import dev.noctilume.demo.eyeopener.contract.ResponseReason;

public record RequestRecordSnapshot(
        String requestId,
        String userId,
        long workId,
        Operation operation,
        Decision decision,
        Effect effect,
        boolean likedAfter,
        long countAfter,
        ResponseReason reason
) {
}
