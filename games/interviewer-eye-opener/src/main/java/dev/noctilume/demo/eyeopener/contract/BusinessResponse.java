package dev.noctilume.demo.eyeopener.contract;

import java.util.Objects;

public record BusinessResponse(
        String requestId,
        Decision decision,
        Effect effect,
        boolean likedAfter,
        long countAfter,
        ResponseReason reason,
        boolean replayed
) {
    public BusinessResponse {
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(decision, "decision");
        Objects.requireNonNull(effect, "effect");
    }

    public BusinessResponse asReplay() {
        return new BusinessResponse(
                requestId, decision, effect, likedAfter, countAfter, reason, true);
    }

    public boolean sameBusinessResult(BusinessResponse other) {
        return other != null
                && requestId.equals(other.requestId)
                && decision == other.decision
                && effect == other.effect
                && likedAfter == other.likedAfter
                && countAfter == other.countAfter
                && Objects.equals(reason, other.reason);
    }
}
