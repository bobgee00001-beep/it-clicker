import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const required = ['<title>DevOps Clicker</title>', 'class Game', 'Release Train', 'startDeploy()', 'release_manager', 'devopsClicker'];
const missing = required.filter((needle) => !html.includes(needle));
if (missing.length) { console.error(`Missing required HTML markers: ${missing.join(', ')}`); process.exit(1); }
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
if (scripts.length === 0) { console.error('Could not locate inline scripts.'); process.exit(1); }
for (const [index, script] of scripts.entries()) {
  try { new Function(script); } catch (error) { console.error(`Inline script ${index + 1} parse failed:`); console.error(error); process.exit(1); }
}
console.log('HTML smoke check passed.');
