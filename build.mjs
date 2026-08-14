/**
 * Build the plugin's distributable artifacts:
 * - lib/index.js, lib/invariant.js (Host half, ESM, @deepseek-ai/* external)
 * - lib/client.js (browser client, closure-factory bundle matching the
 *   harness loader contract: platform modules stay external).
 */
import { build } from 'esbuild'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

const ID = 'the-multiple-deepseek'

const platformExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  external: ['@deepseek-ai/*'],
})

await build({
  entryPoints: [resolve(root, 'src/invariant.ts')],
  outfile: resolve(root, 'lib/invariant.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  external: ['@deepseek-ai/*'],
})

await build({
  entryPoints: [resolve(root, 'src/client/index.tsx')],
  outfile: resolve(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  external: platformExternals,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: '\nreturn module.exports; } });' },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})

console.log('built: lib/index.js, lib/invariant.js, lib/client.js')
