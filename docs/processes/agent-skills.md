## Agent skills

This repo can install MetaMask agent skills for Claude, Cursor, and Codex/OpenAI. `yarn setup` keeps the public [`MetaMask/skills`](https://github.com/MetaMask/skills) cache available through the shared `@metamask/skills` CLI. Run `yarn skills` any time to install or refresh the gitignored generated skills under `.claude/skills/`, `.cursor/rules/`, and `.agents/skills/`.

By default, all stable skills that support Core are installed when you run `yarn skills`. Set `SKILLS_AUTO_UPDATE=1` to opt into best-effort regeneration during setup. The shared package keeps sync/cache behavior uniform with Mobile and Extension. To persist a local selection, copy `.skills.local.example` to `.skills.local` and set values such as `SKILLS_DOMAINS=perps`.

```bash
yarn skills                         # refresh default stable Core skills
yarn skills --domain perps          # install only the perps domain
yarn skills --select                # interactively choose domains
yarn skills --reset                 # clear saved local selection
```
