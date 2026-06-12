const fs = require('fs');
let content = fs.readFileSync('c:/Users/Usuario01/TC-ERP/web/src/lib/database/roles.ts', 'utf8');

const header = `'use server';

import { createClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key, { auth: { persistSession: false } });
};

`;

content = header + content.replace(/import \{ getSupabaseBrowserClient \}.*?\n/, '');
content = content.replace(/getSupabaseBrowserClient\(\)/g, 'getAdminClient()');

fs.writeFileSync('c:/Users/Usuario01/TC-ERP/web/src/lib/database/roles.ts', content);
