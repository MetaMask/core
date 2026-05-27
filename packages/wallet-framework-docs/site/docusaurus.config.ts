import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes } from 'prism-react-renderer';

const codeTheme = themes.dracula;
const commitSha = process.env.DOCS_COMMIT_SHA;
const navbarItemsDependentOnCommit = commitSha
  ? [
      {
        href: 'https://github.com/MetaMask/core',
        label: `commit ${commitSha}`,
        position: 'right' as const,
      },
    ]
  : [];

const config: Config = {
  baseUrl: process.env.DOCS_BASE_URL ?? '/',
  favicon: 'images/metamask-dev-logo.svg',
  onBrokenLinks: 'throw',
  title: 'Wallet Framework Documentation',
  tagline: commitSha
    ? `Generated from commit ${commitSha} — actions and events available for use in clients via the message bus`
    : 'Actions and events available for use in clients via the message bus',
  url: process.env.DOCS_URL ?? 'https://metamask.github.io',

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
          path: '../docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          breadcrumbs: false,
        },
        blog: false,
        theme: {
          customCss: ['./src/css/custom-2.css'],
        },
      } satisfies Preset.Options,
    ],
  ],
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        docsDir: '../docs',
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
    navbar: {
      hideOnScroll: true,
      items: [
        ...navbarItemsDependentOnCommit,
        {
          href: 'https://github.com/MetaMask/core',
          label: 'GitHub',
          position: 'right',
        },
      ],
      logo: {
        alt: 'MetaMask logo',
        src: 'images/metamask-dev-logo.svg',
      },
      title: 'Wallet Framework Documentation',
    },
    docs: {
      sidebar: {
        autoCollapseCategories: true,
      },
    },
    prism: {
      additionalLanguages: ['bash', 'diff'],
      theme: codeTheme,
    },
  } satisfies Preset.ThemeConfig,
} as const satisfies Config;

export default config;
