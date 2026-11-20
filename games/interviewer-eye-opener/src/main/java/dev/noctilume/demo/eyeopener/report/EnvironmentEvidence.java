package dev.noctilume.demo.eyeopener.report;

public record EnvironmentEvidence(
        String javaVersion,
        String javaVendor,
        String javaHome,
        String mysqlImage,
        String mysqlImageId,
        String mysqlServerVersion
) {
}
