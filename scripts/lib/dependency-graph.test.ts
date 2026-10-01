import type { Workspace } from './dependency-graph.js';
import {
  buildMermaidConnectionLines,
  buildMermaidNodeLines,
} from './dependency-graph.js';

/**
 * Builds a workspace entry as `yarn workspaces list --verbose` reports it.
 *
 * @param name - The package name, without the `@metamask/` prefix.
 * @param dependencies - The names of the package's workspace dependencies,
 * without the `@metamask/` prefix.
 * @returns The workspace entry.
 */
function buildWorkspace(name: string, dependencies: string[]): Workspace {
  return {
    name: `@metamask/${name}`,
    location: `packages/${name}`,
    workspaceDependencies: dependencies.map(
      (dependency) => `packages/${dependency}`,
    ),
  };
}

describe('buildMermaidNodeLines', () => {
  it('defines a node for each workspace', () => {
    const workspaces = [
      buildWorkspace('foo-controller', []),
      buildWorkspace('bar', []),
    ];

    expect(buildMermaidNodeLines(workspaces)).toStrictEqual([
      'foo_controller(["@metamask/foo-controller"]);',
      'bar(["@metamask/bar"]);',
    ]);
  });
});

describe('buildMermaidConnectionLines', () => {
  it('draws an edge for each direct dependency', () => {
    const workspaces = [
      buildWorkspace('a', ['b']),
      buildWorkspace('b', ['c']),
      buildWorkspace('c', []),
    ];

    expect(buildMermaidConnectionLines(workspaces)).toStrictEqual([
      'a --> b;',
      'b --> c;',
    ]);
  });

  it('omits dependencies already reachable through another dependency', () => {
    const workspaces = [
      buildWorkspace('a', ['b', 'c']),
      buildWorkspace('b', ['c']),
      buildWorkspace('c', []),
    ];

    expect(buildMermaidConnectionLines(workspaces)).toStrictEqual([
      'a --> b;',
      'b --> c;',
    ]);
  });

  it('omits dependencies reachable through a longer path', () => {
    const workspaces = [
      buildWorkspace('a', ['b', 'd']),
      buildWorkspace('b', ['c']),
      buildWorkspace('c', ['d']),
      buildWorkspace('d', []),
    ];

    expect(buildMermaidConnectionLines(workspaces)).toStrictEqual([
      'a --> b;',
      'b --> c;',
      'c --> d;',
    ]);
  });

  it('keeps dependencies that are not reachable any other way', () => {
    const workspaces = [
      buildWorkspace('a', ['b', 'c']),
      buildWorkspace('b', []),
      buildWorkspace('c', []),
    ];

    expect(buildMermaidConnectionLines(workspaces)).toStrictEqual([
      'a --> b;',
      'a --> c;',
    ]);
  });

  it('converts dashes in package names to underscores', () => {
    const workspaces = [
      buildWorkspace('foo-controller', ['bar-utils']),
      buildWorkspace('bar-utils', []),
    ];

    expect(buildMermaidConnectionLines(workspaces)).toStrictEqual([
      'foo_controller --> bar_utils;',
    ]);
  });

  it('terminates when dependencies form a cycle', () => {
    const workspaces = [
      buildWorkspace('a', ['b']),
      buildWorkspace('b', ['a']),
    ];

    expect(buildMermaidConnectionLines(workspaces)).toStrictEqual([
      'a --> b;',
      'b --> a;',
    ]);
  });

  it('ignores dependencies on workspaces that are not in the list', () => {
    const workspaces = [buildWorkspace('a', ['private-package'])];

    expect(buildMermaidConnectionLines(workspaces)).toStrictEqual([
      'a --> private_package;',
    ]);
  });
});
