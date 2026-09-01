import { defineConfig } from 'astro/config';
import { localEditorPlugin } from './src/lib/local-editor';

export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  // Bind the IPv4 loopback so http://127.0.0.1 connects and gets redirected to
  // localhost (see localEditorPlugin); localhost itself still resolves here.
  server: { host: '127.0.0.1' },
  vite: {
    plugins: [localEditorPlugin()],
  },
});
