import execa from 'execa';
import { promises as fs } from 'fs';

import {
  findConflictedChangelogFiles,
  mergeChangelogs,
  readGitBlob,
  resolveChangelogConflicts,
  resolvePackageMetadata,
} from './changelog-conflicts.js';

jest.mock('execa');

const REPO_URL = 'https://github.com/MetaMask/core';
const TAG_PREFIX = '@metamask/example@';

/**
 * Build minimal changelog content with the given `## [Unreleased]` body.
 *
 * @param unreleasedBody - The Markdown to place under `## [Unreleased]`.
 * @returns The changelog content.
 */
function buildChangelog(unreleasedBody: string): string {
  return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

${unreleasedBody}

## [1.0.0]

### Added

- Initial release ([#1](${REPO_URL}/pull/1))

[Unreleased]: ${REPO_URL}/compare/${TAG_PREFIX}1.0.0...HEAD
[1.0.0]: ${REPO_URL}/releases/tag/${TAG_PREFIX}1.0.0
`;
}

describe('changelog-conflicts', () => {
  describe('mergeChangelogs', () => {
    it('takes the union of distinct entries added on each side, preserving order', async () => {
      const oursContent = buildChangelog(
        `### Added

- Added ours entry ([#10](${REPO_URL}/pull/10))`,
      );
      const theirsContent = buildChangelog(
        `### Added

- Added theirs entry ([#11](${REPO_URL}/pull/11))`,
      );

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(1);
      const addedIndex = content.indexOf('### Added');
      const oursIndex = content.indexOf('Added ours entry');
      const theirsIndex = content.indexOf('Added theirs entry');
      expect(addedIndex).toBeGreaterThan(-1);
      expect(oursIndex).toBeGreaterThan(addedIndex);
      expect(theirsIndex).toBeGreaterThan(oursIndex);
    });

    it('does not duplicate an entry that both sides added (identified by PR number)', async () => {
      const sharedEntry = `- Added shared entry ([#20](${REPO_URL}/pull/20))`;
      const oursContent = buildChangelog(`### Added

${sharedEntry}`);
      const theirsContent = buildChangelog(`### Added

${sharedEntry}`);

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(0);
      expect(content.match(/Added shared entry/gu)).toHaveLength(1);
    });

    it('does not duplicate an entry with no PR number that both sides added (identified by description)', async () => {
      const sharedEntry = '- Added shared entry with no PR number';
      const oursContent = buildChangelog(`### Added

${sharedEntry}`);
      const theirsContent = buildChangelog(`### Added

${sharedEntry}`);

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(0);
      expect(
        content.match(/Added shared entry with no PR number/gu),
      ).toHaveLength(1);
    });

    it('keeps distinct entries that share the same PR number', async () => {
      const sharedEntry = `- Added shared entry ([#20](${REPO_URL}/pull/20))`;
      const oursContent = buildChangelog(`### Added

${sharedEntry}
- Added a second, distinct entry from the same PR ([#20](${REPO_URL}/pull/20))`);
      const theirsContent = buildChangelog(`### Added

${sharedEntry}`);

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(0);
      expect(content.match(/Added shared entry/gu)).toHaveLength(1);
      expect(content).toContain(
        'Added a second, distinct entry from the same PR',
      );
    });

    it('inserts a new breaking entry below existing breaking entries, above non-breaking ones', async () => {
      const oursContent = buildChangelog(
        `### Changed

- **BREAKING:** Ours existing breaking entry ([#31](${REPO_URL}/pull/31))
- Ours existing non-breaking entry ([#32](${REPO_URL}/pull/32))`,
      );
      const theirsContent = buildChangelog(
        `### Changed

- **BREAKING:** Theirs breaking entry ([#30](${REPO_URL}/pull/30))`,
      );

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(1);
      const existingBreakingIndex = content.indexOf(
        'Ours existing breaking entry',
      );
      const newBreakingIndex = content.indexOf('Theirs breaking entry');
      const nonBreakingIndex = content.indexOf(
        'Ours existing non-breaking entry',
      );
      expect(existingBreakingIndex).toBeLessThan(newBreakingIndex);
      expect(newBreakingIndex).toBeLessThan(nonBreakingIndex);
    });

    it('merges in a category that only exists on one side', async () => {
      const oursContent = buildChangelog(
        `### Fixed

- Fixed ours entry ([#40](${REPO_URL}/pull/40))`,
      );
      const theirsContent = buildChangelog(
        `### Added

- Added theirs entry ([#41](${REPO_URL}/pull/41))`,
      );

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(1);
      expect(content).toContain('### Fixed');
      expect(content).toContain('Fixed ours entry');
      expect(content).toContain('### Added');
      expect(content).toContain('Added theirs entry');
    });

    it('merges in a release version that only exists on one side', async () => {
      const theirsContent = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Added

- Added in 2.0.0 ([#50](${REPO_URL}/pull/50))

## [1.0.0]

### Added

- Initial release ([#1](${REPO_URL}/pull/1))

[Unreleased]: ${REPO_URL}/compare/${TAG_PREFIX}2.0.0...HEAD
[2.0.0]: ${REPO_URL}/compare/${TAG_PREFIX}1.0.0...${TAG_PREFIX}2.0.0
[1.0.0]: ${REPO_URL}/releases/tag/${TAG_PREFIX}1.0.0
`;
      const oursContent = buildChangelog('');

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(1);
      expect(content).toContain('## [2.0.0]');
      expect(content).toContain('Added in 2.0.0');
    });

    it('appends a new release version that is older than every existing release', async () => {
      const theirsContent = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Added

- Added in 2.0.0 ([#50](${REPO_URL}/pull/50))

## [0.5.0]

### Added

- Added in 0.5.0 ([#51](${REPO_URL}/pull/51))

[Unreleased]: ${REPO_URL}/compare/${TAG_PREFIX}2.0.0...HEAD
[2.0.0]: ${REPO_URL}/compare/${TAG_PREFIX}0.5.0...${TAG_PREFIX}2.0.0
[0.5.0]: ${REPO_URL}/releases/tag/${TAG_PREFIX}0.5.0
`;
      const oursContent = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Added

- Added in 2.0.0 ([#50](${REPO_URL}/pull/50))

[Unreleased]: ${REPO_URL}/compare/${TAG_PREFIX}2.0.0...HEAD
[2.0.0]: ${REPO_URL}/releases/tag/${TAG_PREFIX}2.0.0
`;

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(1);
      const version2Index = content.indexOf('## [2.0.0]');
      const version05Index = content.indexOf('## [0.5.0]');
      expect(version2Index).toBeLessThan(version05Index);
    });

    it('inserts a new release version into its correct descending-SemVer position, not just at the start or end', async () => {
      const theirsContent = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]

### Added

- Added in 3.0.0 ([#60](${REPO_URL}/pull/60))

## [2.0.0]

### Added

- Added in 2.0.0 ([#61](${REPO_URL}/pull/61))

## [1.0.0]

### Added

- Initial release ([#1](${REPO_URL}/pull/1))

[Unreleased]: ${REPO_URL}/compare/${TAG_PREFIX}3.0.0...HEAD
[3.0.0]: ${REPO_URL}/compare/${TAG_PREFIX}2.0.0...${TAG_PREFIX}3.0.0
[2.0.0]: ${REPO_URL}/compare/${TAG_PREFIX}1.0.0...${TAG_PREFIX}2.0.0
[1.0.0]: ${REPO_URL}/releases/tag/${TAG_PREFIX}1.0.0
`;
      const oursContent = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]

### Added

- Added in 3.0.0 ([#60](${REPO_URL}/pull/60))

## [1.0.0]

### Added

- Initial release ([#1](${REPO_URL}/pull/1))

[Unreleased]: ${REPO_URL}/compare/${TAG_PREFIX}3.0.0...HEAD
[3.0.0]: ${REPO_URL}/compare/${TAG_PREFIX}1.0.0...${TAG_PREFIX}3.0.0
[1.0.0]: ${REPO_URL}/releases/tag/${TAG_PREFIX}1.0.0
`;

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(1);
      const version3Index = content.indexOf('## [3.0.0]');
      const version2Index = content.indexOf('## [2.0.0]');
      const version1Index = content.indexOf('## [1.0.0]');
      expect(version3Index).toBeLessThan(version2Index);
      expect(version2Index).toBeLessThan(version1Index);
      expect(content).toContain(
        `[3.0.0]: ${REPO_URL}/compare/${TAG_PREFIX}2.0.0...${TAG_PREFIX}3.0.0`,
      );
    });

    it('keeps an entry shared by both sides in its "ours" position, appending only genuinely new entries', async () => {
      // Regression test for a rebase scenario: "ours" (the branch being
      // rebased onto) has since gained a new entry, while "theirs" (the
      // replayed commit) already contained an entry that also exists in
      // "ours". Only the entry unique to "ours" should be appended; the
      // shared entry should not move.
      const oursContent = buildChangelog(
        `### Changed

- New entry only on ours ([#6388](${REPO_URL}/pull/6388))
- Shared entry ([#9960](${REPO_URL}/pull/9960))`,
      );
      const theirsContent = buildChangelog(
        `### Changed

- **BREAKING:** Breaking entry only on theirs ([#9168](${REPO_URL}/pull/9168))
- Shared entry ([#9960](${REPO_URL}/pull/9960))`,
      );

      const { content, mergedEntryCount } = await mergeChangelogs({
        oursContent,
        theirsContent,
        repoUrl: REPO_URL,
        tagPrefix: TAG_PREFIX,
      });

      expect(mergedEntryCount).toBe(1);
      const breakingIndex = content.indexOf('Breaking entry only on theirs');
      const newEntryIndex = content.indexOf('New entry only on ours');
      const sharedIndex = content.indexOf('Shared entry');
      expect(breakingIndex).toBeLessThan(newEntryIndex);
      expect(newEntryIndex).toBeLessThan(sharedIndex);
    });
  });

  describe('findConflictedChangelogFiles', () => {
    it('filters unmerged paths down to package changelogs', async () => {
      (execa as unknown as jest.Mock).mockResolvedValue({
        stdout: [
          'packages/foo/CHANGELOG.md',
          'packages/foo/package.json',
          'yarn.lock',
        ].join('\n'),
      });

      const result = await findConflictedChangelogFiles();

      expect(result).toStrictEqual(['packages/foo/CHANGELOG.md']);
      expect(execa).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-only', '--diff-filter=U'],
        expect.objectContaining({ encoding: 'utf8' }),
      );
    });

    it('returns an empty array when there are no unmerged paths', async () => {
      (execa as unknown as jest.Mock).mockResolvedValue({ stdout: '' });

      expect(await findConflictedChangelogFiles()).toStrictEqual([]);
    });
  });

  describe('readGitBlob', () => {
    it('reads a file at the given ref', async () => {
      (execa as unknown as jest.Mock).mockResolvedValue({ stdout: 'content' });

      const result = await readGitBlob(':2', 'packages/foo/CHANGELOG.md');

      expect(result).toBe('content');
      expect(execa).toHaveBeenCalledWith(
        'git',
        ['show', ':2:packages/foo/CHANGELOG.md'],
        expect.objectContaining({ encoding: 'utf8' }),
      );
    });
  });

  describe('resolvePackageMetadata', () => {
    it('resolves the package name, repo URL, and tag prefix from the working tree', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          name: '@metamask/example',
          repository: {
            type: 'git',
            url: 'https://github.com/MetaMask/core.git',
          },
        }),
      );

      const result = await resolvePackageMetadata(
        'packages/example/CHANGELOG.md',
      );

      expect(result).toStrictEqual({
        name: '@metamask/example',
        repoUrl: 'https://github.com/MetaMask/core',
        tagPrefix: '@metamask/example@',
      });
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('packages/example/package.json'),
        'utf8',
      );
      expect(execa).not.toHaveBeenCalled();
    });

    it('falls back to the "ours" conflict stage if package.json is not parseable in the working tree', async () => {
      jest.spyOn(fs, 'readFile').mockResolvedValue('<<<<<<< HEAD\nconflict');
      (execa as unknown as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify({
          name: '@metamask/example',
          repository: { url: 'https://github.com/MetaMask/core' },
        }),
      });

      const result = await resolvePackageMetadata(
        'packages/example/CHANGELOG.md',
      );

      expect(result).toStrictEqual({
        name: '@metamask/example',
        repoUrl: 'https://github.com/MetaMask/core',
        tagPrefix: '@metamask/example@',
      });
      expect(execa).toHaveBeenCalledWith(
        'git',
        ['show', ':2:packages/example/package.json'],
        expect.objectContaining({ encoding: 'utf8' }),
      );
    });

    it('throws if the package name or repository URL is missing', async () => {
      jest
        .spyOn(fs, 'readFile')
        .mockResolvedValue(JSON.stringify({ name: '@metamask/example' }));

      await expect(
        resolvePackageMetadata('packages/example/CHANGELOG.md'),
      ).rejects.toThrow(
        'Could not resolve package name or repository for "packages/example/CHANGELOG.md".',
      );
    });
  });

  describe('resolveChangelogConflicts', () => {
    it('resolves each conflicted file and stages it with git add', async () => {
      const changelogPath = 'packages/example/CHANGELOG.md';
      const oursContent = buildChangelog(
        `### Added

- Added ours entry ([#10](${REPO_URL}/pull/10))`,
      );
      const theirsContent = buildChangelog(
        `### Added

- Added theirs entry ([#11](${REPO_URL}/pull/11))`,
      );

      (execa as unknown as jest.Mock).mockImplementation(
        async (command: string, args: string[]) => {
          if (args[0] === 'diff') {
            return { stdout: changelogPath };
          }
          if (args[0] === 'show' && args[1] === `:2:${changelogPath}`) {
            return { stdout: oursContent };
          }
          if (args[0] === 'show' && args[1] === `:3:${changelogPath}`) {
            return { stdout: theirsContent };
          }
          if (args[0] === 'add') {
            return { stdout: '' };
          }
          throw new Error(
            `Unexpected execa call: ${command} ${args.join(' ')}`,
          );
        },
      );

      jest.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          name: '@metamask/example',
          repository: { type: 'git', url: `${REPO_URL}.git` },
        }),
      );
      jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const result = await resolveChangelogConflicts();

      expect(result.skipped).toStrictEqual([]);
      expect(result.resolved).toStrictEqual([
        { path: changelogPath, mergedEntryCount: 1 },
      ]);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(changelogPath),
        expect.stringContaining('Added theirs entry'),
        'utf8',
      );
      expect(execa).toHaveBeenCalledWith(
        'git',
        ['add', changelogPath],
        expect.objectContaining({ cwd: expect.any(String) }),
      );
    });

    it('skips a file that cannot be parsed and leaves it unresolved', async () => {
      const changelogPath = 'packages/example/CHANGELOG.md';

      (execa as unknown as jest.Mock).mockImplementation(
        async (command: string, args: string[]) => {
          if (args[0] === 'diff') {
            return { stdout: changelogPath };
          }
          if (args[0] === 'show' && args[1] === `:2:${changelogPath}`) {
            return { stdout: 'this is not a valid changelog' };
          }
          if (args[0] === 'show' && args[1] === `:3:${changelogPath}`) {
            return { stdout: buildChangelog('') };
          }
          throw new Error(
            `Unexpected execa call: ${command} ${args.join(' ')}`,
          );
        },
      );

      jest.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify({
          name: '@metamask/example',
          repository: { type: 'git', url: `${REPO_URL}.git` },
        }),
      );
      const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue();

      const result = await resolveChangelogConflicts();

      expect(result.resolved).toStrictEqual([]);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]?.path).toBe(changelogPath);
      expect(writeFileSpy).not.toHaveBeenCalled();
    });
  });
});
