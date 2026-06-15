const { Pool } = require('pg');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');

async function testUrl(name, url) {
  if (!url) { console.log(`❌ ${name}: No encontrada`); return; }
  const masked = url.replace(/(?<=:)[^:@]+(?=@)/, '***');
  console.log(`\n🔌 Probando ${name}...`);
  console.log(`   ${masked}`);
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    const r = await pool.query('SELECT current_user, version()');
    console.log(`   ✅ ÉXITO - Usuario: ${r.rows[0].current_user}`);
  } catch(e) {
    console.log(`   ❌ ERROR (${e.code}): ${e.message}`);
  } finally {
    await pool.end();
  }
}

(async () => {
  const dbUrl   = envContent.match(/\nDATABASE_URL="([^"]+)"/)?.[1];
  const directUrl = envContent.match(/\nDIRECT_URL="([^"]+)"/)?.[1];
  await testUrl('DATABASE_URL (Pooler)', dbUrl);
  await testUrl('DIRECT_URL  (Directo)', directUrl);
})();
