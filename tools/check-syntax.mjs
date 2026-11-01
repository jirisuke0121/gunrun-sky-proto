// Syntax-check every script that ships: top-level *.js, server/worker.js and
// the inline <script> blocks of each *.html (the bulk of the game lives there).
// Usage: node tools/check-syntax.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'syntax-'));
const failures = [];
let checked = 0;

function check(file, label) {
  checked++;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures.push(`${label}\n${String(error.stderr || error.message).trim()}`);
  }
}

const top = readdirSync(root);
for (const name of top.filter((n) => n.endsWith('.js'))) check(join(root, name), name);
check(join(root, 'server', 'worker.js'), 'server/worker.js');

for (const name of top.filter((n) => n.endsWith('.html'))) {
  const html = readFileSync(join(root, name), 'utf8');
  let index = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs) || !body.trim()) continue;
    const type = (/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs) || []).slice(1).find((v) => v !== undefined);
    const isModule = type?.toLowerCase() === 'module';
    // Skip data blocks such as application/json; only classic and module code is parsed.
    if (type && !isModule && !/^(text|application)\/(x-)?javascript$/i.test(type)) continue;
    const file = join(tmp, `${name}.${index}.${isModule ? 'mjs' : 'js'}`);
    writeFileSync(file, body);
    check(file, `${name} inline <script> #${index}${isModule ? ' (module)' : ''}`);
    index++;
  }
}

rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  console.error(`Syntax errors in ${failures.length} of ${checked} scripts:\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log(`OK: ${checked} scripts parsed without syntax errors`);
