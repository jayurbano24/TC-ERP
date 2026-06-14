export interface AuthUser {
  id: string;
  email: string;
  appMetadata: any;
  userMetadata: any;
}

export interface IAuthProvider {
  getCurrentUser(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  // Métodos adicionales según se requieran (login, signup, passwordReset)
}
