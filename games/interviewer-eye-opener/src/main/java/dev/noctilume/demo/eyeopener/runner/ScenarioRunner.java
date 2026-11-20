package dev.noctilume.demo.eyeopener.runner;

import dev.noctilume.demo.eyeopener.contract.BusinessResponse;
import dev.noctilume.demo.eyeopener.contract.LikeCommand;
import dev.noctilume.demo.eyeopener.contract.Operation;
import dev.noctilume.demo.eyeopener.contract.WorldCoordinate;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;
import dev.noctilume.demo.eyeopener.scenario.ScenarioStep;
import dev.noctilume.demo.eyeopener.world.LikeWorld;
import dev.noctilume.demo.eyeopener.world.WorldFactory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

public final class ScenarioRunner {
    private static final long BARRIER_TIMEOUT_SECONDS = 30;
    private static final long REQUEST_TIMEOUT_SECONDS = 90;

    private final LoadedScenario scenario;
    private final WorldFactory worlds;
    private final ApplicationProcessExecutor processes;
    private final ResponseDeliveryBoundary deliveryBoundary = new ResponseDeliveryBoundary();
    private final AtomicLong completionOrder = new AtomicLong();

    public ScenarioRunner(
            LoadedScenario scenario,
            WorldFactory worlds,
            ApplicationProcessExecutor processes
    ) {
        this.scenario = scenario;
        this.worlds = worlds;
        this.processes = processes;
    }

    public ScenarioTrace run(WorldCoordinate coordinate) {
        String startedAt = Instant.now().toString();
        List<StepTrace> traces = new ArrayList<>();
        LikeWorld world = worlds.open(coordinate, scenario);
        int generation = 1;

        try {
            world.initialize();
            for (ScenarioStep step : scenario.definition().steps()) {
                if (step.kind() == dev.noctilume.demo.eyeopener.scenario.StepKind.RESPONSE_LOSS_RESTART_RETRY) {
                    RestartExecution execution = executeResponseLoss(step, coordinate, world, generation);
                    world = execution.world();
                    generation = execution.generation();
                    traces.add(execution.trace());
                } else {
                    traces.add(execute(step, world, generation));
                }
            }
            return new ScenarioTrace(
                    coordinate,
                    scenario.definition().scenarioId(),
                    scenario.sha256(),
                    startedAt,
                    Instant.now().toString(),
                    List.copyOf(traces),
                    world.snapshot());
        } finally {
            world.close();
        }
    }

    private StepTrace execute(ScenarioStep step, LikeWorld world, int generation) {
        return switch (step.kind()) {
            case INITIALIZE -> new StepTrace(
                    step.id(), step.kind(), false, List.of(), world.snapshot());
            case REQUEST_REPLAY_AND_CONFLICT -> executeReplayAndConflict(step, world, generation);
            case CONCURRENT_SAME_USER -> executeConcurrentSameUser(step, world, generation);
            case CONCURRENT_USERS -> executeConcurrentUsers(step, world, generation);
            case APPLY_AND_RETRY -> executeApplyAndRetry(step, world, generation);
            case APPLY_ONCE -> executeApplyOnce(step, world, generation);
            case RESPONSE_LOSS_RESTART_RETRY -> throw new IllegalStateException("Restart step is handled separately");
        };
    }

    private StepTrace executeReplayAndConflict(ScenarioStep step, LikeWorld world, int generation) {
        LikeCommand command = command(step.requestId(), step.userId(), step.operation());
        LikeCommand conflict = command(step.requestId(), step.userId(), step.conflictOperation());
        List<AttemptTrace> attempts = List.of(
                apply("primary", generation, command, world, Delivery.DELIVERED),
                apply("same-request-retry", generation, command, world, Delivery.DELIVERED),
                apply("same-id-different-operation", generation, conflict, world, Delivery.DELIVERED));
        return new StepTrace(step.id(), step.kind(), false, attempts, world.snapshot());
    }

    private StepTrace executeConcurrentSameUser(ScenarioStep step, LikeWorld world, int generation) {
        List<LikeCommand> commands = new ArrayList<>();
        for (int index = 1; index <= step.attempts(); index++) {
            String requestId = step.requestIdPrefix() + "%03d".formatted(index);
            commands.add(command(requestId, step.userId(), step.operation()));
        }
        List<AttemptTrace> attempts = applyConcurrently(commands, world, generation);
        return new StepTrace(step.id(), step.kind(), false, attempts, world.snapshot());
    }

    private StepTrace executeConcurrentUsers(ScenarioStep step, LikeWorld world, int generation) {
        List<LikeCommand> commands = step.requests().stream()
                .map(request -> command(request.requestId(), request.userId(), request.operation()))
                .toList();
        List<AttemptTrace> attempts = applyConcurrently(commands, world, generation);
        return new StepTrace(step.id(), step.kind(), false, attempts, world.snapshot());
    }

