% "name" is required for all workspaces (including the root).
\+ gen_enforced_field(WorkspaceCwd, 'name', null).

% "description" is required for all workspaces.
\+ gen_enforced_field(WorkspaceCwd, 'description', null).

% "repository" must be unset for non-publishable workspaces.
gen_enforced_field(WorkspaceCwd, 'repository', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "repository.type" must be "git" for publishable workspaces.
gen_enforced_field(WorkspaceCwd, 'repository.type', 'git') :-
  workspace_field(WorkspaceCwd, 'private', null).

% "repository.type" must start with "git@github.com:mcmire/" for publishable
% workspaces.
% TODO
%atom_starts_with(Atom, Prefix) :-
  %sub_atom(Atom, _, _, _, Prefix).
%gen_enforced_field(WorkspaceCwd, 'repository.url', RepoUrl) :-
  %\+ workspace_field(WorkspaceCwd, 'private', true),
  %atom_starts_with(RepoUrl, 'git@github.com:mcmire/').

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

% "engines.node" must be ">=12.0.0" for all workspaces.
gen_enforced_field(WorkspaceCwd, 'engines.node', '>=12.0.0').

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

% The version of Jest used in the root must be synchronized across all packages
% that list Jest.
gen_enforced_dependency(WorkspaceCwd, 'jest', DependencyRange, DependencyType) :-
  workspace_has_dependency('.', 'jest', DependencyRange, DependencyType),
  workspace_has_dependency(WorkspaceCwd, 'jest', _, DependencyType),
  WorkspaceCwd \= '.'.
