import { TALLER_KPI_GOAL_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function getKpiGoals() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from('taller_kpi_goals')
    .select(TALLER_KPI_GOAL_SELECT)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching kpi goals:", error);
    return [];
  }
  return data || [];
}

export async function saveKpiGoal(goal: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase no configurado" };

  const { id, user_id, stage, technology_id, model_id, daily_goal, weekly_goal } = goal;

  const dbGoal = {
    user_id,
    stage,
    technology_id,
    model_id,
    daily_goal: parseInt(daily_goal) || 0,
    weekly_goal: parseInt(weekly_goal) || 0,
    updated_at: new Date().toISOString()
  };

  if (id && id !== 'new') {
    const { data, error } = await supabase
      .from('taller_kpi_goals')
      .update(dbGoal)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error("Error actualizando meta:", error);
      return { error: error.message };
    }
    return { data };
  } else {
    const { data, error } = await supabase
      .from('taller_kpi_goals')
      .insert([dbGoal])
      .select()
      .single();
    if (error) {
      console.error("Error creando meta:", error);
      return { error: error.message };
    }
    return { data };
  }
}

export async function deleteKpiGoal(id: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase no configurado" };
  const { error } = await supabase.from('taller_kpi_goals').delete().eq('id', id);
  return { error };
}
