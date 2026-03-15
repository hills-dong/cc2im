# E2E Test Case Generator Skill Design

## Goal

Create a skill that generates comprehensive E2E test case checklists for existing projects, supporting both Web and CLI applications. Output is structured markdown — no test code.

## Project Type Detection

Auto-detect, user can override:
- **Web**: has playwright/cypress config, or route/page components
- **CLI**: has bin entry, command definitions, CLI entry point
- **Mixed**: both detected, generate both sections

## Input Sources (Priority Order)

1. **Source code**: routes, pages, components, CLI commands
2. **Documentation**: README, PRD, API docs (supplement)
3. **Existing E2E tests**: mark coverage status

## Analysis Dimensions

### Web E2E

| Dimension | Focus |
|-----------|-------|
| UI | Element rendering, layout, responsive, visual consistency |
| UX | Interaction flow, navigation, feedback (loading/toast), accessibility |
| Functional | Core business happy path, data flow, cross-page consistency |
| Error Handling | Network error, empty state, unauthorized, input validation, degradation |

### CLI E2E

| Dimension | Focus |
|-----------|-------|
| Input Validation | Argument parsing, missing/invalid args, help info |
| Output Validation | stdout/stderr content, exit code, output format |
| Side Effect Validation | File read/write, directory creation, config changes |
| Error Handling | Bad input, missing dependencies, timeout |

## Output Format

File: `docs/tests/YYYY-MM-DD-e2e-{path}.md`

### Module/Page Overview Table

Per page (Web) or command (CLI):

```
### Chat Page

| Route/Command | Description |
|---------------|-------------|
| `/chat` | Main chat interface |
```

### E2E Test Case Table

| Column | Description |
|--------|------------|
| Module/Page | Web page name or CLI command |
| User Scenario | What the user wants to accomplish |
| Test Case Name | Specific case |
| Dimension | Analysis dimension |
| Preconditions | Required state/data |
| Steps | User actions |
| Expected Result | Pass condition |
| Screenshot Verify | Y/N — whether LLM visual verification needed |
| Priority | P0/P1/P2 |

## Process

1. Detect project type (Web/CLI/Mixed)
2. Read source: routes, pages, CLI commands
3. Read docs: README, PRD (if available)
4. Read existing E2E tests
5. Generate cases per module, applying all dimensions
6. Mark existing coverage
7. Output single markdown file

## Naming

`e2e-test-case-generator` — mirrors `hills-unit-test-cases-generator`.
