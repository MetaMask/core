import type { MessengerCapabilityPacket, NamespaceGroup } from './types';

/**
 * Convert backtick-quoted action/event names in text into links when they
 * match a known item in the same namespace. For example, `` `setActiveNetwork` ``
 * becomes a link to `#networkcontrollersetactivenetwork` on the actions page.
 *
 * @param text - The markdown text to process.
 * @param namespace - The current namespace (e.g. "NetworkController").
 * @param knownNames - Map from short name (e.g. "setActiveNetwork") to the page-relative path and anchor.
 * @returns The text with backtick references replaced by links.
 */
function linkifyReferences(
  text: string,
  namespace: string,
  knownNames: Map<string, string>,
): string {
  return text.replace(/`([a-zA-Z]\w*)`/gu, (match, name: string) => {
    const link = knownNames.get(name);
    if (link) {
      return `[\`${name}\`](${link})`;
    }
    // Also try with namespace prefix (e.g. "NetworkController:setActiveNetwork")
    const fullName = `${namespace}:${name}`;
    const anchor = fullName.toLowerCase().replace(/[^a-z0-9]/gu, '');
    const linkFull = knownNames.get(fullName);
    if (linkFull) {
      return `[\`${name}\`](${linkFull})`;
    }
    // Check if the anchor matches exactly in known names values
    for (const [, href] of knownNames) {
      if (href.endsWith(`#${anchor}`)) {
        return `[\`${name}\`](${href})`;
      }
    }
    return match;
  });
}

/**
 * Generate markdown documentation for a single messenger item.
 *
 * @param item - The messenger item to document.
 * @param namespace - The current namespace.
 * @param knownNames - Map from short/full names to their link paths.
 * @param repoBaseUrl - Optional GitHub blob base URL (e.g. "https://github.com/Owner/Repo/blob/sha/").
 * @returns The generated markdown string.
 */
export function generateItemMarkdown(
  item: MessengerCapabilityPacket,
  namespace: string,
  knownNames: Map<string, string>,
  repoBaseUrl: string | null,
): string {
  const parts: string[] = [];

  parts.push(`### \`${item.typeString}\``);
  parts.push('');

  if (item.deprecated) {
    parts.push('> **Deprecated**');
    parts.push('');
  }

  // For sources scanned out of an @metamask/*/dist directory we render an
  // npm link, since the original .ts paths are not part of the repo we're
  // documenting. Other `node_modules/` paths fall through to the normal
  // source-link branches.
  const metamaskPkgMatch = item.sourceFile.match(
    /node_modules\/(@metamask\/[^/]+)/u,
  );
  if (metamaskPkgMatch) {
    const pkgName = metamaskPkgMatch[1];
    const npmUrl = `https://www.npmjs.com/package/${pkgName}`;
    parts.push(`**Package**: [\`${pkgName}\`](${npmUrl})`);
  } else if (repoBaseUrl) {
    const ghUrl = `${repoBaseUrl}${item.sourceFile}#L${item.line}`;
    parts.push(`**Source**: [${item.sourceFile}:${item.line}](${ghUrl})`);
  } else {
    parts.push(`**Source**: \`${item.sourceFile}:${item.line}\``);
  }
  parts.push('');

  if (item.jsDoc) {
    parts.push(linkifyReferences(item.jsDoc, namespace, knownNames));
    parts.push('');
  }

  // Only actions get a parameters table — events carry a positional tuple
  // payload, not named arguments, so a `@param` table doesn't fit.
  if (item.kind === 'action' && item.params.length > 0) {
    parts.push('**Parameters**:');
    parts.push('');
    parts.push('| Name | Description |');
    parts.push('|------|-------------|');
    for (const param of item.params) {
      const description = linkifyReferences(
        param.description,
        namespace,
        knownNames,
      );
      parts.push(`| \`${param.name}\` | ${description} |`);
    }
    parts.push('');
  }

  if (item.kind === 'action' && item.returns) {
    parts.push(
      `**Returns**: ${linkifyReferences(item.returns, namespace, knownNames)}`,
    );
    parts.push('');
  }

  const signatureLabel = item.kind === 'action' ? 'Handler' : 'Payload';
  parts.push(`**${signatureLabel} signature**:`);
  parts.push('');
  parts.push('```typescript');
  parts.push(item.handlerOrPayload);
  parts.push('```');
  parts.push('');

  return parts.join('\n');
}

/**
 * Generate a full markdown page for a namespace's actions or events.
 *
 * @param ns - The namespace group to generate a page for.
 * @param kind - Whether to generate the actions or events page.
 * @param repoBaseUrl - Optional GitHub blob base URL for source links.
 * @returns The generated markdown string.
 */
