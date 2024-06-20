%===============================================================================
% Utility predicates
%===============================================================================

% True if and only if VersionRange is a value that we would expect to see
% following a package in a "*dependencies" field within a `package.json`.
is_valid_version_range(VersionRange) :-
  VersionRange = 'workspace:^';
  VersionRange = 'workspace:~';
  parse_version_range(VersionRange, _, _, _, _).

% Succeeds if Number can be unified with Atom converted to a number; throws if
% not.
atom_to_number(Atom, Number) :-
  atom_chars(Atom, Chars),
  number_chars(Number, Chars).

% True if and only if Atom can be converted to a number.
is_atom_number(Atom) :-
  catch(atom_to_number(Atom, _), _, false).

% True if and only if Modifier can be unified with the leading character of the
% version range ("^" or "~" if present, or "" if not present), Major can be
% unified with the major part of the version string, Minor with the minor, and
% Patch with the patch.
parse_version_range(VersionRange, Modifier, Major, Minor, Patch) :-
  % Identify and extract the modifier (^ or ~) from the version string
  atom_chars(VersionRange, Chars),
  Chars = [PossibleModifier | CharsWithoutPossibleModifier],
  (
    (
      PossibleModifier = '^';
      PossibleModifier = '~'
    ) ->
      (
        Modifier = PossibleModifier,
        CharsWithoutModifier = CharsWithoutPossibleModifier
      ) ;
      (
        is_atom_number(PossibleModifier) ->
          (
            Modifier = '',
            CharsWithoutModifier = Chars
          ) ;
          false
      )
  ),
  atomic_list_concat(CharsWithoutModifier, '', VersionRangeWithoutModifier),
  atomic_list_concat(VersionParts, '.', VersionRangeWithoutModifier),
  % Validate version string while extracting each part
  length(VersionParts, 3),
  nth0(0, VersionParts, MajorAtom),
  nth0(1, VersionParts, MinorAtom),
  nth0(2, VersionParts, PatchAtom),
  atom_to_number(MajorAtom, Major),
  atom_to_number(MinorAtom, Minor),
  atom_to_number(PatchAtom, Patch).

% True if and only if the first SemVer version range is greater than the second
% SemVer version range. Such a range must match "^MAJOR.MINOR.PATCH",
% "~MAJOR.MINOR.PATCH", "MAJOR.MINOR.PATCH". If two ranges do not have the same
% modifier ("^" or "~"), then they cannot be compared and the first cannot be
% considered as less than the second.
%
% Borrowed from: <https://github.com/npm/node-semver/blob/a7b8722674e2eedfd89960b4155ffddd6a20ee21/classes/semver.js#L107>
npm_version_range_out_of_sync(VersionRange1, VersionRange2) :-
  parse_version_range(VersionRange1, VersionRange1Modifier, VersionRange1Major, VersionRange1Minor, VersionRange1Patch),
  parse_version_range(VersionRange2, VersionRange2Modifier, VersionRange2Major, VersionRange2Minor, VersionRange2Patch),
  VersionRange1Modifier == VersionRange2Modifier,
  (
    % 2.0.0 > 1.0.0
    % 2.0.0 > 1.1.0
    % 2.0.0 > 1.0.1
    VersionRange1Major @> VersionRange2Major ;
    (
      VersionRange1Major == VersionRange2Major ,
      (
        % 1.1.0 > 1.0.0
        % 1.1.0 > 1.0.1
        VersionRange1Minor @> VersionRange2Minor ;
        (
          VersionRange1Minor == VersionRange2Minor ,
          % 1.0.1 > 1.0.0
          VersionRange1Patch @> VersionRange2Patch
        )
      )
    )
  ).

% True if and only if WorkspaceBasename can unify with the part of the given
% workspace directory name that results from removing all leading directories.
workspace_basename(WorkspaceCwd, WorkspaceBasename) :-
  atomic_list_concat(Parts, '/', WorkspaceCwd),
  last(Parts, WorkspaceBasename).

