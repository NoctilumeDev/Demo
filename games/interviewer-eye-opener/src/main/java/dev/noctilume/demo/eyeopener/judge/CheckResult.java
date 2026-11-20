package dev.noctilume.demo.eyeopener.judge;

public record CheckResult(boolean passed, String detail) {
    public static CheckResult pass(String detail) {
        return new CheckResult(true, detail);
    }

    public static CheckResult fail(String detail) {
        return new CheckResult(false, detail);
    }
}
