import React, { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { AppModal } from "@/components/modals/base/app-modal";
import { MatchesPenaltyShootoutModal } from "@/components/modals";
import { ForfaitEmailModal } from "./forfait-email-modal";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type Referee } from "@/services/core";
import { useRefereesQuery } from "@/hooks/useRefereesQuery";
import { Users, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTeamPlayersWithSuspensions, type TeamPlayer } from "@/components/pages/admin/matches/hooks/useTeamPlayers";
import { PlayerDataRefreshModal } from "@/components/modals";
import { costSettingsService, financialService } from "@/domains/financial";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentDate, localDateTimeToISO } from "@/lib/dateUtils";
import { MatchFormData, PlayerSelection } from "@/components/pages/admin/matches/types";
import { useMatchFormState } from "@/components/pages/admin/matches/hooks/useMatchFormState";
import { useEnhancedMatchFormSubmission } from "@/components/pages/admin/matches/hooks/useEnhancedMatchFormSubmission";
import { canEditMatch, canTeamManagerEdit, shouldAutoLockMatch } from "@/lib/matchLockUtils";
import { useMatchFormSettings } from "@/hooks/useMatchFormSettings";
import { getSubtleMatchScoreBackground, getTeamKitColumnStyle } from "@/components/common/ColorPreview";
import { MatchFormCardsSection } from "@/components/modals/matches/MatchFormCardsSection";
import { MatchFormCaptainSelect } from "@/components/modals/matches/MatchFormCaptainSelect";
import { MatchFormFinancialSection } from "@/components/modals/matches/MatchFormFinancialSection";
import { MatchFormNotesSection } from "@/components/modals/matches/MatchFormNotesSection";
import {
  type MatchFormCardItem,
  type MatchFormPenaltyItem,
  type MatchFormSavedCard,
  type MatchFormTeamKey,
} from "@/components/modals/matches/matchFormTypes";
import { MatchFormMobileTabBar, MatchFormSectionShell } from "@/components/modals/matches/MatchFormMobileTabs";
import { MatchFormPlayerSelectionTable } from "@/components/modals/matches/MatchFormPlayerSelectionTable";
import { MatchFormScoreSection } from "@/components/modals/matches/MatchFormScoreSection";
import { MatchFormSectionCard } from "@/components/modals/matches/MatchFormSectionCard";
import { MatchFormWedstrijdinfoSection } from "@/components/modals/matches/MatchFormWedstrijdinfoSection";
import {
  coerceMatchFormMobileTab,
  getDefaultMatchFormMobileTab,
  getDefaultSectionOpenState,
  getMatchFormRole,
  type MatchFormMobileTab,
} from "@/components/modals/matches/matchFormLayout";
import { normalizeRole } from "@/config/navigation";
import { fetchMatchTeamsContactForSession } from "@/services/match/matchTeamsContactSessionFetch";
import { fetchPublicTeams } from "@/services/public/publicScheduleFetch";
import { fetchTeamForSession } from "@/services/core/teamsSessionFetch";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { useAuth } from "@/hooks/useAuth";
import { useRegisterDevMatchFormModal } from "@/context/DevDebugContext";
import {
  clearSkipAutoMatchCostsForAdmin,
  costNameImpliesMatchCostSuppression,
  findForfaitVerwittigdPenaltyCost,
  costNameIsForfaitVerwittigd,
  fetchTeamCostsForMatch,
  invokeSyncMatchCostsForMatch,
  matchHasForfaitPenalty,
  matchSkipAutoMatchCosts,
} from "@/services/financial/matchCostService";
import { isAdminMatchCostName } from "@/services/financial/teamCostCategories";

interface WedstrijdformulierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: MatchFormData;
  isAdmin: boolean;
  isReferee: boolean;
  teamId: number;
  onComplete?: () => void;
}

