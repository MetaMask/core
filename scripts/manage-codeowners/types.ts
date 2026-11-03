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

  /**
   * The teams whose approval is actually expected for the matched files, for
   * files that the Core Platform team co-owns in every package.
   *
   * Core Platform co-owns certain files in each package, such as changelogs
   * and manifests, so that it can maintain them across the monorepo. Changing
   * them doesn't require Core Platform's approval, though; the package's own
   * teams can approve. This is set to those teams, even when they include Core
   * Platform, so that tools like `create-codeownership-summary` can tell
   * engineers whom to ask for review. It doesn't affect the generated
   * CODEOWNERS file.
   */
  primaryOwners?: string[];
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

  /**
   * Nested sections rendered below this section's rules.
   */
  subsections?: CodeownersSection[];
};

/**
 * Metadata about a package used to generate its CODEOWNERS rules.
 */
export type PackageInfo = {
  /**
   * The GitHub teams that own the package's top-level directory.
   */
  teams: string[];

  /**
   * The package directory's path under the wallet initialization instances.
   */
  initializationPath?: string;
};

/**
 * The declarative configuration used to generate CODEOWNERS.
 */
export type CodeownersConfig = {
  /**
   * Package ownership metadata keyed by package directory name.
   */
  packages: Record<string, PackageInfo>;

  /**
   * Rules that are emitted last so that they take precedence over generated
   * package rules.
   */
  overrides: CodeownersRule[];
};
