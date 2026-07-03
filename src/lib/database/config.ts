import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { notify } from "@/components/ui/messaging/messageStore";
import {
  getCachedReferenceCatalog,
  invalidateReferenceCatalogCache,
  setCachedReferenceCatalog,
} from '@/shared/catalogs/referenceCatalogCache';
import {
  AGENCY_SELECT,
  BRAND_SELECT,
  CARRIER_SELECT,
  CAT_DIAGNOSTIC_REPAIR_SELECT,
  CAT_DIAGNOSTIC_SELECT,
  CAT_REACOND_TEST_SELECT,
  CAT_REPAIR_SELECT,
  MODEL_SELECT,
  PX_PROVIDER_SELECT,
  RETURN_REASON_SELECT,
  TECHNOLOGY_SELECT,
} from '@/shared/constants/dbProjections';

// --- TECNOLOGÍAS ---

export async function getTechnologies() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const cached = getCachedReferenceCatalog<any>('technologies');
  if (cached) return cached;
  const { data, error } = await supabase.from('technologies').select(TECHNOLOGY_SELECT).order('name');
  if (error) {
    console.error("Error fetching technologies:", JSON.stringify(error, null, 2));
    return [];
  }
  const rows = data || [];
  setCachedReferenceCatalog('technologies', rows);
  return rows;
}

export async function saveTechnology(tech: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { id, ...payload } = tech;
  
  // Mapear camelCase UI -> snake_case DB
  const dbTech = {
    name: payload.name || payload.nombre,
    series_count: payload.series_count || payload.seriesCount || 1,
    digits_per_series: payload.digits_per_series || payload.digitsPerSeries || [12]
  };

  if (!dbTech.name) return { error: "El nombre es requerido" };

  if (id && id.includes('-')) {
    // Update existing UUID
    const { data, error } = await supabase.from('technologies').update(dbTech).eq('id', id).select().single();
    if (error) console.error("Error updating technology:", error);
    else invalidateReferenceCatalogCache();
    return { data, error };
  } else {
    // New insert
    const { data, error } = await supabase.from('technologies').insert([dbTech]).select().single();
    if (error) console.error("Error inserting technology:", error);
    else invalidateReferenceCatalogCache();
    return { data, error };
  }
}

export async function deleteTechnology(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('technologies').delete().eq('id', id);
  if (!error) invalidateReferenceCatalogCache();
  return { error };
}

// --- MARCAS ---

export async function getBrands() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const cached = getCachedReferenceCatalog<any>('brands');
  if (cached) return cached;
  const { data, error } = await supabase.from('brands').select(BRAND_SELECT).order('name');
  if (error) { 
    console.error("Error fetching brands:", JSON.stringify(error, null, 2)); 
    return []; 
  }
  const rows = data || [];
  setCachedReferenceCatalog('brands', rows);
  return rows;
}

export async function saveBrand(brand: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { id, ...payload } = brand;
  
  const name = payload.nombre || payload.name;
  if (!name) return { error: "El nombre de la marca es requerido" };

  const dbBrand = {
    name: name,
    code: (payload.code || name.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 100))
  };

  if (id && id.length > 10) { // UUID
    const { data, error } = await supabase.from('brands').update({ name: dbBrand.name }).eq('id', id).select().single();
    if (!error) invalidateReferenceCatalogCache();
    return { data, error };
  } else {
    // New insert
    const { data, error } = await supabase.from('brands').insert([dbBrand]).select().single();
    if (error) {
        console.error("Error saving brand:", error);
        return { error: error };
    }
    invalidateReferenceCatalogCache();
    return { data, error };
  }
}

export async function deleteBrand(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('brands').delete().eq('id', id);
  if (!error) invalidateReferenceCatalogCache();
  return { error };
}

// --- PROVEEDORES PX ---

export async function getPxProviders() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('px_providers').select(PX_PROVIDER_SELECT).order('name');
  if (error) { 
    console.error("Error fetching px_providers:", JSON.stringify(error, null, 2)); 
    return []; 
  }
  return data || [];
}

export async function savePxProvider(provider: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { id, ...payload } = provider;
  
  const name = payload.nombre || payload.name;
  if (!name) return { error: "El nombre del proveedor es requerido" };

  const dbProvider = {
    name: name,
    code: (payload.code || name.substring(0, 3).toUpperCase() + Date.now().toString().slice(-4))
  };

  if (id && id.length > 10) { // UUID
    const { data, error } = await supabase.from('px_providers').update({ name: dbProvider.name }).eq('id', id).select().single();
    if (error) return { error: error.message || "Error al actualizar proveedor" };
    return { data };
  } else {
    // New insert
    const { data, error } = await supabase.from('px_providers').insert([dbProvider]).select().single();
    if (error) {
        console.error("Error saving px_provider:", error.message || error);
        return { error: error.message || "Error al crear proveedor en la base de datos" };
    }
    return { data };
  }
}

