import type { CodeownersSection } from './types.js';

/**
 * Renders a section in the CODEOWNERS file. This can either be a team section,
 * a package section, or an overrides section.
 *
 * A team section is a series of package sections (i.e., it has subsections). An
 * overrides section is like a package section (except it's listed last in the
 * CODEOWNERS file). A package/overrides section is a series of rules, where
 * each rule has a glob pattern followed by the teams or users that own the
 * files or directories which match that pattern. For each rule, there will be
 * four spaces between the pattern and owners.
 *
 * @param section - The section to render.
 * @param headingLevel - The Markdown heading level to use.
 * @returns The rendered section.
 */
export function renderCodeownersSection(
  section: CodeownersSection,
  headingLevel = 2,
): string {
  const blocks = [renderHeading(section, headingLevel)];
  const { rules } = section;

  if (rules.length > 0) {
    const patternLengthWithPadding =
      Math.max(...rules.map((rule) => rule.pattern.length)) + 4;
    blocks.push(
      rules
        .map(
          (rule) =>
            rule.pattern.padEnd(patternLengthWithPadding) +
            rule.owners.join(' '),
        )
        .join('\n'),
    );
  }

  if (section.subsections !== undefined) {
    blocks.push(
      ...section.subsections.map((subsection) =>
        renderCodeownersSection(subsection, headingLevel + 1),
      ),
    );
  }

  const separator =
    section.title === 'Overrides' || section.subsections !== undefined
      ? '\n\n'
      : '\n';
  return blocks.join(separator);
}

/**
 * Renders a section heading.
 *
 * A team section will have an underlined header above it; a package section
 * will have a header prefixed with `###`.
 *
 * @param section - The section whose heading should be rendered.
 * @param headingLevel - The heading level to use.
 * @returns The rendered heading.
 */
function renderHeading(
  section: CodeownersSection,
  headingLevel: number,
): string {
  if (headingLevel === 2) {
    const heading = `# ${section.title}`;
    return `${heading}\n# ${'-'.repeat(heading.length - 2)}`;
  }

  return `${'#'.repeat(headingLevel)} ${section.title}`;
}
