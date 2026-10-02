# General development workflow

(This file is more for agents than humans.)

Follow test-driven development when making changes:

1. **Update tests first:** Before modifying implementation, update or write tests that describe the desired behavior. Aim for 100% test coverage.
2. **Watch tests fail:** Run tests to verify they fail with the current implementation (or fail appropriately if adding new functionality).
3. **Make tests pass:** Implement changes to make the tests pass.
4. **Run tests after changes:** Always run tests after making code changes to ensure nothing is broken.

Additionally, make sure the following checks pass after completing a request:

- There should be no lint violations or type errors.
- All tests should pass.
- All changelogs should pass validation.
