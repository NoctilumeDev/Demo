package dev.noctilume.demo.eyeopener.mysql;

import dev.noctilume.demo.eyeopener.contract.BusinessResponse;
import dev.noctilume.demo.eyeopener.contract.Decision;
import dev.noctilume.demo.eyeopener.contract.Effect;
import dev.noctilume.demo.eyeopener.contract.LikeCommand;
import dev.noctilume.demo.eyeopener.contract.Operation;
import dev.noctilume.demo.eyeopener.contract.ResponseReason;
import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;
import dev.noctilume.demo.eyeopener.world.LikeStateSnapshot;
import dev.noctilume.demo.eyeopener.world.LikeWorld;
import dev.noctilume.demo.eyeopener.world.RequestRecordSnapshot;
import dev.noctilume.demo.eyeopener.world.WorkCountSnapshot;
import dev.noctilume.demo.eyeopener.world.WorldSnapshot;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public final class MysqlBaselineWorld implements LikeWorld {
    public static final String STRATEGY = "MYSQL_BASELINE";
    private final JdbcConnectionFactory connections;
    private final WorldCoordinate coordinate;
    private final LoadedScenario scenario;

    public MysqlBaselineWorld(
            JdbcConnectionFactory connections,
            WorldCoordinate coordinate,
            LoadedScenario scenario
    ) {
        this.connections = Objects.requireNonNull(connections, "connections");
        this.coordinate = Objects.requireNonNull(coordinate, "coordinate");
        this.scenario = Objects.requireNonNull(scenario, "scenario");
    }

    @Override
    public void initialize() {
        try (Connection connection = connections.open()) {
            connection.setAutoCommit(false);
            try {
                insertWorldIfAbsent(connection);
                verifyWorldIdentity(connection);
                insertCounterIfAbsent(connection, scenario.definition().workId());
                connection.commit();
            } catch (Exception e) {
                rollback(connection, e);
                throw e;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot initialize world " + coordinate, e);
        }
    }

    @Override
    public BusinessResponse apply(LikeCommand command) {
        try (Connection connection = connections.open()) {
            connection.setAutoCommit(false);
            connection.setTransactionIsolation(Connection.TRANSACTION_READ_COMMITTED);
            try {
                boolean inserted = insertRequestIfAbsent(connection, command);
                StoredRequest stored = lockRequest(connection, command.requestId());

                if (!stored.samePayload(command)) {
                    CurrentState current = lockCurrentState(connection, command.workId(), command.userId());
                    BusinessResponse conflict = new BusinessResponse(
                            command.requestId(),
                            Decision.REJECTED,
                            Effect.NO_CHANGE,
                            current.liked(),
                            current.count(),
                            ResponseReason.REQUEST_ID_CONFLICT,
                            false);
                    connection.commit();
                    return conflict;
                }

                if (!inserted) {
                    BusinessResponse replay = stored.toCompletedResponse().asReplay();
                    connection.commit();
                    return replay;
                }

                CurrentState current = lockCurrentState(connection, command.workId(), command.userId());
                boolean likedAfter = command.operation() == Operation.LIKE;
                boolean changed = current.liked() != likedAfter;
                long countAfter = current.count();

                if (changed) {
                    saveLikeState(connection, command.workId(), command.userId(), likedAfter, current.stateRowExists());
                    countAfter += likedAfter ? 1 : -1;
                    saveCount(connection, command.workId(), countAfter);
                }

                BusinessResponse response = new BusinessResponse(
                        command.requestId(),
                        Decision.APPLIED,
                        changed ? Effect.STATE_CHANGED : Effect.NO_CHANGE,
                        likedAfter,
                        countAfter,
                        null,
                        false);
                completeRequest(connection, response);
                connection.commit();
                return response;
            } catch (Exception e) {
                rollback(connection, e);
                throw e;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot apply request " + command.requestId(), e);
        }
    }

    @Override
    public WorldSnapshot snapshot() {
        try (Connection connection = connections.open()) {
            connection.setReadOnly(true);
            return new WorldSnapshot(
                    coordinate,
                    readRequests(connection),
                    readStates(connection),
                    readCounts(connection));
        } catch (SQLException e) {
            throw new IllegalStateException("Cannot read world " + coordinate, e);
        }
    }

    private void insertWorldIfAbsent(Connection connection) throws SQLException {
        String sql = """
                INSERT INTO world_run
                    (run_id, world_id, strategy, scenario_id, scenario_sha256)
                VALUES (?, ?, ?, ?, ?)
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            statement.setString(3, STRATEGY);
            statement.setString(4, scenario.definition().scenarioId());
            statement.setString(5, scenario.sha256());
            executeAllowingDuplicate(statement);
        }
    }

    private void verifyWorldIdentity(Connection connection) throws SQLException {
        String sql = """
                SELECT strategy, scenario_id, scenario_sha256
                FROM world_run
                WHERE run_id = ? AND world_id = ?
                FOR UPDATE
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("World row was not created: " + coordinate);
                }
                if (!STRATEGY.equals(result.getString("strategy"))
                        || !scenario.definition().scenarioId().equals(result.getString("scenario_id"))
                        || !scenario.sha256().equals(result.getString("scenario_sha256"))) {
                    throw new IllegalStateException("World identity conflicts with retained database facts");
                }
            }
        }
    }

    private void insertCounterIfAbsent(Connection connection, long workId) throws SQLException {
        String sql = """
                INSERT INTO work_like_count (run_id, world_id, work_id, like_count)
                VALUES (?, ?, ?, 0)
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            statement.setLong(3, workId);
            executeAllowingDuplicate(statement);
        }
    }

    private boolean insertRequestIfAbsent(Connection connection, LikeCommand command) throws SQLException {
        String sql = """
                INSERT INTO request_record
                    (run_id, world_id, request_id, user_id, work_id, operation)
                VALUES (?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            statement.setString(3, command.requestId());
            statement.setString(4, command.userId());
            statement.setLong(5, command.workId());
            statement.setString(6, command.operation().name());
            try {
                statement.executeUpdate();
                return true;
            } catch (SQLIntegrityConstraintViolationException e) {
                if (e.getErrorCode() == 1062) {
                    return false;
                }
                throw e;
            }
        }
    }

    private StoredRequest lockRequest(Connection connection, String requestId) throws SQLException {
        String sql = """
                SELECT request_id, user_id, work_id, operation,
                       decision, effect, liked_after, count_after, reason
                FROM request_record
                WHERE run_id = ? AND world_id = ? AND request_id = ?
                FOR UPDATE
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            statement.setString(3, requestId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Request row was not created: " + requestId);
                }
                return StoredRequest.from(result);
            }
        }
    }

    private CurrentState lockCurrentState(Connection connection, long workId, String userId) throws SQLException {
        long count = lockCount(connection, workId);
        String sql = """
                SELECT liked
                FROM like_state
                WHERE run_id = ? AND world_id = ? AND work_id = ? AND user_id = ?
                FOR UPDATE
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            statement.setLong(3, workId);
            statement.setString(4, userId);
            try (ResultSet result = statement.executeQuery()) {
                if (result.next()) {
                    return new CurrentState(true, result.getBoolean("liked"), count);
                }
                return new CurrentState(false, false, count);
            }
        }
    }

    private long lockCount(Connection connection, long workId) throws SQLException {
        String sql = """
                SELECT like_count
                FROM work_like_count
                WHERE run_id = ? AND world_id = ? AND work_id = ?
                FOR UPDATE
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            statement.setLong(3, workId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    throw new IllegalStateException("Missing count row for work " + workId);
                }
                return result.getLong("like_count");
            }
        }
    }

    private void saveLikeState(
            Connection connection,
            long workId,
            String userId,
            boolean liked,
            boolean rowExists
    ) throws SQLException {
        String sql = rowExists
                ? """
                  UPDATE like_state SET liked = ?
                  WHERE run_id = ? AND world_id = ? AND work_id = ? AND user_id = ?
                  """
                : """
                  INSERT INTO like_state (liked, run_id, world_id, work_id, user_id)
                  VALUES (?, ?, ?, ?, ?)
                  """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setBoolean(1, liked);
            bindCoordinate(statement, 2);
            statement.setLong(4, workId);
            statement.setString(5, userId);
            statement.executeUpdate();
        }
    }

    private void saveCount(Connection connection, long workId, long count) throws SQLException {
        String sql = """
                UPDATE work_like_count SET like_count = ?
                WHERE run_id = ? AND world_id = ? AND work_id = ?
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, count);
            bindCoordinate(statement, 2);
            statement.setLong(4, workId);
            statement.executeUpdate();
        }
    }

    private void completeRequest(Connection connection, BusinessResponse response) throws SQLException {
        String sql = """
                UPDATE request_record
                SET decision = ?, effect = ?, liked_after = ?, count_after = ?, reason = ?,
                    completed_at = CURRENT_TIMESTAMP(6)
                WHERE run_id = ? AND world_id = ? AND request_id = ?
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, response.decision().name());
            statement.setString(2, response.effect().name());
            statement.setBoolean(3, response.likedAfter());
            statement.setLong(4, response.countAfter());
            statement.setString(5, response.reason() == null ? null : response.reason().name());
            bindCoordinate(statement, 6);
            statement.setString(8, response.requestId());
            statement.executeUpdate();
        }
    }

    private List<RequestRecordSnapshot> readRequests(Connection connection) throws SQLException {
        String sql = """
                SELECT request_id, user_id, work_id, operation,
                       decision, effect, liked_after, count_after, reason
                FROM request_record
                WHERE run_id = ? AND world_id = ?
                ORDER BY request_id
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            try (ResultSet result = statement.executeQuery()) {
                List<RequestRecordSnapshot> records = new ArrayList<>();
                while (result.next()) {
                    records.add(new RequestRecordSnapshot(
                            result.getString("request_id"),
                            result.getString("user_id"),
                            result.getLong("work_id"),
                            Operation.valueOf(result.getString("operation")),
                            enumOrNull(Decision.class, result.getString("decision")),
                            enumOrNull(Effect.class, result.getString("effect")),
                            result.getBoolean("liked_after"),
                            result.getLong("count_after"),
                            enumOrNull(ResponseReason.class, result.getString("reason"))));
                }
                return List.copyOf(records);
            }
        }
    }

    private List<LikeStateSnapshot> readStates(Connection connection) throws SQLException {
        String sql = """
                SELECT work_id, user_id, liked
                FROM like_state
                WHERE run_id = ? AND world_id = ?
                ORDER BY work_id, user_id
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            try (ResultSet result = statement.executeQuery()) {
                List<LikeStateSnapshot> states = new ArrayList<>();
                while (result.next()) {
                    states.add(new LikeStateSnapshot(
                            result.getLong("work_id"),
                            result.getString("user_id"),
                            result.getBoolean("liked")));
                }
                return List.copyOf(states);
            }
        }
    }

    private List<WorkCountSnapshot> readCounts(Connection connection) throws SQLException {
        String sql = """
                SELECT work_id, like_count
                FROM work_like_count
                WHERE run_id = ? AND world_id = ?
                ORDER BY work_id
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bindCoordinate(statement, 1);
            try (ResultSet result = statement.executeQuery()) {
                List<WorkCountSnapshot> counts = new ArrayList<>();
                while (result.next()) {
                    counts.add(new WorkCountSnapshot(
                            result.getLong("work_id"),
                            result.getLong("like_count")));
                }
                return List.copyOf(counts);
            }
        }
    }

    private void bindCoordinate(PreparedStatement statement, int startIndex) throws SQLException {
        statement.setString(startIndex, coordinate.runId());
        statement.setString(startIndex + 1, coordinate.worldId());
    }

    private static <E extends Enum<E>> E enumOrNull(Class<E> type, String value) {
        return value == null ? null : Enum.valueOf(type, value);
    }

    private static void executeAllowingDuplicate(PreparedStatement statement) throws SQLException {
        try {
            statement.executeUpdate();
        } catch (SQLIntegrityConstraintViolationException e) {
            if (e.getErrorCode() != 1062) {
                throw e;
            }
        }
    }

    private static void rollback(Connection connection, Exception original) {
        try {
            connection.rollback();
        } catch (SQLException rollbackFailure) {
            original.addSuppressed(rollbackFailure);
        }
    }

    private record CurrentState(boolean stateRowExists, boolean liked, long count) {
    }

    private record StoredRequest(
            String requestId,
            String userId,
            long workId,
            Operation operation,
            Decision decision,
            Effect effect,
            boolean likedAfter,
            long countAfter,
            ResponseReason reason
    ) {
        private static StoredRequest from(ResultSet result) throws SQLException {
            return new StoredRequest(
                    result.getString("request_id"),
                    result.getString("user_id"),
                    result.getLong("work_id"),
                    Operation.valueOf(result.getString("operation")),
                    enumOrNull(Decision.class, result.getString("decision")),
                    enumOrNull(Effect.class, result.getString("effect")),
                    result.getBoolean("liked_after"),
                    result.getLong("count_after"),
                    enumOrNull(ResponseReason.class, result.getString("reason")));
        }

        private boolean samePayload(LikeCommand command) {
            return userId.equals(command.userId())
                    && workId == command.workId()
                    && operation == command.operation();
        }

        private BusinessResponse toCompletedResponse() {
            if (decision == null || effect == null) {
                throw new IllegalStateException("Request is not terminal: " + requestId);
            }
            return new BusinessResponse(
                    requestId, decision, effect, likedAfter, countAfter, reason, false);
        }
    }
}
