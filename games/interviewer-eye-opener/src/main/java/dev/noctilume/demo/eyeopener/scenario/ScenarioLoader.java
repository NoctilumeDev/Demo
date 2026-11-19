package dev.noctilume.demo.eyeopener.scenario;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class ScenarioLoader {
    private static final String RESOURCE = "/scenarios/s0-s6.json";
    private static final String HASH_RESOURCE = "/scenarios/s0-s6.sha256";

    private ScenarioLoader() {
    }

    public static LoadedScenario load() {
        try (InputStream input = ScenarioLoader.class.getResourceAsStream(RESOURCE)) {
            if (input == null) {
                throw new IllegalStateException("Missing scenario resource: " + RESOURCE);
            }
            byte[] bytes = input.readAllBytes();
            ScenarioDefinition definition = new ObjectMapper().readValue(bytes, ScenarioDefinition.class);
            validate(definition);
            String actualHash = sha256(bytes);
            String expectedHash = readExpectedHash();
            if (!expectedHash.equals(actualHash)) {
                throw new IllegalStateException(
                        "Frozen scenario hash differs: expected " + expectedHash + ", observed " + actualHash);
            }
            return new LoadedScenario(definition, bytes, actualHash);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot load scenario " + RESOURCE, e);
        }
    }

    private static void validate(ScenarioDefinition definition) {
        if (!"S0-S6".equals(definition.scenarioId())) {
            throw new IllegalStateException("Unexpected scenario id: " + definition.scenarioId());
        }
        if (!"1.0.0".equals(definition.version())) {
            throw new IllegalStateException("Unexpected scenario version: " + definition.version());
        }
        if (definition.steps() == null || definition.steps().size() != 7) {
            throw new IllegalStateException("S0-S6 must contain exactly seven steps");
        }
        for (int index = 0; index < definition.steps().size(); index++) {
            String expectedId = "S" + index;
            if (!expectedId.equals(definition.steps().get(index).id())) {
                throw new IllegalStateException("Expected " + expectedId + " at step " + index);
            }
        }
    }

    private static String readExpectedHash() throws IOException {
        try (InputStream input = ScenarioLoader.class.getResourceAsStream(HASH_RESOURCE)) {
            if (input == null) {
                throw new IllegalStateException("Missing scenario hash resource: " + HASH_RESOURCE);
            }
            String line = new String(input.readAllBytes(), StandardCharsets.UTF_8).strip();
            if (line.length() < 64) {
                throw new IllegalStateException("Invalid frozen scenario hash file");
            }
            return line.substring(0, 64).toLowerCase();
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