    private StepTrace executeApplyAndRetry(ScenarioStep step, LikeWorld world, int generation) {
        LikeCommand command = command(step.requestId(), step.userId(), step.operation());
        List<AttemptTrace> attempts = List.of(
                apply("primary", generation, command, world, Delivery.DELIVERED),
                apply("same-request-retry", generation, command, world, Delivery.DELIVERED));
        return new StepTrace(step.id(), step.kind(), false, attempts, world.snapshot());
    }

    private StepTrace executeApplyOnce(ScenarioStep step, LikeWorld world, int generation) {
        LikeCommand command = command(step.requestId(), step.userId(), step.operation());
        AttemptTrace attempt = apply("primary", generation, command, world, Delivery.DELIVERED);
        return new StepTrace(step.id(), step.kind(), false, List.of(attempt), world.snapshot());
    }

    private RestartExecution executeResponseLoss(
            ScenarioStep step,
            WorldCoordinate coordinate,
            LikeWorld oldWorld,
            int generation
    ) {
        LikeCommand command = command(step.requestId(), step.userId(), step.operation());
        oldWorld.close();
        ProcessExecution firstProcess = processes.execute(coordinate, scenario, command);
        AttemptTrace lost = fromProcess(
                "committed-response-lost", generation, command, firstProcess, Delivery.LOST_AFTER_COMMIT);

        int restartedGeneration = generation + 1;
        ProcessExecution secondProcess = processes.execute(coordinate, scenario, command);
        AttemptTrace retry = fromProcess(
                "retry-after-restart", restartedGeneration, command, secondProcess, Delivery.DELIVERED);

        LikeWorld restartedWorld = worlds.open(coordinate, scenario);
        restartedWorld.initialize();

        StepTrace trace = new StepTrace(
                step.id(),
                step.kind(),
                true,
                List.of(lost, retry),
                restartedWorld.snapshot());
        return new RestartExecution(restartedWorld, restartedGeneration, trace);
    }

    private List<AttemptTrace> applyConcurrently(
            List<LikeCommand> commands,
            LikeWorld world,
            int generation
    ) {
        CountDownLatch ready = new CountDownLatch(commands.size());
        CountDownLatch start = new CountDownLatch(1);
        List<Future<AttemptTrace>> futures = new ArrayList<>();

        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (LikeCommand command : commands) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(BARRIER_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("Concurrent start barrier timed out");
                    }
                    return apply(command.requestId(), generation, command, world, Delivery.DELIVERED);
                }));
            }

            if (!ready.await(BARRIER_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Not all concurrent requests reached the barrier");
            }
            start.countDown();

            List<AttemptTrace> attempts = new ArrayList<>();
            for (Future<AttemptTrace> future : futures) {
                attempts.add(future.get(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS));
            }
            attempts.sort(Comparator.comparingLong(AttemptTrace::completionOrder));
            return List.copyOf(attempts);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Concurrent scenario was interrupted", e);
        } catch (ExecutionException e) {
            throw new IllegalStateException("Concurrent request failed", e.getCause());
        } catch (TimeoutException e) {
            throw new IllegalStateException("Concurrent request did not complete in time", e);
        }
    }

    private AttemptTrace apply(
            String label,
            int generation,
            LikeCommand command,
            LikeWorld world,
            Delivery delivery
    ) {
        String startedAt = Instant.now().toString();
        BusinessResponse systemResponse = world.apply(command);
        ResponseDeliveryBoundary.DeliveryOutcome outcome = deliveryBoundary.pass(systemResponse, delivery);
        return new AttemptTrace(
                label,
                generation,
                ProcessHandle.current().pid(),
                null,
                completionOrder.incrementAndGet(),
                startedAt,
                Instant.now().toString(),
                command,
                outcome.systemResponse(),
                outcome.clientResponse(),
                outcome.delivery());
    }

    private AttemptTrace fromProcess(
            String label,
            int generation,
            LikeCommand command,
            ProcessExecution execution,
            Delivery delivery
    ) {
        ResponseDeliveryBoundary.DeliveryOutcome outcome = deliveryBoundary.pass(execution.response(), delivery);
        return new AttemptTrace(
                label,
                generation,
                execution.processId(),
                execution.exitCode(),
                completionOrder.incrementAndGet(),
                execution.startedAt(),
                execution.exitedAt(),
                command,
                outcome.systemResponse(),
                outcome.clientResponse(),
                outcome.delivery());
    }

    private LikeCommand command(String requestId, String userId, Operation operation) {
        return new LikeCommand(requestId, userId, scenario.definition().workId(), operation);
    }

    private record RestartExecution(LikeWorld world, int generation, StepTrace trace) {
    }
}
