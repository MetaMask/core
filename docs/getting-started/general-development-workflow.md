# General development workflow

(This file is more for agents than humans.)

- Don't reinvent the wheel. Before implementing a task, search the web for existing packages, GitHub gists, blog posts, etc. to see if anyone else has solved the problem before, and present these to the user as options.
- Follow test-driven development when making changes:
  1. **Update tests first:** Before modifying implementation, update or write tests that describe the desired behavior. Aim for 100% test coverage.
  2. **Watch tests fail:** Run tests to verify they fail with the current implementation (or fail appropriately if adding new functionality).
  3. **Make tests pass:** Implement changes to make the tests pass.
- Make sure the following checks pass after completing a task:
  - There should be no lint violations, formatting differences, or type errors. (See ["Linting and formatting"](../processes/linting-and-formatting.md).)
  - All tests should pass. (See ["Testing"](../processes/testing.md).)
  - All changelogs should pass validation. (See ["Updating changelogs"](../processes/updating-changelogs.md).)
