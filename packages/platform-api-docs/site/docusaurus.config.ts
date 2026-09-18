import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes } from 'prism-react-renderer';

const codeTheme = themes.dracula;

const projectLabel = process.env.DOCS_PROJECT_LABEL;
const commitSha = process.env.DOCS_COMMIT_SHA;
// The CLI discovers the project's `origin` remote and passes it through so
// navbar links point at the actual repo the docs were generated from, not
// hardcoded MetaMask/core. Falls back to MetaMask/core when running outside a
// git checkout (e.g. local smoke tests).
const repoUrl = process.env.DOCS_REPO_URL ?? 'https://github.com/MetaMask/core';
const projectSuffix = projectLabel ? ` (${projectLabel})` : '';

const config: Config = {
  title: `Platform API${projectSuffix}`,
  tagline: commitSha
    ? `Generated from commit ${commitSha} — actions and events available for use in clients via the message bus`
    : 'Actions and events available for use in clients via the message bus',
  url: process.env.DOCS_URL ?? 'https://metamask.github.io',
  baseUrl: process.env.DOCS_BASE_URL ?? '/',
  favicon: 'img/favicons/favicon-96x96.png',

  onBrokenLinks: 'warn',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        docsRouteBasePath: '/',
        hashed: true,
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          breadcrumbs: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      logo: {
        alt: 'MetaMask logo',
        src: 'img/metamask-logo.svg',
        srcDark: 'img/metamask-logo-dark.svg',
      },
      hideOnScroll: false,
      items: [
        ...(commitSha
          ? [
              {
                label: `commit ${commitSha}`,
                position: 'right' as const,
                href: `${repoUrl}/commit/${commitSha}`,
              },
            ]
          : []),
        {
          href: repoUrl,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    docs: {
      sidebar: {
        autoCollapseCategories: false,
      },
    },
    prism: {
      theme: codeTheme,
      defaultLanguage: 'typescript',
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