export const WedstrijdformulierModal: React.FC<WedstrijdformulierModalProps> = ({
  open,
  onOpenChange,
  match,
  teamId: teamIdProp,
  onComplete,
}) => {
  const { user, isAuthenticated, isSuperAdmin } = useAuth();
  useRegisterDevMatchFormModal(open);

  const normalizedRole = normalizeRole(user?.role ?? "");
  const isAdmin =
    isAuthenticated &&
    (normalizedRole === "admin" ||
      normalizedRole === "superadmin" ||
      normalizedRole === "super_admin" ||
      isSuperAdmin ||
      user?.id === -1);
  const isReferee = isAuthenticated && normalizedRole === "referee";
  const isTeamManager = isAuthenticated && normalizedRole === "player_manager";
  const teamId = useMemo(() => {
    if (normalizedRole === "player_manager" && user?.teamId) {
      return user.teamId;
    }
    if (teamIdProp > 0) return teamIdProp;
    return user?.teamId ?? 0;
  }, [normalizedRole, user?.teamId, teamIdProp]);

  const queryClient = useQueryClient();
  const {
    homeScore,
    setHomeScore,
    awayScore,
    setAwayScore,
    selectedReferee,
    setSelectedReferee,
    refereeNotes,
    setRefereeNotes,
    playerCards,
    setPlayerCards,
    isSubmitting,
    setIsSubmitting,
    homeTeamSelections,
    setHomeTeamSelections,
    awayTeamSelections,
    setAwayTeamSelections,
    getHomeTeamSelectionsWithCards,
    getAwayTeamSelectionsWithCards,
    homePlayersDirty,
    awayPlayersDirty,
    suppressDirtyRef
  } = useMatchFormState(match);

  const { submitMatchForm } = useEnhancedMatchFormSubmission();
  const { data: matchFormSettings } = useMatchFormSettings();
  const [showPenaltyModal, setShowPenaltyModal] = React.useState(false);
  const [pendingSubmission, setPendingSubmission] = React.useState<MatchFormData | null>(null);
  const [showLatePenaltyModal, setShowLatePenaltyModal] = useState(false);
  const [latePenaltyTeamNames, setLatePenaltyTeamNames] = useState<string[]>([]);
  const [latePenaltyTeamIds, setLatePenaltyTeamIds] = useState<number[]>([]);
  const [pendingLatePenaltyMatch, setPendingLatePenaltyMatch] = useState<MatchFormData | null>(null);
  const [homeCardsOpen, setHomeCardsOpen] = React.useState(false);
  const [awayCardsOpen, setAwayCardsOpen] = React.useState(false);
  const [isKaartenOpen, setIsKaartenOpen] = useState(false);
  const [isNotitiesOpen, setIsNotitiesOpen] = useState(false);
  const [isGegevensOpen, setIsGegevensOpen] = useState(false);
  // Referee query with robust retry logic
  const { 
    data: referees = [], 
    isLoading: loadingReferees, 
    error: refereesError,
    refetch: refetchReferees,
    failureCount: refereesFailureCount
  } = useRefereesQuery({ enabled: open && (isAdmin || isReferee) });
  const [homeTeamOpen, setHomeTeamOpen] = useState(false);
  const [awayTeamOpen, setAwayTeamOpen] = useState(false);
  const [isSubmittingPlayers, setIsSubmittingPlayers] = useState(false);
  const { toast } = useToast();
  
  // Card management state (from MatchesRefereeCardsSection)
  const [cardItems, setCardItems] = useState<MatchFormCardItem[]>([]);
  const [isSavingCards, setIsSavingCards] = useState(false);
  const [savedCards, setSavedCards] = useState<MatchFormSavedCard[]>([]);
  const [isLoadingCards, setIsLoadingCards] = useState(true);

  // Penalty management state (from MatchesRefereePenaltySection)
  const [penalties, setPenalties] = useState<MatchFormPenaltyItem[]>([]);
  const [availablePenalties, setAvailablePenalties] = useState<any[]>([]);
  const [isLoadingPenalties, setIsLoadingPenalties] = useState(false);
  const [savedPenalties, setSavedPenalties] = useState<Array<{ id: number; teamName: string; penaltyName: string; amount: number }>>([]);
  const [isFinancieelOpen, setIsFinancieelOpen] = useState(false);
  const [matchCosts, setMatchCosts] = useState<Array<{ id: number; teamId: number; teamName: string; costName: string; category: string; amount: number; costSettingId: number | null }>>([]);
  const [isLoadingMatchCosts, setIsLoadingMatchCosts] = useState(false);
  const [editingCostId, setEditingCostId] = useState<number | null>(null);
  const [editingCostAmount, setEditingCostAmount] = useState<string>("");
  const [isDeletingPenalty, setIsDeletingPenalty] = useState<number | null>(null);
  const [skipAutoMatchCosts, setSkipAutoMatchCosts] = useState(false);
  const [hasForfaitPenalty, setHasForfaitPenalty] = useState(false);
  const [restoringAutoMatchCosts, setRestoringAutoMatchCosts] = useState(false);
  const [forfaitEmailModalOpen, setForfaitEmailModalOpen] = useState(false);
  const [forfaitEmailContext, setForfaitEmailContext] = useState<{ forfaitTeamName: string } | null>(null);

  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const { data: publicTeams } = useQuery({
    queryKey: withOrgQueryKey(["match-form-public-teams"], organizationId),
    enabled: open && orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchPublicTeams(organizationId!),
  });

  const { data: matchTeamsContact = [] } = useQuery({
    queryKey: withOrgQueryKey(
      ["match-form-teams-contact", match.homeTeamId, match.awayTeamId],
      organizationId,
    ),
    enabled: open && orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchMatchTeamsContactForSession(match.homeTeamId, match.awayTeamId),
  });

  const homeTeamInfo = useMemo(
    () => matchTeamsContact.find((team) => team.team_id === match.homeTeamId) ?? null,
    [matchTeamsContact, match.homeTeamId],
  );
  const awayTeamInfo = useMemo(
    () => matchTeamsContact.find((team) => team.team_id === match.awayTeamId) ?? null,
    [matchTeamsContact, match.awayTeamId],
  );

  const { data: ownTeamKit } = useQuery({
    queryKey: withOrgQueryKey(["match-form-own-team-kit", teamId], organizationId),
    enabled: open && orgQueryEnabled && isTeamManager && teamId > 0,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchTeamForSession(teamId),
  });

  const resolveClubColors = useCallback(
    (targetTeamId: number, contactColors: string | null | undefined) => {
      const fromPublic = publicTeams?.find((team) => team.team_id === targetTeamId)?.club_colors;
      if (fromPublic) return fromPublic;
      if (contactColors) return contactColors;
      if (isTeamManager && targetTeamId === teamId && ownTeamKit?.club_colors) {
        return ownTeamKit.club_colors;
      }
      return null;
    },
    [publicTeams, isTeamManager, teamId, ownTeamKit?.club_colors],
  );

  const homeClubColors = useMemo(
    () => resolveClubColors(match.homeTeamId, homeTeamInfo?.club_colors),
    [resolveClubColors, match.homeTeamId, homeTeamInfo?.club_colors],
  );

  const awayClubColors = useMemo(
    () => resolveClubColors(match.awayTeamId, awayTeamInfo?.club_colors),
    [resolveClubColors, match.awayTeamId, awayTeamInfo?.club_colors],
  );

  const scoreSectionStyle = useMemo(
    () => getSubtleMatchScoreBackground(homeClubColors, awayClubColors),
    [homeClubColors, awayClubColors],
  );

  const homeColumnStyle = useMemo(
    () => getTeamKitColumnStyle(homeClubColors),
    [homeClubColors],
  );

  const awayColumnStyle = useMemo(
    () => getTeamKitColumnStyle(awayClubColors),
    [awayClubColors],
  );

  const penaltyTeamOptions = useMemo(() => ([
    { id: match.homeTeamId, name: match.homeTeamName },
    { id: match.awayTeamId, name: match.awayTeamName },
  ]), [match.homeTeamId, match.homeTeamName, match.awayTeamId, match.awayTeamName]);

  /** Standaard snelknop: «Forfait verwittigd» (€25). */
  const forfaitVerwittigdPenaltyCost = useMemo(
    () => findForfaitVerwittigdPenaltyCost(availablePenalties),
    [availablePenalties]
  );

  /** Boetelijst: suppressie/forfait bovenaan voor snellere keuze bij handmatige invoer. */
  const sortedPenaltyOptions = useMemo(() => {
    return [...availablePenalties].sort((a, b) => {
      const sa = costNameImpliesMatchCostSuppression(a.name);
      const sb = costNameImpliesMatchCostSuppression(b.name);
      if (sa !== sb) return sa ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [availablePenalties]);

  const loadExistingPenalties = useCallback(async () => {
    try {
      const penaltyCostIds = new Set(
        (availablePenalties.length > 0
          ? availablePenalties
          : await costSettingsService.getPenalties()
        ).map((cs) => Number(cs.id))
      );

      const rows = await fetchTeamCostsForMatch(match.matchId);

      const matchPenalties = rows
        .filter((tc) =>
          tc.cost_category === 'penalty' ||
          (tc.cost_setting_id != null && penaltyCostIds.has(Number(tc.cost_setting_id)))
        )
        .map((tc) => ({
          id: tc.id,
          teamName: tc.team_id === match.homeTeamId ? match.homeTeamName : match.awayTeamName,
          penaltyName: tc.cost_name || 'Boete',
          amount: tc.amount !== null && tc.amount !== undefined ? Number(tc.amount) : Number(tc.cost_default_amount || 0),
        }));

      setSavedPenalties(matchPenalties);
    } catch (error) {
      console.error('Error loading existing penalties:', error);
    }
  }, [
    match.matchId,
    match.homeTeamId,
    match.awayTeamId,
    match.homeTeamName,
    match.awayTeamName,
    availablePenalties,
  ]);

  useEffect(() => {
    if (!open) return;
    setPenalties([]);
    const loadAvailablePenalties = async () => {
      try {
        const costSettings = await costSettingsService.getPenalties();
        setAvailablePenalties(costSettings);
      } catch (error) {
        console.error('Error loading penalties:', error);
      }
    };
    loadAvailablePenalties();
  }, [open, match.matchId]);

  useEffect(() => {
    if (!open || availablePenalties.length === 0) return;
    loadExistingPenalties();
  }, [open, availablePenalties, loadExistingPenalties]);

  // Load match costs for Financieel section (admin + referee)
  const loadMatchCosts = useCallback(async () => {
    if (!isAdmin && !isReferee) return;
    setIsLoadingMatchCosts(true);
    try {
      const rows = await fetchTeamCostsForMatch(match.matchId);
      const costs = rows
        .filter((tc) => tc.cost_category !== "penalty")
        .map((tc) => ({
        id: tc.id,
        teamId: tc.team_id,
        teamName: tc.team_id === match.homeTeamId ? match.homeTeamName : match.awayTeamName,
        costName: tc.cost_name || 'Onbekend',
        category: tc.cost_category || 'other',
        amount: tc.amount !== null ? Number(tc.amount) : Number(tc.cost_default_amount || 0),
        costSettingId: tc.cost_setting_id
      }));
      setMatchCosts(costs);
    } catch (error) {
      console.error('Error loading match costs:', error);
    } finally {
      setIsLoadingMatchCosts(false);
    }
  }, [isAdmin, isReferee, match.matchId, match.homeTeamId, match.awayTeamId, match.homeTeamName, match.awayTeamName]);

  useEffect(() => {
    if ((isAdmin || isReferee) && open) {
      loadMatchCosts();
    }
  }, [isAdmin, isReferee, open, loadMatchCosts]);

  const refreshSkipAutoMatchCosts = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setSkipAutoMatchCosts(await matchSkipAutoMatchCosts(match.matchId));
    } catch {
      /* ignore */
    }
  }, [isAdmin, match.matchId]);

  const refreshForfaitPenaltyState = useCallback(async () => {
    try {
      const has = await matchHasForfaitPenalty(match.matchId);
      setHasForfaitPenalty(has);
    } catch {
      /* ignore */
    }
  }, [match.matchId]);

  const invalidateFinancialQueries = useCallback(() => {
    const keys = [['all-team-transactions'], ['teams-financial'], ['submitted-matches'], ['cost-settings']];
    keys.forEach(queryKey => queryClient.invalidateQueries({ queryKey }));
  }, [queryClient]);

  const refreshFinancialState = useCallback(async () => {
    await loadExistingPenalties();
    await refreshForfaitPenaltyState();
    if (isAdmin) {
      await loadMatchCosts();
      await refreshSkipAutoMatchCosts();
    }
    invalidateFinancialQueries();
  }, [
    loadExistingPenalties,
    refreshForfaitPenaltyState,
    isAdmin,
    loadMatchCosts,
    refreshSkipAutoMatchCosts,
    invalidateFinancialQueries,
  ]);

  useEffect(() => {
    if (!open || !isAdmin) return;
    refreshSkipAutoMatchCosts();
    refreshForfaitPenaltyState();
  }, [open, isAdmin, refreshSkipAutoMatchCosts, refreshForfaitPenaltyState]);

  const handleDeleteMatchCost = useCallback(async (costId: number) => {
    const cost = matchCosts.find((c) => c.id === costId);
    if (cost && isAdminMatchCostName(cost.costName)) {
      toast({
        title: "Niet toegestaan",
        description: "Administratiekosten kunnen niet worden verwijderd.",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await costSettingsService.deleteTransaction(costId);
      if (result.success) {
        toast({ title: "Kost verwijderd" });
        await refreshFinancialState();
      } else {
        toast({ title: "Fout", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      console.error('Error deleting match cost:', error);
      toast({ title: "Fout", description: "Kon kost niet verwijderen.", variant: "destructive" });
    }
  }, [toast, refreshFinancialState, matchCosts]);

  const handleRestoreAutoMatchCosts = useCallback(async () => {
    setRestoringAutoMatchCosts(true);
    try {
      const cleared = await clearSkipAutoMatchCostsForAdmin(match.matchId);
      if (!cleared.success) {
        toast({ title: "Fout", description: cleared.message, variant: "destructive" });
        return;
      }
      const syncRes = await invokeSyncMatchCostsForMatch({
        matchId: match.matchId,
        matchDateISO: localDateTimeToISO(match.date, match.time),
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        isSubmitted: !!match.isCompleted,
        referee: selectedReferee ?? null,
      });
      if (!syncRes.success) {
        toast({
          title: "Reset gelukt, sync mislukt",
          description:
            syncRes.message ||
            "Vlag is gewist; probeer opnieuw na te controleren dat de wedstrijd ingediend is.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Standaard wedstrijdkosten",
          description: "Automatische sync staat weer aan; kosten zijn bijgewerkt waar mogelijk.",
        });
      }
      await refreshFinancialState();
    } finally {
      setRestoringAutoMatchCosts(false);
    }
  }, [
    match.matchId,
    match.date,
    match.time,
    match.homeTeamId,
    match.awayTeamId,
    match.isCompleted,
    selectedReferee,
    toast,
    refreshFinancialState,
  ]);

  const handleUpdateMatchCostAmount = useCallback(async (costId: number, newAmount: number) => {
    try {
      const result = await costSettingsService.updateTransaction(costId, { amount: newAmount });
      if (result.success) {
        setEditingCostId(null);
        toast({ title: "Bedrag bijgewerkt" });
        await refreshFinancialState();
      } else {
        toast({ title: "Fout", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      console.error('Error updating match cost:', error);
      toast({ title: "Fout", description: "Kon bedrag niet bijwerken.", variant: "destructive" });
    }
  }, [toast, refreshFinancialState]);

  const addPenalty = useCallback(() => {
    setIsFinancieelOpen(true);
    setPenalties(prev => {
      const validPenalties = prev.filter(p => p.teamId && p.costSettingId);
      return [...validPenalties, { costSettingId: null, teamId: null }];
    });
    requestAnimationFrame(() => {
      document.getElementById('penalties-new-list')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, []);

  const parseFormOrMatchScore = useCallback((formValue: string, matchValue: number | null | undefined) => {
    if (formValue !== "") return parseInt(formValue, 10);
    if (matchValue != null) return matchValue;
    return NaN;
  }, []);

  /** Ingediende wedstrijd met uitslag: forfait verwittigd hoort hier niet (wedstrijd is wel gespeeld). */
  const matchAppearsPlayed = useMemo(() => {
    const h = parseFormOrMatchScore(homeScore, match.homeScore);
    const a = parseFormOrMatchScore(awayScore, match.awayScore);
    return match.isCompleted || (!Number.isNaN(h) && !Number.isNaN(a));
  }, [homeScore, awayScore, match.homeScore, match.awayScore, match.isCompleted, parseFormOrMatchScore]);

  const persistPenaltyItems = useCallback(async (
    items: MatchFormPenaltyItem[],
    options?: { successTitle?: string; successDescription?: string }
  ): Promise<boolean> => {
    const validItems = items.filter((p) => p.costSettingId && p.teamId);
    if (validItems.length === 0) return false;

    const hasForfaitVerwittigdDraft = validItems.some((p) => {
      const cs = availablePenalties.find((x) => Number(x.id) === Number(p.costSettingId));
      return cs != null && costNameIsForfaitVerwittigd(cs.name);
    });
    if (hasForfaitVerwittigdDraft && matchAppearsPlayed) {
      toast({
        title: "Forfait verwittigd niet van toepassing",
        description:
          "Deze wedstrijd heeft een uitslag en is (of wordt) ingediend. Forfait verwittigd geldt alleen als de wedstrijd niet is gespeeld.",
        variant: "destructive",
      });
      return false;
    }

    setIsLoadingPenalties(true);
    try {
      const currentDate = getCurrentDate();
      let savedCount = 0;

      for (const penalty of validItems) {
        const teamId = Number(penalty.teamId);
        const costSettingId = Number(penalty.costSettingId);
        const costSetting = availablePenalties.find((cs) => Number(cs.id) === costSettingId);

        if (!costSetting) {
          throw new Error(
            `Boetetype (id ${costSettingId}) niet gevonden. Vernieuw het formulier en probeer opnieuw.`
          );
        }

        const result = await financialService.addTransaction({
          team_id: teamId,
          amount: Number(costSetting.amount),
          description: null,
          transaction_type: 'penalty',
          transaction_date: currentDate,
          match_id: Number(match.matchId),
          penalty_type_id: null,
          cost_setting_id: costSettingId,
        });

        if (!result.success) {
          throw new Error(result.message || 'Kon boete niet opslaan');
        }
        savedCount += 1;
      }

      if (savedCount !== validItems.length) {
        throw new Error('Niet alle boetes konden worden opgeslagen.');
      }

      const hadForfaitVerwittigd = validItems.some((p) => {
        const cs = availablePenalties.find((x) => Number(x.id) === Number(p.costSettingId));
        return cs != null && costNameIsForfaitVerwittigd(cs.name);
      });

      const hadForfait = validItems.some((p) => {
        const cs = availablePenalties.find((x) => Number(x.id) === Number(p.costSettingId));
        return cs != null && costNameImpliesMatchCostSuppression(cs.name);
      });

      if (hadForfaitVerwittigd) {
        setSelectedReferee("");
        const forfaitItem = validItems.find((p) => {
          const cs = availablePenalties.find((x) => Number(x.id) === Number(p.costSettingId));
          return cs != null && costNameIsForfaitVerwittigd(cs.name);
        });
        if (forfaitItem) {
          const forfaitTeamName =
            Number(forfaitItem.teamId) === Number(match.homeTeamId)
              ? match.homeTeamName
              : match.awayTeamName;
          setForfaitEmailContext({ forfaitTeamName });
          setForfaitEmailModalOpen(true);
        }
      }

      const savedKeys = new Set(
        validItems.map((p) => `${p.teamId}:${p.costSettingId}`)
      );
      setPenalties((prev) =>
        prev.filter((p) => !p.costSettingId || !p.teamId || !savedKeys.has(`${p.teamId}:${p.costSettingId}`))
      );
      await refreshFinancialState();

      const forfaitVerwittigdNote = hadForfaitVerwittigd
        ? " Scheidsrechter-toewijzing is verwijderd (wedstrijd niet gespeeld)."
        : "";

      toast({
        title: options?.successTitle ?? "Boetes opgeslagen",
        description:
          options?.successDescription ??
          (hadForfait
            ? `${savedCount} boete(s) toegevoegd. Forfait: wedstrijdkosten (veld/scheids/admin) voor deze wedstrijd zijn verwijderd.${forfaitVerwittigdNote}`
            : `${savedCount} boete(s) succesvol toegevoegd aan de teamtransacties.`),
      });
      return true;
    } catch (error: unknown) {
      console.error('Error saving penalties:', error);
      toast({
        title: "Fout bij opslaan boetes",
        description: error instanceof Error ? error.message : "Er is een fout opgetreden bij het opslaan van de boetes.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoadingPenalties(false);
    }
  }, [availablePenalties, match.matchId, match.homeTeamId, match.homeTeamName, match.awayTeamName, matchAppearsPlayed, toast, refreshFinancialState, setSelectedReferee]);

  /** Standaard forfait-regel: vult boetype + verliezend team in en slaat direct op wanneer het team bekend is. */
  const addForfaitPenaltyPreset = useCallback(async () => {
    if (matchAppearsPlayed) {
      toast({
        title: "Forfait verwittigd niet van toepassing",
        description:
          "Deze wedstrijd heeft een uitslag. Verwijder een verkeerde forfait-boete via het prullenbak-icoon bij opgeslagen boetes.",
        variant: "destructive",
      });
      return;
    }

    const forfaitCost = forfaitVerwittigdPenaltyCost;
    if (!forfaitCost) {
      toast({
        title: "Geen forfait-boete gevonden",
        description:
          "Configureer in beheer een boete ‘Forfait verwittigd’, of gebruik ‘Boete toevoegen’.",
        variant: "destructive",
      });
      return;
    }

    if (
      hasForfaitPenalty ||
      savedPenalties.some((p) => costNameImpliesMatchCostSuppression(p.penaltyName))
    ) {
      toast({
        title: "Forfait bestaat al",
        description: "Er staat al een forfait-boete op deze wedstrijd.",
      });
      return;
    }

    const h = parseFormOrMatchScore(homeScore, match.homeScore);
    const a = parseFormOrMatchScore(awayScore, match.awayScore);
    let suggestedTeamId: number | null = null;
    if (!Number.isNaN(h) && !Number.isNaN(a) && h !== a) {
      suggestedTeamId = h < a ? match.homeTeamId : match.awayTeamId;
    }

    setIsFinancieelOpen(true);

    const draft: MatchFormPenaltyItem = { teamId: suggestedTeamId, costSettingId: forfaitCost.id };

    if (suggestedTeamId != null) {
      const ok = await persistPenaltyItems([draft], {
        successTitle: "Forfait verwittigd opgeslagen",
        successDescription:
          "De boete Forfait verwittigd is bewaard. Standaard wedstrijdkosten zijn verwijderd en de scheidsrechter-toewijzing is opgeheven.",
      });
      if (ok) {
        const forfaitTeamName =
          suggestedTeamId === match.homeTeamId ? match.homeTeamName : match.awayTeamName;
        setForfaitEmailContext({ forfaitTeamName });
        setForfaitEmailModalOpen(true);
      }
      return;
    }

    setPenalties((prev) => {
      const valid = prev.filter((p) => p.teamId && p.costSettingId);
      return [...valid, draft];
    });
    toast({
      title: "Forfait toegevoegd",
      description: "Kies het team dat forfait kreeg en klik op Boetes opslaan.",
    });
  }, [
    forfaitVerwittigdPenaltyCost,
    hasForfaitPenalty,
    savedPenalties,
    parseFormOrMatchScore,
    homeScore,
    awayScore,
    match.homeScore,
    match.awayScore,
    match.homeTeamId,
    match.awayTeamId,
    match.homeTeamName,
    match.awayTeamName,
    persistPenaltyItems,
    matchAppearsPlayed,
    toast,
  ]);

  const updatePenalty = useCallback((index: number, field: keyof MatchFormPenaltyItem, value: MatchFormPenaltyItem[keyof MatchFormPenaltyItem]) => {
    setPenalties(prev => {
      const updated = prev.map((penalty, i) => {
        if (i === index) {
          // When team changes, reset costSettingId to allow new selection
          if (field === 'teamId') {
            return { ...penalty, [field]: value, costSettingId: null };
          }
          return { ...penalty, [field]: value };
        }
        return penalty;
      });
      
      // Clean up multiple empty penalties - ensure only one empty penalty exists at a time
      const validPenalties = updated.filter(p => p.teamId && p.costSettingId);
      const emptyPenalties = updated.filter(p => !p.teamId || !p.costSettingId);
      
      // If there are multiple empty penalties, keep only one
      if (emptyPenalties.length > 1) {
        return [...validPenalties, emptyPenalties[0]];
      }
      
      return updated;
    });
  }, []);

  const savePenalties = useCallback(async (): Promise<boolean> => {
    const validPenalties = penalties.filter((p) => p.costSettingId && p.teamId);

    if (validPenalties.length === 0) {
      toast({
        title: "Geen geldige boetes",
        description: "Vul ten minste één boete volledig in (team en type) voordat je opslaat.",
        variant: "destructive",
      });
      return false;
    }

    return persistPenaltyItems(validPenalties);
  }, [penalties, persistPenaltyItems, toast]);

  const removeSavedPenalty = useCallback(async (index: number) => {
    const penalty = savedPenalties[index];
    if (!penalty) return;

    const wasForfaitPenalty = costNameImpliesMatchCostSuppression(penalty.penaltyName);

    // Never perform local-only delete for saved penalties: force DB-backed ids.
    if (penalty.id <= 0) {
      await refreshFinancialState();
      return;
    }
    
    // Delete from database and refetch
    setIsDeletingPenalty(penalty.id);
    try {
      const result = await costSettingsService.deleteTransaction(penalty.id);
      
      if (!result.success) {
        toast({ title: "Fout", description: result.message, variant: "destructive" });
        await refreshFinancialState();
        return;
      }
      toast({ title: "Boete verwijderd", description: "Boete succesvol verwijderd uit de database." });
      await refreshFinancialState();

      if (wasForfaitPenalty && match.isCompleted && isAdmin) {
        const stillForfait = await matchHasForfaitPenalty(match.matchId);
        const stillSkip = await matchSkipAutoMatchCosts(match.matchId);
        if (!stillForfait && !stillSkip) {
          const syncRes = await invokeSyncMatchCostsForMatch({
            matchId: match.matchId,
            matchDateISO: localDateTimeToISO(match.date, match.time),
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            isSubmitted: true,
            referee: selectedReferee ?? null,
          });
          if (syncRes.success) {
            await refreshFinancialState();
          }
        }
      }
    } catch (error) {
      console.error('Error removing saved penalty:', error);
      toast({ title: "Fout", description: "Kon boete niet verwijderen.", variant: "destructive" });
      await refreshFinancialState();
    } finally {
      setIsDeletingPenalty(null);
    }
  }, [
    savedPenalties,
    toast,
    refreshFinancialState,
    match.matchId,
    match.isCompleted,
    match.date,
    match.time,
    match.homeTeamId,
    match.awayTeamId,
    isAdmin,
    selectedReferee,
  ]);


  const playersByTeam = useMemo(() => ({
    home: homeTeamSelections.filter(s => s.playerId !== null),
    away: awayTeamSelections.filter(s => s.playerId !== null)
  }), [homeTeamSelections, awayTeamSelections]);

  // Load existing cards from database
  useEffect(() => {
    const loadExistingCards = async () => {
      setIsLoadingCards(true);
      try {
        const existingCards: MatchFormSavedCard[] = [];
        
        if (match.homePlayers) {
          for (const player of match.homePlayers) {
            if (player.playerId && player.cardType && player.cardType !== 'none') {
              existingCards.push({
                team: 'home',
                playerName: player.playerName || `Speler #${player.playerId}`,
                cardType: player.cardType,
                playerId: player.playerId
              });
            } 
          }
        }
        
        if (match.awayPlayers) {
          for (const player of match.awayPlayers) {
            if (player.playerId && player.cardType && player.cardType !== 'none') {
              existingCards.push({
                team: 'away',
                playerName: player.playerName || `Speler #${player.playerId}`,
                cardType: player.cardType,
                playerId: player.playerId
              });
            }
          }
        }
        
        setSavedCards(existingCards);
      } catch (error) {
        console.error('Error loading existing cards:', error);
      } finally {
        setIsLoadingCards(false);
      }
    };

    loadExistingCards();
  }, [match.homePlayers, match.awayPlayers]);

  const addCardItem = useCallback(() => {
    setIsKaartenOpen(true);
    setCardItems(prev => [...prev, { team: "", playerId: null, cardType: "yellow" }]);
  }, []);

  const updateCardItem = useCallback((index: number, field: keyof MatchFormCardItem, value: MatchFormCardItem[keyof MatchFormCardItem]) => {
    setCardItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value, ...(field === "team" ? { playerId: null } : {}) } : it));
  }, []);

  const removeCardItem = useCallback((index: number) => {
    setCardItems(prev => prev.filter((_, i) => i !== index));
  }, []);


  const userRole = useMemo(() => (isAdmin ? "admin" : isReferee ? "referee" : "player_manager"), [isAdmin, isReferee]);

  const isMatchAssignedToMe = useMemo(() => {
    if (!isReferee || !user) return false;
    if (match.assignedRefereeId != null && match.assignedRefereeId === user.id) return true;
    if (match.referee && user.username && match.referee === user.username) return true;
    return false;
  }, [isReferee, user, match.assignedRefereeId, match.referee]);

  const hasClaimedRefereeInForm = useMemo(() => {
    if (!isReferee || !user?.username) return false;
    return selectedReferee === user.username;
  }, [isReferee, user?.username, selectedReferee]);

  /** Andere scheids op iemand anders’ wedstrijd: eerst jezelf toewijzen */
  const showRefereeClaimHint = useMemo(
    () => isReferee && !isMatchAssignedToMe && !hasClaimedRefereeInForm,
    [isReferee, isMatchAssignedToMe, hasClaimedRefereeInForm],
  );

  const canRefereeEditMatchContent = useMemo(() => {
    if (isAdmin) return true;
    if (!isReferee) return true; // team managers: geen claim-gate
    return isMatchAssignedToMe || hasClaimedRefereeInForm;
  }, [isAdmin, isReferee, isMatchAssignedToMe, hasClaimedRefereeInForm]);

  const canEditScore = useMemo(
    () => isAdmin || (isReferee && canRefereeEditMatchContent),
    [isAdmin, isReferee, canRefereeEditMatchContent],
  );
  const canEdit = useMemo(() => canEditMatch(match.isLocked, match.date, match.time, isAdmin, isReferee, matchFormSettings?.lock_minutes_before, matchFormSettings?.allow_late_submission), [match.isLocked, match.date, match.time, isAdmin, isReferee, matchFormSettings]);
  /** Inhoud (spelers/score/kaarten/…) — scheids die niet toegewezen is moet eerst claimen */
  const canEditFormContent = useMemo(
    () => canEdit && canRefereeEditMatchContent,
    [canEdit, canRefereeEditMatchContent],
  );
  const showRefereeFields = useMemo(() => isReferee || isAdmin, [isReferee, isAdmin]);

  const isAddPenaltyButtonDisabled = useMemo(() => {
    return !canEditFormContent || isLoadingPenalties;
  }, [canEditFormContent, isLoadingPenalties]);

  const isSavePenaltyButtonDisabled = useMemo(() => {
    const hasValidPenalty = penalties.some(p => p.teamId && p.costSettingId);
    return !hasValidPenalty || isLoadingPenalties || !canEditFormContent;
  }, [penalties, isLoadingPenalties, canEditFormContent]);
  const hideInlineCardSelectors = useMemo(() => isReferee || isAdmin, [isReferee, isAdmin]);
  const isCupMatch = useMemo(() => match.matchday?.includes('🏆'), [match.matchday]);
  const canTeamManagerEditMatch = useMemo(() => 
    canTeamManagerEdit(match.isLocked, match.date, match.time, match.homeTeamId, match.awayTeamId, teamId, matchFormSettings?.lock_minutes_before, matchFormSettings?.allow_late_submission), 
    [match.isLocked, match.date, match.time, match.homeTeamId, match.awayTeamId, teamId, matchFormSettings]
  );
  
  // Late penalty only on first submission after deadline — not when form was already submitted on time
  const isLateSubmission = useMemo(() => {
    if (!isTeamManager || !matchFormSettings?.allow_late_submission || match.isCompleted) return false;
    return shouldAutoLockMatch(match.date, match.time, matchFormSettings.lock_minutes_before);
  }, [isTeamManager, match.isCompleted, match.date, match.time, matchFormSettings]);

  const handleComplete = useCallback(() => {
    if (onComplete) {
      onComplete();
    }
    onOpenChange(false);
  }, [onComplete, onOpenChange]);

  const handleCardChange = useCallback((playerId: number, cardType: string) => {
    setPlayerCards(prev => ({
      ...prev,
      [playerId]: cardType === "none" ? "" : cardType
    }));
  }, [setPlayerCards]);

  const saveCardItems = useCallback(async () => {
    setIsSavingCards(true);
    try {
      let saved = 0;
      const sessionAdds: MatchFormSavedCard[] = [];
      for (const it of cardItems) {
        if (it.team && it.playerId && it.cardType) {
          handleCardChange(it.playerId, it.cardType);
          saved++;
          const list = it.team === "home" ? playersByTeam.home : playersByTeam.away;
          const sel = list.find(s => s.playerId === it.playerId);
          sessionAdds.push({ 
            team: it.team as MatchFormTeamKey, 
            playerName: sel?.playerName || `Speler #${it.playerId}`, 
            cardType: it.cardType,
            playerId: it.playerId
          });
        }
      }
      toast({ title: "Kaarten opgeslagen", description: `${saved} kaart(en) toegevoegd.` });
      setCardItems([]);
      setSavedCards(prev => [...sessionAdds, ...prev].slice(0, 20));
    } finally {
      setIsSavingCards(false);
    }
  }, [cardItems, handleCardChange, playersByTeam, toast]);

  const removeSavedCard = useCallback((index: number) => {
    const cardToRemove = savedCards[index];
    if (cardToRemove?.playerId) {
      handleCardChange(cardToRemove.playerId, 'none');
    }
    setSavedCards(prev => prev.filter((_, i) => i !== index));
  }, [savedCards, handleCardChange]);

  const updatePlayerSelection = useCallback((
    selections: PlayerSelection[],
    setSelections: React.Dispatch<React.SetStateAction<PlayerSelection[]>>,
    index: number,
    field: keyof PlayerSelection,
    value: any
  ) => {
    setSelections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      if (field === "isCaptain" && value === true) {
        updated.forEach((sel, idx) => {
          if (idx !== index) updated[idx].isCaptain = false;
        });
      }
      
      if (field === "playerId" && value === null) {
        updated[index].playerName = "";
        updated[index].jerseyNumber = "";
        updated[index].isCaptain = false;
        if (updated[index].playerId) {
          setPlayerCards(prev => {
            const newCards = { ...prev };
            delete newCards[updated[index].playerId!];
            return newCards;
          });
        }
      }
      return updated;
    });
  }, [setPlayerCards]);

  const handlePlayerSelection = useCallback((
    index: number,
    field: keyof PlayerSelection,
    value: any,
    isHomeTeam: boolean
  ) => {
    const setSelections = isHomeTeam ? setHomeTeamSelections : setAwayTeamSelections;
    const selections = isHomeTeam ? homeTeamSelections : awayTeamSelections;
    updatePlayerSelection(selections, setSelections, index, field, value);
  }, [homeTeamSelections, awayTeamSelections, setHomeTeamSelections, setAwayTeamSelections, updatePlayerSelection]);

  // State for match data fields (date, time, location, matchday)
  const [matchData, setMatchData] = React.useState({
    date: match.date,
    time: match.time,
    location: match.location,
    matchday: match.matchday || "",
  });

  // Sync matchData when match prop changes (e.g. opening a different match)
  useEffect(() => {
    setMatchData({
      date: match.date,
      time: match.time,
      location: match.location,
      matchday: match.matchday || "",
    });
  }, [match.matchId, match.date, match.time, match.location, match.matchday]);

  // Handler for match data changes (date, time, location, matchday)
  const handleMatchDataChange = useCallback((field: string, value: string) => {
    setMatchData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Player selection logic (from PlayerSelectionSection)
  const matchDate = useMemo(() => {
    try {
      return new Date(match.date);
    } catch (error) {
      console.error('Error parsing match date:', error, match.date);
      return new Date();
    }
  }, [match.date]);

  // Load players for both teams
  const { 
    playersWithSuspensions: homePlayersWithSuspensions, 
    loading: homeLoading, 
    error: homeError, 
    suspensionLoading: homeSuspensionLoading, 
    retryCount: homeRetryCount, 
    refetch: homeRefetch 
  } = useTeamPlayersWithSuspensions(match.homeTeamId, matchDate);

  const { 
    playersWithSuspensions: awayPlayersWithSuspensions, 
    loading: awayLoading, 
    error: awayError, 
    suspensionLoading: awaySuspensionLoading, 
    retryCount: awayRetryCount, 
    refetch: awayRefetch 
  } = useTeamPlayersWithSuspensions(match.awayTeamId, matchDate);

  const homeIsLoading = homeLoading || homeSuspensionLoading;
  const awayIsLoading = awayLoading || awaySuspensionLoading;

  // Debug logging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [WedstrijdformulierModal] Player loading status:', {
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        matchDate: matchDate?.toISOString(),
        homeLoading: homeIsLoading,
        awayLoading: awayIsLoading,
        homePlayersCount: homePlayersWithSuspensions?.length || 0,
        awayPlayersCount: awayPlayersWithSuspensions?.length || 0,
        homeError: homeError?.message,
        awayError: awayError?.message
      });
    }
  }, [match.homeTeamId, match.awayTeamId, matchDate, homeIsLoading, awayIsLoading, homePlayersWithSuspensions, awayPlayersWithSuspensions, homeError, awayError]);

  // Sync player names when players are loaded - this ensures playerName is always set correctly
  useEffect(() => {
    if (!homeIsLoading && homePlayersWithSuspensions && homePlayersWithSuspensions.length > 0) {
      suppressDirtyRef.current = true;
      setHomeTeamSelections(prev => prev.map(selection => {
        if (selection.playerId) {
          const player = homePlayersWithSuspensions.find(p => p.player_id === selection.playerId);
          if (player) {
            const expectedName = `${player.first_name} ${player.last_name}`;
            return {
              ...selection,
              playerName: expectedName
            };
          }
        }
        return selection;
      }));
      suppressDirtyRef.current = false;
    }
  }, [homePlayersWithSuspensions, homeIsLoading]);

  useEffect(() => {
    if (!awayIsLoading && awayPlayersWithSuspensions && awayPlayersWithSuspensions.length > 0) {
      suppressDirtyRef.current = true;
      setAwayTeamSelections(prev => prev.map(selection => {
        if (selection.playerId) {
          const player = awayPlayersWithSuspensions.find(p => p.player_id === selection.playerId);
          if (player) {
            const expectedName = `${player.first_name} ${player.last_name}`;
            return {
              ...selection,
              playerName: expectedName
            };
          }
        }
        return selection;
      }));
      suppressDirtyRef.current = false;
    }
  }, [awayPlayersWithSuspensions, awayIsLoading]);

  const createUpdatedMatch = useCallback((homeScore: number | null, awayScore: number | null) => {
    const homeSelections = getHomeTeamSelectionsWithCards();
    const awaySelections = getAwayTeamSelectionsWithCards();
    
    // Ensure all selected players have playerName set
    const homePlayersWithNames = homeSelections.map(selection => {
      if (selection.playerId && (!selection.playerName || selection.playerName === '')) {
        // Try to find the player name from loaded players
        const player = homePlayersWithSuspensions?.find(p => p.player_id === selection.playerId);
        if (player) {
          return {
            ...selection,
            playerName: `${player.first_name} ${player.last_name}`
          };
        }
      }
      return selection;
    });
    
    const awayPlayersWithNames = awaySelections.map(selection => {
      if (selection.playerId && (!selection.playerName || selection.playerName === '')) {
        // Try to find the player name from loaded players
        const player = awayPlayersWithSuspensions?.find(p => p.player_id === selection.playerId);
        if (player) {
          return {
            ...selection,
            playerName: `${player.first_name} ${player.last_name}`
          };
        }
      }
      return selection;
    });
    
    const processedRefereeNotes = refereeNotes !== undefined && refereeNotes !== null ? refereeNotes : "";
    
    console.log('🔍 [WedstrijdformulierModal] createUpdatedMatch - Referee notes:', {
      originalRefereeNotes: refereeNotes,
      processedRefereeNotes: processedRefereeNotes,
      type: typeof processedRefereeNotes,
      length: processedRefereeNotes?.length || 0,
      isUndefined: refereeNotes === undefined,
      isNull: refereeNotes === null,
      isEmpty: processedRefereeNotes === ""
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [WedstrijdformulierModal] Creating updated match with players:', {
        homePlayers: homePlayersWithNames.filter(p => p.playerId !== null).map(p => ({ playerId: p.playerId, playerName: p.playerName })),
        awayPlayers: awayPlayersWithNames.filter(p => p.playerId !== null).map(p => ({ playerId: p.playerId, playerName: p.playerName }))
      });
    }
    
    // Only include matchData (date, time, location, matchday) for admin/referee
    // Team managers should NOT overwrite these fields to prevent data corruption
    // Referees can now save player data (protected by prevent_player_data_wipe trigger)
    // Only include player data if it was actually modified (dirty tracking)
    const updatedMatch: MatchFormData = {
      ...match,
      ...(isAdmin || isReferee ? matchData : {}),
      homeScore,
      awayScore,
      referee: selectedReferee,
      refereeNotes: processedRefereeNotes,
      isCompleted: homeScore != null && awayScore != null,
      homePlayers: homePlayersDirty ? homePlayersWithNames : undefined as any,
      awayPlayers: awayPlayersDirty ? awayPlayersWithNames : undefined as any
    };
    
    console.log('🔍 [WedstrijdformulierModal] createUpdatedMatch - Dirty flags:', {
      homePlayersDirty,
      awayPlayersDirty,
      homePlayersIncluded: homePlayersDirty,
      awayPlayersIncluded: awayPlayersDirty
    });
    
    console.log('🔍 [WedstrijdformulierModal] createUpdatedMatch - Final match object:', {
      matchId: updatedMatch.matchId,
      refereeNotes: updatedMatch.refereeNotes,
      refereeNotesType: typeof updatedMatch.refereeNotes,
      refereeNotesLength: updatedMatch.refereeNotes?.length || 0
    });
    
    return updatedMatch;
  }, [match, matchData, selectedReferee, refereeNotes, getHomeTeamSelectionsWithCards, getAwayTeamSelectionsWithCards, homePlayersWithSuspensions, awayPlayersWithSuspensions, homePlayersDirty, awayPlayersDirty, isAdmin, isReferee]);

  const handleSubmit = useCallback(async () => {
    const parsedHomeScore = homeScore !== "" ? parseInt(homeScore) : null;
    const parsedAwayScore = awayScore !== "" ? parseInt(awayScore) : null;

    const pendingValidPenalties = penalties.filter((p) => p.costSettingId && p.teamId);
    if (pendingValidPenalties.length > 0) {
      const penaltiesSaved = await savePenalties();
      if (!penaltiesSaved) return;
    }
    
    if (isCupMatch && parsedHomeScore !== null && parsedAwayScore !== null && parsedHomeScore === parsedAwayScore) {
      const updatedMatch = createUpdatedMatch(parsedHomeScore, parsedAwayScore);
      setPendingSubmission(updatedMatch);
      setShowPenaltyModal(true);
      return;
    }
    
    setIsSubmitting(true);
    let shouldCloseModal = false;
    try {
      const updatedMatch = createUpdatedMatch(parsedHomeScore, parsedAwayScore);
      
      // Check if admin is submitting after match date → show styled penalty modal
      if (isAdmin && updatedMatch.date && updatedMatch.time) {
        const matchDateTime = new Date(`${updatedMatch.date}T${updatedMatch.time}`);
        if (new Date() > matchDateTime) {
          const getPlayerIds = (players: any[]) => (players || []).filter((p: any) => p?.playerId != null).map((p: any) => p.playerId).sort((a: number, b: number) => a - b);
          const origHome = getPlayerIds(match.homePlayers);
          const origAway = getPlayerIds(match.awayPlayers);
          const currHome = getPlayerIds(updatedMatch.homePlayers);
          const currAway = getPlayerIds(updatedMatch.awayPlayers);
          
          const homeChanged = JSON.stringify(origHome) !== JSON.stringify(currHome);
          const awayChanged = JSON.stringify(origAway) !== JSON.stringify(currAway);
          
          if (homeChanged || awayChanged) {
            const teamNames: string[] = [];
            const teamIds: number[] = [];
            if (homeChanged) { teamNames.push(match.homeTeamName); teamIds.push(match.homeTeamId); }
            if (awayChanged) { teamNames.push(match.awayTeamName); teamIds.push(match.awayTeamId); }
            
            setLatePenaltyTeamNames(teamNames);
            setLatePenaltyTeamIds(teamIds);
            setPendingLatePenaltyMatch(updatedMatch);
            setShowLatePenaltyModal(true);
            return;
          }
        }
      }
      
      const result = await submitMatchForm(updatedMatch, isAdmin, userRole, matchFormSettings, []);
      if (result.success) {
        shouldCloseModal = true;
      }
    } catch (error) {
      console.error('❌ [WedstrijdformulierModal] Error submitting match form:', error);
    } finally {
      setIsSubmitting(false);
      if (shouldCloseModal) {
        handleComplete();
      }
    }
  }, [homeScore, awayScore, penalties, savePenalties, isCupMatch, createUpdatedMatch, submitMatchForm, isAdmin, userRole, handleComplete, setIsSubmitting, match, matchFormSettings]);

  const handleLatePenaltySubmit = useCallback(async (applyPenalty: boolean) => {
    if (!pendingLatePenaltyMatch) return;

    const matchToSubmit = pendingLatePenaltyMatch;
    const teamIds = applyPenalty ? latePenaltyTeamIds : [];

    setShowLatePenaltyModal(false);
    setPendingLatePenaltyMatch(null);
    setIsSubmitting(true);

    try {
      const result = await submitMatchForm(matchToSubmit, isAdmin, userRole, matchFormSettings, teamIds);
      if (result.success) handleComplete();
    } catch (error) {
      console.error('Error submitting match form:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingLatePenaltyMatch, latePenaltyTeamIds, submitMatchForm, isAdmin, userRole, matchFormSettings, handleComplete, setIsSubmitting]);

  const handlePenaltyResult = useCallback(async (winner: 'home' | 'away', homePenalties: number, awayPenalties: number, notes: string) => {
    if (!pendingSubmission) return;
    
    setIsSubmitting(true);
    try {
      const updatedHomeScore = winner === 'home' ? (pendingSubmission.homeScore || 0) + 1 : pendingSubmission.homeScore;
      const updatedAwayScore = winner === 'away' ? (pendingSubmission.awayScore || 0) + 1 : pendingSubmission.awayScore;
      const finalMatch: MatchFormData = {
        ...pendingSubmission,
        homeScore: updatedHomeScore,
        awayScore: updatedAwayScore,
        refereeNotes: `${pendingSubmission.refereeNotes || ''}${pendingSubmission.refereeNotes ? '\n\n' : ''}${notes}`
      };
      const result = await submitMatchForm(finalMatch, isAdmin, userRole, matchFormSettings);
      if (result.success) {
        handleComplete();
      }
    } catch (error) {
      console.error('Error submitting match form with penalties:', error);
    } finally {
      setIsSubmitting(false);
      setPendingSubmission(null);
    }
  }, [pendingSubmission, isAdmin, userRole, submitMatchForm, handleComplete, setIsSubmitting]);

  // Keyboard shortcut handler - referees and admins can always edit, team managers need to check their team
  const canActuallyEdit = useMemo(() => {
    if (isAdmin) return true;
    if (isReferee) return canEditFormContent;
    return isTeamManager ? canTeamManagerEditMatch : canEdit;
  }, [isAdmin, isReferee, canEditFormContent, isTeamManager, canTeamManagerEditMatch, canEdit]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+S or Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (canActuallyEdit && !isSubmitting) {
          handleSubmit();
        }
      }
      // Enter key to save (when not in input/textarea)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (canActuallyEdit && !isSubmitting) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canActuallyEdit, isSubmitting, handleSubmit]);

  const formRole = useMemo(
    () => getMatchFormRole(isAdmin, isReferee),
    [isAdmin, isReferee],
  );
  const [mobileTab, setMobileTab] = useState<MatchFormMobileTab>(() =>
    getDefaultMatchFormMobileTab(getMatchFormRole(isAdmin, isReferee)),
  );
  const activeMobileTab = useMemo(
    () => coerceMatchFormMobileTab(formRole, mobileTab),
    [formRole, mobileTab],
  );
  const prevFormRoleRef = useRef(formRole);

  useEffect(() => {
    if (!open) return;
    setMobileTab(getDefaultMatchFormMobileTab(formRole));
  }, [open, match.matchId, formRole]);

  useEffect(() => {
    if (prevFormRoleRef.current === formRole) return;
    prevFormRoleRef.current = formRole;
    setMobileTab((current) => coerceMatchFormMobileTab(formRole, current));
  }, [formRole]);

  // Rol-specifieke default open state bij openen modal
  useEffect(() => {
    if (!open) return;
    const defaults = getDefaultSectionOpenState(
      formRole,
      teamId,
      match.homeTeamId,
      match.awayTeamId,
    );
    setHomeTeamOpen(defaults.homeTeamOpen);
    setAwayTeamOpen(defaults.awayTeamOpen);
    setIsKaartenOpen(defaults.isKaartenOpen);
    setIsGegevensOpen(defaults.isGegevensOpen);
    setIsNotitiesOpen(defaults.isNotitiesOpen);
    setIsFinancieelOpen(defaults.isFinancieelOpen);
  }, [open, formRole, match.homeTeamId, match.awayTeamId, teamId]);

  // Focus bij openen: invulbare score voor scheids/admin (score-tab is default voor alle rollen)
  useEffect(() => {
    if (!open || !canActuallyEdit || !canEditScore) return;
    const timer = setTimeout(() => {
      if (!homeScore && !awayScore) {
        document.getElementById("home-score")?.focus();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [open, canActuallyEdit, canEditScore, homeScore, awayScore]);

  // Memoize referees for performance (now using useRefereesQuery hook above)
  const memoizedReferees = useMemo(() => referees, [referees]);
  
  // Referee selector logic (from MatchDataSection)
  const selectedRefereeExists = useMemo(() => 
    selectedReferee && memoizedReferees.some(ref => ref.username === selectedReferee),
    [memoizedReferees, selectedReferee]
  );
  
  // Always show selectedReferee if it exists, even if not in the list yet (during loading or if referee was removed)
  // Only show undefined if there's no selectedReferee at all
  const refereeSelectValue = useMemo(() => {
    if (selectedReferee) {
      // If we have a selectedReferee, always use it (even if not in list yet)
      return selectedReferee;
    }
    // Only return undefined if there's no selectedReferee
    return undefined;
  }, [selectedReferee]);

  // Player selection logic (from PlayerSelectionSection)
  const getSelectedPlayerIds = useCallback((selections: PlayerSelection[]) =>
    selections.map((sel) => sel.playerId).filter((id): id is number => id !== null), []);
  
  const homeSelectedPlayerIds = useMemo(() => 
    getSelectedPlayerIds(homeTeamSelections), [homeTeamSelections, getSelectedPlayerIds]);
  
  const awaySelectedPlayerIds = useMemo(() => 
    getSelectedPlayerIds(awayTeamSelections), [awayTeamSelections, getSelectedPlayerIds]);

  const canEditHome = useMemo(() => {
    if (isAdmin) return true;
    if (isReferee) return canRefereeEditMatchContent;
    if (isTeamManager) {
      return canTeamManagerEdit(match.isLocked, match.date, match.time, match.homeTeamId, match.awayTeamId, teamId, matchFormSettings?.lock_minutes_before, matchFormSettings?.allow_late_submission) && match.homeTeamId === teamId;
    }
    return canTeamManagerEditMatch;
  }, [isAdmin, isReferee, canRefereeEditMatchContent, isTeamManager, match.isLocked, match.date, match.time, match.homeTeamId, match.awayTeamId, teamId, matchFormSettings, canTeamManagerEditMatch]);
  
  const canEditAway = useMemo(() => {
    if (isAdmin) return true;
    if (isReferee) return canRefereeEditMatchContent;
    if (isTeamManager) {
      return canTeamManagerEdit(match.isLocked, match.date, match.time, match.homeTeamId, match.awayTeamId, teamId) && match.awayTeamId === teamId;
    }
    return canTeamManagerEditMatch;
  }, [isAdmin, isReferee, canRefereeEditMatchContent, isTeamManager, match.isLocked, match.date, match.time, match.homeTeamId, match.awayTeamId, teamId, canTeamManagerEditMatch]);

  const handleCaptainChange = useCallback((captainPlayerId: string, isHomeTeam: boolean) => {
    const selections = isHomeTeam ? homeTeamSelections : awayTeamSelections;
    selections.forEach((selection, index) => {
      const isCaptain = captainPlayerId !== "no-captain" && selection.playerId?.toString() === captainPlayerId;
      handlePlayerSelection(index, 'isCaptain', isCaptain, isHomeTeam);
    });
  }, [homeTeamSelections, awayTeamSelections, handlePlayerSelection]);

  const handleSavePlayerSelection = useCallback(async () => {
    if (!isAdmin && !isReferee && !canEdit) return;
    if (isTeamManager && !canTeamManagerEditMatch) return;
    
    // Only include player data that was actually modified (dirty tracking)
    // This prevents accidentally overwriting existing data with blank arrays
    const homePlayersToSave = homePlayersDirty ? homeTeamSelections : undefined;
    const awayPlayersToSave = awayPlayersDirty ? awayTeamSelections : undefined;
    
    if (!homePlayersToSave && !awayPlayersToSave) {
      toast({
        title: "Geen wijzigingen",
        description: "Er zijn geen wijzigingen om op te slaan.",
      });
      return;
    }
    
    setIsSubmittingPlayers(true);
    try {
      const updatedMatch: MatchFormData = {
        ...match,
        homePlayers: homePlayersToSave as any,
        awayPlayers: awayPlayersToSave as any,
        isCompleted: false
      };
      
      const userRole = isReferee ? "referee" : isAdmin ? "admin" : "player_manager";
      const result = await submitMatchForm(updatedMatch, isAdmin, userRole, matchFormSettings);
      if (result.success) {
        toast({
          title: "Spelers opgeslagen",
          description: "De spelersselectie is succesvol opgeslagen.",
        });

        // Waarschuwing voor teamverantwoordelijken: ontbrekende rugnummers of aanvoerder kan boete opleveren
        if (isTeamManager) {
          const checkTeam = (selections: any[] | undefined) => {
            if (!selections) return { missingJersey: false, missingCaptain: false };
            const activePlayers = selections.filter(s => s.playerId);
            const missingJersey = activePlayers.some(s => !s.jerseyNumber || String(s.jerseyNumber).trim() === "");
            const missingCaptain = activePlayers.length > 0 && !activePlayers.some(s => s.isCaptain);
            return { missingJersey, missingCaptain };
          };
          const home = checkTeam(homePlayersToSave as any[]);
          const away = checkTeam(awayPlayersToSave as any[]);
          const missingJersey = home.missingJersey || away.missingJersey;
          const missingCaptain = home.missingCaptain || away.missingCaptain;

          if (missingJersey || missingCaptain) {
            const parts: string[] = [];
            if (missingJersey) parts.push("rugnummers ontbreken");
            if (missingCaptain) parts.push("er is geen aanvoerder aangeduid");
            toast({
              title: "⚠️ Let op: mogelijke boete",
              description: `Sommige ${parts.join(" en ")}. Dit kan een boete opleveren — vul dit aan om boetes te vermijden.`,
              variant: "destructive",
              duration: 8000,
            });
          }
        }

        handleComplete(); // Sluit modal na succes
      }
    } catch (error) {
      console.error('Error saving player selection:', error);
      toast({
        title: "Error",
        description: "Er is een fout opgetreden bij het opslaan van de spelers.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingPlayers(false);
    }
  }, [isTeamManager, isAdmin, isReferee, canEdit, canTeamManagerEditMatch, match, homeTeamSelections, awayTeamSelections, homePlayersDirty, awayPlayersDirty, submitMatchForm, toast, matchFormSettings]);

  // Score validation and display logic (from MatchesScoreSection)
  const isValidScore = useCallback((score: string) => {
    if (!score || score === "") return false;
    const num = parseInt(score);
    return !isNaN(num) && num >= 0 && num <= 99;
  }, []);

  const homeScoreValid = useMemo(() => isValidScore(homeScore), [homeScore, isValidScore]);
  const awayScoreValid = useMemo(() => isValidScore(awayScore), [awayScore, isValidScore]);

  const displayHomeScore = useMemo(() => homeScore || "", [homeScore]);
  const displayAwayScore = useMemo(() => awayScore || "", [awayScore]);

  const homeScoreClassName = useMemo(() => cn(
    "input-login-style text-center text-3xl font-bold h-16",
    "border-2 transition-all",
    homeScoreValid 
      ? "border-primary bg-brand-50" 
      : "border-[var(--color-300)]",
    "focus:border-primary focus:ring-2 focus:ring-primary/20",
    "disabled:border-[var(--color-300)] disabled:opacity-100"
  ), [homeScoreValid]);

  const awayScoreClassName = useMemo(() => cn(
    "input-login-style text-center text-3xl font-bold h-16",
    "border-2 transition-all",
    awayScoreValid 
      ? "border-primary bg-brand-50" 
      : "border-[var(--color-300)]",
    "focus:border-primary focus:ring-2 focus:ring-primary/20",
    "disabled:border-[var(--color-300)] disabled:opacity-100"
  ), [awayScoreValid]);

  // Sync player names when players are loaded - this ensures playerName is always set correctly
  useEffect(() => {
    if (!homeIsLoading && homePlayersWithSuspensions && homePlayersWithSuspensions.length > 0) {
      setHomeTeamSelections(prev => prev.map(selection => {
        if (selection.playerId) {
          const player = homePlayersWithSuspensions.find(p => p.player_id === selection.playerId);
          if (player) {
            const expectedName = `${player.first_name} ${player.last_name}`;
            // Always update playerName to ensure it matches the loaded player data
            return {
              ...selection,
              playerName: expectedName
            };
          }
        }
        return selection;
      }));
    }
  }, [homePlayersWithSuspensions, homeIsLoading]);

  useEffect(() => {
    if (!awayIsLoading && awayPlayersWithSuspensions && awayPlayersWithSuspensions.length > 0) {
      setAwayTeamSelections(prev => prev.map(selection => {
        if (selection.playerId) {
          const player = awayPlayersWithSuspensions.find(p => p.player_id === selection.playerId);
          if (player) {
            const expectedName = `${player.first_name} ${player.last_name}`;
            // Always update playerName to ensure it matches the loaded player data
            return {
              ...selection,
              playerName: expectedName
            };
          }
        }
        return selection;
      }));
    }
  }, [awayPlayersWithSuspensions, awayIsLoading]);

  const getPlayerSelectValueClassName = useCallback((playerName: string | null | undefined) => {
    // Always use truncate - let CSS handle text overflow with ellipsis
    // Font size will only reduce when text actually exceeds container width
    return 'truncate max-w-full min-w-0';
  }, []);

  const isPlayerSuspended = useCallback((playerId: number, players: TeamPlayer[] | undefined) => {
    const player = players?.find(p => p.player_id === playerId);
    return player ? !player.is_eligible : false;
  }, []);

  // Helper function to get player name from selection or players list
  const getPlayerDisplayName = useCallback((
    selection: PlayerSelection,
    players: TeamPlayer[] | undefined
  ): string | null => {
    // If playerName exists but is "(niet beschikbaar)", try to resolve from loaded players first
    if (selection.playerName && selection.playerName !== '(niet beschikbaar)') {
      return selection.playerName;
    }
    if (selection.playerId && players) {
      const player = players.find(p => p.player_id === selection.playerId);
      if (player) {
        return `${player.first_name} ${player.last_name}`;
      }
    }
    // Return existing playerName as last resort (could be "(niet beschikbaar)")
    if (selection.playerName) {
      return selection.playerName;
    }
    return null;
  }, []);


   // Boetes + Financieel merged section - visible for admin + referee

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Wedstrijdformulier"
      size="lg"
      aria-describedby="match-form-description"
      showCloseButton={true}
      bodyStyle={scoreSectionStyle}
      primaryAction={{
        label: isSubmitting ? "Bezig..." : "Opslaan",
        onClick: handleSubmit,
        disabled: isSubmitting || (!canActuallyEdit && !isAdmin && !isReferee),
        loading: isSubmitting,
        variant: "primary"
      }}
    >
      <div id="match-form-description" className="sr-only">
        Vul scores, spelers en details van de wedstrijd in
      </div>
      {isLateSubmission && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Te laat ingevuld</p>
            <p className="text-muted-foreground">
              Dit formulier wordt na de deadline ingevuld. Bij opslaan wordt automatisch een boete van €{matchFormSettings?.late_penalty_amount?.toFixed(2) ?? "5.00"} aangerekend.
            </p>
          </div>
        </div>
      )}
      <MatchFormMobileTabBar
        role={formRole}
        value={activeMobileTab}
        onValueChange={setMobileTab}
      />
      <div className="flex flex-col gap-6">
        <MatchFormSectionShell
          section="spelers"
          role={formRole}
          mobileTab={activeMobileTab}
        >
        {/* Spelers */}
        <h3 className="text-center text-xl font-semibold text-brand-dark">Spelers</h3>
        
        <div className="space-y-4">
          {/* Mobile-first: Stacked cards, collapsible on mobile */}
          <div className="space-y-3">
            {/* Home Team Card */}
            <MatchFormSectionCard
              open={homeTeamOpen}
              onOpenChange={setHomeTeamOpen}
              contentId="match-form-home-players"
              title={
                <>
                  <Users className="h-4 w-4 text-primary" />
                  {match.homeTeamName}
                </>
              }
              trailing={<span className="text-sm font-normal text-muted-foreground">(Thuis)</span>}
            >
              <CardContent className="pt-4">
                    <MatchFormPlayerSelectionTable
                      teamLabel={`${match.homeTeamName} (Thuis)`}
                      selections={homeTeamSelections}
                      selectedPlayerIds={homeSelectedPlayerIds}
                      canEditTeam={canEditHome}
                      isHomeTeam
                      players={homePlayersWithSuspensions}
                      isLoading={homeIsLoading}
                      error={homeError}
                      retryCount={homeRetryCount}
                      refetch={homeRefetch}
                      onPlayerSelection={handlePlayerSelection}
                      getPlayerDisplayName={getPlayerDisplayName}
                      isPlayerSuspended={isPlayerSuspended}
                    />
                    <div className="mt-4">
                      <MatchFormCaptainSelect
                        selections={homeTeamSelections}
                        canEditTeam={canEditHome}
                        teamLabel={`${match.homeTeamName} (Thuis)`}
                        isHomeTeam
                        onCaptainChange={handleCaptainChange}
                      />
                    </div>
              </CardContent>
            </MatchFormSectionCard>

            <MatchFormSectionCard
              open={awayTeamOpen}
              onOpenChange={setAwayTeamOpen}
              contentId="match-form-away-players"
              title={
                <>
                  <Users className="h-4 w-4 text-primary" />
                  {match.awayTeamName}
                </>
              }
              trailing={<span className="text-sm font-normal text-muted-foreground">(Uit)</span>}
            >
              <CardContent className="pt-4">
                    <MatchFormPlayerSelectionTable
                      teamLabel={`${match.awayTeamName} (Uit)`}
                      selections={awayTeamSelections}
                      selectedPlayerIds={awaySelectedPlayerIds}
                      canEditTeam={canEditAway}
                      isHomeTeam={false}
                      players={awayPlayersWithSuspensions}
                      isLoading={awayIsLoading}
                      error={awayError}
                      retryCount={awayRetryCount}
                      refetch={awayRefetch}
                      onPlayerSelection={handlePlayerSelection}
                      getPlayerDisplayName={getPlayerDisplayName}
                      isPlayerSuspended={isPlayerSuspended}
                    />
                    <div className="mt-4">
                      <MatchFormCaptainSelect
                        selections={awayTeamSelections}
                        canEditTeam={canEditAway}
                        teamLabel={`${match.awayTeamName} (Uit)`}
                        isHomeTeam={false}
                        onCaptainChange={handleCaptainChange}
                      />
                    </div>
              </CardContent>
            </MatchFormSectionCard>
          </div>
          
          {/* Save button for team managers, referees, and admins */}
          {(isTeamManager || isReferee || isAdmin) && canEdit && (
            <div className="flex justify-center mt-4">
              {/* PlayerSelectionActions is empty, so no button needed */}
            </div>
          )}
        </div>
        </MatchFormSectionShell>

        <MatchFormSectionShell
          section="score"
          role={formRole}
          mobileTab={activeMobileTab}
        >
        <MatchFormScoreSection
          homeTeamName={match.homeTeamName}
          awayTeamName={match.awayTeamName}
          homeClubColors={homeClubColors}
          awayClubColors={awayClubColors}
          homeColumnStyle={homeColumnStyle}
          awayColumnStyle={awayColumnStyle}
          homeTeamContact={homeTeamInfo}
          awayTeamContact={awayTeamInfo}
          homeContactEnabled={!isTeamManager || match.homeTeamId !== teamId}
          awayContactEnabled={!isTeamManager || match.awayTeamId !== teamId}
          canEditScore={canEditScore}
          isTeamManager={isTeamManager}
          displayHomeScore={displayHomeScore}
          displayAwayScore={displayAwayScore}
          homeScoreClassName={homeScoreClassName}
          awayScoreClassName={awayScoreClassName}
          onHomeScoreChange={setHomeScore}
          onAwayScoreChange={setAwayScore}
        />
        </MatchFormSectionShell>

        <MatchFormSectionShell
          section="gegevens"
          role={formRole}
          mobileTab={activeMobileTab}
        >
        {/* Basisgegevens */}
        <div className="space-y-4">
          <MatchFormWedstrijdinfoSection
            open={isGegevensOpen}
            onOpenChange={setIsGegevensOpen}
            date={matchData.date}
            time={matchData.time}
            location={matchData.location}
            matchday={matchData.matchday || ""}
            onFieldChange={handleMatchDataChange}
            isAdmin={isAdmin}
            isReferee={isReferee}
            isTeamManager={isTeamManager}
            canEdit={canEdit}
            canEditReferee={isAdmin || isReferee}
            showRefereeClaimHint={showRefereeClaimHint}
            refereeSelectValue={refereeSelectValue}
            selectedReferee={selectedReferee}
            onRefereeChange={setSelectedReferee}
            loadingReferees={loadingReferees}
            referees={memoizedReferees}
            refereesError={refereesError}
            onRefetchReferees={refetchReferees}
            selectedRefereeExists={!!selectedRefereeExists}
          />
        </div>
        </MatchFormSectionShell>

        <MatchFormSectionShell
          section="wedstrijd"
          role={formRole}
          mobileTab={activeMobileTab}
        >
        {/* Kaarten, Boetes & Notities - Hidden for team managers */}
        {!isTeamManager && (
          <div className="space-y-3">
            <h3 className="text-center text-xl font-semibold text-brand-dark">Wedstrijd</h3>
            <MatchFormCardsSection
              open={isKaartenOpen}
              onOpenChange={setIsKaartenOpen}
              homeTeamName={match.homeTeamName}
              awayTeamName={match.awayTeamName}
              showRefereeFields={showRefereeFields}
              canEdit={canEditFormContent}
              isLoadingCards={isLoadingCards}
              cardItems={cardItems}
              savedCards={savedCards}
              playersByTeam={playersByTeam}
              isSavingCards={isSavingCards}
              onAddCardItem={addCardItem}
              onUpdateCardItem={updateCardItem}
              onClearCardItems={() => setCardItems([])}
              onRemoveCardItem={removeCardItem}
              onSaveCardItems={saveCardItems}
              onRemoveSavedCard={removeSavedCard}
            />
            {showRefereeFields && (
              <MatchFormFinancialSection
                open={isFinancieelOpen}
                onOpenChange={setIsFinancieelOpen}
                isAdmin={isAdmin}
                canEdit={canEditFormContent}
                matchIsCompleted={match.isCompleted}
                matchAppearsPlayed={matchAppearsPlayed}
                penalties={penalties}
                savedPenalties={savedPenalties}
                sortedPenaltyOptions={sortedPenaltyOptions}
                penaltyTeamOptions={penaltyTeamOptions}
                isLoadingPenalties={isLoadingPenalties}
                isAddPenaltyButtonDisabled={isAddPenaltyButtonDisabled}
                isSavePenaltyButtonDisabled={isSavePenaltyButtonDisabled}
                matchCosts={matchCosts}
                isLoadingMatchCosts={isLoadingMatchCosts}
                hasForfaitPenalty={hasForfaitPenalty}
                skipAutoMatchCosts={skipAutoMatchCosts}
                restoringAutoMatchCosts={restoringAutoMatchCosts}
                editingCostId={editingCostId}
                editingCostAmount={editingCostAmount}
                onAddPenalty={addPenalty}
                onClearPenalties={() => setPenalties([])}
                onUpdatePenalty={updatePenalty}
                onRemovePenaltyDraft={(index) => setPenalties((prev) => prev.filter((_, i) => i !== index))}
                onSavePenalties={savePenalties}
                onRemoveSavedPenalty={removeSavedPenalty}
                onRestoreAutoMatchCosts={handleRestoreAutoMatchCosts}
                onStartEditCost={(costId, amount) => {
                  setEditingCostId(costId);
                  setEditingCostAmount(amount.toString());
                }}
                onCancelEditCost={() => setEditingCostId(null)}
                onEditingCostAmountChange={setEditingCostAmount}
                onUpdateMatchCostAmount={handleUpdateMatchCostAmount}
                onDeleteMatchCost={handleDeleteMatchCost}
                costNameImpliesMatchCostSuppression={costNameImpliesMatchCostSuppression}
              />
            )}
            <MatchFormNotesSection
              open={isNotitiesOpen}
              onOpenChange={setIsNotitiesOpen}
              showRefereeFields={showRefereeFields}
              canEdit={canEditFormContent}
              refereeNotes={refereeNotes}
              onRefereeNotesChange={setRefereeNotes}
            />

          </div>
        )}
        </MatchFormSectionShell>
        
        {/* Hidden fields to preserve poll data */}
        <>
          <input
            type="hidden"
            name="assignedRefereeId"
            value={(match as any).assignedRefereeId || ''}
          />
          <input
            type="hidden"
            name="pollGroupId"
            value={(match as any).pollGroupId || ''}
          />
          <input
            type="hidden"
            name="pollMonth"
            value={(match as any).pollMonth || ''}
          />
        </>
        
        <MatchesPenaltyShootoutModal
          open={showPenaltyModal}
          onOpenChange={setShowPenaltyModal}
          homeTeamName={match.homeTeamName}
          awayTeamName={match.awayTeamName}
          onPenaltyResult={handlePenaltyResult}
        />

        <AppModal
          open={showLatePenaltyModal}
          onOpenChange={setShowLatePenaltyModal}
          title="⚠️ Wedstrijddatum verstreken"
          size="sm"
          showCloseButton={!isSubmitting}
          primaryAction={{
            label: "Boete aanrekenen",
            onClick: () => void handleLatePenaltySubmit(true),
            variant: "destructive",
            disabled: isSubmitting,
            loading: isSubmitting,
          }}
          secondaryAction={{
            label: "Opslaan zonder boete",
            onClick: () => void handleLatePenaltySubmit(false),
            disabled: isSubmitting,
          }}
        >
          <div className="space-y-2 text-sm text-foreground">
            <p className="font-medium">De wedstrijddatum is verstreken.</p>
            <p>
              {latePenaltyTeamNames.length === 1
                ? `Wil je een "Boete te laat ingevuld" aanrekenen voor ${latePenaltyTeamNames[0]}?`
                : `Wil je een "Boete te laat ingevuld" aanrekenen voor beide teams (${latePenaltyTeamNames.join(' en ')})?`}
            </p>
          </div>
        </AppModal>

        {forfaitEmailContext && (
          <ForfaitEmailModal
            open={forfaitEmailModalOpen}
            onOpenChange={(o) => {
              setForfaitEmailModalOpen(o);
              if (!o) setForfaitEmailContext(null);
            }}
            homeTeamId={match.homeTeamId}
            awayTeamId={match.awayTeamId}
            homeTeamName={match.homeTeamName}
            awayTeamName={match.awayTeamName}
            forfaitTeamName={forfaitEmailContext.forfaitTeamName}
            matchDate={match.date}
            matchTime={match.time}
            location={match.location}
          />
        )}
      </div>
    </AppModal>
  );
};

