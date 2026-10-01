// Vite config for the Kart Chaos test scripts: same as the project config, but without HMR / file watching so
// edits by other developers working in parallel can't reload the pages mid-test.
//   npx vite --config scripts/kart-vite.config.mjs --port 5391 --strictPort
import base from '../vite.config.js';

export default async (env) => {
  const b = typeof base === 'function' ? await base(env) : base;
  return { ...b, root: new URL('..', import.meta.url).pathname, server: { ...(b.server || {}), hmr: false, watch: { ignored: ['**/*'] } } };
};
