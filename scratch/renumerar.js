const url = 'https://gpvocfptmsskgfpacadl.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMDcwNCwiZXhwIjoyMDkyOTc2NzA0fQ.ZywBVseCD2qU5zvviTulsPQPKGXs79nINSM1mIZXx-I';

async function run() {
  const res = await fetch(`${url}/rest/v1/employees?select=id,nombre_completo,created_at&order=created_at.asc`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const data = await res.json();
  
  for (let i = 0; i < data.length; i++) {
    const code = `EMP-${(i+1).toString().padStart(4, '0')}`;
    const updateRes = await fetch(`${url}/rest/v1/employees?id=eq.${data[i].id}`, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ codigo_empleado: code })
    });
    console.log(`Updated ${data[i].nombre_completo} -> ${code}`);
  }
}
run();
