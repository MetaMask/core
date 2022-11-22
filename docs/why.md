# Why a monorepo?

Prior to November 2022, this repo was a monolithic repo, where the code for many [controllers](./what.md) lived under one roof and was published as one package (`@metamask/controllers`). This led to a few problems:

- Even if a product team wanted to use a small subset of controllers, they were forced to add the entire package to their project, which bloated the dependency tree unnecessarily.
- Occasionally, a product team tasked with carving out a new feature needed to make temporary modifications to one or more controllers during development, but this was difficult, as they were forced to fork the repo and keep it up to date.
- Beyond the controllers repo, we were maintaining code for other shared libraries in separate repos, and keeping these repos architecturally aligned with each other had grown to be painful.

We aimed to improve these situations by splitting up `@metamask/controllers` into many packages, where each package corresponded to a single controller (except for a few cases). By doing this:

- Product teams could now choose which controllers they wanted to use in their project without the fear of relying on more dependencies than were necessary.
- Instead of forking, product teams can publish [preview builds](./preview-builds.md) for in-progress work and make use of those builds in products to test them out as they are working on new features.
- Although not carried out yet, in the future we hope to bring shared libraries as well as additional controllers not hosted here into this repo so that we can standardize the shape of each package much more easily than we can today.

For a more in-depth explanation of challenges and solutions, read the [kickoff document for the monorepo project](https://docs.google.com/document/d/1G3M-lcwvfNFs3Tq4lVzhywqzYhCqPqBN7c5n8TC9sWM/edit).
