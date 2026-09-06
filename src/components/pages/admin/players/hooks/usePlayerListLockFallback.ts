import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import {
  fetchPublicApplicationSettings,
  findPublicSetting,
} from "@/services/public/publicApplicationSettingsFetch";
import { formatDateShort } from "@/lib/dateUtils";
import {
  buildPlayerListLockMessage,
  isSettingsPlayerListLocked,
  resolveLockMessageDates,
  resolvePlayerListLockReason,
  type PlayerListLockSettingValue,
} from "@/lib/playerListLockUtils";

/**
 * Fallback hook for player list lock status.
 * Used when PlayerListLockProvider is not available (backwards compatibility).
 */
export const usePlayerListLockFallback = () => {
  const { user } = useAuth();
  const { organizationId } = useOrgQueryScope();
  const [isSettingsLocked, setIsSettingsLocked] = useState(false);
  const [isSeasonLocked, setIsSeasonLocked] = useState(false);
  const [lockDate, setLockDate] = useState<string | null>(null);
  const [lockUntilDate, setLockUntilDate] = useState<string | null>(null);
  const [seasonEndDate, setSeasonEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkLockStatus = useCallback(async () => {
    if (organizationId == null) {
      setLoading(false);
      return;
    }

    const isAdminUser = user?.role === "admin" || user?.id === -1;

    try {
      let settingsLocked = false;
      let settingsLockDate: string | null = null;
      let seasonEnd: string | null = null;

      const { data: rpcLocked, error } = await supabase.rpc("is_player_list_locked", {
        p_organization_id: organizationId,
      });

      let rpcOk = false;
      if (error) {
        console.error("❌ Error calling is_player_list_locked function:", error);
      } else {
        rpcOk = true;
        settingsLocked = Boolean(rpcLocked);
      }

      const lockRows = await fetchPublicApplicationSettings(
        ["player_list_lock"],
        organizationId,
      );
      const settings = findPublicSetting(lockRows, "player_list_lock", "global_lock");

      if (settings?.setting_value) {
        const settingValue = settings.setting_value as PlayerListLockSettingValue;
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

      if (!rpcOk && !isAdminUser && !settingsLocked) {
        settingsLocked = true;
      }

      const seasonRows = await fetchPublicApplicationSettings(
        ["season_data"],
        organizationId,
      );
      const seasonConfig = findPublicSetting(seasonRows, "season_data", "main_config");
      if (seasonConfig?.setting_value) {
        const seasonValue = seasonConfig.setting_value as {
          season_end_date?: string;
        };
        seasonEnd = seasonValue.season_end_date ?? null;
      }

      setIsSettingsLocked(settingsLocked);
      setIsSeasonLocked(false);
      setLockDate(settingsLockDate);
      setSeasonEndDate(seasonEnd);
    } catch (error) {
      console.error("❌ Error checking lock status:", error);
      if (!isAdminUser) {
        setIsSettingsLocked(true);
        setIsSeasonLocked(false);
      } else {
        setIsSettingsLocked(false);
        setIsSeasonLocked(false);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId, user?.role, user?.id]);

  useEffect(() => {
    checkLockStatus();
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
    const isAdminUser = user?.role === "admin" || user?.id === -1;
    if (isAdminUser) return true;
    if (loading) return false;
    return !isLocked;
  }, [user?.role, user?.id, isLocked, loading]);

  return {
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
};
