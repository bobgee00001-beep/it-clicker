import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const required = ['<title>IT-Clicker pausiert</title>', 'IT-Clicker ist pausiert', 'noindex', 'Gee-Corp Release Hold'];
const forbidden = ['class Game', 'DevOps Clicker', 'Release Train', 'startDeploy()', 'devopsClicker'];
const missing = required.filter((needle) => !html.includes(needle));
const presentForbidden = forbidden.filter((needle) => html.includes(needle));
if (missing.length) { console.error(`Missing maintenance HTML markers: ${missing.join(', ')}`); process.exit(1); }
if (presentForbidden.length) { console.error(`Game markers still present: ${presentForbidden.join(', ')}`); process.exit(1); }
console.log('Maintenance HTML smoke check passed.');
