package dev.noctilume.demo.eyeopener.scenario;

public enum StepKind {
    INITIALIZE,
    REQUEST_REPLAY_AND_CONFLICT,
    CONCURRENT_SAME_USER,
    CONCURRENT_USERS,
    APPLY_AND_RETRY,
    APPLY_ONCE,
    RESPONSE_LOSS_RESTART_RETRY
}
