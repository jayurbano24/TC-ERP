const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);
const supabaseUrl = urlMatch[1].trim().replace(/^"|"$/g, '');
const supabaseKey = keyMatch[1].trim().replace(/^"|"$/g, '');
const supabase = createClient(supabaseUrl, supabaseKey);

async function seedRoles() {
  const roles = [
    { name: 'Administrador', description: 'Acceso total al sistema' },
    { name: 'Gerente', description: 'Acceso a reportes y gestión global' },
    { name: 'Auditor', description: 'Acceso de solo lectura a todos los módulos' },
    { name: 'Bodega Central', description: 'Gestión de inventarios y traslados' },
    { name: 'Producción', description: 'Gestión de backoffice y calidad' },
    { name: 'Recepcionista', description: 'Recepción de mercancía' },
  ];

  for (const role of roles) {
    const { data, error } = await supabase.from('erp_roles').insert(role).select('*');
    if (error) {
      console.log('Error inserting role:', role.name, error.message);
    } else {
      console.log('Inserted role:', data[0].name);
    }
  }
}

seedRoles();
