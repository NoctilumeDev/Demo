package dev.noctilume.demo.eyeopener.scenario;

public record LoadedScenario(
        ScenarioDefinition definition,
        byte[] sourceBytes,
        String sha256
) {
    public LoadedScenario {
        sourceBytes = sourceBytes.clone();
    }

    @Override
    public byte[] sourceBytes() {
        return sourceBytes.clone();
    }
}
