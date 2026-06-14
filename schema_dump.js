const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const content = fs.readFileSync('c:/Users/Usuario01/TC-ERP/web/.env.local', 'utf8');
const urlMatch = content.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = content.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const secretMatch = content.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), secretMatch ? secretMatch[1].trim() : keyMatch[1].trim());

async function checkHistory() {
  const { data: d2 } = await supabase.from('erp_audit_logs').select('*').limit(5);
  console.log('erp_audit_logs count:', d2 ? d2.length : 0);
  if (d2 && d2.length > 0) console.log(d2[0]);
}

checkHistory();
