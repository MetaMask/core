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

% All dependency ranges must be synchronized across the monorepo (the highest
% one wins).
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, DependencyRange2, DependencyType1) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange1, DependencyType1),
  workspace_has_dependency(OtherWorkspaceCwd, DependencyIdent, DependencyRange2, DependencyType2),
  DependencyRange1 @< DependencyRange2.

% If a dependency is listed under "dependencies", it should not be listed under
% any other "*dependencies" lists. We match on the same dependency range so that
% if a dependency is listed twice in the same manifest, their versions are
% synchronized and then this constraint will apply and remove the "right"
% duplicate.
gen_enforced_dependency(WorkspaceCwd, DependencyIdent, null, DependencyType) :-
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, 'dependencies'),
  workspace_has_dependency(WorkspaceCwd, DependencyIdent, DependencyRange, DependencyType),
  DependencyType \= 'dependencies'.
