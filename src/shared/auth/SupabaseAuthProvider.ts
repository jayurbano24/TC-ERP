import { injectable } from 'tsyringe';
import { IAuthProvider, AuthUser } from './IAuthProvider';
import { createClient } from '../../lib/supabase/client';

@injectable()
export class SupabaseAuthProvider implements IAuthProvider {
  async getCurrentUser(): Promise<AuthUser | null> {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) return null;
    
    return {
      id: user.id,
      email: user.email || '',
      appMetadata: user.app_metadata,
      userMetadata: user.user_metadata
    };
  }

  async signOut(): Promise<void> {
    const supabase = createClient();
    await supabase.auth.signOut();
  }
}
