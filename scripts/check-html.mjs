import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const required = ['<title>DevOps Clicker</title>', 'class Game', 'Release Train', 'game.save()', 'SAVE_VERSION'];
const forbidden = ['<title>IT-Clicker pausiert</title>', 'IT-Clicker ist pausiert', 'Gee-Corp Release Hold'];
const missing = required.filter((needle) => !html.includes(needle));
const presentForbidden = forbidden.filter((needle) => html.includes(needle));
if (missing.length) { console.error(`Missing maintenance HTML markers: ${missing.join(', ')}`); process.exit(1); }
if (presentForbidden.length) { console.error(`Maintenance markers still present: ${presentForbidden.join(', ')}`); process.exit(1); }
console.log('Game HTML smoke check passed.');
