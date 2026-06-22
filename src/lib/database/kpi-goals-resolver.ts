import { resolveWorkshopGoal } from '@/lib/database/workshop-kpi';

type GoalRow = {
  stage?: string;
  user_id?: string | null;
  model_id?: string | null;
  technology_id?: string | null;
  daily_goal?: number;
  weekly_goal?: number;
};

/** Meta semanal de salida: solo etapa "listo", sin sumar diag+reac+rep (evita metas infladas). */
export function resolveWeeklyListoGoal(goals: GoalRow[]): number | null {
  const listoGoals = goals.filter((g) => g.stage === 'listo');
  if (listoGoals.length === 0) return null;

  const globals = listoGoals.filter((g) => !g.user_id && !g.model_id && !g.technology_id);
  if (globals.length > 0) {
    const best = globals.reduce((max, g) => {
      const w = Number(g.weekly_goal) || (Number(g.daily_goal) > 0 ? Number(g.daily_goal) * 5 : 0);
      return Math.max(max, w);
    }, 0);
    if (best > 0) return best;
  }

  const byUser = new Map<string, number>();
  listoGoals.forEach((g) => {
    if (!g.user_id) return;
    const weekly =
      Number(g.weekly_goal) || (Number(g.daily_goal) > 0 ? Number(g.daily_goal) * 5 : 0);
    if (weekly <= 0) return;
    const prev = byUser.get(g.user_id) ?? 0;
    byUser.set(g.user_id, Math.max(prev, weekly));
  });

  if (byUser.size > 0) {
    return Array.from(byUser.values()).reduce((sum, v) => sum + v, 0);
  }

  const fallback = resolveWorkshopGoal(goals, null, 'listo');
  return fallback.weekly > 0 ? fallback.weekly : null;
}

export function resolveDailyListoGoal(goals: GoalRow[]): number | null {
  const weekly = resolveWeeklyListoGoal(goals);
  if (weekly !== null && weekly > 0) return Math.round(weekly / 5);
  return null;
}
