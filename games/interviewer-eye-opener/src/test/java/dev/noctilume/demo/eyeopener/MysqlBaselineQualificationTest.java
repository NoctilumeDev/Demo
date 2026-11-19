package dev.noctilume.demo.eyeopener;

import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.judge.CrossWorldVerdict;
import dev.noctilume.demo.eyeopener.judge.IndependentJudge;
import dev.noctilume.demo.eyeopener.judge.WorldVerdict;
import dev.noctilume.demo.eyeopener.mysql.JdbcConnectionFactory;
import dev.noctilume.demo.eyeopener.mysql.MysqlBaselineWorld;
import dev.noctilume.demo.eyeopener.mysql.SchemaManager;
import dev.noctilume.demo.eyeopener.report.EnvironmentEvidence;
import dev.noctilume.demo.eyeopener.report.QualificationReport;
import dev.noctilume.demo.eyeopener.report.ReportWriter;
import dev.noctilume.demo.eyeopener.report.StrategySlot;
import dev.noctilume.demo.eyeopener.report.TerminalReport;
import dev.noctilume.demo.eyeopener.report.WorldEvidence;
import dev.noctilume.demo.eyeopener.runner.ScenarioRunner;
import dev.noctilume.demo.eyeopener.runner.ScenarioTrace;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;
import dev.noctilume.demo.eyeopener.scenario.ScenarioLoader;
import dev.noctilume.demo.eyeopener.world.WorldFactory;
import org.junit.jupiter.api.Test;
import org.testcontainers.mysql.MySQLContainer;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MysqlBaselineQualificationTest {
    private static final String MYSQL_IMAGE = "mysql:8.4.13";

    @Test
    void qualifiesMysqlBaselineAgainstFrozenS0ToS6Script() throws Exception {
        LoadedScenario scenario = ScenarioLoader.load();

        try (MySQLContainer mysql = new MySQLContainer(MYSQL_IMAGE)
                .withDatabaseName("eye_opener")
                .withUsername("demo")
                .withPassword("demo")
                .withCommand(
                        "--max-connections=300",
                        "--character-set-server=utf8mb4",
                        "--collation-server=utf8mb4_0900_ai_ci")) {
            mysql.start();

            JdbcConnectionFactory connections = () -> DriverManager.getConnection(
                    mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword());
            SchemaManager.createSchema(connections);

            WorldFactory worldFactory = (coordinate, loadedScenario) ->
                    new MysqlBaselineWorld(connections, coordinate, loadedScenario);
            String coordinateSeed = UUID.randomUUID().toString();
            WorldCoordinate firstCoordinate = new WorldCoordinate(
                    "qualification-" + coordinateSeed + "-a", "mysql-baseline-a");
            WorldCoordinate secondCoordinate = new WorldCoordinate(
                    "qualification-" + coordinateSeed + "-b", "mysql-baseline-b");

            List<ScenarioTrace> traces = runWorldsInParallel(
                    scenario, worldFactory, firstCoordinate, secondCoordinate);

            IndependentJudge judge = new IndependentJudge();
            WorldVerdict firstVerdict = judge.judge(scenario, traces.get(0));
            WorldVerdict secondVerdict = judge.judge(scenario, traces.get(1));
            CrossWorldVerdict isolation = judge.judgeIsolation(
                    traces.get(0), traces.get(1), firstVerdict, secondVerdict);

            boolean qualified = firstVerdict.qualified()
                    && secondVerdict.qualified()
                    && isolation.qualified();
            QualificationReport report = new QualificationReport(
                    Instant.now().toString(),
                    "S0-S6 / MYSQL_BASELINE",
                    qualified ? "QUALIFIED" : "NOT_QUALIFIED",
                    scenario.definition().scenarioId(),
                    scenario.definition().version(),
                    scenario.sha256(),
                    "Correctness evidence for the frozen S0-S6 script on MySQL 8.4.13; "
                            + "not a production capacity or high-concurrency throughput claim.",
                    environment(mysql, connections),
                    List.of(
                            new StrategySlot("MYSQL_BASELINE", qualified ? "QUALIFIED" : "NOT_QUALIFIED"),
                            new StrategySlot("CHECKLIST_STACK", "NOT_IMPLEMENTED"),
                            new StrategySlot("EVIDENCE_DRIVEN", "NOT_IMPLEMENTED"),
                            new StrategySlot("ACADEMIC", "NOT_IMPLEMENTED")),
                    List.of(
                            new WorldEvidence(traces.get(0), firstVerdict),
                            new WorldEvidence(traces.get(1), secondVerdict)),
                    isolation);

            Path output = Path.of(System.getProperty("qualification.output", "target/qualification"));
            new ReportWriter().write(output, scenario, report);
            TerminalReport.print(report);

            assertTrue(firstVerdict.qualified(), () -> "first world: " + firstVerdict.checks());
            assertTrue(secondVerdict.qualified(), () -> "second world: " + secondVerdict.checks());
            assertTrue(isolation.qualified(), () -> "isolation: " + isolation.checks());
            assertEquals("QUALIFIED", report.status());
        }
    }

    private static List<ScenarioTrace> runWorldsInParallel(
            LoadedScenario scenario,
            WorldFactory worldFactory,
            WorldCoordinate first,
            WorldCoordinate second
    ) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            Future<ScenarioTrace> firstRun = executor.submit(() -> runAfterBarrier(
                    scenario, worldFactory, first, ready, start));
            Future<ScenarioTrace> secondRun = executor.submit(() -> runAfterBarrier(
                    scenario, worldFactory, second, ready, start));
            assertTrue(ready.await(30, TimeUnit.SECONDS), "both worlds must reach the replay barrier");
            start.countDown();
            return List.of(firstRun.get(), secondRun.get());
        }
    }

    private static ScenarioTrace runAfterBarrier(
            LoadedScenario scenario,
            WorldFactory worldFactory,
            WorldCoordinate coordinate,
            CountDownLatch ready,
            CountDownLatch start
    ) throws InterruptedException {
        ready.countDown();
        if (!start.await(30, TimeUnit.SECONDS)) {
            throw new IllegalStateException("world replay barrier timed out");
        }
        return new ScenarioRunner(scenario, worldFactory).run(coordinate);
    }

    private static EnvironmentEvidence environment(
            MySQLContainer mysql,
            JdbcConnectionFactory connections
    ) throws SQLException {
        return new EnvironmentEvidence(
                System.getProperty("java.version"),
                System.getProperty("java.vendor"),
                System.getProperty("java.home"),
                MYSQL_IMAGE,
                mysql.getContainerInfo().getImageId(),
                mysqlVersion(connections));
    }

    private static String mysqlVersion(JdbcConnectionFactory connections) throws SQLException {
        try (Connection connection = connections.open();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT VERSION()")) {
            result.next();
            return result.getString(1);
        }
    }
}
