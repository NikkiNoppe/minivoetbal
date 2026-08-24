
import React, { useState, useEffect, ReactNode } from 'react';
import { User } from '@/types/auth';
import { supabase } from '@/integrations/supabase/client';
import { resetUserContextCache } from '@/lib/supabaseUtils';
import { AuthContext, AuthContextType } from '@/hooks/useAuth';
import { getRpcSessionArgs, getSessionToken } from '@/lib/authSession';
import { USE_SUPABASE_AUTH } from '@/config/authFlags';
import {
  loginWithSupabaseAuthBridge,
  restoreSupabaseAuthBridgeSession,
  signOutSupabaseAuthBridge,
} from '@/lib/supabaseAuthBridge';
import {
  resolveOrganizationFromHostname,
  userBelongsToOrganization,
} from '@/services/organization/resolveOrganization';
import { getActiveOrgSlugOverride } from '@/config/organizationHosts';
import {
  clearSuperAdminActingOrg,
  getSuperAdminActingOrg,
  setSuperAdminActingOrg,
} from '@/lib/superAdminOrg';
import { setSuperAdminActingOrganization } from '@/services/organization/superAdminOrganizationService';
import { LoginError } from '@/lib/loginErrors';

function isSuperAdminUsername(username: string): boolean {
  return username.trim().toLowerCase() === 'superadmin';
}

function normalizeRole(role: string): string {
  const r = String(role || '').toLowerCase();
  if (['team', 'manager', 'team_manager', 'player-manager'].includes(r)) {
    return 'player_manager';
  }
  return role;
}

async function restoreSessionContext(sessionToken: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('restore_user_session', {
    p_session_token: sessionToken,
  });
  if (error) {
    console.warn('Could not restore session context:', error.message);
    return false;
  }
  return data === true;
}

