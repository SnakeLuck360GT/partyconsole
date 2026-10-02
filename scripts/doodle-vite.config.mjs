// Vite config for the Doodle Dash test scripts: same as the project config, but without HMR / file watching so
// edits by other developers working in parallel can't reload the pages mid-test.
//   npx vite --config scripts/doodle-vite.config.mjs --port 5642 --strictPort
import base from '../vite.config.js';

export default async (env) => {
  const b = typeof base === 'function' ? await base(env) : base;
  return { ...b, root: new URL('..', import.meta.url).pathname, server: { ...(b.server || {}), hmr: false, watch: { ignored: ['**/*'] } } };
};
