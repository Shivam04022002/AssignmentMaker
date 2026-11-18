/* eslint-env node */
/**
 * Transpiles the app's Lang4 analysis modules and the protocol helpers (only
 * what they import) to CommonJS in ./lib, so the real engine runs under plain
 * Node for the dataset evaluation. Reads the project; writes only ./lib.
 *
 *   node transpile27.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const babel = require(path.join(ROOT, 'node_modules/@babel/core'));
const OUT = path.join(__dirname, 'lib');
const ENTRIES = ['src/handwriting/learn/analyzeSample.js', 'src/handwriting/learn/raster.js', 'src/handwriting/learn/textUnits.js', '__tests__/helpers/pngGray.js', '__tests__/helpers/realProtocol.js'];
const seen = new Set();

function resolve(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, path.join(base, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  throw new Error(`cannot resolve ${spec} from ${fromFile}`);
}

function visit(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (seen.has(rel)) return;
  seen.add(rel);
  const code = fs.readFileSync(file, 'utf8');
  const specs = [...code.matchAll(/^\s*(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
  for (const s of specs) {
    if (!s.startsWith('.')) {
      if (['fs', 'path', 'zlib'].includes(s)) continue; // Node built-ins in the helpers
      throw new Error(`${rel} imports a bare module (${s}) — the runner cannot load it`);
    }
    visit(resolve(file, s));
  }
  const out = babel.transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [[path.join(ROOT, 'node_modules/@babel/preset-env'), { targets: { node: 'current' }, modules: 'commonjs' }]],
  }).code;
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
}

for (const e of ENTRIES) visit(path.join(ROOT, e));
console.log(`transpiled ${seen.size} modules into ${OUT}`);
