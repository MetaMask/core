import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes } from 'prism-react-renderer';

const codeTheme = themes.dracula;

/**
 * Docusaurus configuration for the MetaMask Core developer documentation site.
 *
 * The site root is `docs/developers/`; all markdown in this directory tree is
 * served as docs pages. Run via the `docs:*` scripts defined in the root
 * `package.json`.
 */
const config: Config = {
  title: 'Developer Docs',
  tagline: 'Guides for developers',
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

  presets: [
    [
      'classic',
      {
        docs: {
          /**
           * Serve docs from the site root so that the markdown files that live
           * directly in `docs/developers/` are accessible at `/`.
           */
          routeBasePath: '/',
          /**
           * The docs content directory is `.` (i.e. `docs/developers/` itself).
           * Docusaurus will recursively discover all `.md` / `.mdx` files here.
           */
          path: '.',
          include: ['**/*.md', '**/*.mdx'],
          /**
           * Exclude Docusaurus config/theme directories from being treated as
           * doc pages.
           */
          exclude: [
            'node_modules/**',
            'src/**',
            'static/**',
            'build/**',
            '.docusaurus/**',
          ],
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
    prism: {
      theme: codeTheme,
      defaultLanguage: 'typescript',
      additionalLanguages: ['bash', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
