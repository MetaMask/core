import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Developer Docs',
  description: 'Guides for developers',
  rewrites: {
    'README.md': 'index.md',
    'wallet-framework/README.md': 'wallet-framework/index.md',
    'wallet-framework/data-services/README.md':
      'wallet-framework/data-services/index.md',
  },
  /*
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: 'Markdown Examples', link: '/markdown-examples' },
          { text: 'Runtime API Examples', link: '/api-examples' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' },
    ],
  },
  */
});
