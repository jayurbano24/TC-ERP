import {
  ACCESSORY_BOX_LIST_SELECT,
  ACCESSORY_BOX_SELECT,
  ACCESSORY_MOVEMENT_SELECT,
  ACCESSORY_SELECT,
} from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export async function getAccessories() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('accessories')
    .select(ACCESSORY_SELECT)
    .order('name');
    
  if (error) {
    console.error('Error fetching accessories:', error.message || error.code || error);
    return [];
  }
  return data;
}

export async function createAccessory(name: string, characteristics?: string, comments?: string, sku?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const payload: Record<string, string | null> = {
    name: name.trim(),
    sku: sku?.trim() || null,
    characteristics: characteristics?.trim() || null,
    comments: comments?.trim() || null,
  };

  const { data, error } = await supabase
    .from('accessories')
    .insert([payload])
    .select(ACCESSORY_SELECT)
    .single();

  if (error) return { error: error.message };
  return { data };
}

export async function registerAccessoryEntry(
  accessoryId: string, 
  condition: 'NEW' | 'RECOVERED', 
  boxQuantities: number[],
  sapNumber?: string,
  initialStatus?: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const totalQuantity = boxQuantities.reduce((a, b) => a + b, 0);

  const { error } = await supabase
    .from('accessory_movements')
    .insert([{
      accessory_id: accessoryId,
      movement_type: 'IN',
      condition,
      quantity: totalQuantity,
      sap_transfer_number: sapNumber,
      created_by: userId
    }]);

  if (error) return { error: error.message };

  let generatedOrders: string[] = [];

  if (condition === 'RECOVERED' && initialStatus) {
    for (let i = 0; i < boxQuantities.length; i++) {
      const { data: orderData } = await supabase.rpc('get_next_recovery_order');
      const recoveryOrder = orderData || `REC-ACC-${Date.now().toString().slice(-6)}-${i}`;
      generatedOrders.push(recoveryOrder);
      
      const { error: boxError } = await supabase
        .from('accessory_boxes')
        .insert([{
          recovery_order: recoveryOrder,
          accessory_id: accessoryId,
          quantity: boxQuantities[i],
          status: initialStatus,
          created_by: userId
        }]);
      if (boxError) console.error('Error creating accessory box:', boxError);
    }
  }

  return { success: true, recoveryOrders: generatedOrders };
}

export async function registerAccessoryDispatch(
  accessoryId: string, 
  condition: 'NEW' | 'RECOVERED', 
  quantity: number, 
  destination: string,
  notes?: string,
  boxId?: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  // Verify stock first
  const { data: accessory } = await supabase
    .from('accessories')
    .select(ACCESSORY_SELECT)
    .eq('id', accessoryId)
    .single();

  if (!accessory) return { error: 'Accesorio no encontrado' };

  if (condition === 'NEW' && accessory.qty_new < quantity) {
    return { error: `Stock insuficiente. Tienes ${accessory.qty_new} accesorios nuevos.` };
  }
  
  if (condition === 'RECOVERED') {
    if (accessory.qty_recovered < quantity) {
      return { error: `Stock insuficiente. Tienes ${accessory.qty_recovered} accesorios recuperados en total.` };
    }
    
    if (boxId) {
      // Dispatch from specific box
      const { data: box } = await supabase.from('accessory_boxes').select(ACCESSORY_BOX_SELECT).eq('id', boxId).single();
      if (!box || box.status !== 'Clasificado Y Limpio') {
        return { error: 'Caja no encontrada o no está en estado Limpio.' };
      }
      if (box.quantity < quantity) {
        return { error: `La caja seleccionada solo tiene ${box.quantity} accesorios.` };
      }
      await supabase.from('accessory_boxes').update({ quantity: box.quantity - quantity, updated_at: new Date().toISOString() }).eq('id', boxId);
    } else {
      // Check clean boxes and deduct sequentially
      const { data: cleanBoxes } = await supabase
        .from('accessory_boxes')
        .select(ACCESSORY_BOX_SELECT)
        .eq('accessory_id', accessoryId)
        .eq('status', 'Clasificado Y Limpio')
        .gt('quantity', 0)
        .order('created_at', { ascending: true });
        
      let totalClean = 0;
      cleanBoxes?.forEach(b => totalClean += b.quantity);
      
      if (totalClean < quantity) {
        return { error: `Stock insuficiente en estado LIMPIO. Tienes ${totalClean} accesorios listos para despachar de este tipo.` };
      }
      
      // Deduct from clean boxes
      let remainingToDispatch = quantity;
      for (const box of (cleanBoxes || [])) {
        if (remainingToDispatch <= 0) break;
        const deduct = Math.min(box.quantity, remainingToDispatch);
        remainingToDispatch -= deduct;
        const newQty = box.quantity - deduct;
        await supabase.from('accessory_boxes').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', box.id);
      }
    }
  }

  const { error } = await supabase
    .from('accessory_movements')
    .insert([{
      accessory_id: accessoryId,
      movement_type: 'OUT',
      condition,
      quantity,
      destination,
      notes,
      created_by: userId
    }]);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getAccessoryBoxes() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('accessory_boxes')
    .select(ACCESSORY_BOX_LIST_SELECT)
    .gt('quantity', 0)
    .order('created_at', { ascending: false });

  if (error) return [];
  
  if (!data || data.length === 0) return data;

  const userIds = [...new Set(data.map(d => d.created_by).filter(Boolean))];
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
    if (profilesData) {
      const profileMap = Object.fromEntries(profilesData.map(p => [p.id, p]));
      return data.map(d => ({
        ...d,
        profiles: d.created_by ? profileMap[d.created_by] : null
      }));
    }
  }
  return data;
}

