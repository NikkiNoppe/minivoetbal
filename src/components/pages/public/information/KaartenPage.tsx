import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, AlertTriangle, Loader2 } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAllCards, CardData } from "@/services/match";
import { sortDatesDesc } from "@/lib/dateUtils";
import ResponsiveCardsTable from "@/components/tables/ResponsiveCardsTable";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { Skeleton } from "@/components/ui/skeleton";

interface PlayerCardSummary {
  playerId: number;
  playerName: string;
  teamName: string;
  yellowCards: number;
  redCards: number;
  totalCards: number;
  isSuspended: boolean;
  suspensionReason?: string;
  cards: CardData[];
}

const KaartenPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [cardTypeFilter, setCardTypeFilter] = useState("");
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();

  const { data: allCards, isFetching, error, refetch, isFetched } = useQuery({
    queryKey: withOrgQueryKey(['allCards'], organizationId),
    queryFn: fetchAllCards,
    enabled: orgQueryEnabled,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });

  const hasData = allCards !== undefined;
  const waitingForData = !hasData && isFetching;
  const loadingGate = useMinLoadingGate(waitingForData);
  const isListLoading =
    !loadingGate.timedOut && !hasData && (waitingForData || !loadingGate.minReady);
  const isRefreshing = hasData && isFetching;
  const showError = (!!error || loadingGate.timedOut) && !hasData && !isListLoading;

  // Group cards by player and calculate suspensions
  const playerCardSummaries: PlayerCardSummary[] = React.useMemo(() => {
    if (!allCards) return [];

    const playerGroups = allCards.reduce((acc, card) => {
      const key = `${card.playerId}-${card.playerName}`;
      if (!acc[key]) {
        acc[key] = {
          playerId: card.playerId,
          playerName: card.playerName,
          teamName: card.teamName,
          cards: []
        };
      }
      acc[key].cards.push(card);
      return acc;
    }, {} as Record<string, { playerId: number; playerName: string; teamName: string; cards: CardData[] }>);

    return Object.values(playerGroups).map(group => {
      const yellowCards = group.cards.filter(card => card.cardType === 'yellow').length;
      const redCards = group.cards.filter(card => card.cardType === 'red').length;
      
      // Calculate suspension
      let isSuspended = false;
      let suspensionReason = "";
      
      if (redCards > 0) {
        isSuspended = true;
        suspensionReason = `${redCards} rode kaart${redCards > 1 ? 'en' : ''}`;
      } else if (yellowCards >= 2) {
        isSuspended = true;
        suspensionReason = `${yellowCards} gele kaarten`;
      }

      return {
        playerId: group.playerId,
        playerName: group.playerName,
        teamName: group.teamName,
        yellowCards,
        redCards,
        totalCards: yellowCards + redCards,
        isSuspended,
        suspensionReason,
        cards: group.cards.sort((a, b) => sortDatesDesc(a.matchDate, b.matchDate))
      };
    }).sort((a, b) => b.totalCards - a.totalCards);
  }, [allCards]);

  // Get unique team names for filtering
  const teamNames = [...new Set(allCards?.map(card => card.teamName) || [])];

  const filteredSummaries = playerCardSummaries.filter(summary => {
    if (searchTerm && !summary.playerName.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !summary.teamName.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (teamFilter && summary.teamName !== teamFilter) {
      return false;
    }
    if (cardTypeFilter === 'yellow' && summary.yellowCards === 0) {
      return false;
    }
    if (cardTypeFilter === 'red' && summary.redCards === 0) {
      return false;
    }
    if (cardTypeFilter === 'suspended' && !summary.isSuspended) {
      return false;
    }
    return true;
  });

  const showEmpty = isFetched && !isListLoading && !showError && (allCards?.length ?? 0) === 0;
  const totalYellowCards = allCards?.filter(card => card.cardType === 'yellow').length ?? 0;
  const totalRedCards = allCards?.filter(card => card.cardType === 'red').length ?? 0;
  const suspendedPlayers = playerCardSummaries.filter(p => p.isSuspended).length;

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
              <div>
                <p className="text-2xl font-bold">{isListLoading ? "—" : totalYellowCards}</p>
                <p className="text-sm text-muted-foreground">Gele Kaarten</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              <div>
                <p className="text-2xl font-bold">{isListLoading ? "—" : totalRedCards}</p>
                <p className="text-sm text-muted-foreground">Rode Kaarten</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-orange-500 mr-2" />
              <div>
                <p className="text-2xl font-bold">{isListLoading ? "—" : suspendedPlayers}</p>
                <p className="text-sm text-muted-foreground">Geschorst</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-muted-foreground rounded-full mr-2"></div>
              <div>
                <p className="text-2xl font-bold">{isListLoading ? "—" : totalYellowCards + totalRedCards}</p>
                <p className="text-sm text-muted-foreground">Totaal Kaarten</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cards Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Kaarten Overzicht</span>
            {isRefreshing ? (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground" aria-live="polite">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Vernieuwen…
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            Alle gele en rode kaarten uit wedstrijdformulieren
          </CardDescription>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
            <div>
              <Label htmlFor="search">Zoeken</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Speler of team..."
                  className="pl-8 input-login-style"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="team-filter">Team</Label>
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger id="team-filter" className="dropdown-login-style">
                  <SelectValue placeholder="Alle teams" />
                </SelectTrigger>
                <SelectContent className="dropdown-content-login-style">
                  <SelectItem value="" className="dropdown-item-login-style">Alle teams</SelectItem>
                  {teamNames.map((team, idx) => (
                    <SelectItem key={idx} value={team} className="dropdown-item-login-style">{team}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="card-type-filter">Kaarttype</Label>
              <Select value={cardTypeFilter} onValueChange={setCardTypeFilter}>
                <SelectTrigger id="card-type-filter" className="dropdown-login-style">
                  <SelectValue placeholder="Alle kaarten" />
                </SelectTrigger>
                <SelectContent className="dropdown-content-login-style">
                  <SelectItem value="" className="dropdown-item-login-style">Alle kaarten</SelectItem>
                  <SelectItem value="yellow" className="dropdown-item-login-style">Gele kaarten</SelectItem>
                  <SelectItem value="red" className="dropdown-item-login-style">Rode kaarten</SelectItem>
                  <SelectItem value="suspended" className="dropdown-item-login-style">Geschorste spelers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setTeamFilter("");
                  setCardTypeFilter("");
                }}
              >
                Filters wissen
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isListLoading ? (
            <div className="space-y-3" aria-busy="true">
              <span className="sr-only">Kaarten laden…</span>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : showError ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center" role="alert">
              <p className="text-sm text-destructive">Kan kaarten niet laden</p>
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => refetch()}>
                Opnieuw
              </Button>
            </div>
          ) : showEmpty ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Geen kaarten gevonden</p>
          ) : (
            <ResponsiveCardsTable playerSummaries={filteredSummaries} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default KaartenPage; 