%atom_starts_with(Atom, Prefix) :-
  %sub_atom(Atom, _, _, _, Prefix).

% "name" is required for all workspaces (including the root).
\+ gen_enforced_field(WorkspaceCwd, 'name', null).

% "description" is required for all workspaces.
\+ gen_enforced_field(WorkspaceCwd, 'description', null).

% "repository" must be unset for the root workspace.
gen_enforced_field(WorkspaceCwd, 'repository', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "repository.type" must be "git" for publishable workspaces.
gen_enforced_field(WorkspaceCwd, 'repository.type', 'git') :-
  workspace_field(WorkspaceCwd, 'private', false).

% "repository.type" must start with "git@github.com:mcmire/" for publishable workspaces.
%gen_enforced_field(WorkspaceCwd, 'repository.url', RepoUrl) :-
  %\+ workspace_field(WorkspaceCwd, 'private', true),
  %atom_starts_with(RepoUrl, 'git@github.com:mcmire/').

% "main" must be "dist/index.js" for publishable workspaces
% and unset for the root.
gen_enforced_field(WorkspaceCwd, 'main', 'dist/index.js') :-
  workspace_field(WorkspaceCwd, 'private', false).
gen_enforced_field(WorkspaceCwd, 'main', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "types" must be "dist/index.d.ts" for publishable workspaces
% and unset for the root.
gen_enforced_field(WorkspaceCwd, 'types', 'dist/index.d.ts') :-
  workspace_field(WorkspaceCwd, 'private', false).
gen_enforced_field(WorkspaceCwd, 'types', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "files" must be ["dist/"] for publishable workspaces
% and unset for the root.
gen_enforced_field(WorkspaceCwd, 'files', ['dist/']) :-
  workspace_field(WorkspaceCwd, 'private', false).
gen_enforced_field(WorkspaceCwd, 'files', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "engines.node" must be ">=14.0.0" for all workspaces.
gen_enforced_field(WorkspaceCwd, 'engines.node', '>=14.0.0').

% "publishConfig.access" must be "public" for publishable workspaces
% and unset for the root.
gen_enforced_field(WorkspaceCwd, 'publishConfig.access', 'public') :-
  workspace_field(WorkspaceCwd, 'private', false).
gen_enforced_field(WorkspaceCwd, 'publishConfig.access', null) :-
  workspace_field(WorkspaceCwd, 'private', true).

% "publishConfig.registry" must be "https://registry.npmjs.org" for publishable workspaces
% and unset for the root.
gen_enforced_field(WorkspaceCwd, 'publishConfig.registry', 'https://registry.npmjs.org') :-
  workspace_field(WorkspaceCwd, 'private', false).
gen_enforced_field(WorkspaceCwd, 'publishConfig.registry', null) :-
  workspace_field(WorkspaceCwd, 'private', true).
