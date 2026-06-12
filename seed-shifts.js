require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seedShifts() {
  // Limpiamos los turnos previos si hubiera
  await supabase.from('company_shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { data, error } = await supabase.from('company_shifts').insert([
    {
      name: 'Semana A (L-J 8 a 6, V 8 a 5)',
      weekly_schedule: {
        "1": { "entrada": "08:00", "salida": "18:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "2": { "entrada": "08:00", "salida": "18:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "3": { "entrada": "08:00", "salida": "18:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "4": { "entrada": "08:00", "salida": "18:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "5": { "entrada": "08:00", "salida": "17:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" }
      }
    },
    {
      name: 'Semana B (L-V 8 a 5, S 8 a 12)',
      weekly_schedule: {
        "1": { "entrada": "08:00", "salida": "17:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "2": { "entrada": "08:00", "salida": "17:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "3": { "entrada": "08:00", "salida": "17:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "4": { "entrada": "08:00", "salida": "17:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "5": { "entrada": "08:00", "salida": "17:00", "tolerancia": 15, "almuerzo_inicio": "13:00", "almuerzo_fin": "14:00" },
        "6": { "entrada": "08:00", "salida": "12:00", "tolerancia": 15 }
      }
    }
  ]).select();

  if (error) {
    console.error('Error inserting shifts:', error);
  } else {
    console.log('Shifts inserted successfully:', data.length);
  }
}

seedShifts();
