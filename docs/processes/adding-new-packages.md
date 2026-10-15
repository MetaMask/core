# Adding new packages to the monorepo

> [!NOTE]
> If you're migrating an existing package to the monorepo, please see [the package migration documentation](./package-migration-process-guide.md). You may be able to make use of `create-package` when migrating your package, but there's a lot more to it.

Manually creating a new monorepo package can be a tedious, even frustrating process. To alleviate that problem, we have created a CLI that automates most of the job for us, creatively titled [`create-package`](../../scripts/create-package/). To create a new monorepo package, follow these steps:

1. Create a new package using `yarn create-package`.
   - Use the `--help` flag for usage information.
   - Once this is done, you can find a package with your chosen name in `/packages`.
2. Make sure your license is correct.
   - By default, `create-package` gives your package a combined MIT license and Apache 2.0 license.
   - If your desired license is _not_ MIT and Apache 2.0, then you must update your `LICENSE` file and the `license` field of `package.json`.
3. Update `.github/CODEOWNERS` and `teams.json` to assign a team as the owner of the new package.
4. Open a new Pull Request to merge your new package scaffolding into the monorepo.
   - It should contain no functional changes beyond the addition of the new package structure.
   - See [Why two PRs are recommended](#why-two-prs-are-recommended).
5. Add the remaining code and dependencies for your new package.
   - Do this as normal using `yarn`.
   - Remember, if you are adding other monorepo packages as dependents, don't forget to add them to the `references` array in your package's `tsconfig.json` and `tsconfig.build.json`.

And that's it!

### Contributing to `create-package`

Along with this documentation, `create-package` is intended to be the source of truth for the process of adding new packages to the monorepo. Consequently, to change that process, you will want to change `create-package`.

The `create-package` directory contains a [template package](../../scripts/create-package/package-template/). The CLI is not aware of the contents of the template, only that its files have [placeholder values](../../scripts/create-package/constants.ts). When a new package is created, the template files are read from disk, the placeholder values are replaced with real ones, and the updated files are added to a new directory in `/packages`. To modify the template package:

- If you need to add or modify any files or folders, just go ahead and make your changes in [`/scripts/create-package/package-template`](../../scripts/create-package/package-template/). The CLI will read whatever's in that directory and write it to disk.
- If you need to add or modify any placeholders, make sure that your desired values are added to both the relevant file(s) and [`/scripts/create-package/constants.ts`](../../scripts/create-package/constants.ts). Then, update the implementation of the CLI accordingly.
- As with placeholders, updating the monorepo files that the CLI interacts with begins by updating [`/scripts/create-package/constants.ts`](../../scripts/create-package/constants.ts).

### Why two PRs are recommended

When adding a new package to the monorepo, it is recommended to open two separate Pull Requests:

1. The first PR should contain only the scaffolding for the new package, including its initial structure, configuration files, and any necessary updates to monorepo-wide files like `.github/CODEOWNERS` and `teams.json`.
2. The second PR should contain the functional changes, such as adding dependencies and implementing the package's features.

This approach helps reviewers from the Core Platform team focus on the structural changes separately from the functional changes which can be a large volume of code, making the review process more manageable and efficient, reducing the risk of introducing errors.
