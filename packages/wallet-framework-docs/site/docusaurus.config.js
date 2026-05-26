// @ts-check

const { themes } = require('prism-react-renderer');

const codeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'MetaMask Core — Developer Documentation',
  tagline: 'Developer documentation for the MetaMask core monorepo',
  url: 'https://metamask.github.io',
  baseUrl: '/core/',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  favicon: undefined,

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  organizationName: 'MetaMask',
  projectName: 'core',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  trailingSlash: true,

  // Fonts are in a plain static CSS file so that webpack does not try to
  // resolve the absolute font URLs at build time.
  stylesheets: ['/core/css/fonts.css'],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        // Disable the preset's built-in docs plugin; we use the standalone
        // plugin-content-docs instance below so we can point it at
        // ../docs/developers instead of a docs/ directory inside website/.
        docs: false,
        // No blog.
        blog: false,
        theme: {
          customCss: require.resolve('./src/scss/custom.scss'),
        },
      }),
    ],
  ],

  plugins: [
    // Enables SCSS/Sass support for custom stylesheets.
    'docusaurus-plugin-sass',

    // The single content-docs instance that serves docs/developers/.
    [
      '@docusaurus/plugin-content-docs',
      /** @type {import('@docusaurus/plugin-content-docs').Options} */
      ({
        id: 'developers',
        path: '../docs/developers',
        routeBasePath: '/',
        sidebarPath: require.resolve('./sidebars.js'),
        editUrl: 'https://github.com/MetaMask/core/edit/main/',
        breadcrumbs: true,
        showLastUpdateTime: false,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },

      navbar: {
        title: 'Core Developer Docs',
        logo: {
          alt: 'MetaMask logo',
          src: 'img/metamask-logo.svg',
          srcDark: 'img/metamask-logo-dark.svg',
          width: 32,
          height: 32,
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
          hideable: true,
        },
      },

      footer: {
        style: 'dark',
        logo: {
          alt: 'MetaMask logo',
          src: 'img/metamask-logo-dark.svg',
          width: 32,
          height: 32,
          href: 'https://metamask.io',
        },
        links: [
          {
            title: 'Documentation',
            items: [
              {
                label: 'Developer docs',
                to: '/',
              },
            ],
          },
          {
            title: 'GitHub',
            items: [
              {
                label: 'MetaMask/core',
                href: 'https://github.com/MetaMask/core',
              },
              {
                label: 'MetaMask/metamask-extension',
                href: 'https://github.com/MetaMask/metamask-extension',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'MetaMask developer docs',
                href: 'https://docs.metamask.io',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} MetaMask`,
      },

      prism: {
        theme: codeTheme,
        darkTheme: codeTheme,
        additionalLanguages: ['bash', 'json', 'typescript'],
      },
    }),
};

module.exports = config;
