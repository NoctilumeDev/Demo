package dev.noctilume.demo.eyeopener.runner;

import dev.noctilume.demo.eyeopener.contract.LikeCommand;
import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;

@FunctionalInterface
public interface ApplicationProcessExecutor {
    ProcessExecution execute(
            WorldCoordinate coordinate,
            LoadedScenario scenario,
            LikeCommand command
    );
}
