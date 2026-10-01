export type Workspace = {
  location: string;
  name: string;
  workspaceDependencies: string[];
};

/**
 * Converts a package name or workspace location into an identifier that Mermaid
 * accepts as a node name.
 *
 * @param nameOrLocation - A package name (`@metamask/foo-bar`) or a workspace
 * location (`packages/foo-bar`).
 * @returns The Mermaid node name (`foo_bar`).
 */
function buildNodeName(nameOrLocation: string): string {
  return nameOrLocation
    .replace(/^(?:@metamask|packages)\//u, '')
    .replace(/-/gu, '_');
}

/**
 * Generates the Markdown fragment that represents a Mermaid graph of the
 * dependencies between the workspace packages in this project.
 *
 * @param workspaces - The Yarn workspaces inside of this project.
 * @returns The new dependency graph Markdown fragment.
 */
export function generateDependencyGraph(workspaces: Workspace[]): string {
  return [
    '```mermaid',
    "%%{ init: { 'flowchart': { 'curve': 'bumpX' } } }%%",
    'graph LR;',
    'linkStyle default opacity:0.5',
    ...buildMermaidNodeLines(workspaces).map((line) => `  ${line}`),
    ...buildMermaidConnectionLines(workspaces).map((line) => `  ${line}`),
    '```',
  ].join('\n');
}

/**
 * Builds a piece of the Mermaid graph by defining a node for each workspace
 * package within this project.
 *
 * @param workspaces - The Yarn workspaces inside of this project.
 * @returns A set of lines that will go into the final Mermaid graph.
 */
export function buildMermaidNodeLines(workspaces: Workspace[]): string[] {
  return workspaces.map(
    (workspace) => `${buildNodeName(workspace.name)}(["${workspace.name}"]);`,
  );
}

/**
 * Builds a piece of the Mermaid graph by defining connections between nodes
 * that correspond to dependencies between workspace packages within this
 * project.
 *
 * Only direct dependencies that aren't already reachable through another direct
 * dependency are drawn (a transitive reduction). This keeps the graph legible
 * and under GitHub's 500-edge rendering limit, which cannot be raised from
 * within the diagram itself.
 *
 * @param workspaces - The Yarn workspaces inside of this project.
 * @returns A set of lines that will go into the final Mermaid graph.
 */
export function buildMermaidConnectionLines(workspaces: Workspace[]): string[] {
  const dependenciesByLocation = new Map(
    workspaces.map((workspace) => [
      workspace.location,
      workspace.workspaceDependencies,
    ]),
  );
  const reachableCache = new Map<string, Set<string>>();

  /**
   * Collects every workspace reachable from the given one by following
   * dependencies.
   *
   * @param location - The workspace location to start from.
   * @returns The locations of all workspaces reachable from it.
   */
  function reachableFrom(location: string): Set<string> {
    const cached = reachableCache.get(location);
    if (cached) {
      return cached;
    }
    // The set is cached before recursing so that a dependency cycle terminates.
    const reachable = new Set<string>();
    reachableCache.set(location, reachable);
    for (const dependency of dependenciesByLocation.get(location) ?? []) {
      reachable.add(dependency);
      for (const transitive of reachableFrom(dependency)) {
        reachable.add(transitive);
      }
    }
    return reachable;
  }

  return workspaces.flatMap((workspace) => {
    const dependencies = workspace.workspaceDependencies;
    return dependencies
      .filter(
        (dependency) =>
          !dependencies.some(
            (other) =>
              other !== dependency && reachableFrom(other).has(dependency),
          ),
      )
      .map(
        (dependency) =>
          `${buildNodeName(workspace.name)} --> ${buildNodeName(dependency)};`,
      );
  });
}
