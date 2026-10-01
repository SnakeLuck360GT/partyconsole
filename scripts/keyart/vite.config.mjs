// Key-art render server: project root, no HMR (other agents edit files in parallel; pages never reload).
//   npx vite --config scripts/keyart/vite.config.mjs --port 5333 --strictPort
export default {
  root: new URL('../..', import.meta.url).pathname,
  publicDir: 'public',
  logLevel: 'warn',
  server: { host: '127.0.0.1', hmr: false },
  optimizeDeps: { entries: ['scripts/keyart/index.html'] },
};
