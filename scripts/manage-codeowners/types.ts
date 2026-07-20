/**
 * A single CODEOWNERS rule: a file pattern and the owners responsible for it.
 */
export type CodeownersRule = {
  /**
   * The file pattern matched by the rule.
   */
  pattern: string;

  /**
   * The GitHub owners assigned to the pattern.
   */
  owners: string[];
};

/**
 * A group of CODEOWNERS rules rendered together under an optional heading.
 * Sections are generally tied to the team(s) responsible for the patterns
 * within them.
 */
export type CodeownersSection = {
  /**
   * The heading rendered above the section's rules. Omit this for rules that
   * apply repository-wide and should not be grouped under a team heading.
   */
  title?: string;

  /**
   * The rules that belong to this section.
   */
  rules: CodeownersRule[];
};
