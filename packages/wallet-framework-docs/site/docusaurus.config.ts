import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes } from 'prism-react-renderer';

const codeTheme = themes.dracula;
const commitSha = process.env.DOCS_COMMIT_SHA;

const config = {
  baseUrl: '/core/wallet-framework-docs',
  favicon: 'images/metamask-dev-logo.svg',
  onBrokenLinks: 'throw',
  title: 'Wallet Framework Documentation',
  tagline: commitSha
    ? `Generated from commit ${commitSha} — Documentation for the Wallet Framework`
    : 'Documentation for the Wallet Framework',
  url: 'https://metamask.github.io',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  presets: [
    [
      'classic',
      {
        docs: {
          path: '../content',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: ['./src/css/custom.css'],
        },
      } satisfies Preset.Options,
    ],
  ],
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        docsDir: '../content',
        docsRouteBasePath: '/',
        hashed: true,
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],
  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        autoCollapseCategories: true,
      },
    },
    navbar: {
      hideOnScroll: true,
      items: [
        {
          href: `https://github.com/MetaMask/core/tree/${commitSha ?? 'main'}/packages/wallet-framework-docs/content`,
          label: 'GitHub',
          position: 'right' as const,
        },
      ],
      logo: {
        alt: 'MetaMask logo',
        src: 'images/metamask-dev-logo.svg',
      },
      title: 'Wallet Framework Documentation',
    },
    prism: {
      additionalLanguages: ['bash', 'diff'],
      magicComments: [
        {
          className: 'theme-code-block-highlighted-line',
          line: 'highlight-next-line',
          block: {
            start: 'highlight-start',
            end: 'highlight-end',
          },
        },
        {
          className: 'code-block-diff-added-line',
          line: '::diff-added-next::',
          block: {
            start: '::diff-added-start::',
            end: '::diff-added-end::',
          },
        },
        {
          className: 'code-block-diff-deleted-line',
          line: '::diff-deleted-next::',
          block: {
            start: '::diff-deleted-start::',
            end: '::diff-deleted-end::',
          },
        },
      ],
      theme: codeTheme,
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
} as const satisfies Config;

export default config;
