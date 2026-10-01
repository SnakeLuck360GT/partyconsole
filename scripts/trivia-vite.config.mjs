// Vite config for scripts/trivia-test.mjs: same as the project config, but without file watching / HMR so
// edits by other developers working in parallel can't reload the pages mid-test.
import base from '../vite.config.js';

export default async (env) => {
  const b = typeof base === 'function' ? await base(env) : base;
  return { ...b, root: new URL('..', import.meta.url).pathname, server: { ...(b.server || {}), hmr: false, watch: { ignored: ['**/*'] } } };
};
