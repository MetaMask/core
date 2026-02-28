# Review guidelines

## General

- When reviewing a PR, always read the [AGENTS.md](../AGENTS.md) file. It contains general guidelines to follow when working on the repository.

## Controller guidelines

For files matching the pattern `.*(Controller|-controller)\.(ts|js)$`:

- Ensure that the file follows the [controller guidelines](../docs/code-guidelines/controller-guidelines.md).
  - Add a non-blocking bug with a title referencing the controller guideline that is being violated.
  - Body: "Please review the controller guidelines and follow the recommendations." followed by an explanation of the guideline that is being violated.

## Data service guidelines

For files matching the pattern `.*(Service|-service)\.(ts|js)$`:

- Ensure that the file follows the [data service guidelines](../docs/code-guidelines/data-services.md).
  - Add a non-blocking bug with a title referencing the data service guideline that is being violated.
  - Body: "Please review the data service guidelines and follow the recommendations." followed by an explanation of the guideline that is being violated.

## Unit testing guidelines

For files matching the pattern `.*test\.(ts|js)$`:

- Ensure that the file follows the [unit testing guidelines](../docs/processes/testing.md).
  - Add a non-blocking bug with a title referencing the unit testing guideline that is being violated.
  - Body: "Please review the unit testing guidelines and follow the recommendations." followed by an explanation of the guideline that is being violated.