export function generateNamespacePage(
  ns: NamespaceGroup,
  kind: 'action' | 'event',
  repoBaseUrl: string | null = null,
): string {
  const items = kind === 'action' ? ns.actions : ns.events;
  const title = kind === 'action' ? 'Actions' : 'Events';
  const parts: string[] = [];

  parts.push('---');
  parts.push(`title: "${ns.namespace} ${title}"`);
  parts.push(`sidebar_label: "${title}"`);
  parts.push('---');
  parts.push('');
  parts.push(`# ${ns.namespace} ${title}`);
  parts.push('');

  if (items.length === 0) {
    parts.push(`_No ${kind}s found for this namespace._`);
    parts.push('');
    return parts.join('\n');
  }

  parts.push(
    `${items.length} ${kind}${items.length === 1 ? '' : 's'} registered.`,
  );
  parts.push('');

  // Build a map of known names → link paths for cross-referencing.
  // Actions on same page get #anchor, actions/events on sibling page get relative path.
  const knownNames = new Map<string, string>();
  for (const action of ns.actions) {
    const shortName = action.typeString.split(':')[1];
    const anchor = action.typeString.toLowerCase().replace(/[^a-z0-9]/gu, '');
    const href = kind === 'action' ? `#${anchor}` : `./actions#${anchor}`;
    knownNames.set(shortName, href);
    knownNames.set(action.typeString, href);
  }
  for (const event of ns.events) {
    const shortName = event.typeString.split(':')[1];
    const anchor = event.typeString.toLowerCase().replace(/[^a-z0-9]/gu, '');
    const href = kind === 'event' ? `#${anchor}` : `./events#${anchor}`;
    knownNames.set(shortName, href);
    knownNames.set(event.typeString, href);
  }

  // Table of contents
  parts.push('| Name | Deprecated |');
  parts.push('|------|-----------|');
  for (const item of items) {
    const name = item.typeString.split(':')[1];
    // Docusaurus uses github-slugger: strips non-alphanumeric, lowercases, no dashes for special chars in code spans
    const anchor = item.typeString.toLowerCase().replace(/[^a-z0-9]/gu, '');
    const dep = item.deprecated ? 'Yes' : '';
    parts.push(`| [\`${name}\`](#${anchor}) | ${dep} |`);
  }
  parts.push('');
  parts.push('---');
  parts.push('');

  for (const item of items) {
    parts.push(
      generateItemMarkdown(item, ns.namespace, knownNames, repoBaseUrl),
    );
    parts.push('---');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Options controlling how {@link generateIndexPage} renders the index header.
 */
export type IndexPageOptions = {
  /**
   * Short label identifying the project the docs were generated from (e.g.
   * "Core", "Extension"). When provided, the title is rendered as
   * `Platform API (Core)`.
   */
  projectLabel?: string | null;
  /**
   * Git commit SHA the docs were generated from. When provided, it's shown
   * in the intro so engineers know how current the site is.
   */
  commitSha?: string | null;
};

/**
 * Generate the index/overview page listing all namespaces.
 *
 * @param namespaces - All namespace groups sorted alphabetically.
 * @param options - Optional project label and commit SHA to stamp in the header.
 * @returns The generated markdown string.
 */
export function generateIndexPage(
  namespaces: NamespaceGroup[],
  options: IndexPageOptions = {},
): string {
  const totalActions = namespaces.reduce(
    (sum, ns) => sum + ns.actions.length,
    0,
  );
  const totalEvents = namespaces.reduce((sum, ns) => sum + ns.events.length, 0);
  const projectSuffix = options.projectLabel
    ? ` (${options.projectLabel})`
    : '';

  const parts: string[] = [];
  parts.push('---');
  parts.push(`title: "Platform API${projectSuffix} Reference"`);
  parts.push('slug: "/"');
  parts.push('---');
  parts.push('');
  parts.push(`# Platform API${projectSuffix}`);
  parts.push('');
  parts.push(
    'This site documents every action and event registered on the Messenger — the type-safe message bus used across all controllers.',
  );
  parts.push('');
  if (options.commitSha) {
    parts.push(`Generated from commit \`${options.commitSha}\`.`);
    parts.push('');
  }
  parts.push(`- **${namespaces.length}** namespaces`);
  parts.push(`- **${totalActions}** actions`);
  parts.push(`- **${totalEvents}** events`);
  parts.push('');
  parts.push('## Namespaces');
  parts.push('');
  parts.push('| Namespace | Actions | Events |');
  parts.push('|-----------|---------|--------|');

  for (const ns of namespaces) {
    const firstLink =
      ns.actions.length > 0
        ? `${ns.namespace}/actions`
        : `${ns.namespace}/events`;
    parts.push(
      `| [${ns.namespace}](${firstLink}) | ${ns.actions.length} | ${ns.events.length} |`,
    );
  }

  parts.push('');
  return parts.join('\n');
}

/**
 * Generate the sidebars.ts file content for Docusaurus.
 *
 * @param namespaces - All namespace groups sorted alphabetically.
 * @returns The generated TypeScript source string.
 */
export function generateSidebars(namespaces: NamespaceGroup[]): string {
  const items = namespaces.map((ns) => ({
    type: 'category',
    label: ns.namespace,
    items: [
      ...(ns.actions.length > 0 ? [`${ns.namespace}/actions`] : []),
      ...(ns.events.length > 0 ? [`${ns.namespace}/events`] : []),
    ],
  }));

  const sidebar = {
    messengerSidebar: [
      {
        type: 'doc',
        id: 'index',
        label: 'Overview',
      },
      ...items,
    ],
  };

  return `// This file is auto-generated by @metamask/platform-api-docs\n// Do not edit manually.\nconst sidebars = ${JSON.stringify(
    sidebar,
    null,
    2,
  )};\nexport default sidebars;\n`;
}
