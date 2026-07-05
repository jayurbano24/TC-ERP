const { randomBytes } = require('crypto');
const { spawnSync } = require('child_process');
const secret = randomBytes(32).toString('hex');
const result = spawnSync(
  'vercel',
  ['env', 'add', 'CRON_SECRET', 'production', '--yes'],
  { input: secret, encoding: 'utf8', shell: true, cwd: __dirname + '/..' }
);
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
console.log('CRON_SECRET configured (save locally in .env.local):', secret);
