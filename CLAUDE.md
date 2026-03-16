# Project Rules

## Testing Requirements

When adding or modifying features, follow this workflow:

1. **Generate/update test case checklists first:**
   - Use `hills-unit-test-cases-generator` to generate or update the unit test case checklist in documentation
   - Use `hills-e2e-test-case-generator` to generate or update the E2E test case checklist in documentation

2. **Update test code based on checklists:**
   - Add or modify unit test code to match the updated unit test case checklist
   - Add or modify E2E test code to match the updated E2E test case checklist

3. **Use TDD (Test-Driven Development) for implementation:**
   - Write/update tests first, then implement the feature code
   - Ensure all tests pass before considering the work complete

4. **Ensure sufficient test coverage:**
   - Unit tests and E2E tests must adequately cover the new or modified functionality
