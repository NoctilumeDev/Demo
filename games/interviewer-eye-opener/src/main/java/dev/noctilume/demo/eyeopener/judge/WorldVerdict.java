package dev.noctilume.demo.eyeopener.judge;

import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;

import java.util.Map;

public record WorldVerdict(
        WorldCoordinate coordinate,
        boolean qualified,
        Map<String, CheckResult> checks
) {
}