% True if and only if WorkspacePackageName can unify with the name of the
% package which the workspace represents (which comes from the directory where
% the package is located). Assumes that the package is not in a sub-workspace
% and is not private.
workspace_package_name(WorkspaceCwd, WorkspacePackageName) :-
  workspace_basename(WorkspaceCwd, WorkspaceBasename),
  atom_concat('@metamask/', WorkspaceBasename, WorkspacePackageName).

% True if RepoName can be unified with the repository name part of RepoUrl, a
% complete URL for a repository on GitHub. This URL must include the ".git"
% extension.
repo_name(RepoUrl, RepoName) :-
  Prefix = 'https://github.com/MetaMask/',
  atom_length(Prefix, PrefixLength),
  Suffix = '.git',
  atom_length(Suffix, SuffixLength),
  atom_length(RepoUrl, RepoUrlLength),
  sub_atom(RepoUrl, 0, PrefixLength, After, Prefix),
  sub_atom(RepoUrl, Before, SuffixLength, 0, Suffix),
  Start is RepoUrlLength - After + 1,
  End is Before + 1,
  RepoNameLength is End - Start,
  sub_atom(RepoUrl, PrefixLength, RepoNameLength, SuffixLength, RepoName).

% True if DependencyIdent starts with '@metamask' and ends with '-controller'.
is_controller(DependencyIdent) :-
  Prefix = '@metamask/',
  atom_length(Prefix, PrefixLength),
  Suffix = '-controller',
  atom_length(Suffix, SuffixLength),
  atom_length(DependencyIdent, DependencyIdentLength),
  sub_atom(DependencyIdent, 0, PrefixLength, After, Prefix),
  sub_atom(DependencyIdent, Before, SuffixLength, 0, Suffix),
  Start is DependencyIdentLength - After + 1,
  End is Before + 1,
  ControllerNameLength is End - Start,
  sub_atom(DependencyIdent, PrefixLength, ControllerNameLength, SuffixLength, _).

%===============================================================================
% Constraints
%===============================================================================

% All packages, published or otherwise, must have a name.
\+ gen_enforced_field(WorkspaceCwd, 'name', null).

% The name of the root package can be anything, but the name of a non-root
% package must match its directory (e.g., a package located in "packages/foo"
% must be called "@metamask/foo").
%
% NOTE: This assumes that the set of non-root workspaces is flat. Nested
% workspaces will be added in a future change.
gen_enforced_field(WorkspaceCwd, 'name', WorkspacePackageName) :-
  WorkspaceCwd \= '.',
  workspace_package_name(WorkspaceCwd, WorkspacePackageName).

% All packages, published or otherwise, must have a description.
\+ gen_enforced_field(WorkspaceCwd, 'description', null).
% The description cannot end with a period.
gen_enforced_field(WorkspaceCwd, 'description', DescriptionWithoutTrailingPeriod) :-
  workspace_field(WorkspaceCwd, 'description', Description),
  atom_length(Description, Length),
  LengthLessOne is Length - 1,
  sub_atom(Description, LengthLessOne, 1, 0, LastCharacter),
  sub_atom(Description, 0, LengthLessOne, 1, DescriptionWithoutPossibleTrailingPeriod),
  (
    LastCharacter == '.' ->
      DescriptionWithoutTrailingPeriod = DescriptionWithoutPossibleTrailingPeriod ;
      DescriptionWithoutTrailingPeriod = Description
  ).

