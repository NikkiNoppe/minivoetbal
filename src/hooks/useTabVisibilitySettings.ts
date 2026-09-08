
import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import {
  insertApplicationSettingForSession,
  listApplicationSettingsForSession,
  updateApplicationSettingForSession,
} from "@/services/core/applicationSettingsSessionFetch";
import { fetchPublicApplicationSettings } from "@/services/public/publicApplicationSettingsFetch";

export type RoleKey = 'public' | 'player_manager' | 'referee' | 'admin';

export interface RoleVisibility {
  public: boolean;
  player_manager: boolean;
  referee: boolean;
  admin: boolean;
}

export interface TabVisibilitySetting {
  id: number;
  setting_name: string;
  is_visible: boolean; // Legacy - kept for backwards compatibility
  requires_login: boolean;
  visibility: RoleVisibility;
}

const DEFAULT_VISIBILITY: RoleVisibility = {
  public: true,
  player_manager: true,
  referee: true,
  admin: true,
};

// Hidden by default visibility (only admin can see)
const HIDDEN_VISIBILITY: RoleVisibility = {
  public: false,
  player_manager: false,
  referee: false,
  admin: true,
};

export const useTabVisibilitySettings = () => {
  const { toast } = useToast();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  // Initialize with safe defaults to prevent redirect loops during loading
  const [settings, setSettings] = useState<TabVisibilitySetting[]>([
    { id: -1, setting_name: 'algemeen', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
    { id: -2, setting_name: 'competitie', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
    { id: -3, setting_name: 'playoff', is_visible: false, requires_login: false, visibility: HIDDEN_VISIBILITY },
    { id: -4, setting_name: 'beker', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
    { id: -5, setting_name: 'reglement', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
    { id: -6, setting_name: 'teams', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
  ]);
  const [loading, setLoading] = useState(true);
  // Track updates in progress to prevent race conditions
  const updatingRef = useRef<Set<string>>(new Set());
  // Track if we're currently fetching to prevent refetch during updates
  const fetchingRef = useRef(false);

  const fetchSettings = useCallback(async () => {
    if (organizationId == null) return;
    try {
      const rows = await fetchPublicApplicationSettings(['tab_visibility'], organizationId);
      const data = [...rows].sort((a, b) => a.setting_name.localeCompare(b.setting_name));

      if (process.env.NODE_ENV === 'development') {
        console.log(`[TabVisibilitySettings] Fetched ${data.length} settings from database`);
      }
      
      const mappedSettings = data.map(item => {
        const settingValue = item.setting_value as any;
        
        // Parse new visibility structure or fallback to legacy
        const visibility: RoleVisibility = settingValue?.visibility || DEFAULT_VISIBILITY;
        
        // Debug logging for tab visibility settings (only in development)
        // Removed verbose logging for production performance
        
        return {
          id: item.id,
          setting_name: item.setting_name,
          is_visible: Object.values(visibility).some(v => v),
          requires_login: settingValue?.requires_login ?? false,
          visibility,
        };
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[TabVisibilitySettings] Loaded ${mappedSettings.length} settings`);
      }
      setSettings(mappedSettings);
    } catch (error) {
      console.error('Error fetching tab settings:', error);
      // Fallback to main tabs only with default visibility
      setSettings([
        { id: 1, setting_name: 'algemeen', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
        { id: 2, setting_name: 'competitie', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
        { id: 3, setting_name: 'playoff', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
        { id: 4, setting_name: 'beker', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
        { id: 5, setting_name: 'schorsingen', is_visible: true, requires_login: false, visibility: { ...DEFAULT_VISIBILITY, public: false, referee: false } },
        { id: 6, setting_name: 'teams', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
        { id: 7, setting_name: 'reglement', is_visible: true, requires_login: false, visibility: DEFAULT_VISIBILITY },
      ]);
      toast({
        title: "Info",
        description: "Gebruikt standaard tab instellingen voor hoofdtabs",
      });
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [toast, organizationId]);

  const updateRoleVisibility = async (settingName: string, role: RoleKey, isVisible: boolean) => {
    // Create unique key for this update
    const updateKey = `${settingName}-${role}`;
    
    // Prevent duplicate updates
    if (updatingRef.current.has(updateKey)) {
      console.log(`[TabVisibilitySettings] Update already in progress for ${updateKey}, skipping...`);
      return;
    }
    
    updatingRef.current.add(updateKey);
    
    // Store original state for rollback
    let originalSetting = settings.find(s => s.setting_name === settingName);
    
    // For 'teams', also check 'teams-admin' as fallback
    if (!originalSetting && settingName === 'teams') {
      originalSetting = settings.find(s => s.setting_name === 'teams-admin');
      // If found, we'll update teams-admin but also create/update 'teams' setting
      if (originalSetting) {
        // Use 'teams' as the setting name going forward
        settingName = 'teams';
      }
    }
    
    // If setting doesn't exist, create it with default visibility
    if (!originalSetting) {
      const defaultVisibility: RoleVisibility = {
        public: false,
        player_manager: false,
        referee: false,
        admin: true,
      };
      
      const newId = await insertApplicationSettingForSession({
        setting_category: 'tab_visibility',
        setting_name: settingName,
        setting_value: {
          visibility: defaultVisibility,
          requires_login: true,
        },
      });

      const createdRows = await listApplicationSettingsForSession('tab_visibility');
      const newSetting = createdRows.find((row) => row.id === newId);
      if (!newSetting) {
        updatingRef.current.delete(updateKey);
        throw new Error('Failed to create setting');
      }

      const settingValue = newSetting.setting_value as any;
      originalSetting = {
        id: newSetting.id,
        setting_name: newSetting.setting_name,
        is_visible: Object.values(settingValue?.visibility || defaultVisibility).some(v => v),
        requires_login: settingValue?.requires_login ?? true,
        visibility: settingValue?.visibility || defaultVisibility,
      };
      
      // Add to local state
      setSettings(prev => [...prev, originalSetting!]);
    }

    try {
      const newVisibility = {
        ...originalSetting.visibility,
        [role]: isVisible,
      };

      const newSettingValue = {
        visibility: newVisibility,
        requires_login: originalSetting.requires_login,
      };

      const anyVisible = Object.values(newVisibility).some(v => v);

      setSettings(prev =>
        prev.map(setting =>
          setting.setting_name === settingName
            ? { ...setting, visibility: newVisibility, is_visible: anyVisible }
            : setting
        )
      );

      await updateApplicationSettingForSession(originalSetting.id, {
        setting_value: newSettingValue,
        setting_category: 'tab_visibility',
      });

      if (settingName === 'teams-admin') {
        const tabRows = await listApplicationSettingsForSession('tab_visibility');
        const existingTeams = tabRows.find((row) => row.setting_name === 'teams');

        if (!existingTeams) {
          await insertApplicationSettingForSession({
            setting_category: 'tab_visibility',
            setting_name: 'teams',
            setting_value: newSettingValue,
          });
        } else {
          await updateApplicationSettingForSession(existingTeams.id, {
            setting_value: newSettingValue,
            setting_category: 'tab_visibility',
          });
        }
      }

      // Verify the update was successful by reading back from database
      // This ensures we have the correct state and prevents race conditions
      // Retry verification up to 3 times with increasing delays
      let verified = false;
      let verifyAttempts = 0;
      const maxVerifyAttempts = 3;
      
      while (!verified && verifyAttempts < maxVerifyAttempts) {
        verifyAttempts++;
        const delay = verifyAttempts * 200; // 200ms, 400ms, 600ms
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        let verifyData: { id: number; setting_name: string; setting_value: unknown } | undefined;
        try {
          const tabRows = await listApplicationSettingsForSession('tab_visibility');
          verifyData = tabRows.find((row) => row.setting_name === settingName);
          if (!verifyData) throw new Error('Setting not found');
        } catch (verifyError) {
          console.warn(`[TabVisibilitySettings] Verification attempt ${verifyAttempts} failed for ${settingName}:`, verifyError);
          if (verifyAttempts >= maxVerifyAttempts) {
            console.warn(`[TabVisibilitySettings] Could not verify update for ${settingName} after ${maxVerifyAttempts} attempts. Keeping optimistic update.`);
            verified = true;
          }
          continue;
        }

        if (verifyData) {
          // Update state with verified data from database
          const verifiedSettingValue = verifyData.setting_value as any;
          const verifiedVisibility: RoleVisibility = verifiedSettingValue?.visibility || DEFAULT_VISIBILITY;
          const verifiedVisible = Object.values(verifiedVisibility).some(v => v);

          // Verify that the role visibility matches what we tried to set
          const expectedVisibility = isVisible;
          const actualVisibility = verifiedVisibility[role];
          
          if (actualVisibility === expectedVisibility) {
            setSettings(prev =>
              prev.map(setting =>
                setting.setting_name === settingName
                  ? {
                      ...setting,
                      visibility: verifiedVisibility,
                      is_visible: verifiedVisible,
                      requires_login: verifiedSettingValue?.requires_login ?? false,
                    }
                  : setting
              )
            );

            console.log(`[TabVisibilitySettings] Verified update for ${settingName} (attempt ${verifyAttempts}):`, {
              role,
              expectedVisibility,
              actualVisibility,
              visibility: verifiedVisibility,
            });
            verified = true;
          } else {
            console.warn(`[TabVisibilitySettings] Verification mismatch for ${settingName} (attempt ${verifyAttempts}):`, {
              role,
              expectedVisibility,
              actualVisibility,
              visibility: verifiedVisibility,
            });
            if (verifyAttempts >= maxVerifyAttempts) {
              // Mismatch after all attempts - keep optimistic update
              console.warn(`[TabVisibilitySettings] Keeping optimistic update despite verification mismatch`);
              verified = true;
            }
          }
        }
      }

      // Don't refetch immediately - we've already updated with verified data
      // The optimistic update + verification update should be sufficient
      // Other components will get updates via realtime subscription if needed
      // Only refetch if no other updates are in progress after a longer delay
      // This prevents the refetch from overwriting the verified state
      setTimeout(async () => {
        // Only refetch if no other updates are in progress and we're not currently fetching
        if (updatingRef.current.size === 0 && !fetchingRef.current) {
          console.log(`[TabVisibilitySettings] Refetching all settings after update for ${settingName}`);
          await fetchSettings();
        } else {
          console.log(`[TabVisibilitySettings] Skipping refetch - updates/fetch in progress`, {
            updatingKeys: Array.from(updatingRef.current),
            fetching: fetchingRef.current,
          });
        }
      }, 2000); // Increased delay to ensure database is fully propagated

      toast({
        title: "Instelling bijgewerkt",
        description: `Zichtbaarheid voor "${settingName}" is aangepast`,
      });
    } catch (error) {
      console.error('Error updating role visibility:', error);
      toast({
        title: "Fout bij opslaan",
        description: "Kon instelling niet bijwerken",
        variant: "destructive",
      });
    } finally {
      updatingRef.current.delete(updateKey);
    }
  };

  // Legacy update function for backwards compatibility
  const updateSetting = async (settingName: string, updates: Partial<TabVisibilitySetting>) => {
    try {
      const currentSetting = settings.find(s => s.setting_name === settingName);
      if (!currentSetting) throw new Error('Setting not found');

      let settingValue: Record<string, unknown>;
      if (typeof updates.is_visible === 'boolean') {
        settingValue = {
          visibility: {
            ...currentSetting.visibility,
            public: updates.is_visible,
          },
          requires_login: currentSetting.requires_login,
        };
      } else if (typeof updates.requires_login === 'boolean') {
        settingValue = {
          visibility: currentSetting.visibility,
          requires_login: updates.requires_login,
        };
      } else {
        throw new Error('Geen geldige update');
      }

      await updateApplicationSettingForSession(currentSetting.id, {
        setting_value: settingValue,
        setting_category: 'tab_visibility',
      });

      setSettings(prev =>
        prev.map(setting =>
          setting.setting_name === settingName
            ? {
                ...setting,
                is_visible: updates.is_visible ?? setting.is_visible,
                requires_login: updates.requires_login ?? setting.requires_login
              }
            : setting
        )
      );

      toast({
        title: "Instelling bijgewerkt",
        description: `Tab "${settingName}" is bijgewerkt`,
      });
    } catch (error) {
      console.error('Error updating tab setting:', error);
      toast({
        title: "Fout bij opslaan",
        description: "Kon instelling niet bijwerken",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!orgQueryEnabled) return;
    fetchSettings();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtimeSubscription = () => {
      // Clean up existing channel if any
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      channel = supabase
        .channel('tab-visibility-live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'application_settings', filter: 'setting_category=eq.tab_visibility' },
          () => {
            if (updatingRef.current.size > 0 || fetchingRef.current) {
              return;
            }

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              if (updatingRef.current.size === 0 && !fetchingRef.current) {
                fetchSettings();
              }
            }, 1500);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`[TabVisibilitySettings] Realtime connection issue: ${status}. Continuing without live updates.`);
          }
        });
    };

    setupRealtimeSubscription();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [fetchSettings, orgQueryEnabled]);

  // Check if a specific setting is being updated
  const isUpdating = (settingName: string, role: RoleKey) => {
    return updatingRef.current.has(`${settingName}-${role}`);
  };

  return {
    settings,
    loading,
    updateSetting,
    updateRoleVisibility,
    refetch: fetchSettings,
    isUpdating
  };
};
