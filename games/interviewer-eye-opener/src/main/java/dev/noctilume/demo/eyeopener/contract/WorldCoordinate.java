package dev.noctilume.demo.eyeopener.contract;

public record WorldCoordinate(String runId, String worldId) {
    public WorldCoordinate {
        if (runId == null || runId.isBlank() || worldId == null || worldId.isBlank()) {
            throw new IllegalArgumentException("runId and worldId must not be blank");
        }
    }

    @Override
    public String toString() {
        return runId + "/" + worldId;
    }
}