export async function deletePxProvider(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('px_providers').delete().eq('id', id);
  return { error };
}

// --- RAZONES DE DEVOLUCIÓN ---

export async function getReturnReasons() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('return_reasons').select(RETURN_REASON_SELECT).eq('active', true).order('name');
  if (error) {
    console.error("Error fetching return_reasons:", JSON.stringify(error, null, 2));
    return [];
  }
  return data || [];
}

export async function saveReturnReason(reason: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { id, ...payload } = reason;

  const name = (payload.nombre || payload.name || '').trim();
  if (!name) return { error: "El nombre de la razón es requerido" };

  if (id) {
    const { data, error } = await supabase.from('return_reasons').update({ name }).eq('id', id).select().single();
    if (error) return { error: error.message || "Error al actualizar la razón" };
    return { data };
  }
  const { data, error } = await supabase.from('return_reasons').insert([{ name }]).select().single();
  if (error) {
    console.error("Error saving return_reason:", error.message || error);
    return { error: error.message || "Error al crear la razón de devolución" };
  }
  return { data };
}

export async function deleteReturnReason(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('return_reasons').delete().eq('id', id);
  return { error };
}


// --- MODELOS ---

export async function getModels() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const cached = getCachedReferenceCatalog<any>('models');
  if (cached) return cached;
  const { data, error } = await supabase.from('models').select(MODEL_SELECT).order('name');
  if (error) { 
    console.error("Error fetching models:", JSON.stringify(error, null, 2)); 
    return []; 
  }
  const rows = data || [];
  setCachedReferenceCatalog('models', rows);
  return rows;
}

export async function saveModel(model: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { id, ...payload } = model;
  
  // Mapping UI fields to DB fields
  const dbModel = {
    brand_id: payload.brand_id || payload.marcaId,
    code: (payload.nombre || payload.name || '').replace(/\s+/g, '-').toUpperCase(),
    name: payload.nombre || payload.name,
    technology_id: payload.tecnologiaId,
    series_count: payload.seriesCount,
    digits_per_series: payload.digitsPerSeries
  };

  if (id && id.length > 10) {
    const { data, error } = await supabase.from('models').update(dbModel).eq('id', id).select().single();
    if (!error) invalidateReferenceCatalogCache();
    return { data, error };
  } else {
    const { data, error } = await supabase.from('models').insert([dbModel]).select().single();
    if (!error) invalidateReferenceCatalogCache();
    return { data, error };
  }
}

export async function deleteModel(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('models').delete().eq('id', id);
  if (!error) invalidateReferenceCatalogCache();
  return { error };
}

// --- AGENCIAS ---

export async function getAgencies() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('agencies').select(AGENCY_SELECT).order('name');
  if (error) { 
    console.error("Error fetching agencies:", JSON.stringify(error, null, 2)); 
    return []; 
  }
  return data || [];
}

async function ensureClientId(supabase: any): Promise<string | null> {
  // Fuente primaria: env var con el UUID ya conocido de TC-DEFAULT.
  // Esto evita depender de una consulta SQL que puede fallar por permisos RLS.
  const envClientId = process.env.NEXT_PUBLIC_TC_DEFAULT_CLIENT_ID?.trim();
  if (envClientId) {
    console.log('[ensureClientId] ✅ Usando client_id desde NEXT_PUBLIC_TC_DEFAULT_CLIENT_ID:', envClientId);
    return envClientId;
  }

  // Fallback: intentar leer TC-DEFAULT desde la base de datos
  console.warn('[ensureClientId] ⚠️ NEXT_PUBLIC_TC_DEFAULT_CLIENT_ID no está definido. Consultando DB...');

  const { data: existing, error: selectError } = await supabase
    .from('clients')
    .select('id')
    .eq('code', 'TC-DEFAULT')
    .maybeSingle();
  if (selectError) {
    console.error(
      '[ensureClientId] ❌ Error al leer clients (TC-DEFAULT).\n' +
      '  → Agrega NEXT_PUBLIC_TC_DEFAULT_CLIENT_ID=<uuid> en .env.local\n' +
      '  → o ejecuta 007_clients_agencies_policies.sql en Supabase SQL Editor.',
      selectError
    );
    return null;
  }
  if (existing?.id) return existing.id;

  // Último recurso: cualquier cliente existente
  const { data: fallback } = await supabase
    .from('clients').select('id').limit(1).maybeSingle();
  if (fallback?.id) return fallback.id;

  console.error(
    '[ensureClientId] ❌ No se encontró ningún cliente y no hay env var.\n' +
    '  → Agrega NEXT_PUBLIC_TC_DEFAULT_CLIENT_ID=221f750b-3172-49eb-86cc-16871d925473 en .env.local'
  );
  return null;
}

