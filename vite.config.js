import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// `npm run dev:https` serves over HTTPS (self-signed) so phones on the LAN can use gyro/tilt controls,
// which browsers only allow in secure contexts. Accept the certificate warning once on each device.
const https = process.env.HTTPS === '1';

export default defineConfig(async () => ({
  base: './',
  // Live reload is off by default: many agents edit files in parallel, and reloads drop phones mid-game.
  // Use `HMR=1 npm run dev` to turn it back on.
  server: { host: true, hmr: process.env.HMR === '1' },
  plugins: https ? [(await import('@vitejs/plugin-basic-ssl')).default()] : [],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        screen: resolve(import.meta.dirname, 'screen.html'),
        controller: resolve(import.meta.dirname, 'controller.html'),
      },
    },
  },
}));
