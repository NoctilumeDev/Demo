package dev.noctilume.demo.eyeopener.judge;

import java.util.Map;

public record CrossWorldVerdict(boolean qualified, Map<String, CheckResult> checks) {
}
