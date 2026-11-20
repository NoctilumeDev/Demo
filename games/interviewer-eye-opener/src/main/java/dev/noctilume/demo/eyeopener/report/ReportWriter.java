package dev.noctilume.demo.eyeopener.report;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ReportWriter {
    private final ObjectMapper mapper = new ObjectMapper()
            .setSerializationInclusion(JsonInclude.Include.NON_NULL)
            .enable(SerializationFeature.INDENT_OUTPUT);

    public void write(Path outputDirectory, LoadedScenario scenario, QualificationReport report) {
        try {
            Files.createDirectories(outputDirectory);
            Files.write(outputDirectory.resolve("scenario.json"), scenario.sourceBytes());
            Files.writeString(
                    outputDirectory.resolve("scenario.sha256"),
                    scenario.sha256() + "  scenario.json" + System.lineSeparator(),
                    StandardCharsets.UTF_8);
            mapper.writeValue(outputDirectory.resolve("run-report.json").toFile(), report);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot write qualification evidence to " + outputDirectory, e);
        }
    }
}
