import * as fs from 'node:fs';
import * as path from 'node:path';

import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes } from 'prism-react-renderer';

const codeTheme = themes.dracula;

// When running inside a host project (e.g. metamask-extension) whose React
// version differs from Docusaurus's, we alias react/react-dom to the copies
// installed alongside this package.  Only create aliases for packages that
// actually exist at the NODE_PATH location (they may be hoisted when the host
// already has a compatible version).
const extraNodeModules = process.env.NODE_PATH; // eslint-disable-line no-process-env
const reactAlias: Record<string, string> = {};
if (extraNodeModules) {
  for (const pkg of ['react', 'react-dom', '@mdx-js/react']) {
    const pkgPath = path.join(extraNodeModules, pkg);
    if (fs.existsSync(pkgPath)) {
      reactAlias[pkg] = pkgPath;
    }
  }
}

const config: Config = {
  title: 'Messenger API',
  tagline: 'Action and event reference for MetaMask controller messengers',
  url: 'https://metamask.github.io',
  baseUrl: '/',
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

  plugins: [
    function resolvePlugin() {
      return {
        name: 'resolve-deps',
        configureWebpack() {
          if (Object.keys(reactAlias).length === 0) {
            return {};
          }
          return {
            resolve: { alias: reactAlias },
          };
        },
      };
    },
  ],

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
