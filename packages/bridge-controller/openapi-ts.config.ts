import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './src/api-spec.json',
  output: {
    path: './src/generated',
    format: 'prettier',
  },
  plugins: [
    '@hey-api/typescript',
    {
      name: 'zod',
      exportAllTypes: true,
    },
  ],
});
