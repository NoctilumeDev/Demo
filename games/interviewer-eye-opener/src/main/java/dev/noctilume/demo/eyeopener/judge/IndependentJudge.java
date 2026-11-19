package dev.noctilume.demo.eyeopener.judge;

import dev.noctilume.demo.eyeopener.contract.BusinessResponse;
import dev.noctilume.demo.eyeopener.contract.Decision;
import dev.noctilume.demo.eyeopener.contract.Effect;
import dev.noctilume.demo.eyeopener.contract.Operation;
import dev.noctilume.demo.eyeopener.contract.ResponseReason;
import dev.noctilume.demo.eyeopener.runner.AttemptTrace;
import dev.noctilume.demo.eyeopener.runner.Delivery;
import dev.noctilume.demo.eyeopener.runner.ScenarioTrace;
import dev.noctilume.demo.eyeopener.runner.StepTrace;
import dev.noctilume.demo.eyeopener.scenario.LoadedScenario;
import dev.noctilume.demo.eyeopener.scenario.ScenarioStep;
import dev.noctilume.demo.eyeopener.scenario.StepExpectation;
import dev.noctilume.demo.eyeopener.world.RequestRecordSnapshot;
import dev.noctilume.demo.eyeopener.world.WorldSnapshot;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

public final class IndependentJudge {
    public WorldVerdict judge(LoadedScenario scenario, ScenarioTrace trace) {
        Map<String, CheckResult> checks = new LinkedHashMap<>();
        checks.put("scenario-coordinate", checkScenarioCoordinate(scenario, trace));
        checks.put("step-contracts", checkStepContracts(scenario, trace));
        checks.put("request-replay", checkRequestReplay(trace));
        checks.put("request-conflict", checkRequestConflict(trace));
        checks.put("concurrent-state-transition", checkConcurrentTransition(trace));
        checks.put("response-loss-and-restart", checkResponseLossAndRestart(trace));
        checks.put("request-records-terminal", checkTerminalRecords(trace.finalSnapshot()));
        checks.put("independent-count-invariant", checkCountInvariant(scenario, trace.finalSnapshot()));
        checks.put("final-business-state", checkFinalState(scenario, trace.finalSnapshot()));
        boolean qualified = checks.values().stream().allMatch(CheckResult::passed);
        return new WorldVerdict(trace.coordinate(), qualified, Map.copyOf(checks));
    }

    public CrossWorldVerdict judgeIsolation(
            ScenarioTrace first,
            ScenarioTrace second,
            WorldVerdict firstVerdict,
            WorldVerdict secondVerdict
    ) {
        Map<String, CheckResult> checks = new LinkedHashMap<>();
        boolean distinctCoordinates = !first.coordinate().runId().equals(second.coordinate().runId())
                && !first.coordinate().worldId().equals(second.coordinate().worldId());
        checks.put("distinct-run-and-world", result(
                distinctCoordinates,
                distinctCoordinates
                        ? "runId and worldId are both distinct"
                        : "isolation run reused a runId or worldId"));

        List<String> firstInputs = normalizedInputs(first);
        List<String> secondInputs = normalizedInputs(second);
        checks.put("identical-input-identifiers", result(
                firstInputs.equals(secondInputs),
                "both worlds replayed " + firstInputs.size() + " identical request attempts"));

        boolean logicalFactsMatch = normalizedStoredInputs(first.finalSnapshot())
                        .equals(normalizedStoredInputs(second.finalSnapshot()))
                && outcomeTotals(first.finalSnapshot()).equals(outcomeTotals(second.finalSnapshot()))
                && first.finalSnapshot().states().equals(second.finalSnapshot().states())
                && first.finalSnapshot().counts().equals(second.finalSnapshot().counts());
        checks.put("independent-logical-results", result(
                logicalFactsMatch,
                logicalFactsMatch
                        ? "same inputs, outcome totals and final facts were retained; concurrent winners may differ"
                        : "the two isolated worlds produced different logical facts"));

        boolean requestRowsComplete = first.finalSnapshot().requests().size() == 106
                && second.finalSnapshot().requests().size() == 106;
        checks.put("complete-request-ledgers", result(
                requestRowsComplete,
                "request rows: " + first.finalSnapshot().requests().size()
                        + " and " + second.finalSnapshot().requests().size()));

        checks.put("both-worlds-qualified", result(
                firstVerdict.qualified() && secondVerdict.qualified(),
                "world verdicts: " + firstVerdict.qualified() + ", " + secondVerdict.qualified()));

        boolean qualified = checks.values().stream().allMatch(CheckResult::passed);
        return new CrossWorldVerdict(qualified, Map.copyOf(checks));
    }

