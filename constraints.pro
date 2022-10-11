%%%%%
% Utility predicates
%%%%%

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

% True if and only if the first SemVer version range is less than the second
% SemVer version range. Such a range must match "^MAJOR.MINOR.PATCH",
% "~MAJOR.MINOR.PATCH", "MAJOR.MINOR.PATCH". If two ranges do not have the same
% modifier ("^" or "~"), then they cannot be compared and the first cannot be
% considered as less than the second.
npm_version_range_out_of_sync(VersionRange1, VersionRange2) :-
  parse_version_range(VersionRange1, VersionRange1Modifier, VersionRange1Major, VersionRange1Minor, VersionRange1Patch),
  parse_version_range(VersionRange2, VersionRange2Modifier, VersionRange2Major, VersionRange2Minor, VersionRange2Patch),
  VersionRange1Modifier == VersionRange2Modifier,
  (
    % 1.0.0 <= 2.0.0
    % 1.1.0 <= 2.0.0
    % 1.0.1 <= 2.0.0
    VersionRange1Major @< VersionRange2Major ;
    (
      VersionRange1Major == VersionRange2Major ,
      (
        % 1.0.0 <= 1.1.0
        % 1.0.1 <= 1.1.0
        VersionRange1Minor @< VersionRange2Minor ;
        (
          % 1.0.0 <= 1.0.1
          VersionRange1Minor == VersionRange2Minor ,
          VersionRange1Patch @< VersionRange2Patch
        )
      )
    )
  ).

% True if and only if WorkspaceBasename can unify with the part of the given
% workspace directory name that results from removing all leading directories.
workspace_basename(WorkspaceCwd, WorkspaceBasename) :-
  atomic_list_concat(Parts, '/', WorkspaceCwd),
  last(Parts, WorkspaceBasename).

%%%%%
% Constraints
%%%%%

% "name" is required for all workspaces (including the root).
\+ gen_enforced_field(WorkspaceCwd, 'name', null).

% The name of the root package can be anything, but the name of a workspace
% package must match its directory (e.g., a package located in "packages/foo"
% must be called "@metamask/foo").
gen_enforced_field(WorkspaceCwd, 'name', WorkspacePackageName) :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  workspace_basename(WorkspaceCwd, WorkspaceBasename),
  atom_concat('@metamask/', WorkspaceBasename, WorkspacePackageName).

% "description" is required for all packages.
\+ gen_enforced_field(WorkspaceCwd, 'description', null).

% The value of "description" cannot end with a period.
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

% "keywords" must be the same across all workspace packages
% (and must be unset for the root).
gen_enforced_field(WorkspaceCwd, 'keywords', ['MetaMask', 'Ethereum']) :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'keywords', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "homepage" must match the name of the package (based on the workspace
% directory name) across all workspace packages (and must be unset for the
% root).
gen_enforced_field(WorkspaceCwd, 'homepage', CorrectHomepageUrl) :-
  \+ workspace_field(WorkspaceCwd, 'private', true),
  workspace_basename(WorkspaceCwd, WorkspaceBasename),
  atomic_list_concat(['https://github.com/MetaMask/controllers/tree/main/packages/', WorkspaceBasename, '#readme'], CorrectHomepageUrl).
gen_enforced_field(WorkspaceCwd, 'homepage', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "repository.type" must be "git" for all packages.
gen_enforced_field(WorkspaceCwd, 'repository.type', 'git').

% "repository.url" must be "https://github.com/MetaMask/controllers.git" for all
% packages.
gen_enforced_field(WorkspaceCwd, 'repository.url', 'https://github.com/MetaMask/controllers.git').

% "license" must be "MIT" for all workspace packages and unset for the root.
gen_enforced_field(WorkspaceCwd, 'license', 'MIT') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'license', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "main" must be "dist/index.js" for workspace packages and unset for the
% root.
gen_enforced_field(WorkspaceCwd, 'main', './dist/index.js') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'main', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "types" must be "dist/index.d.ts" for workspace packages and unset for the
% root.
gen_enforced_field(WorkspaceCwd, 'types', './dist/index.d.ts') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'types', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "files" must be ["dist/"] for workspace packages and unset for the root.
gen_enforced_field(WorkspaceCwd, 'files', ['dist/']) :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'files', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "engines.node" must be ">=14.0.0" for all packages.
gen_enforced_field(WorkspaceCwd, 'engines.node', '>=14.0.0').

% "publishConfig.access" must be "public" for workspace packages and unset
% for the root.
gen_enforced_field(WorkspaceCwd, 'publishConfig.access', 'public') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'publishConfig.access', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "publishConfig.registry" must be "https://registry.npmjs.org" for all
% workspace packages and unset for the root.
gen_enforced_field(WorkspaceCwd, 'publishConfig.registry', 'https://registry.npmjs.org/') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'publishConfig.registry', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% All dependency ranges must be recognizable.
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, 'a range optionally starting with ^ or ~', DependencyType) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  \+ is_valid_version_range(DependencyRange).

% All dependency ranges for a package must be synchronized across the monorepo
% (the highest one wins), regardless of which "*dependencies" the package
% appears.
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, OtherDependencyRange, DependencyType) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  workspace_has_dependency(OtherWorkspaceCwd, DependencyIdent, OtherDependencyRange, OtherDependencyType),
  WorkspaceCwd \= OtherWorkspaceCwd,
  DependencyRange \= OtherDependencyRange,
  npm_version_range_out_of_sync(DependencyRange, OtherDependencyRange).

% If a dependency is listed under "dependencies", it should not be listed under
% any other "*dependencies" lists. We match on the same dependency range so that
% if a dependency is listed twice in the same manifest, their versions are
% synchronized and then this constraint will apply and remove the "right"
% duplicate.
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, null, DependencyType) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, 'dependencies'),
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  DependencyType \= 'dependencies'.