export async function saveAgency(agency: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { id, ...payload } = agency;

  const clientId = await ensureClientId(supabase);
  if (!clientId) return { error: "No se pudo obtener el client_id de referencia" };

  const dbAgency: any = {
    code: id,
    name: payload.nombre,
    client_id: clientId,
    manager: payload.encargado,
    email: payload.email,
    phone: payload.telefono,
    address: payload.direccion
  };

  // Si tenemos el ID de la base de datos (UUID), lo usamos para asegurar el update
  if (payload.dbId) {
    dbAgency.id = payload.dbId;
  }

  const { data, error } = await supabase.from('agencies').upsert([dbAgency], { onConflict: 'client_id,code' }).select().single();
  if (error) {
    console.error("Error saving agency detail:", error);
    return { error: error.message || "Error desconocido al guardar en la base de datos" };
  }
  return { data };
}

export async function saveAgenciesBulk(agencies: any[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const clientId = await ensureClientId(supabase);
  if (!clientId) return { error: "No se pudo obtener el client_id de referencia" };

  const dbAgencies = agencies.map(a => ({
    code: a.id,
    name: a.nombre,
    client_id: clientId,
    manager: a.encargado,
    email: a.email,
    phone: a.telefono,
    address: a.direccion
  }));

  // Deduplicar por código antes de enviar a Supabase para evitar el error de ON CONFLICT
  const uniqueAgencies = Array.from(
    dbAgencies.reduce((map, agency) => {
      map.set(agency.code, agency);
      return map;
    }, new Map<string, any>()).values()
  );

  const { data, error } = await supabase.from('agencies').upsert(uniqueAgencies, { onConflict: 'client_id,code' });
  if (error) {
    console.error("Error saving agencies:", error);
    return { error: error.message };
  }
  return { data };
}

export async function deleteAgency(idOrCode: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Intentar borrar por UUID (Primary Key) si tiene formato UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
  
  if (isUUID) {
    const { error } = await supabase.from('agencies').delete().eq('id', idOrCode);
    return { error };
  } else {
    // 2. Fallback: borrar por código de agencia (para registros antiguos o compatibilidad)
    const { error } = await supabase.from('agencies').delete().eq('code', idOrCode);
    return { error };
  }
}

export async function deleteAgenciesBulk(ids: string[]) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { error } = await supabase.from('agencies').delete().in('id', ids);
  return { error };
}

// --- LOGISTICS CARRIERS ---

export async function getCarriers() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('logistics_carriers').select(CARRIER_SELECT).order('name');
  if (error) { 
    console.error("Error fetching carriers:", JSON.stringify(error, null, 2)); 
    return []; 
  }
  return data || [];
}

export async function saveCarrier(carrier: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { id, ...payload } = carrier;
  
  const name = payload.nombre || payload.name;
  if (!name) return { error: "El nombre del transporte es requerido" };

  const dbCarrier = {
    name: name,
    code: (payload.code || payload.id || name.replace(/\s+/g, '_').toUpperCase())
  };

  if (id && id.length > 10 && id.includes('-')) { // UUID
    const { data, error } = await supabase.from('logistics_carriers').update({ name: dbCarrier.name }).eq('id', id).select().single();
    return { data, error };
  } else {
    // New insert
    const { data, error } = await supabase.from('logistics_carriers').insert([dbCarrier]).select().single();
    if (error) return { error };
    return { data, error };
  }
}

export async function deleteCarrier(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('logistics_carriers').delete().eq('id', id);
  return { error };
}

// --- REPAIRS ---

export async function getRepairs() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('cat_repairs').select(CAT_REPAIR_SELECT).order('name');
  if (error) { 
    console.error("Error fetching repairs:", error); 
    return []; 
  }
  return data || [];
}

export async function saveRepair(repair: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  
  const { id, nombre } = repair;
  const dbRepair = { name: nombre };

  if (id && id.length > 10 && id.includes('-')) {
    const { data, error } = await supabase.from('cat_repairs').update(dbRepair).eq('id', id).select().single();
    return { data, error };
  } else {
    const { data, error } = await supabase.from('cat_repairs').insert([dbRepair]).select().single();
    return { data, error };
  }
}

export async function deleteRepair(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('cat_repairs').delete().eq('id', id);
  return { error };
}

// --- DIAGNOSTICS ---

