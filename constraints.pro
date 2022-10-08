%%% Utility predicates

is_valid_version_range(VersionRange) :-
  VersionRange = 'workspace:^';
  VersionRange = 'workspace:~';
  parse_version_range(VersionRange, _, _, _, _).

atom_to_number(Atom, Number) :-
  atom_chars(Atom, Chars),
  number_chars(Number, Chars).

is_atom_number(Atom) :-
  catch(atom_to_number(Atom, _), _, false).

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

%npm_version_range_out_of_sync(VersionRange1, VersionRange2, VersionRange1Modifier, VersionRange2Modifier, VersionRange1Major, VersionRange1Minor, VersionRange1Patch, VersionRange2Major, VersionRange2Minor, VersionRange2Patch) :-
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

% "name" is required for all workspaces (including the root).
\+ gen_enforced_field(WorkspaceCwd, 'name', null).

% "description" is required for all workspaces.
\+ gen_enforced_field(WorkspaceCwd, 'description', null).

% "repository.type" must be "git" for all workspaces (including the root).
gen_enforced_field(WorkspaceCwd, 'repository.type', 'git').

% "repository.url" must be "https://github.com/MetaMask/controllers.git" for all
% workspaces (including the root).
gen_enforced_field(WorkspaceCwd, 'repository.url', 'https://github.com/MetaMask/controllers.git').

% "license" must be "MIT" for all publishable workspaces and unset for the
% root.
gen_enforced_field(WorkspaceCwd, 'license', 'MIT') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'license', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "main" must be "dist/index.js" for publishable workspaces and unset for the
% root.
gen_enforced_field(WorkspaceCwd, 'main', './dist/index.js') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'main', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "types" must be "dist/index.d.ts" for publishable workspaces and unset for the
% root.
gen_enforced_field(WorkspaceCwd, 'types', './dist/index.d.ts') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'types', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "files" must be ["dist/"] for publishable workspaces and unset for the root.
gen_enforced_field(WorkspaceCwd, 'files', ['dist/']) :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'files', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "engines.node" must be ">=14.0.0" for all workspaces.
gen_enforced_field(WorkspaceCwd, 'engines.node', '>=14.0.0').

% "publishConfig.access" must be "public" for publishable workspaces and unset
% for the root.
gen_enforced_field(WorkspaceCwd, 'publishConfig.access', 'public') :-
  \+ workspace_field(WorkspaceCwd, 'private', true).
gen_enforced_field(WorkspaceCwd, 'publishConfig.access', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "publishConfig.registry" must be "https://registry.npmjs.org" for publishable
% workspaces and unset for the root.
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