    private CheckResult checkScenarioCoordinate(LoadedScenario scenario, ScenarioTrace trace) {
        boolean passed = scenario.definition().scenarioId().equals(trace.scenarioId())
                && scenario.sha256().equals(trace.scenarioSha256())
                && trace.steps().size() == scenario.definition().steps().size();
        return result(passed, "scenario=" + trace.scenarioId() + ", sha256=" + trace.scenarioSha256());
    }

    private CheckResult checkStepContracts(LoadedScenario scenario, ScenarioTrace trace) {
        List<String> failures = new ArrayList<>();
        long workId = scenario.definition().workId();

        for (int index = 0; index < scenario.definition().steps().size(); index++) {
            ScenarioStep definition = scenario.definition().steps().get(index);
            StepTrace observed = trace.steps().get(index);
            StepExpectation expected = definition.expected();
            if (!definition.id().equals(observed.stepId()) || definition.kind() != observed.kind()) {
                failures.add(definition.id() + ": wrong step identity");
                continue;
            }

            long applied = observed.attempts().stream()
                    .filter(attempt -> attempt.response().decision() == Decision.APPLIED)
                    .count();
            long rejected = observed.attempts().stream()
                    .filter(attempt -> attempt.response().decision() == Decision.REJECTED)
                    .count();
            long stateChanges = observed.attempts().stream()
                    .filter(attempt -> !attempt.response().replayed())
                    .filter(attempt -> attempt.response().effect() == Effect.STATE_CHANGED)
                    .count();
            long noChanges = observed.attempts().stream()
                    .filter(attempt -> !attempt.response().replayed())
                    .filter(attempt -> attempt.response().effect() == Effect.NO_CHANGE)
                    .count();
            long replayed = observed.attempts().stream()
                    .filter(attempt -> attempt.response().replayed())
                    .count();

            if (observed.snapshotAfter().count(workId) != expected.countAfter()) {
                failures.add(definition.id() + ": count=" + observed.snapshotAfter().count(workId));
            }
            if (applied != expected.responsesApplied()
                    || rejected != expected.responsesRejected()
                    || stateChanges != expected.newStateChanges()
                    || noChanges != expected.newNoChanges()
                    || replayed != expected.replayedResponses()) {
                failures.add(definition.id() + ": response/effect totals differ");
            }
            for (Map.Entry<String, Boolean> state : expected.liked().entrySet()) {
                if (observed.snapshotAfter().liked(workId, state.getKey()) != state.getValue()) {
                    failures.add(definition.id() + ": state differs for " + state.getKey());
                }
            }
        }
        return failures.isEmpty()
                ? CheckResult.pass("all seven step contracts matched the frozen script")
                : CheckResult.fail(String.join("; ", failures));
    }

    private CheckResult checkRequestReplay(ScenarioTrace trace) {
        StepTrace step = step(trace, "S1");
        if (step.attempts().size() != 3) {
            return CheckResult.fail("S1 did not retain three attempts");
        }
        BusinessResponse primary = step.attempts().get(0).response();
        BusinessResponse replay = step.attempts().get(1).response();
        boolean passed = primary.sameBusinessResult(replay)
                && !primary.replayed()
                && replay.replayed()
                && primary.decision() == Decision.APPLIED
                && primary.effect() == Effect.STATE_CHANGED;
        return result(passed, "same request restored the original business result; only replayed changed");
    }

    private CheckResult checkRequestConflict(ScenarioTrace trace) {
        StepTrace step = step(trace, "S1");
        AttemptTrace conflict = step.attempts().get(2);
        RequestRecordSnapshot retained = step.snapshotAfter().requests().stream()
                .filter(record -> record.requestId().equals("R001"))
                .findFirst()
                .orElse(null);
        boolean passed = conflict.response().decision() == Decision.REJECTED
                && conflict.response().effect() == Effect.NO_CHANGE
                && conflict.response().reason() == ResponseReason.REQUEST_ID_CONFLICT
                && !conflict.response().replayed()
                && retained != null
                && retained.operation() == Operation.LIKE
                && retained.decision() == Decision.APPLIED
                && step.snapshotAfter().requests().stream()
                        .filter(record -> record.requestId().equals("R001"))
                        .count() == 1;
        return result(passed, "same requestId with a different operation was rejected without rewriting R001");
    }