export async function getDiagnostics() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('cat_diagnostics')
    .select(CAT_DIAGNOSTIC_SELECT)
    .order('name');

  if (error) { 
    console.error("Error fetching diagnostics:", error); 
    if (typeof window !== 'undefined') notify.error('Error de base de datos', { description: error.message });
    return []; 
  }
  
  // We can fetch relations separately to avoid PostgREST join issues
  const { data: relData } = await supabase.from('cat_diagnostic_repairs').select(CAT_DIAGNOSTIC_REPAIR_SELECT);
  
  return (data || []).map(d => {
    const rels = (relData || []).filter((r: any) => r.diagnostic_id === d.id);
    return {
      id: d.id,
      nombre: d.name,
      reparacionesIds: rels.map((r: any) => r.repair_id)
    };
  });
}

export async function saveDiagnosticConfig(diagnostic: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  
  const { id, nombre, reparacionesIds } = diagnostic;
  let diagnosticId = id;

  if (id && id.length > 10 && id.includes('-')) {
    const { error } = await supabase.from('cat_diagnostics').update({ name: nombre }).eq('id', id);
    if (error) return { error };
  } else {
    const { data, error } = await supabase.from('cat_diagnostics').insert([{ name: nombre }]).select().single();
    if (error) return { error };
    diagnosticId = data.id;
  }

  // Update relations
  if (reparacionesIds) {
    await supabase.from('cat_diagnostic_repairs').delete().eq('diagnostic_id', diagnosticId);
    
    if (reparacionesIds.length > 0) {
      const relations = reparacionesIds.map((rId: string) => ({
        diagnostic_id: diagnosticId,
        repair_id: rId
      }));
      await supabase.from('cat_diagnostic_repairs').insert(relations);
    }
  }

  return { success: true, id: diagnosticId };
}

export async function deleteDiagnosticConfig(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('cat_diagnostics').delete().eq('id', id);
  return { error };
}

// --- REACONDICIONADO TESTS ---

export async function getReacondicionadoTests() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('cat_reacondicionado_tests')
    .select(CAT_REACOND_TEST_SELECT)
    .order('name');

  if (error) { 
    console.error("Error fetching reacondicionado tests:", error); 
    return []; 
  }
  
  return data || [];
}

export async function saveReacondicionadoTest(test: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  
  const { id, nombre, technologyIds, modelIds } = test;
  const dbTest = { 
    name: nombre,
    technology_ids: technologyIds || [],
    model_ids: modelIds || []
  };

  if (id && id.length > 10 && id.includes('-')) {
    const { data, error } = await supabase.from('cat_reacondicionado_tests').update(dbTest).eq('id', id).select();
    if (error) console.error("Update error:", error);
    return { data: data ? data[0] : null, error };
  } else {
    const { data, error } = await supabase.from('cat_reacondicionado_tests').insert([dbTest]).select();
    if (error) console.error("Insert error:", error);
    return { data: data ? data[0] : null, error };
  }
}

export async function deleteReacondicionadoTest(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  const { error } = await supabase.from('cat_reacondicionado_tests').delete().eq('id', id);
  return { error };
}


// --- USUARIOS ---

export async function getProfiles() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  
    const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      is_active,
      created_at,
      avatar_url,
      employee_id,
      employees ( codigo_empleado, nombre_completo ),
      user_roles ( role, role_id )
    `)
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error("Error fetching profiles:", JSON.stringify(error, null, 2));
    return [{ id: 'error', full_name: 'ERROR DE DB', role: error.message }];
  }
  
  return data.map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    is_active: p.is_active,
    created_at: p.created_at,
    avatar_url: p.avatar_url,
    employee_id: p.employee_id,
    employee_code: p.employees?.codigo_empleado || null,
    employee_name: p.employees?.nombre_completo || null,
    role: p.user_roles && p.user_roles.length > 0 ? p.user_roles[0].role : 'Sin Rol',
    user_roles: p.user_roles // pasar el objeto completo para que getUsersWithRoles procese role_id
  }));
}

export async function saveProfile(profile: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };
  
  const { id, full_name, email, avatar_url, employee_id } = profile;
  if (!id) return { error: "ID de usuario requerido" };

  const updateData: any = { full_name };
  if (email !== undefined) updateData.email = email;
  if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
  if (employee_id !== undefined) updateData.employee_id = employee_id;

  const { data, error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("Error updating profile:", error);
    return { error };
  }
  return { data };
}

export async function assignUserRole(userId: string, role: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // Eliminar rol anterior
  await supabase.from('user_roles').delete().eq('user_id', userId);
  
  // Añadir rol al enum dinámicamente si no existe
  await supabase.rpc('add_app_role_value', { new_role: role });
  
  // Buscar el role_id de hr_positions
  const { data: posData } = await supabase.from('hr_positions').select('id').eq('name', role).single();
  const roleId = posData ? posData.id : null;

  // Asignar nuevo rol
  const { data, error } = await supabase.from('user_roles').insert({
    user_id: userId,
    role: role,
    role_id: roleId
  });

  if (error) {
    console.error("Error asignando rol:", error);
    return { error: error.message };
  }
  return { data };
}
