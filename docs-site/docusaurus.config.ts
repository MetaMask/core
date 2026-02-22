import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes } from 'prism-react-renderer';

const codeTheme = themes.dracula;

const config: Config = {
  title: 'MetaMask Core Messenger API',
  tagline: 'Action and event reference for the MetaMask controller messenger',
  url: 'https://metamask.github.io',
  baseUrl: '/core/',
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
        {
          href: 'https://github.com/MetaMask/core',
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
    footer: {
      logo: {
        alt: 'MetaMask logo',
        src: 'img/metamask-logo.svg',
        srcDark: 'img/metamask-logo-dark.svg',
        href: 'https://metamask.io/',
      },
      copyright: `\u00a9 ${new Date().getFullYear()} MetaMask \u2022 A Consensys Formation`,
    },
    prism: {
      theme: codeTheme,
      defaultLanguage: 'typescript',
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
