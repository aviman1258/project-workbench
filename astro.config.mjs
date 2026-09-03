import { defineConfig } from 'astro/config';
import { localEditorPlugin } from './src/lib/local-editor';

export default defineConfig({
  output: 'static',
  trailingSlash: 'never',
  site: 'https://www.avisheksportfolio.com',
  // The custom domain serves at the root, so the deploy workflow no longer sets
  // DEPLOY_BASE; the hook stays for building path-prefixed previews by hand.
  ...(process.env.DEPLOY_BASE ? { base: process.env.DEPLOY_BASE } : {}),
  // Bind the IPv4 loopback so http://127.0.0.1 connects and gets redirected to
  // localhost (see localEditorPlugin); localhost itself still resolves here.
  server: { host: '127.0.0.1' },
  vite: {
    plugins: [localEditorPlugin()],
  },
});