async function fetchTeamIdFromSession(): Promise<number | undefined> {
  try {
    const { data, error } = await supabase.rpc('get_user_team_ids_secure', getRpcSessionArgs());
    if (error || !Array.isArray(data) || data.length === 0) {
      return undefined;
    }
    const first = data[0];
    return typeof first === 'number' ? first : undefined;
  } catch {
    return undefined;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authContextReady, setAuthContextReady] = useState(false);

  const persistAuthState = (userData: User | null, sessionToken?: string) => {
    if (userData && sessionToken) {
      const authData = {
        user: userData,
        sessionToken,
        expires: Date.now() + (24 * 60 * 60 * 1000),
      };
      localStorage.setItem('auth_data', JSON.stringify(authData));
    } else {
      localStorage.removeItem('auth_data');
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedAuth = localStorage.getItem('auth_data');
        if (!storedAuth) {
          setAuthContextReady(true);
          return;
        }

        const authData = JSON.parse(storedAuth);
        if (!authData.user || !authData.sessionToken || authData.expires <= Date.now()) {
          localStorage.removeItem('auth_data');
          setAuthContextReady(true);
          return;
        }

        if (USE_SUPABASE_AUTH) {
          const bridge = await restoreSupabaseAuthBridgeSession();
          if (!bridge) {
            localStorage.removeItem('auth_data');
            setAuthContextReady(true);
            return;
          }
          persistAuthState(bridge.user, bridge.sessionToken);
          setUser(bridge.user);
          setIsAuthenticated(true);
          setAuthContextReady(true);
          return;
        }

        const restored = await restoreSessionContext(authData.sessionToken);
        if (!restored) {
          localStorage.removeItem('auth_data');
          setAuthContextReady(true);
          return;
        }

        let nextUser = authData.user as User;
        if (normalizeRole(nextUser.role) === 'player_manager' && !nextUser.teamId) {
          const teamId = await fetchTeamIdFromSession();
          if (teamId) {
            nextUser = { ...nextUser, teamId };
            persistAuthState(nextUser, authData.sessionToken);
          }
        }

        const isSuperAdminUser =
          nextUser.isSuperAdmin === true || nextUser.id === -1;

        if (isSuperAdminUser) {
          let orgId = getSuperAdminActingOrg()?.organizationId;
          let orgSlug = getSuperAdminActingOrg()?.slug;
          if (orgId == null) {
            try {
              const hostOrg = await resolveOrganizationFromHostname({
                orgSlugOverride: getActiveOrgSlugOverride({
                  isSuperAdmin: true,
                }),
              });
              orgId = hostOrg.id;
              orgSlug = hostOrg.slug;
            } catch {
              console.error(
                'SuperAdmin: organisatie kon niet worden bepaald; acting org niet gezet.',
              );
              setAuthContextReady(true);
              setLoading(false);
              return;
            }
          }
          const applied = await setSuperAdminActingOrganization(orgId);
          if (applied) {
            nextUser = { ...nextUser, organizationId: orgId };
            if (orgSlug) {
              setSuperAdminActingOrg({ organizationId: orgId, slug: orgSlug });
            }
            persistAuthState(nextUser, authData.sessionToken);
          }
        }

        try {
          const hostOrg = await resolveOrganizationFromHostname({
            orgSlugOverride: getActiveOrgSlugOverride({
              isSuperAdmin: isSuperAdminUser,
            }),
          });
          if (
            !userBelongsToOrganization(
              nextUser.organizationId,
              hostOrg.id,
              isSuperAdminUser,
            )
          ) {
            localStorage.removeItem('auth_data');
            setAuthContextReady(true);
            return;
          }
        } catch {
          localStorage.removeItem('auth_data');
          setAuthContextReady(true);
          return;
        }

        setUser(nextUser);
        setIsAuthenticated(true);
        setAuthContextReady(true);
      } catch (error) {
        console.error('Error loading auth state:', error);
        localStorage.removeItem('auth_data');
        setAuthContextReady(true);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      if (isSuperAdminUsername(username)) {
        const { data, error } = await supabase.rpc('login_super_admin', {
          p_password: password.trim(),
        });
        if (error || !data?.[0]?.session_token) {
          if (error) {
            console.error('SuperAdmin login RPC error:', error.message);
          }
          throw new LoginError(
            'Ongeldige gebruikersnaam of wachtwoord.',
            'invalid_credentials',
          );
        }

        const sessionToken = data[0].session_token;
        const superAdminUser: User = {
          id: -1,
          username: 'SuperAdmin',
          password: '',
          role: 'admin',
          email: '',
          isSuperAdmin: true,
        };

        persistAuthState(superAdminUser, sessionToken);

        let nextUser: User = superAdminUser;
        try {
          await restoreSessionContext(sessionToken);

          let orgId: number;
          let orgSlug: string;
          try {
            const hostOrg = await resolveOrganizationFromHostname({
              orgSlugOverride: getActiveOrgSlugOverride({ isSuperAdmin: true }),
            });
            orgId = hostOrg.id;
            orgSlug = hostOrg.slug;
          } catch {
            const stored = getSuperAdminActingOrg();
            if (stored?.organizationId == null || !stored.slug) {
              throw new LoginError(
                'Organisatie kon niet worden bepaald. Open de juiste site of kies een tenant.',
                'invalid_credentials',
              );
            }
            orgId = stored.organizationId;
            orgSlug = stored.slug;
          }

          const applied = await setSuperAdminActingOrganization(
            orgId,
            sessionToken,
          );
          nextUser = applied
            ? { ...superAdminUser, organizationId: orgId }
            : superAdminUser;

          if (applied) {
            setSuperAdminActingOrg({ organizationId: orgId, slug: orgSlug });
            persistAuthState(nextUser, sessionToken);
          } else {
            console.warn(
              'SuperAdmin: tenant niet gekoppeld aan sessie, login gaat door.',
            );
          }
        } catch (setupError) {
          console.error('SuperAdmin post-login setup failed:', setupError);
        }

        setUser(nextUser);
        setIsAuthenticated(true);
        resetUserContextCache();
        setAuthContextReady(true);
        return true;
      }

      if (USE_SUPABASE_AUTH) {
        const bridge = await loginWithSupabaseAuthBridge(username, password);
        if (bridge) {
          setUser(bridge.user);
          setIsAuthenticated(true);
          persistAuthState(bridge.user, bridge.sessionToken);
          resetUserContextCache();
          setAuthContextReady(true);
          return true;
        }
        return false;
      }

      let hostOrg;
      try {
        hostOrg = await resolveOrganizationFromHostname({
          orgSlugOverride: getActiveOrgSlugOverride({ isSuperAdmin: false }),
        });
      } catch {
        throw new LoginError(
          'Organisatie kon niet worden bepaald voor deze site.',
          'invalid_credentials',
        );
      }

      const { data, error } = await supabase.rpc('login_user', {
        input_username_or_email: username,
        input_password: password,
        p_organization_id: hostOrg.id,
      });

      if (error) {
        console.error('Login RPC error:', error);
        const rpcMessage = (error.message || '').trim();
        if (/te veel inlogpogingen/i.test(rpcMessage)) {
          throw new LoginError(rpcMessage, 'rate_limited');
        }
        throw new LoginError(
          'Gebruikersnaam/e-mail of wachtwoord is onjuist.',
          'invalid_credentials',
        );
      }

      if (!data?.[0]) {
        throw new LoginError(
          'Gebruikersnaam/e-mail of wachtwoord is onjuist.',
          'invalid_credentials',
        );
      }

      const userData = data[0];
      const teamIds = userData.team_ids as number[] | null;
      const teamId = Array.isArray(teamIds) && teamIds.length > 0 ? teamIds[0] : undefined;

      const loggedInUser: User = {
        id: userData.user_id,
        username: userData.username,
        password: '',
        role: userData.role as User['role'],
        email: userData.email || '',
        isSuperAdmin: false,
        organizationId: userData.organization_id,
        ...(teamId !== undefined ? { teamId } : {}),
      };

      try {
        if (
          !userBelongsToOrganization(
            loggedInUser.organizationId,
            hostOrg.id,
            false,
          )
        ) {
          await supabase.rpc('logout_user', {
            p_session_token: userData.session_token,
          });
          throw new LoginError(
            `Dit account hoort bij een andere organisatie en kan niet inloggen op ${hostOrg.name}.`,
            'wrong_organization',
          );
        }
      } catch (error) {
        if (error instanceof LoginError) {
          throw error;
        }
        throw new LoginError(
          'Organisatie kon niet worden bepaald voor deze site.',
          'invalid_credentials',
        );
      }

      setUser(loggedInUser);
      setIsAuthenticated(true);
      persistAuthState(loggedInUser, userData.session_token);
      resetUserContextCache();
      setAuthContextReady(true);
      return true;
    } catch (error) {
      if (error instanceof LoginError) {
        throw error;
      }
      console.error('Login error:', error);
      throw new LoginError(
        'Er is een onverwachte fout opgetreden tijdens het inloggen.',
        'invalid_credentials',
      );
    }
  };

  const logout = async () => {
    const sessionToken = getSessionToken();
    if (sessionToken) {
      try {
        await supabase.rpc('logout_user', { p_session_token: sessionToken });
      } catch (e) {
        console.warn('Could not revoke session server-side:', e);
      }
    }
    if (USE_SUPABASE_AUTH) {
      await signOutSupabaseAuthBridge();
    }
    setUser(null);
    setIsAuthenticated(false);
    persistAuthState(null);
    clearSuperAdminActingOrg();
    resetUserContextCache();
    try {
      sessionStorage.removeItem('dismissedNotifications');
    } catch (e) {
      console.warn('Could not clear dismissed notifications:', e);
    }
    setAuthContextReady(true);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    loading,
    authContextReady,
    isSuperAdmin: user?.isSuperAdmin === true,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
