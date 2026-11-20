package dev.noctilume.demo.eyeopener.runner;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.noctilume.demo.eyeopener.contract.LikeCommand;
import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class JavaApplicationProcessExecutor implements ApplicationProcessExecutor {
    private static final long PROCESS_TIMEOUT_SECONDS = 60;

    private final String jdbcUrl;
    private final String databaseUser;
    private final String databasePassword;
    private final String javaExecutable;
    private final String classpath;
    private final ObjectMapper mapper = new ObjectMapper();

    public JavaApplicationProcessExecutor(
            String jdbcUrl,
            String databaseUser,
            String databasePassword
    ) {
        this(
                jdbcUrl,
                databaseUser,
                databasePassword,
                defaultJavaExecutable(),
                System.getProperty("surefire.test.class.path", System.getProperty("java.class.path")));
    }

    JavaApplicationProcessExecutor(
            String jdbcUrl,
            String databaseUser,
            String databasePassword,
            String javaExecutable,
            String classpath
    ) {
        this.jdbcUrl = jdbcUrl;
        this.databaseUser = databaseUser;
        this.databasePassword = databasePassword;
        this.javaExecutable = javaExecutable;
        this.classpath = classpath;
    }

    @Override
    public ProcessExecution execute(
            WorldCoordinate coordinate,
            LoadedScenario scenario,
            LikeCommand command
    ) {
        ProcessBuilder builder = new ProcessBuilder(List.of(
                javaExecutable,
                "-cp",
                classpath,
                ApplicationWorker.class.getName()));
        builder.redirectErrorStream(true);
        Map<String, String> environment = builder.environment();
        environment.put("DEMO_JDBC_URL", jdbcUrl);
        environment.put("DEMO_DB_USER", databaseUser);
        environment.put("DEMO_DB_PASSWORD", databasePassword);
        environment.put("DEMO_RUN_ID", coordinate.runId());
        environment.put("DEMO_WORLD_ID", coordinate.worldId());
        environment.put("DEMO_SCENARIO_ID", scenario.definition().scenarioId());
        environment.put("DEMO_SCENARIO_VERSION", scenario.definition().version());
        environment.put("DEMO_SCENARIO_SHA256", scenario.sha256());
        environment.put("DEMO_WORK_ID", Long.toString(command.workId()));
        environment.put("DEMO_REQUEST_ID", command.requestId());
        environment.put("DEMO_USER_ID", command.userId());
        environment.put("DEMO_OPERATION", command.operation().name());

        String startedAt = Instant.now().toString();
        try {
            Process process = builder.start();
            long processId = process.pid();
            if (!process.waitFor(PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                process.waitFor();
                throw new IllegalStateException("Application process timed out: pid=" + processId);
            }
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (process.exitValue() != 0) {
                throw new IllegalStateException(
                        "Application process failed: pid=" + processId + ", exit=" + process.exitValue()
                                + System.lineSeparator() + output);
            }
            ApplicationWorker.WorkerResult result = parseResult(output);
            if (result.processId() != processId) {
                throw new IllegalStateException("Worker reported a different process id");
            }
            return new ProcessExecution(
                    processId,
                    process.exitValue(),
                    startedAt,
                    Instant.now().toString(),
                    result.response());
        } catch (IOException e) {
            throw new IllegalStateException("Cannot start application process", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Application process wait was interrupted", e);
        }
    }

    private ApplicationWorker.WorkerResult parseResult(String output) throws IOException {
        String json = output.lines()
                .filter(line -> line.startsWith(ApplicationWorker.RESULT_PREFIX))
                .map(line -> line.substring(ApplicationWorker.RESULT_PREFIX.length()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "Application process did not emit a result" + System.lineSeparator() + output));
        return mapper.readValue(json, ApplicationWorker.WorkerResult.class);
    }

    private static String defaultJavaExecutable() {
        String executable = System.getProperty("os.name").toLowerCase().contains("win")
                ? "java.exe"
                : "java";
        return Path.of(System.getProperty("java.home"), "bin", executable).toString();
    }
}
