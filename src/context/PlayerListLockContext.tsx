import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { formatDateShort } from "@/lib/dateUtils";
import {
  buildPlayerListLockMessage,
  isSettingsPlayerListLocked,
  resolveLockMessageDates,
  resolvePlayerListLockReason,
  type PlayerListLockReason,
  type PlayerListLockSettingValue,
} from "@/lib/playerListLockUtils";
import {
  fetchPublicApplicationSettings,
  findPublicSetting,
} from "@/services/public/publicApplicationSettingsFetch";

interface PlayerListLockContextType {
  isLocked: boolean;
  isSettingsLocked: boolean;
  isSeasonLocked: boolean;
  lockReason: PlayerListLockReason;
  lockDate: string | null;
  seasonEndDate: string | null;
  lockMessage: string | null;
  canEdit: boolean;
  loading: boolean;
  refreshLockStatus: () => Promise<void>;
}

export const PlayerListLockContext = createContext<PlayerListLockContextType | undefined>(undefined);

function isAdminLike(user: {
  role?: string;
  id?: number;
  isSuperAdmin?: boolean;
} | null | undefined): boolean {
  return (
    user?.role === "admin" ||
    user?.role === "superadmin" ||
    user?.id === -1 ||
    Boolean(user?.isSuperAdmin)
  );
}

export const PlayerListLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { organizationId, isOrganizationReady } = useOrganization();
  const [isSettingsLocked, setIsSettingsLocked] = useState(false);
  const [isSeasonLocked, setIsSeasonLocked] = useState(false);
  const [lockDate, setLockDate] = useState<string | null>(null);
  const [lockUntilDate, setLockUntilDate] = useState<string | null>(null);
  const [seasonEndDate, setSeasonEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkLockStatus = useCallback(async () => {
    if (!isOrganizationReady || organizationId == null) {
      return;
    }

    const orgId = organizationId;
    const adminUser = isAdminLike(user);

    try {
      let settingsLocked = false;
      let settingsLockDate: string | null = null;
      let seasonEnd: string | null = null;
      let rpcOk = false;

      const { data: rpcLocked, error } = await supabase.rpc("is_player_list_locked", {
        p_organization_id: orgId,
      });

      if (error) {
        console.error("❌ Error calling is_player_list_locked function:", error);
      } else {
        rpcOk = true;
        settingsLocked = Boolean(rpcLocked);
      }

      try {
        const rows = await fetchPublicApplicationSettings(["player_list_lock"], orgId);
        const settings = findPublicSetting(rows, "player_list_lock", "global_lock");

        if (settings?.setting_value) {
          const settingValue = settings.setting_value as PlayerListLockSettingValue;
          // Alleen client-fallback als RPC faalde — nooit RPC-unlock overrulen
          if (!rpcOk) {
            settingsLocked = isSettingsPlayerListLocked(settingValue);
          }
          if (settingValue.lock_enabled !== false) {
            const dates = resolveLockMessageDates(settingValue);
            if (settingsLocked) {
              settingsLockDate = dates.from;
              setLockUntilDate(dates.until);
            } else {
              settingsLockDate = null;
              setLockUntilDate(null);
            }
          } else {
            setLockUntilDate(null);
          }
        }
      } catch (settingsError) {
        console.error("❌ Error fetching lock settings:", settingsError);
      }

      if (!rpcOk && !adminUser && !settingsLocked) {
        settingsLocked = true;
      }

      try {
        const seasonRows = await fetchPublicApplicationSettings(["season_data"], orgId);
        const seasonConfig = findPublicSetting(seasonRows, "season_data", "main_config");
        if (seasonConfig?.setting_value) {
          const seasonValue = seasonConfig.setting_value as {
            season_end_date?: string;
          };
          seasonEnd = seasonValue.season_end_date ?? null;
        }
      } catch (seasonError) {
        console.error("❌ Error fetching season data for player lock:", seasonError);
      }

      setIsSettingsLocked(settingsLocked);
      setIsSeasonLocked(false);
      setLockDate(settingsLockDate);
      setSeasonEndDate(seasonEnd);
    } catch (error) {
      console.error("❌ Error checking lock status:", error);
      if (!adminUser) {
        setIsSettingsLocked(true);
        setIsSeasonLocked(false);
      } else {
        setIsSettingsLocked(false);
        setIsSeasonLocked(false);
      }
    } finally {
      setLoading(false);
    }
  }, [isOrganizationReady, organizationId, user]);

  useEffect(() => {
    void checkLockStatus();
  }, [checkLockStatus]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void checkLockStatus();
      }
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkLockStatus]);

  const isLocked = isSettingsLocked;
  const lockReason = resolvePlayerListLockReason(isSettingsLocked, false);

  const lockMessage = useMemo(
    () =>
      buildPlayerListLockMessage(
        lockReason,
        lockDate,
        seasonEndDate,
        formatDateShort,
        lockUntilDate,
      ),
    [lockReason, lockDate, seasonEndDate, lockUntilDate],
  );

  const canEdit = useMemo(() => {
    if (isAdminLike(user)) return true;
    if (loading) return false;
    return !isLocked;
  }, [user, isLocked, loading]);

  const value: PlayerListLockContextType = {
    isLocked,
    isSettingsLocked,
    isSeasonLocked,
    lockReason,
    lockDate,
    seasonEndDate,
    lockMessage,
    canEdit,
    loading,
    refreshLockStatus: checkLockStatus,
  };

  return (
    <PlayerListLockContext.Provider value={value}>
      {children}
    </PlayerListLockContext.Provider>
  );
};

export const usePlayerListLockContext = () => {
  const context = useContext(PlayerListLockContext);
  if (context === undefined) {
    throw new Error("usePlayerListLockContext must be used within a PlayerListLockProvider");
  }
  return context;
};
