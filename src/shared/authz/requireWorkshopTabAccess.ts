import { loadUserAuthz } from './permissions';
import {
  canAccessWorkshopTab,
  type WorkshopPermissionTab,
} from './workshopTabPermissions';

export async function userCanAccessWorkshopTab(
  userId: string,
  tab: WorkshopPermissionTab,
  action: 'view' | 'edit',
): Promise<boolean> {
  const authz = await loadUserAuthz(userId);
  return canAccessWorkshopTab(authz, tab, action);
}
