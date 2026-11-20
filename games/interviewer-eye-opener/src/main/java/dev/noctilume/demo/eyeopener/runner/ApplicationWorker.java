package dev.noctilume.demo.eyeopener.runner;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.noctilume.demo.eyeopener.contract.BusinessResponse;
import dev.noctilume.demo.eyeopener.contract.LikeCommand;
import dev.noctilume.demo.eyeopener.contract.Operation;
import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.mysql.JdbcConnectionFactory;
import dev.noctilume.demo.eyeopener.mysql.MysqlBaselineWorld;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;
import dev.noctilume.demo.eyeopener.scenario.ScenarioDefinition;

import java.sql.DriverManager;
import java.util.List;
import java.util.Map;

public final class ApplicationWorker {
    public static final String RESULT_PREFIX = "DEMO_PROCESS_RESULT=";

    private ApplicationWorker() {
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> environment = System.getenv();
        WorldCoordinate coordinate = new WorldCoordinate(
                required(environment, "DEMO_RUN_ID"),
                required(environment, "DEMO_WORLD_ID"));
        long workId = Long.parseLong(required(environment, "DEMO_WORK_ID"));
        LoadedScenario scenario = new LoadedScenario(
                new ScenarioDefinition(
                        required(environment, "DEMO_SCENARIO_ID"),
                        required(environment, "DEMO_SCENARIO_VERSION"),
                        workId,
                        List.of(),
                        List.of()),
                new byte[0],
                required(environment, "DEMO_SCENARIO_SHA256"));
        LikeCommand command = new LikeCommand(
                required(environment, "DEMO_REQUEST_ID"),
                required(environment, "DEMO_USER_ID"),
                workId,
                Operation.valueOf(required(environment, "DEMO_OPERATION")));

        JdbcConnectionFactory connections = () -> DriverManager.getConnection(
                required(environment, "DEMO_JDBC_URL"),
                required(environment, "DEMO_DB_USER"),
                required(environment, "DEMO_DB_PASSWORD"));
        MysqlBaselineWorld world = new MysqlBaselineWorld(connections, coordinate, scenario);
        world.initialize();
        BusinessResponse response = world.apply(command);

        WorkerResult result = new WorkerResult(ProcessHandle.current().pid(), response);
        System.out.println(RESULT_PREFIX + new ObjectMapper().writeValueAsString(result));
    }

    private static String required(Map<String, String> environment, String name) {
        String value = environment.get(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Missing process environment value: " + name);
        }
        return value;
    }

    public record WorkerResult(long processId, BusinessResponse response) {
    }
}
