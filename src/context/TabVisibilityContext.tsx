
import React, { createContext, useContext, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { getOrganizationFeatures } from '@/config/organizationFeatures';
import { useTabVisibilitySettings, RoleKey } from '@/hooks/useTabVisibilitySettings';

const PLAYOFF_TAB_KEYS = new Set([
  'playoff',
  'playoffs',
  'match-forms-playoffs',
  'format-playoffs',
]);

interface TabVisibilityContextProps {
  isTabVisible: (tab: TabName | string) => boolean;
  loading: boolean;
}

const TabVisibilityContext = createContext<TabVisibilityContextProps | undefined>(undefined);

export const TabVisibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { settings, loading } = useTabVisibilitySettings();
  const { organizationSlug } = useOrganization();
  const features = getOrganizationFeatures(organizationSlug);
  const isSuperAdmin = user?.isSuperAdmin === true || user?.id === -1;

  const isTabVisible = useCallback((tab: TabName | string): boolean => {
    if (!features.playoffs && PLAYOFF_TAB_KEYS.has(tab)) {
      return false;
    }
    const userRole = resolveVisibilityRole(user, isSuperAdmin);
    const adminToPublicMapping: Record<string, string> = {
      'competition': 'competitie',
      'cup': 'beker',
      'playoffs': 'playoff',
    };

    // Use mapped tab name if it exists, otherwise use original
    const mappedTab = adminToPublicMapping[tab] || tab;

    // Match forms: login required tabs that respect visibility settings
    const isMatchFormTab =
      tab === 'match-forms-league' ||
      tab === 'match-forms-cup' ||
      tab === 'match-forms-playoffs';

    if (isMatchFormTab) {
      // Require login for match forms
      if (!user) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[TabVisibility] Match form tab "${tab}" requires login`);
        }
        return false;
      }
      
      const setting = settings.find(s => s.setting_name === tab);
      if (!setting) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[TabVisibility] No setting found for match form tab: ${tab}`);
        }
        return false;
      }
      
      // Check role-specific visibility
      const roleVisibility = setting.visibility?.[userRole];
      const isVisible = roleVisibility === true;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[TabVisibility] Match form tab "${tab}" for role "${userRole}":`, {
          settingFound: !!setting,
          roleVisibility,
          isVisible,
        });
      }
      
      return isVisible;
    }

    // Special case for match-forms - check if any match forms are visible
    if (tab === 'match-forms') {
      if (!user) return false;
      
      const leagueSetting = settings.find(s => s.setting_name === 'match-forms-league');
      const cupSetting = settings.find(s => s.setting_name === 'match-forms-cup');
      const playoffsSetting = settings.find(s => s.setting_name === 'match-forms-playoffs');
      
      return !!(
        leagueSetting?.visibility?.[userRole] || 
        cupSetting?.visibility?.[userRole] || 
        playoffsSetting?.visibility?.[userRole]
      );
    }

    // Admin tabs that require login and check visibility settings directly
    // Note: 'teams' is now only used for admin teams page (/admin/teams)
    const adminTabs = ['teams', 'users', 'players', 'scheidsrechters', 'schorsingen', 'financial', 'settings', 'blog-management', 'notification', 'format-competition', 'format-cup', 'format-playoffs'];
    
    // Special handling for 'teams': admin teams page only
    if (tab === 'teams') {
      // Require login for admin teams page
      if (!user) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[TabVisibility] Admin teams tab requires login`);
        }
        return false;
      }
      
      // Admin teams page - check for 'teams' setting (preferred) or 'teams-admin' (backward compatibility)
      let setting = settings.find(s => s.setting_name === 'teams');
      if (!setting) {
        // Fallback to teams-admin for backward compatibility
        setting = settings.find(s => s.setting_name === 'teams-admin');
      }
      
      if (!setting) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[TabVisibility] No setting found for admin teams tab`, {
            availableSettings: settings.map(s => s.setting_name),
          });
        }
        return false;
      }
      
      if (!setting.visibility || typeof setting.visibility !== 'object') {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[TabVisibility] Setting "teams" has invalid visibility structure:`, setting);
        }
        return false;
      }
      
      const roleVisibility = setting.visibility[userRole];
      const isVisible = roleVisibility === true;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[TabVisibility] Checking admin teams tab for role "${userRole}":`, {
          settingFound: !!setting,
          settingName: setting.setting_name,
          roleVisibility,
          isVisible,
        });
      }
      
      return isVisible;
    }
    
    if (adminTabs.includes(tab)) {
      // Require login for admin tabs
      if (!user) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[TabVisibility] Admin tab "${tab}" requires login`);
        }
        return false;
      }
      
      const setting = settings.find(s => s.setting_name === tab);
      if (!setting) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[TabVisibility] No setting found for tab: ${tab}`, {
            availableSettings: settings.map(s => s.setting_name),
          });
        }
        return false;
      }
      
      // Check if visibility object exists and has the role
      if (!setting.visibility || typeof setting.visibility !== 'object') {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[TabVisibility] Setting "${tab}" has invalid visibility structure:`, setting);
        }
        return false;
      }
      
      const roleVisibility = setting.visibility[userRole];
      const isVisible = roleVisibility === true; // Explicitly check for true, not just truthy
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[TabVisibility] Checking tab "${tab}" for role "${userRole}":`, {
          settingFound: !!setting,
          settingName: setting.setting_name,
          roleVisibility,
          isVisible,
        });
      }
      
      return isVisible;
    }

    // Essential public tabs that should always be visible as fallback
    const alwaysVisiblePublicTabs = ['algemeen', 'competitie', 'beker', 'reglement', 'teams', 'archief'];

    // Find the setting for public tabs
    const setting = settings.find(s => s.setting_name === mappedTab);

    // If no setting found, use safe fallback for essential public tabs
    if (!setting) {
      return alwaysVisiblePublicTabs.includes(mappedTab);
    }

    // Check role-specific visibility from the new structure
    const isVisibleForRole = setting.visibility?.[userRole] ?? setting.is_visible;

    if (!isVisibleForRole) {
      return false;
    }

    // If login is required but user is not authenticated, hide the tab
    if (setting.requires_login && !user) {
      return false;
    }

    return true;
  }, [settings, user, isSuperAdmin, features.playoffs]);

  return (
    <TabVisibilityContext.Provider value={{ isTabVisible, loading }}>
      {children}
    </TabVisibilityContext.Provider>
  );
};

// Helper: SuperAdmin volgt admin-zichtbaarheid per tenant (geen bypass).
function resolveVisibilityRole(
  user: { role?: string } | null | undefined,
  isSuperAdmin: boolean,
): RoleKey {
  if (!user) return 'public';
  if (isSuperAdmin) return 'admin';
  return getUserRole(user.role ?? '');
}

// Helper function to map user role to RoleKey
// Normalizes various role names (team_manager, team, manager, etc.) to player_manager
function getUserRole(role: string): RoleKey {
  const normalizedRole = String(role || '').toLowerCase();
  
  // Normalize team manager variants to player_manager
  if (['team', 'manager', 'team_manager', 'player-manager', 'player_manager'].includes(normalizedRole)) {
    return 'player_manager';
  }
  
  switch (normalizedRole) {
    case 'admin':
      return 'admin';
    case 'referee':
      return 'referee';
    default:
      return 'public';
  }
}

export const useTabVisibility = () => {
  const context = useContext(TabVisibilityContext);
  if (!context) {
    throw new Error("useTabVisibility must be used within a TabVisibilityProvider");
  }
  return context;
};

export type TabName =
  | "algemeen"
  | "competitie"
  | "playoff"
  | "beker"
  | "schorsingen"
  | "kaarten"
  | "reglement"
  | "teams"
  | "scheidsrechters"
  | "admin_match_forms_league"
  | "admin_match_forms_cup"
  | "admin_match_forms_playoffs";
