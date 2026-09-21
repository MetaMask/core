import { renderCodeownersSection } from './render.js';

describe('renderCodeownersSection', () => {
  it('renders a package section without a blank line between its header and rules', () => {
    const section = {
      title: 'accounts-controller',
      rules: [
        {
          pattern: '/packages/accounts-controller',
          owners: ['@MetaMask/accounts-engineers'],
        },
      ],
    };

    expect(renderCodeownersSection(section, 3)).toBe(
      '### accounts-controller\n/packages/accounts-controller    @MetaMask/accounts-engineers',
    );
  });

  it('pads patterns so that owners align within a section', () => {
    const section = {
      title: 'example',
      rules: [
        { pattern: '/packages/example', owners: ['@MetaMask/team'] },
        {
          pattern: '/packages/example/CHANGELOG.md',
          owners: ['@MetaMask/team', '@MetaMask/core-platform'],
        },
      ],
    };

    expect(renderCodeownersSection(section, 3)).toBe(
      '### example\n' +
        '/packages/example                 @MetaMask/team\n' +
        '/packages/example/CHANGELOG.md    @MetaMask/team @MetaMask/core-platform',
    );
  });

  it('underlines a top-level section heading', () => {
    expect(
      renderCodeownersSection({
        title: '@MetaMask/accounts-engineers',
        rules: [],
      }),
    ).toBe('# @MetaMask/accounts-engineers\n# ----------------------------');
  });

  it('renders a team section with a blank line before each nested package section', () => {
    const section = {
      title: '@MetaMask/team',
      rules: [],
      subsections: [
        {
          title: 'alpha',
          rules: [
            { pattern: '/packages/alpha', owners: ['@MetaMask/team'] },
            {
              pattern: '/packages/alpha/CHANGELOG.md',
              owners: ['@MetaMask/team', '@MetaMask/core-platform'],
            },
          ],
        },
        {
          title: 'beta',
          rules: [{ pattern: '/packages/beta', owners: ['@MetaMask/team'] }],
        },
      ],
    };

    expect(renderCodeownersSection(section)).toBe(
      `# @MetaMask/team
# --------------

### alpha
/packages/alpha                 @MetaMask/team
/packages/alpha/CHANGELOG.md    @MetaMask/team @MetaMask/core-platform

### beta
/packages/beta    @MetaMask/team`,
    );
  });

  it('adds a blank line between the Overrides heading and its rules', () => {
    expect(
      renderCodeownersSection({
        title: 'Overrides',
        rules: [
          {
            pattern: '/.github/',
            owners: ['@MetaMask/core-platform'],
          },
        ],
      }),
    ).toBe('# Overrides\n# ---------\n\n/.github/    @MetaMask/core-platform');
  });
});