export async function updateAccessoryBoxStatus(boxId: string, newStatus: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const { error } = await supabase
    .from('accessory_boxes')
    .update({ 
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', boxId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteAccessoryBox(boxId: string, boxQty: number, accessoryId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase
    .from('accessory_boxes')
    .delete()
    .eq('id', boxId)
    .select();

  if (error) return { error: error.message };
  
  if (!data || data.length === 0) {
    return { error: "La caja no existía o ya fue eliminada" };
  }

  // Insert adjustment movement to deduct from inventory only if box was deleted
  await supabase.from('accessory_movements').insert([{
    accessory_id: accessoryId,
    movement_type: 'OUT',
    condition: 'RECOVERED',
    quantity: boxQty,
    destination: 'Ajuste (Caja Eliminada)',
    created_by: userId
  }]);

  return { success: true };
}

export async function updateAccessoryBox(boxId: string, accessoryId: string, oldQty: number, newQty: number, location: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase
    .from('accessory_boxes')
    .update({ 
      quantity: newQty,
      location: location,
      updated_at: new Date().toISOString()
    })
    .eq('id', boxId)
    .select();

  if (error) return { error: error.message };
  
  if (!data || data.length === 0) {
    return { error: "La caja no existía o ya fue actualizada" };
  }

  // Handle inventory adjustments if quantity changed
  const diff = newQty - oldQty;
  if (diff > 0) {
    await supabase.from('accessory_movements').insert([{
      accessory_id: accessoryId,
      movement_type: 'IN',
      condition: 'RECOVERED',
      quantity: diff,
      sap_transfer_number: 'Ajuste (Aumento de Caja)',
      created_by: userId
    }]);
  } else if (diff < 0) {
    await supabase.from('accessory_movements').insert([{
      accessory_id: accessoryId,
      movement_type: 'OUT',
      condition: 'RECOVERED',
      quantity: Math.abs(diff),
      destination: 'Ajuste (Reducción de Caja)',
      created_by: userId
    }]);
  }

  return { success: true };
}

export async function bulkUpdateAccessoryBoxLocation(boxIds: string[], location: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase no configurado' };

  const { error } = await supabase
    .from('accessory_boxes')
    .update({ 
      location: location,
      updated_at: new Date().toISOString()
    })
    .in('id', boxIds);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getAccessoryMovements(accessoryId?: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  let query = supabase
    .from('accessory_movements')
    .select(`${ACCESSORY_MOVEMENT_SELECT}, accessories(name, sku)`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (accessoryId) {
    query = query.eq('accessory_id', accessoryId);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching accessory movements:', error);
    return [];
  }
  
  if (!data || data.length === 0) return data;

  const userIds = [...new Set(data.map(d => d.created_by).filter(Boolean))];
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase.from('profiles').select('id, full_name, employees(nombre_completo)').in('id', userIds);
    if (profilesData) {
      const profileMap = Object.fromEntries(profilesData.map(p => {
        let name = (p.employees as any)?.nombre_completo || p.full_name;
        if (name && name.includes('@')) {
          name = name.split('@')[0];
        }
        return [p.id, { full_name: name }];
      }));
      return data.map(d => ({
        ...d,
        profiles: d.created_by ? profileMap[d.created_by] : null
      }));
    }
  }
  return data;
}
