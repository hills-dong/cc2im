# Project Rules

## Testing Requirements

When adding or modifying features, follow this workflow:

1. **Use hills-test for all test-related work:**
   - Invoke `hills-test` to analyze the scenario and generate a test plan
   - Follow the plan's skill assignments for each task

2. **Skill Integration: hills-test × superpowers**

| superpowers step | must call hills-test skill |
|---|---|
| writing-plans with test tasks | `hills-test` (scene analysis, generate skill-annotated test tasks) |
| executing-plans before implementation | `hills-test-impact` (impact analysis) |
| TDD write test step | `hills-unit-test` / `hills-e2e-test` |
| TDD run test step | `hills-test-run` |
| after test code complete | `hills-test-quality` |
| verification-before-completion | `hills-test-run` + `hills-test-quality` + `hills-test-verify` |

3. **Sub-Agent Role Isolation (Iron Rule):**
   - Case analyst, test developer, business developer, quality reviewer, test runner, and walkthrough verifier MUST run in separate sub-agents
   - Never let the same agent write code and review it

4. **Ensure sufficient test coverage:**
   - Unit tests and E2E tests must adequately cover the new or modified functionality
   - All test documents go to `docs/hills-test/{requirement_name}/`

<!-- DEPRECATED: old test workflow instructions, remove after Task 9 integration test passes
1. Generate/update test case checklists first:
   - Use hills-unit-test-cases-generator for unit test case checklist
   - Use hills-e2e-test-case-generator for E2E test case checklist
2. Update test code based on checklists
3. Use TDD for implementation
4. Ensure sufficient test coverage
-->
