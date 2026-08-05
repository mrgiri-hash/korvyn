/**
 * Build-time bridge: generate the enterprise GL in korvyn-core, validate is proven
 * by the test suite, then embed a serialized snapshot into the single-file dashboard.
 *
 * The dashboard imports nothing at runtime, so this is the ONLY way data crosses
 * from the typed core into it — a snapshot written into <script id="egl-data">,
 * not a live dependency. Idempotent: re-run to refresh the snapshot in place.
 *
 *   cd korvyn-core && npm run build && node tools/emit_enterprise_gl.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildEnterpriseGL, serializeEnterpriseGL, lineCount } from '../dist/fixtures/enterprise-gl.js';

const here = dirname(fileURLToPath(import.meta.url));
const dashboard = resolve(here, '..', '..', '..', 'apps', 'dashboard', 'korvyn_dashboard.html');

const gl = buildEnterpriseGL({ seed: 42, invoicesPerMonth: 12 });
const json = serializeEnterpriseGL(gl);

// Guard: the serialized data must not contain a script-closing sequence, which
// would terminate the embedding <script> early. Our data is plain text, but assert it.
if (json.includes('</')) {
  console.error('refusing to embed: serialized data contains a "</" sequence');
  process.exit(1);
}

const html = readFileSync(dashboard, 'utf8');
const re = /<script id="egl-data">[\s\S]*?<\/script>/;
if (!re.test(html)) {
  console.error('marker <script id="egl-data"> not found in', dashboard);
  process.exit(1);
}
const tag = `<script id="egl-data">window.EGL_DATA=${json};</script>`;
writeFileSync(dashboard, html.replace(re, tag), 'utf8');

console.log(
  `embedded enterprise GL: ${gl.entities.length} entities, ${gl.accounts.length} accounts, ` +
  `${gl.entries.length} entries, ${lineCount(gl)} lines, ${Math.round(json.length / 1024)} KB`,
);
