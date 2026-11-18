/* eslint-env node */
/**
 * Transpiles the app's Lang4 analysis modules (and only what they import) to
 * CommonJS in ./lib, so the real pipeline can run under plain Node for the
 * OCR proof of concept. Reads the project; writes nothing into it.
 */
const fs = require('fs');
const path = require('path');
const babel = require('D:/AssignmentMaker/node_modules/@babel/core');

const SRC = 'D:/AssignmentMaker/src';
const OUT = path.join(__dirname, 'lib');
const ENTRIES = ['handwriting/learn/analyzeSample.js', 'handwriting/learn/raster.js', 'handwriting/learn/textUnits.js'];
const seen = new Set();

function resolve(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, path.join(base, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  throw new Error(`cannot resolve ${spec} from ${fromFile}`);
}

function visit(file) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  if (seen.has(rel)) return;
  seen.add(rel);
  const code = fs.readFileSync(file, 'utf8');
  const specs = [...code.matchAll(/^\s*(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
  for (const s of specs) {
    if (!s.startsWith('.')) throw new Error(`${rel} imports a bare module (${s}) — the PoC runner cannot load it`);
    visit(resolve(file, s));
  }
  const out = babel.transformSync(code, {
    filename: file,
    babelrc: false,
    configFile: false,
    presets: [['D:/AssignmentMaker/node_modules/@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
  }).code;
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
}

for (const e of ENTRIES) visit(path.join(SRC, e));
console.log(`transpiled ${seen.size} modules into ${OUT}`);