    private CheckResult checkConcurrentTransition(ScenarioTrace trace) {
        StepTrace step = step(trace, "S2");
        Set<String> requestIds = new TreeSet<>();
        long changed = 0;
        long unchanged = 0;
        for (AttemptTrace attempt : step.attempts()) {
            requestIds.add(attempt.command().requestId());
            if (attempt.response().effect() == Effect.STATE_CHANGED) {
                changed++;
            } else {
                unchanged++;
            }
        }
        boolean passed = step.attempts().size() == 100
                && requestIds.size() == 100
                && changed == 1
                && unchanged == 99
                && step.attempts().stream().allMatch(attempt -> attempt.response().decision() == Decision.APPLIED)
                && step.snapshotAfter().liked(1, "D")
                && step.snapshotAfter().count(1) == 2;
        return result(passed, "100 distinct concurrent requests produced one 0->1 transition and 99 no-ops");
    }

    private CheckResult checkResponseLossAndRestart(ScenarioTrace trace) {
        StepTrace step = step(trace, "S6");
        if (step.attempts().size() != 2) {
            return CheckResult.fail("S6 did not retain the lost response and retry");
        }
        AttemptTrace lost = step.attempts().get(0);
        AttemptTrace retry = step.attempts().get(1);
        boolean passed = step.applicationRestarted()
                && lost.delivery() == Delivery.LOST_AFTER_COMMIT
                && retry.delivery() == Delivery.DELIVERED
                && retry.applicationGeneration() > lost.applicationGeneration()
                && lost.response().sameBusinessResult(retry.response())
                && !lost.response().replayed()
                && retry.response().replayed()
                && step.snapshotAfter().count(1) == 3
                && !step.snapshotAfter().liked(1, "B");
        return result(passed, "committed result survived response loss and a new application instance");
    }

    private CheckResult checkTerminalRecords(WorldSnapshot snapshot) {
        long incomplete = snapshot.requests().stream()
                .filter(record -> record.decision() == null || record.effect() == null)
                .count();
        return result(incomplete == 0, "terminal request rows=" + (snapshot.requests().size() - incomplete)
                + ", incomplete=" + incomplete);
    }

    private CheckResult checkCountInvariant(LoadedScenario scenario, WorldSnapshot snapshot) {
        long workId = scenario.definition().workId();
        long count = snapshot.count(workId);
        long sum = snapshot.stateSum(workId);
        return result(count == sum, "independently maintained count=" + count + ", state sum=" + sum);
    }

    private CheckResult checkFinalState(LoadedScenario scenario, WorldSnapshot snapshot) {
        long workId = scenario.definition().workId();
        boolean passed = snapshot.count(workId) == 3
                && snapshot.liked(workId, "A")
                && !snapshot.liked(workId, "B")
                && snapshot.liked(workId, "C")
                && snapshot.liked(workId, "D");
        return result(passed, "A=1, B=0, C=1, D=1, count=" + snapshot.count(workId));
    }

    private static StepTrace step(ScenarioTrace trace, String id) {
        return trace.steps().stream()
                .filter(step -> step.stepId().equals(id))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Missing step " + id));
    }

    private static List<String> normalizedInputs(ScenarioTrace trace) {
        return trace.steps().stream()
                .flatMap(step -> step.attempts().stream())
                .map(attempt -> attempt.command().requestId()
                        + "|" + attempt.command().userId()
                        + "|" + attempt.command().workId()
                        + "|" + attempt.command().operation())
                .sorted()
                .toList();
    }

    private static List<String> normalizedStoredInputs(WorldSnapshot snapshot) {
        return snapshot.requests().stream()
                .map(record -> record.requestId()
                        + "|" + record.userId()
                        + "|" + record.workId()
                        + "|" + record.operation())
                .sorted()
                .toList();
    }

    private static Map<String, Long> outcomeTotals(WorldSnapshot snapshot) {
        Map<String, Long> totals = new LinkedHashMap<>();
        for (RequestRecordSnapshot record : snapshot.requests()) {
            String key = record.decision() + "|" + record.effect();
            totals.merge(key, 1L, Long::sum);
        }
        return Map.copyOf(totals);
    }

    private static CheckResult result(boolean passed, String detail) {
        return passed ? CheckResult.pass(detail) : CheckResult.fail(detail);
    }
}
