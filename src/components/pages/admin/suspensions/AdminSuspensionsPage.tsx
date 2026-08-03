import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AppModal } from '@/components/modals';
import { AppAlertModal, DestructiveConfirmDescription, InfoConfirmDescription } from '@/components/modals';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Loader2, Calendar, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { suspensionService } from '@/domains/cards-suspensions';
import { useSuspensionsData } from '@/domains/cards-suspensions';
import { supabase } from '@/integrations/supabase/client';
import { getRpcSessionArgs } from '@/lib/authSession';
import { fetchTeamsForSession } from '@/services/core/teamsSessionFetch';
import { fetchPlayersForSession } from '@/services/core/playersSessionFetch';
import { fetchAllCards, type CardData } from '@/domains/matches';
import ResponsiveCardsTable from '@/components/tables/ResponsiveCardsTable';
import { useUpcomingMatches } from '@/domains/matches';
import { useOrgQueryScope } from '@/hooks/useOrganization';
import { withOrgQueryKey } from '@/lib/orgQueryKey';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface ManualSuspension {
  id: number;
  playerId: number;
  playerName?: string;
  teamName?: string;
  reason: string;
  matches: number;
  startDate: string;
  endDate: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

interface EditingSuspensionData {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  type: 'automatic' | 'manual';
  remaining: number;
  reason: string;
  manualSuspensionId?: number;
}

const AdminSuspensionsPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSuspension, setEditingSuspension] = useState<ManualSuspension | null>(null);
  const [editingActiveSuspension, setEditingActiveSuspension] = useState<EditingSuspensionData | null>(null);
  const [newSuspension, setNewSuspension] = useState({
    teamId: '',
    playerId: '',
    reason: '',
    matches: '1',
    notes: ''
  });

  // Fetch data
  const { playerCards, suspensions, isLoading } = useSuspensionsData();

  // Niet meer automatisch vernieuwen bij openen; data wordt via queries opgehaald.
  
  // Kaarten uit wedstrijdformulieren (alle gele/rode kaarten)
  const { data: allCards, isLoading: isCardsLoading } = useQuery({
    queryKey: withOrgQueryKey(['allCardsAdmin'], organizationId),
    queryFn: fetchAllCards,
    enabled: orgQueryEnabled,
  });
  
  // Groepeer kaarten per speler
  const playerCardSummaries = React.useMemo(() => {
    if (!allCards) return [] as Array<{
      playerId: number; playerName: string; teamName: string; yellowCards: number; redCards: number; totalCards: number; isSuspended: boolean; suspensionReason?: string; cards: CardData[];
    }>;
    const groups = allCards.reduce((acc, card) => {
      const key = `${card.playerId}-${card.playerName}`;
      if (!acc[key]) {
        acc[key] = { playerId: card.playerId, playerName: card.playerName, teamName: card.teamName, cards: [] as CardData[] };
      }
      acc[key].cards.push(card);
      return acc;
    }, {} as Record<string, { playerId: number; playerName: string; teamName: string; cards: CardData[] }>);
    return Object.values(groups).map(group => {
      const yellowCards = group.cards.filter(c => c.cardType === 'yellow').length;
      const redCards = group.cards.filter(c => c.cardType === 'red').length;
      const totalCards = yellowCards + redCards;
      const isSuspended = false; // We tonen enkel wie kaarten heeft; status niet verplicht
      return {
        playerId: group.playerId,
        playerName: group.playerName,
        teamName: group.teamName,
        yellowCards,
        redCards,
        totalCards,
        isSuspended,
        cards: group.cards,
      };
    }).sort((a, b) => b.totalCards - a.totalCards);
  }, [allCards]);
  
  const manualSuspensionsQuery = useQuery({
    queryKey: ['manualSuspensions'],
    queryFn: suspensionService.getManualSuspensions
  });

  const teamsQuery = useQuery({
    queryKey: ['allTeams'],
    queryFn: async () => {
      const teams = await fetchTeamsForSession();
      return teams.map((t) => ({ team_id: t.team_id, team_name: t.team_name }));
    }
  });

  const playersQuery = useQuery({
    queryKey: ['allPlayers'],
    queryFn: async () => {
      const [players, teams] = await Promise.all([
        fetchPlayersForSession(null),
        fetchTeamsForSession(),
      ]);
      const teamMap = new Map(teams.map((t) => [t.team_id, t.team_name]));
      return players.map((p) => ({
        playerId: p.player_id,
        playerName: `${p.first_name} ${p.last_name}`,
        teamName: teamMap.get(p.team_id) || 'Onbekend Team',
        teamId: p.team_id,
      }));
    }
  });

  const filteredPlayers = React.useMemo(() => {
    if (!playersQuery.data || !newSuspension.teamId) return [] as { playerId: number; playerName: string; teamName: string; teamId: number }[];
    const teamIdNum = parseInt(newSuspension.teamId);
    return playersQuery.data.filter(p => p.teamId === teamIdNum);
  }, [playersQuery.data, newSuspension.teamId]);

  // Mutations
  const addSuspensionMutation = useMutation({
    mutationFn: (data: any) => suspensionService.applySuspension(
      parseInt(data.playerId),
      data.reason,
      parseInt(data.matches),
      data.notes
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manualSuspensions'] });
      setIsAddDialogOpen(false);
      setNewSuspension({ teamId: '', playerId: '', reason: '', matches: '1', notes: '' });
      toast({
        title: "Schorsing toegevoegd",
        description: "De schorsing is succesvol toegevoegd."
      });
    },
    onError: () => {
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het toevoegen van de schorsing.",
        variant: "destructive"
      });
    }
  });

  const updateSuspensionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => 
      suspensionService.updateSuspension(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manualSuspensions'] });
      setEditingSuspension(null);
      toast({
        title: "Schorsing bijgewerkt",
        description: "De schorsing is succesvol bijgewerkt."
      });
    }
  });

  const deleteSuspensionMutation = useMutation({
    mutationFn: suspensionService.deleteSuspension,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manualSuspensions'] });
      toast({
        title: "Schorsing verwijderd",
        description: "De schorsing is succesvol verwijderd."
      });
    }
  });

  // Mutation for updating player's suspended_matches_remaining (automatic suspensions)
  const updatePlayerSuspensionMutation = useMutation({
    mutationFn: async ({ playerId, remaining }: { playerId: number; remaining: number }) => {
      const { data, error } = await supabase.rpc('update_player_suspension_for_session', {
        ...getRpcSessionArgs(),
        p_player_id: playerId,
        p_suspended_matches_remaining: Math.max(0, remaining),
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.success) throw new Error(result?.message || 'Kon schorsing niet bijwerken');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playerCards'] });
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
      setEditingActiveSuspension(null);
      toast({
        title: "Schorsing aangepast",
        description: "De schorsing is succesvol aangepast."
      });
    },
    onError: () => {
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het aanpassen van de schorsing.",
        variant: "destructive"
      });
    }
  });

  // Mutation for lifting a suspension completely
  const liftSuspensionMutation = useMutation({
    mutationFn: async ({ playerId, type, manualId }: { playerId: number; type: 'automatic' | 'manual'; manualId?: number }) => {
      if (type === 'automatic') {
        const { data, error } = await supabase.rpc('update_player_suspension_for_session', {
          ...getRpcSessionArgs(),
          p_player_id: playerId,
          p_suspended_matches_remaining: 0,
        });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        if (!result?.success) throw new Error(result?.message || 'Kon schorsing niet opheffen');
      } else if (manualId) {
        await suspensionService.deleteSuspension(manualId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playerCards'] });
      queryClient.invalidateQueries({ queryKey: ['suspensions'] });
      queryClient.invalidateQueries({ queryKey: ['manualSuspensions'] });
      toast({
        title: "Schorsing opgeheven",
        description: "De schorsing is succesvol opgeheven."
      });
    }
  });

  const handleAddSuspension = () => {
    addSuspensionMutation.mutate(newSuspension);
  };

  const handleUpdateSuspension = (suspension: ManualSuspension) => {
    updateSuspensionMutation.mutate({
      id: suspension.id,
      data: {
        reason: suspension.reason,
        matches: suspension.matches,
        notes: suspension.notes,
        isActive: suspension.isActive
      }
    });
  };

  const getSuspendedPlayers = () => {
    return playerCards?.filter(player => player.suspendedMatches && player.suspendedMatches > 0) || [];
  };

  const getPlayerName = (playerId: number) => {
    const player = playersQuery.data?.find(p => p.playerId === playerId);
    return player ? `${player.playerName} (${player.teamName})` : `Speler ${playerId}`;
  };

  if (isLoading || manualSuspensionsQuery.isLoading || playersQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded animate-pulse" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const suspendedPlayers = getSuspendedPlayers();
  const manualSuspensions = manualSuspensionsQuery.data || [];
  const activeSuspensions = manualSuspensions.filter(s => s.isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Schorsingen Beheer</h1>
        <div className="flex gap-2">
          <Button 
            className="btn btn--outline flex items-center gap-2"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Schorsing Toevoegen
          </Button>
          <AppModal
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            title="Nieuwe Schorsing Toevoegen"
            size="sm"
            primaryAction={{
              label: "Toevoegen",
              onClick: handleAddSuspension,
              variant: "primary",
              disabled: !newSuspension.teamId || !newSuspension.playerId || !newSuspension.reason,
            }}
            secondaryAction={{
              label: "Annuleren",
              onClick: () => setIsAddDialogOpen(false),
              variant: "secondary",
            }}
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="team">Team</Label>
                <Select value={newSuspension.teamId} onValueChange={(value) =>
                  setNewSuspension(prev => ({ ...prev, teamId: value, playerId: '' }))
                }>
                  <SelectTrigger>
                    <SelectValue placeholder={teamsQuery.isLoading ? 'Teams laden...' : 'Selecteer team'} />
                  </SelectTrigger>
                  <SelectContent>
                    {teamsQuery.data?.map(team => (
                      <SelectItem key={team.team_id} value={team.team_id.toString()}>
                        {team.team_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="player">Speler</Label>
                <Select value={newSuspension.playerId} onValueChange={(value) =>
                  setNewSuspension(prev => ({ ...prev, playerId: value }))
                } disabled={!newSuspension.teamId}>
                  <SelectTrigger>
                    <SelectValue placeholder={!newSuspension.teamId ? 'Selecteer eerst een team' : (playersQuery.isLoading ? 'Spelers laden...' : 'Selecteer speler')} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPlayers.map(player => (
                      <SelectItem key={player.playerId} value={player.playerId.toString()}>
                        {player.playerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="reason">Reden</Label>
                <Input
                  id="reason"
                  value={newSuspension.reason}
                  onChange={(e) => setNewSuspension(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Bijv. Rode kaart - grove overtreding"
                />
              </div>
              <div>
                <Label htmlFor="matches">Aantal wedstrijden</Label>
                <Input
                  id="matches"
                  type="number"
                  min="1"
                  max="10"
                  value={newSuspension.matches}
                  onChange={(e) => setNewSuspension(prev => ({ ...prev, matches: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="notes">Opmerkingen (optioneel)</Label>
                <Textarea
                  id="notes"
                  value={newSuspension.notes}
                  onChange={(e) => setNewSuspension(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Extra opmerkingen over de schorsing"
                />
              </div>
            </div>
          </AppModal>
        </div>
      </div>

      {/* Lijst van spelers die kaarten hebben (uit wedstrijdformulieren) */}
      <Card>
        <CardHeader>
          <CardTitle>Spelers met Kaarten (wedstrijdformulieren)</CardTitle>
        </CardHeader>
        <CardContent>
          {isCardsLoading ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Laden...
            </div>
          ) : (
            <ResponsiveCardsTable playerSummaries={playerCardSummaries} sticky={false} />
          )}
        </CardContent>
      </Card>

      {/* Actieve Schorsingen - gecombineerd overzicht (automatisch + handmatig) met edit/delete */}
      <ActiveSuspensionsSection
        suspendedPlayers={suspendedPlayers}
        manualSuspensions={manualSuspensions}
        playersQuery={playersQuery}
        onEdit={setEditingActiveSuspension}
        onLift={liftSuspensionMutation.mutate}
      />

      {/* Manual Suspensions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Handmatige Schorsingen</CardTitle>
        </CardHeader>
        <CardContent>
          {manualSuspensions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Geen handmatige schorsingen gevonden
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <div className="min-w-0 table-no-inner-scroll-mobile">
                <Table className="table w-full text-sm md:text-base">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Speler</TableHead>
                      <TableHead className="hidden lg:table-cell min-w-[220px]">Reden</TableHead>
                      <TableHead className="hidden sm:table-cell min-w-[120px]">Wedstrijden</TableHead>
                      <TableHead className="hidden md:table-cell min-w-[120px]">Status</TableHead>
                      <TableHead className="hidden lg:table-cell min-w-[140px]">Aangemaakt</TableHead>
                      <TableHead className="text-center min-w-[120px]">Acties</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualSuspensions.map(suspension => (
                      <TableRow key={suspension.id}>
                        <TableCell className="font-medium text-xs sm:text-sm">
                          <div className="min-w-0">
                            <div
                              className="truncate max-w-[200px] sm:max-w-[260px]"
                              title={getPlayerName(suspension.playerId)}
                            >
                              {getPlayerName(suspension.playerId)}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground lg:hidden">
                              {suspension.matches} wedstrijd{suspension.matches === 1 ? "" : "en"}
                              {" · "}
                              {suspension.isActive ? "Actief" : "Inactief"}
                              {suspension.reason ? ` · ${suspension.reason}` : ""}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell truncate max-w-[260px] text-xs sm:text-sm">{suspension.reason}</TableCell>
                        <TableCell className="hidden sm:table-cell">{suspension.matches}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant={suspension.isActive ? 'destructive' : 'secondary'}>
                            {suspension.isActive ? 'Actief' : 'Inactief'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {new Date(suspension.createdAt).toLocaleDateString('nl-NL')}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              onClick={() => setEditingSuspension(suspension)}
                              className="btn btn--icon btn--edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <DeleteSuspensionButton
                              suspensionId={suspension.id}
                              onDelete={() => deleteSuspensionMutation.mutate(suspension.id)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Suspension Dialog */}
      {editingSuspension && (
        <AppModal
          open={!!editingSuspension}
          onOpenChange={(open) => !open && setEditingSuspension(null)}
          title="Handmatige Schorsing Bewerken"
          size="sm"
          primaryAction={{
            label: "Wijzigingen Opslaan",
            onClick: () => editingSuspension && handleUpdateSuspension(editingSuspension),
            variant: "primary",
          }}
          secondaryAction={{
            label: "Annuleren",
            onClick: () => setEditingSuspension(null),
            variant: "secondary",
          }}
        >
          <div className="space-y-4">
            <div>
              <Label>Speler</Label>
              <div className="p-2 bg-muted rounded">
                {getPlayerName(editingSuspension.playerId)}
              </div>
            </div>
            <div>
              <Label htmlFor="edit-reason">Reden</Label>
              <Input
                id="edit-reason"
                value={editingSuspension.reason}
                onChange={(e) => setEditingSuspension(prev => prev ? { ...prev, reason: e.target.value } : null)}
              />
            </div>
            <div>
              <Label htmlFor="edit-matches">Aantal wedstrijden</Label>
              <Input
                id="edit-matches"
                type="number"
                min="1"
                max="10"
                value={editingSuspension.matches}
                onChange={(e) => setEditingSuspension(prev => prev ? { ...prev, matches: parseInt(e.target.value) } : null)}
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">Opmerkingen</Label>
              <Textarea
                id="edit-notes"
                value={editingSuspension.notes || ''}
                onChange={(e) => setEditingSuspension(prev => prev ? { ...prev, notes: e.target.value } : null)}
              />
            </div>
          </div>
        </AppModal>
      )}

      {/* Edit Active Suspension Dialog (voor automatische schorsingen) */}
      {editingActiveSuspension && (
        <EditActiveSuspensionDialog
          suspension={editingActiveSuspension}
          onClose={() => setEditingActiveSuspension(null)}
          onSave={(remaining) => {
            updatePlayerSuspensionMutation.mutate({
              playerId: editingActiveSuspension.playerId,
              remaining
            });
          }}
        />
      )}
    </div>
  );
};

// Component voor Actieve Schorsingen sectie met edit/delete + upcoming matches
const ActiveSuspensionsSection: React.FC<{
  suspendedPlayers: any[];
  manualSuspensions: ManualSuspension[];
  playersQuery: any;
  onEdit: (data: EditingSuspensionData) => void;
  onLift: (data: { playerId: number; type: 'automatic' | 'manual'; manualId?: number }) => void;
}> = ({ suspendedPlayers, manualSuspensions, playersQuery, onEdit, onLift }) => {
  const activeManual = manualSuspensions.filter(s => s.isActive);
  
  const getPlayerDetails = (playerId: number) => {
    const match = playersQuery.data?.find((p: any) => p.playerId === playerId);
    return {
      playerName: match ? match.playerName : `Speler ${playerId}`,
      teamName: match ? match.teamName : 'Onbekend Team',
      teamId: match?.teamId || 0
    };
  };

  const unified = [
    ...suspendedPlayers.map(p => ({
      key: `auto-${p.playerId}`,
      playerId: p.playerId,
      playerName: p.playerName,
      teamName: p.teamName,
      teamId: p.teamId || 0,
      type: 'automatic' as const,
      reason: 'Kaarten (automatisch)',
      remaining: p.suspendedMatches,
      matches: p.suspendedMatches,
      manualSuspensionId: undefined as number | undefined
    })),
    ...activeManual.map(s => {
      const details = getPlayerDetails(s.playerId);
      return {
        key: `manual-${s.id}`,
        playerId: s.playerId,
        playerName: details.playerName,
        teamName: details.teamName,
        teamId: details.teamId,
        type: 'manual' as const,
        reason: s.reason,
        remaining: s.matches,
        matches: s.matches,
        manualSuspensionId: s.id as number | undefined
      };
    })
  ].sort((a, b) => a.playerName.localeCompare(b.playerName));

  if (unified.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Actieve Schorsingen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">Geen actieve schorsingen</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actieve Schorsingen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {unified.map(item => (
          <SuspensionRow
            key={item.key}
            suspension={item}
            onEdit={() => onEdit({
              playerId: item.playerId,
              playerName: item.playerName,
              teamId: item.teamId,
              teamName: item.teamName,
              type: item.type,
              remaining: item.remaining,
              reason: item.reason,
              manualSuspensionId: item.manualSuspensionId
            })}
            onLift={() => onLift({
              playerId: item.playerId,
              type: item.type,
              manualId: item.manualSuspensionId
            })}
          />
        ))}
      </CardContent>
    </Card>
  );
};

// Helper component for delete button with modal
const DeleteSuspensionButton: React.FC<{
  suspensionId: number;
  onDelete: () => void;
}> = ({ suspensionId, onDelete }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button 
        className="btn btn--icon btn--danger"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <AppAlertModal
        open={open}
        onOpenChange={setOpen}
        title="Schorsing verwijderen"
        description={
          <DestructiveConfirmDescription message="Weet je zeker dat je deze schorsing wilt verwijderen?" />
        }
        confirmAction={{
          label: "Verwijderen",
          onClick: () => {
            onDelete();
            setOpen(false);
          },
          variant: "destructive",
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: () => setOpen(false),
          variant: "secondary",
        }}
      />
    </>
  );
};

// Helper component for lift button with modal
const LiftSuspensionButton: React.FC<{
  playerName: string;
  onLift: () => void;
}> = ({ playerName, onLift }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button 
        size="sm" 
        variant="ghost" 
        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <X className="h-4 w-4" />
      </Button>
      <AppAlertModal
        open={open}
        onOpenChange={setOpen}
        title="Schorsing opheffen"
        description={
          <InfoConfirmDescription
            message={
              <>
                Weet je zeker dat je de schorsing van{" "}
                <span className="font-semibold">{playerName}</span> wilt opheffen?
              </>
            }
          />
        }
        confirmAction={{
          label: "Opheffen",
          onClick: () => {
            onLift();
            setOpen(false);
          },
          variant: "destructive",
        }}
        cancelAction={{
          label: "Annuleren",
          onClick: () => setOpen(false),
          variant: "secondary",
        }}
      />
    </>
  );
};

// Component voor één schorsing row met upcoming matches
const SuspensionRow: React.FC<{
  suspension: any;
  onEdit: () => void;
  onLift: () => void;
}> = ({ suspension, onEdit, onLift }) => {
  const { data: upcomingMatches, isLoading } = useUpcomingMatches(suspension.teamId, 5);

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base truncate">{suspension.playerName}</h3>
            <Badge variant="outline" className={suspension.type === 'automatic' ? 'bg-brand-50 text-brand-700 border-brand-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
              {suspension.type === 'automatic' ? 'Automatisch' : 'Handmatig'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{suspension.teamName}</p>
          <p className="text-sm mt-1">{suspension.reason}</p>
          <div className="mt-2">
            <Badge variant="destructive">{suspension.remaining} wedstrijd{suspension.remaining !== 1 ? 'en' : ''} resterend</Badge>
          </div>
        </div>
        
        <div className="flex gap-1 shrink-0">
          <Button onClick={onEdit} size="sm" variant="ghost" className="h-8 w-8 p-0">
            <Edit className="h-4 w-4" />
          </Button>
          <LiftSuspensionButton
            playerName={suspension.playerName}
            onLift={onLift}
          />
        </div>
      </div>

      {/* Upcoming Matches */}
      <div className="mt-3 pt-3 border-t">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Volgende wedstrijden:</span>
        </div>
        
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Laden...</div>
        ) : !upcomingMatches || upcomingMatches.length === 0 ? (
          <div className="text-sm text-muted-foreground">Geen komende wedstrijden gepland</div>
        ) : (
          <div className="space-y-1">
            {upcomingMatches.slice(0, suspension.remaining + 1).map((match, index) => {
              const isMissed = index < suspension.remaining;
              const matchDate = new Date(match.match_date);
              
              return (
                <div 
                  key={match.match_id} 
                  className={`flex items-center gap-2 text-sm ${isMissed ? 'text-muted-foreground' : 'text-foreground font-medium'}`}
                >
                  {isMissed ? (
                    <X className="h-3 w-3 text-destructive shrink-0" />
                  ) : (
                    <Check className="h-3 w-3 text-success shrink-0" />
                  )}
                  <span className="shrink-0">
                    {format(matchDate, 'dd/MM', { locale: nl })}:
                  </span>
                  <span className="truncate">
                    vs {match.opponent_name}
                  </span>
                  {!isMissed && index === suspension.remaining && (
                    <Badge variant="outline" className="ml-auto shrink-0 bg-success/10 text-success border-success/20">
                      Beschikbaar
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Dialog voor het bewerken van actieve schorsingen
const EditActiveSuspensionDialog: React.FC<{
  suspension: EditingSuspensionData;
  onClose: () => void;
  onSave: (remaining: number) => void;
}> = ({ suspension, onClose, onSave }) => {
  const [remaining, setRemaining] = useState(suspension.remaining);
  const { data: upcomingMatches } = useUpcomingMatches(suspension.teamId, 10);

  const handleSave = () => {
    onSave(remaining);
  };

  return (
    <AppModal
      open={true}
      onOpenChange={onClose}
      title={suspension.type === 'automatic' ? 'Automatische Schorsing Aanpassen' : 'Handmatige Schorsing Aanpassen'}
      size="sm"
      primaryAction={{
        label: "Opslaan",
        onClick: handleSave,
        variant: "primary",
      }}
      secondaryAction={{
        label: "Annuleren",
        onClick: onClose,
        variant: "secondary",
      }}
    >
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Speler</Label>
          <div className="p-2 bg-muted rounded-md mt-1">
            <p className="font-medium">{suspension.playerName}</p>
            <p className="text-sm text-muted-foreground">{suspension.teamName}</p>
          </div>
        </div>

        <div>
          <Label htmlFor="remaining-matches">Resterende wedstrijden</Label>
          <Input
            id="remaining-matches"
            type="number"
            min="0"
            max="10"
            value={remaining}
            onChange={(e) => setRemaining(Math.max(0, parseInt(e.target.value) || 0))}
            className="mt-1"
          />
        </div>

        {upcomingMatches && upcomingMatches.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">Impact op beschikbaarheid:</p>
            <div className="space-y-1">
              {upcomingMatches.slice(0, Math.max(remaining, suspension.remaining) + 1).map((match, index) => {
                const isMissed = index < remaining;
                const matchDate = new Date(match.match_date);
                
                return (
                  <div key={match.match_id} className={`flex items-center gap-2 text-sm ${isMissed ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {isMissed ? (
                      <X className="h-3 w-3 text-destructive" />
                    ) : (
                      <Check className="h-3 w-3 text-success" />
                    )}
                    <span>{format(matchDate, 'dd/MM', { locale: nl })}: vs {match.opponent_name}</span>
                  </div>
                );
              })}
            </div>
            {remaining > 0 && upcomingMatches[remaining] && (
              <p className="text-sm text-success mt-2">
                → Beschikbaar vanaf {format(new Date(upcomingMatches[remaining].match_date), 'dd/MM/yyyy', { locale: nl })}
              </p>
            )}
          </div>
        )}
      </div>
    </AppModal>
  );
};

export default AdminSuspensionsPage;