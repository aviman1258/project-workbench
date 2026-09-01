import { defineConfig } from 'astro/config';
import { localEditorPlugin } from './src/lib/local-editor';

export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  vite: {
    plugins: [localEditorPlugin()],
  },
});