% All published packages must have the same set of NPM keywords.
gen_enforced_field(WorkspaceCwd, 'keywords', ['MetaMask', 'Ethereum']) :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
% Non-published packages do not have any NPM keywords.
gen_enforced_field(WorkspaceCwd, 'keywords', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% The homepage of a published package must match its name (which is in turn
% based on its workspace directory name).
gen_enforced_field(WorkspaceCwd, 'homepage', CorrectHomepageUrl) :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  workspace_basename(WorkspaceCwd, WorkspaceBasename),
  workspace_field(WorkspaceCwd, 'repository.url', RepoUrl),
  repo_name(RepoUrl, RepoName),
  atomic_list_concat(['https://github.com/MetaMask/', RepoName, '/tree/main/packages/', WorkspaceBasename, '#readme'], CorrectHomepageUrl).
% Non-published packages do not have a homepage.
gen_enforced_field(WorkspaceCwd, 'homepage', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% The bugs URL of a published package must point to the Issues page for the
% repository.
gen_enforced_field(WorkspaceCwd, 'bugs.url', CorrectBugsUrl) :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  workspace_field(WorkspaceCwd, 'repository.url', RepoUrl),
  repo_name(RepoUrl, RepoName),
  atomic_list_concat(['https://github.com/MetaMask/', RepoName, '/issues'], CorrectBugsUrl).
% Non-published packages must not have a bugs section.
gen_enforced_field(WorkspaceCwd, 'bugs', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% All packages must specify Git as the repository type.
gen_enforced_field(WorkspaceCwd, 'repository.type', 'git').

% All packages must match the URL of a repo within the MetaMask organization.
gen_enforced_field(WorkspaceCwd, 'repository.url', 'https://github.com/MetaMask/<insert repo name here>.git') :-
  workspace_field(WorkspaceCwd, 'repository.url', RepoUrl),
  \+ repo_name(RepoUrl, _).
% The repository URL for non-root packages must match the same URL used for the
% root package.
gen_enforced_field(WorkspaceCwd, 'repository.url', RepoUrl) :-
  workspace_field('.', 'repository.url', RepoUrl),
  repo_name(RepoUrl, _).
  WorkspaceCwd \= '.'.

% The license for all published packages must be MIT unless otherwise specified.
gen_enforced_field(WorkspaceCwd, 'license', 'MIT') :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  WorkspaceCwd \= 'packages/json-rpc-engine',
  WorkspaceCwd \= 'packages/json-rpc-middleware-stream',
  WorkspaceCwd \= 'packages/permission-log-controller',
  WorkspaceCwd \= 'packages/eth-json-rpc-provider'.
% The following published packages use an ISC license instead of MIT.
gen_enforced_field(WorkspaceCwd, 'license', 'ISC') :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  (
    WorkspaceCwd == 'packages/json-rpc-engine' ;
    WorkspaceCwd == 'packages/json-rpc-middleware-stream' ;
    WorkspaceCwd == 'packages/eth-json-rpc-provider'
  ).
% The following published packages use a custom license instead of MIT.
gen_enforced_field(WorkspaceCwd, 'license', 'SEE LICENSE IN LICENSE') :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  WorkspaceCwd == 'packages/permission-log-controller'.
% Non-published packages do not have a license.
gen_enforced_field(WorkspaceCwd, 'license', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% The entrypoint for all published packages must be the same.
gen_enforced_field(WorkspaceCwd, 'main', './dist/index.js') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
% Non-published packages must not specify an entrypoint.
gen_enforced_field(WorkspaceCwd, 'main', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% The type definitions entrypoint for all publishable packages must be the same.
gen_enforced_field(WorkspaceCwd, 'types', './dist/types/index.d.ts') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
% Non-published packages must not specify a type definitions entrypoint.
gen_enforced_field(WorkspaceCwd, 'types', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% The exports for all published packages must be the same.
gen_enforced_field(WorkspaceCwd, 'exports["."].import', './dist/index.mjs') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'exports["."].require', './dist/index.js') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'exports["."].types', './dist/types/index.d.ts') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'exports["./package.json"]', './package.json') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
% Non-published packages must not specify exports.
gen_enforced_field(WorkspaceCwd, 'exports', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% Published packages must not have side effects.
gen_enforced_field(WorkspaceCwd, 'sideEffects', false) :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  WorkspaceCwd \= 'packages/base-controller'.
% Non-published packages must not specify side effects.
gen_enforced_field(WorkspaceCwd, 'sideEffects', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% The list of files included in published packages must only include files
% generated during the build step.
gen_enforced_field(WorkspaceCwd, 'files', ['dist/']) :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
% The root package must specify an empty set of published files. (This is
% required in order to be able to import anything in development-only scripts,
% as otherwise the `node/no-unpublished-require` ESLint rule will disallow it.)
gen_enforced_field(WorkspaceCwd, 'files', []) :-
  WorkspaceCwd = '.'.

% All non-root packages must have the same "build" script.
gen_enforced_field(WorkspaceCwd, 'scripts.build', 'tsup --config ../../tsup.config.ts --tsconfig ./tsconfig.build.json --clean') :-
  WorkspaceCwd \= '.'.

% All non-root packages must have the same "build:docs" script.
gen_enforced_field(WorkspaceCwd, 'scripts.build:docs', 'typedoc') :-
  WorkspaceCwd \= '.'.

% All published packages must have the same "publish:preview" script.
gen_enforced_field(WorkspaceCwd, 'scripts.publish:preview', 'yarn npm publish --tag preview') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).

% All published packages must not have a "prepack" script.
gen_enforced_field(WorkspaceCwd, 'scripts.prepack', null) :-
  \+ workspace_field(WorkspaceCwd, 'private', true).

% The "changelog:validate" script for each published package must run a common
% script with the name of the package as the first argument.
gen_enforced_field(WorkspaceCwd, 'scripts.changelog:validate', CorrectChangelogValidationCommand) :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  workspace_field(WorkspaceCwd, 'scripts.changelog:validate', ChangelogValidationCommand),
  workspace_package_name(WorkspaceCwd, WorkspacePackageName),
  atomic_list_concat(['../../scripts/validate-changelog.sh ', WorkspacePackageName, ' [...]'], CorrectChangelogValidationCommand),
  atom_concat('../../scripts/validate-changelog.sh ', WorkspacePackageName, ExpectedPrefix),
  \+ atom_concat(ExpectedPrefix, _, ChangelogValidationCommand).

% The "changelog:update" script for each published package must run a common
% script with the name of the package as the first argument.
gen_enforced_field(WorkspaceCwd, 'scripts.changelog:update', CorrectChangelogUpdateCommand) :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  workspace_field(WorkspaceCwd, 'scripts.changelog:update', ChangelogUpdateCommand),
  workspace_package_name(WorkspaceCwd, WorkspacePackageName),
  atomic_list_concat(['../../scripts/update-changelog.sh ', WorkspacePackageName, ' [...]'], CorrectChangelogUpdateCommand),
  atom_concat('../../scripts/update-changelog.sh ', WorkspacePackageName, ExpectedPrefix),
  \+ atom_concat(ExpectedPrefix, _, ChangelogUpdateCommand).

% All non-root packages must have the same "test" script.
gen_enforced_field(WorkspaceCwd, 'scripts.test', 'jest --reporters=jest-silent-reporter') :-
  WorkspaceCwd \= '.'.

% All non-root packages must have the same "test:clean" script.
gen_enforced_field(WorkspaceCwd, 'scripts.test:clean', 'jest --clearCache') :-
  WorkspaceCwd \= '.'.

% All non-root packages must have the same "test:verbose" script.
gen_enforced_field(WorkspaceCwd, 'scripts.test:verbose', 'jest --verbose') :-
  WorkspaceCwd \= '.'.

% All non-root packages must have the same "test:watch" script.
gen_enforced_field(WorkspaceCwd, 'scripts.test:watch', 'jest --watch') :-
  WorkspaceCwd \= '.'.

% All dependency ranges must be recognizable (this makes it possible to apply
% the next two rules effectively).
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, 'a range optionally starting with ^ or ~', DependencyType) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  \+ is_valid_version_range(DependencyRange).

% All version ranges used to reference one workspace package in another
% workspace package's `dependencies` or `devDependencies` must be the same.
% Among all references to the same dependency across the monorepo, the one with
% the smallest version range will win. (We handle `peerDependencies` in another
% constraint, as it has slightly different logic.)
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, OtherDependencyRange, DependencyType) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  workspace_has_dependency(OtherWorkspaceCwd, DependencyIdent, OtherDependencyRange, OtherDependencyType),
  WorkspaceCwd \= OtherWorkspaceCwd,
  DependencyRange \= OtherDependencyRange,
  npm_version_range_out_of_sync(DependencyRange, OtherDependencyRange),
  DependencyType \= 'peerDependencies',
  OtherDependencyType \= 'peerDependencies'.

% All version ranges used to reference one workspace package in another
% workspace package's `dependencies` or `devDependencies` must match the current
% version of that package. (We handle `peerDependencies` in another rule.)
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, CorrectDependencyRange, DependencyType) :-
  DependencyType \= 'peerDependencies',
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  workspace_ident(OtherWorkspaceCwd, DependencyIdent),
  workspace_version(OtherWorkspaceCwd, OtherWorkspaceVersion),
  atomic_list_concat(['^', OtherWorkspaceVersion], CorrectDependencyRange).

% If a workspace package is listed under another workspace package's
% `dependencies`, it should not also be listed under its `devDependencies`.
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, null, 'devDependencies') :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, 'dependencies').

