package dev.noctilume.demo.eyeopener.world;

import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;

import java.util.List;

public record WorldSnapshot(
        WorldCoordinate coordinate,
        List<RequestRecordSnapshot> requests,
        List<LikeStateSnapshot> states,
        List<WorkCountSnapshot> counts
) {
    public boolean liked(long workId, String userId) {
        return states.stream()
                .filter(state -> state.workId() == workId && state.userId().equals(userId))
                .map(LikeStateSnapshot::liked)
                .findFirst()
                .orElse(false);
    }

    public long count(long workId) {
        return counts.stream()
                .filter(count -> count.workId() == workId)
                .map(WorkCountSnapshot::likeCount)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Missing count row for work " + workId));
    }

    public long stateSum(long workId) {
        return states.stream()
                .filter(state -> state.workId() == workId && state.liked())
                .count();
    }
}
