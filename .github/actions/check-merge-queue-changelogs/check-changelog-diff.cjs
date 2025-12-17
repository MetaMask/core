// This script checks that any new changelog entries added in a PR
// remain in the [Unreleased] section after the PR is merged.

const fs = require('fs');

if (process.argv.length < 5) {
  console.error(
    'Usage: tsx check-changelog-diff.mts <base-file> <pr-file> <merged-file>',
  );

  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
}

/* eslint-disable n/no-sync */
const baseContent = fs.readFileSync(process.argv[2], 'utf8');
const prContent = fs.readFileSync(process.argv[3], 'utf8');
const mergedContent = fs.readFileSync(process.argv[4], 'utf8');
/* eslint-enable n/no-sync */

/**
 * Extract the "[Unreleased]" section from the changelog content.
 *
 * This doesn't actually parse the Markdown, it just looks for the section
 * header and collects lines until the next section header.
 *
 * @param {string} content - The changelog content.
 * @returns {Set<string>} The lines in the "[Unreleased]" section as a
 * {@link Set}.
 */
function getUnreleasedSection(content) {
  const lines = content.split('\n');

  let inUnreleased = false;
  const sectionLines = new Set();

  for (const line of lines) {
    // Find unreleased header.
    if (line.trim().match(/^##\s+\[Unreleased\]/u)) {
      inUnreleased = true;
      continue;
    }

    // Stop if we hit the next version header (## [x.x.x]).
    if (inUnreleased && line.trim().match(/^##\s+\[/u)) {
      break;
    }

    // If inside the unreleased header, add lines to the set.
    if (inUnreleased) {
      sectionLines.add(line.trim());
    }
  }

  return sectionLines;
}

/**
 * Get the lines that were added in the PR content compared to the base content.
 *
 * @param {string} oldContent - The base changelog content.
 * @param {string} newContent - The PR changelog content.
 * @returns {string[]} The added lines as an array of strings.
 */
function getAddedLines(oldContent, newContent) {
  const oldLines = new Set(oldContent.split('\n').map((line) => line.trim()));
  const newLines = newContent.split('\n').map((line) => line.trim());

  return newLines.filter(
    (line) =>
      line.length > 0 &&
      !oldLines.has(line) &&
      !line.startsWith('#') &&
      !line.startsWith('['),
  );
}

const mergedUnreleased = getUnreleasedSection(mergedContent);
const addedLines = getAddedLines(baseContent, prContent);

const missingLines = [];
for (const line of addedLines) {
  if (!mergedUnreleased.has(line)) {
    missingLines.push(line);
  }
}

if (missingLines.length > 0) {
  console.error(
    `The following lines added in the PR are missing from the "Unreleased" section after merge:\n\n- ${missingLines.join('\n- ')}\n\nPlease update your pull request and ensure that new changelog entries remain in the "Unreleased" section.`,
  );

  process.exitCode = 1;
}
