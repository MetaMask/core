# Testing monorepo changes against other projects

Let's say that you're working on a feature in one of our products and this feature relies on changes that you need to make to one or more packages within this repo. You make those changes here, but now you want to make sure that they fulfill the need you have in your product and don't break anything. How do you integrate these changes into your product?

Previously you might have used the "commit id" method to solve this problem, where you:

- push up a branch in this repo
- copy the commit id of the latest commit on that branch
- open `package.json` in your project
- replace the version of some package with `MetaMask/controllers#<commit id>`

That method won't work anymore (at least until we have all repos using Yarn v3). So now what do you do?

Enter **preview builds**. These are ephemeral versions of packages which are built on demand and published to GitHub Package Registry.

To use them, you'll need to do a few of things:

1. You'll need to create a personal access token within your GitHub account. If you have not already done so, go into the [token settings for your account](https://github.com/settings/tokens) and [create a token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-personal-access-token-classic). (Note: there are two types of tokens; you'll want a **classic** token.)
2. In your product, you'll need to add an `.npmrc` file with the following content:

   ```
   @metamask:registry=https://npm.pkg.github.com

   //npm.pkg.github.com/:_authToken=<insert your personal access token here>
   ```

3. Over here in `controllers`, push up a draft PR for this repo (or place an existing PR into draft mode), then make a comment on the PR with the text:

```
@metamask-bot preview-build
```

This will trigger a GitHub Action which will build all of the packages in the monorepo using the code in the branch and publish them to GitHub Package Registry. You might need to wait a bit, but after a few minutes, you'll see a new comment with the new version that was published. 4. Back in your project, look for the package where you made your changes and replace its version with the one posted in the comment. 5. Run `yarn install`. You should be using the changes now. 5. Continue to keep your `controllers` PR in draft mode until you're sure that you don't need to make any new changes. If you do push up a new commit to your PR, however, simply post another `@metamask-bot preview-build` comment and this will trigger another build.