% Each controller is a singleton, so we need to ensure the versions
% used match expectations. To accomplish this, if a controller (other than
% `base-controller`, `eth-keyring-controller` and `polling-controller`) is
% listed under a workspace package's `dependencies`, it should also be listed
% under its `peerDependencies`, and the major version of the peer dependency
% should match the major part of the current version dependency, with the minor
% and patch parts set to 0. If it is already listed there, then the major
% version should match the current version of the package and the minor and
% patch parts should be <= the corresponding parts.
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, CorrectPeerDependencyRange, 'peerDependencies') :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, 'dependencies'),
  \+ workspace_has_dependency(WorkspaceCwd, DependencyIdent, _, 'peerDependencies'),
  is_controller(DependencyIdent),
  DependencyIdent \= '@metamask/base-controller',
  DependencyIdent \= '@metamask/eth-keyring-controller',
  DependencyIdent \= '@metamask/polling-controller',
  workspace_ident(DependencyWorkspaceCwd, DependencyIdent),
  workspace_version(DependencyWorkspaceCwd, CurrentDependencyWorkspaceVersion),
  parse_version_range(CurrentDependencyWorkspaceVersion, _, CurrentDependencyVersionMajor, _, _),
  atomic_list_concat([CurrentDependencyVersionMajor, 0, 0], '.', CorrectPeerDependencyVersion),
  atom_concat('^', CorrectPeerDependencyVersion, CorrectPeerDependencyRange).
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, CorrectPeerDependencyRange, 'peerDependencies') :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, SpecifiedPeerDependencyRange, 'peerDependencies'),
  is_controller(DependencyIdent),
  DependencyIdent \= '@metamask/base-controller',
  DependencyIdent \= '@metamask/eth-keyring-controller',
  DependencyIdent \= '@metamask/polling-controller',
  workspace_ident(DependencyWorkspaceCwd, DependencyIdent),
  workspace_version(DependencyWorkspaceCwd, CurrentDependencyVersion),
  parse_version_range(CurrentDependencyVersion, _, CurrentDependencyVersionMajor, CurrentDependencyVersionMinor, CurrentDependencyVersionPatch),
  parse_version_range(SpecifiedPeerDependencyRange, _, SpecifiedPeerDependencyVersionMajor, SpecifiedPeerDependencyVersionMinor, SpecifiedPeerDependencyVersionPatch),
  (
    (
      SpecifiedPeerDependencyVersionMajor == CurrentDependencyVersionMajor,
      (
        SpecifiedPeerDependencyVersionMinor @< CurrentDependencyVersionMinor ;
        (
          SpecifiedPeerDependencyVersionMinor == CurrentDependencyVersionMinor,
          SpecifiedPeerDependencyVersionPatch @=< CurrentDependencyVersionPatch
        )
      )
    ) ->
      CorrectPeerDependencyRange = SpecifiedPeerDependencyRange ;
      atom_concat('^', CurrentDependencyVersion, CorrectPeerDependencyRange)
  ).

% All packages must specify a minimum Node version of 18.
gen_enforced_field(WorkspaceCwd, 'engines.node', '^18.18 || >=20').

% All published packages are public.
gen_enforced_field(WorkspaceCwd, 'publishConfig.access', 'public') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
% All published packages are available on the NPM registry.
gen_enforced_field(WorkspaceCwd, 'publishConfig.registry', 'https://registry.npmjs.org/') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
% Non-published packages do not need to specify any publishing settings
% whatsoever.
gen_enforced_field(WorkspaceCwd, 'publishConfig', null) :-
  workspace_field(WorkspaceCwd, 'private', true).
