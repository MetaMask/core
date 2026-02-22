import type { MessengerItemDoc, NamespaceGroup } from './types';

/**
 * Generate markdown documentation for a single messenger item.
 *
 * @param item - The messenger item to document.
 * @param clientMode - Whether we are generating docs from a client's dependency tree.
 * @returns The generated markdown string.
 */
export function generateItemMarkdown(
  item: MessengerItemDoc,
  clientMode: boolean,
): string {
  const parts: string[] = [];

  parts.push(`### \`${item.typeString}\``);
  parts.push('');

  if (item.deprecated) {
    parts.push('> **Deprecated**');
    parts.push('');
  }

  if (clientMode) {
    const pkgMatch = item.sourceFile.match(/node_modules\/(@metamask\/[^/]+)/u);
    const pkgName = pkgMatch ? pkgMatch[1] : item.sourceFile;
    const npmUrl = `https://www.npmjs.com/package/${pkgName}`;
    parts.push(`**Package**: [\`${pkgName}\`](${npmUrl})`);
  } else {
    const ghUrl = `https://github.com/MetaMask/core/blob/main/${item.sourceFile}#L${item.line}`;
    parts.push(`**Source**: [${item.sourceFile}:${item.line}](${ghUrl})`);
  }
  parts.push('');

  if (item.jsDoc) {
    // Strip any @deprecated line from displayed doc (already shown as badge)
    const docText = item.jsDoc
      .split('\n')
      .filter((line) => !line.trim().startsWith('@deprecated'))
      .join('\n')
      .trim();
    if (docText) {
      parts.push(docText);
      parts.push('');
    }
  }

  const label = item.kind === 'action' ? 'Handler' : 'Payload';
  parts.push(`**${label}**:`);
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
 * @param clientMode - Whether we are generating docs from a client's dependency tree.
 * @returns The generated markdown string.
 */
export function generateNamespacePage(
  ns: NamespaceGroup,
  kind: 'action' | 'event',
  clientMode: boolean,
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
    parts.push(generateItemMarkdown(item, clientMode));
    parts.push('---');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Generate the index/overview page listing all namespaces.
 *
 * @param namespaces - All namespace groups sorted alphabetically.
 * @param clientName - Optional client name for client-mode docs.
 * @returns The generated markdown string.
 */
export function generateIndexPage(
  namespaces: NamespaceGroup[],
  clientName?: string,
): string {
  const totalActions = namespaces.reduce(
    (sum, ns) => sum + ns.actions.length,
    0,
  );
  const totalEvents = namespaces.reduce((sum, ns) => sum + ns.events.length, 0);

  const parts: string[] = [];
  if (clientName) {
    parts.push('---');
    parts.push(`title: "${clientName} Messenger API Reference"`);
    parts.push('slug: "/"');
    parts.push('---');
    parts.push('');
    parts.push(`# ${clientName} Messenger API`);
    parts.push('');
    parts.push(
      `This site documents every action and event available in the \`${clientName}\` dependency tree — the type-safe message bus used across all controllers.`,
    );
  } else {
    parts.push('---');
    parts.push('title: "Messenger API Reference"');
    parts.push('slug: "/"');
    parts.push('---');
    parts.push('');
    parts.push('# MetaMask Core Messenger API');
    parts.push('');
    parts.push(
      'This site documents every action and event registered on the Messenger — the type-safe message bus used across all controllers in `@metamask/core`.',
    );
  }
  parts.push('');
  parts.push(`- **${namespaces.length}** namespaces`);
  parts.push(`- **${totalActions}** actions`);
  parts.push(`- **${totalEvents}** events`);
  parts.push('');
  parts.push('## Namespaces');
  parts.push('');
  parts.push('| Namespace | Actions | Events |');
  parts.push('|-----------|---------|--------|');

  for (const ns of namespaces) {
    const link = ns.namespace;
    parts.push(
      `| [${ns.namespace}](${link}/actions) | ${ns.actions.length} | ${ns.events.length} |`,
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

  return `// This file is auto-generated by scripts/generate-messenger-docs\n// Do not edit manually.\nconst sidebars = ${JSON.stringify(sidebar, null, 2)};\nexport default sidebars;\n`;
}
