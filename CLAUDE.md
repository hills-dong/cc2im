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

5. **Report Output is Mandatory:**
   - Every hills-test skill MUST produce its designated report file. No exceptions.
   - Report naming convention:

   | Skill | Report File |
   |-------|------------|
   | `hills-test-impact` | `test-impact-report.md` |
   | `hills-test-quality` | `test-quality-report.md` |
   | `hills-test-run` | `test-run-report.md` |
   | `hills-test-verify` | `test-verify-report.md` |

   - `hills-test-verify` reports MUST use `![stepN](screenshots/filename.png)` markdown image syntax for screenshot references
   - If a report is missing after a skill completes, the skill has NOT completed

6. **Self-Check is the Last Step:**
   - Every hills-test sub-agent prompt contains a "Self-Check Before Completion" checklist
   - Sub-agents MUST verify all checklist items before declaring completion
   - Unchecked items must be completed; blockers must be documented in the report under a `## Blockers` section
   - The orchestrator should verify report existence after each skill returns

7. **Seed Data Sharing (E2E + Walkthrough):**
   - E2E tests (`hills-test-run`) and walkthrough verification (`hills-test-verify`) share the same seed data mechanism
   - When Docker environment (`docker-compose.e2e.yml`) is available: use seeded database with multi-platform, multi-project test data
   - When Docker is unavailable: use local service as degraded fallback, and clearly mark this in the report

## Design Context

See `.impeccable.md` for full design guidelines. Key points:

- **Brand:** Geek · Refined · Composed
- **References:** Vercel, Raycast — clean, information-dense, elegant
- **Palette:** Zinc neutrals + Cyan (#4cc9f0) accent, dark mode default
- **Style:** shadcn-svelte New York, system fonts + JetBrains Mono
- **Principles:** Quiet confidence, information density without clutter, purposeful color, craft in details, developer-native patterns
