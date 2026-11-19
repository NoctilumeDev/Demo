package dev.noctilume.demo.eyeopener.report;

import dev.noctilume.demo.eyeopener.judge.WorldVerdict;
import dev.noctilume.demo.eyeopener.runner.ScenarioTrace;

public record WorldEvidence(ScenarioTrace trace, WorldVerdict verdict) {
}
