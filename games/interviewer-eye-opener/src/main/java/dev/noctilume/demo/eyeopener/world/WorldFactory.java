package dev.noctilume.demo.eyeopener.world;

import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;

@FunctionalInterface
public interface WorldFactory {
    LikeWorld open(WorldCoordinate coordinate, LoadedScenario scenario);
}
