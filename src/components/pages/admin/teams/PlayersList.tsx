import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePlayerListLock } from "../players/hooks/usePlayerListLock";
import { Lock, Loader2 } from "lucide-react";
import { Player } from "@/services/core";
import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";
import { formatDateShort } from "@/lib/dateUtils";
import { fetchPlayersForSession } from "@/services/core/playersSessionFetch";

interface PlayersListProps {
  teamId: number;
  teamName: string;
  teamEmail: string;
}

const PlayersList: React.FC<PlayersListProps> = ({ teamId, teamName, teamEmail }) => {
  const { toast } = useToast();
  const { isLocked, lockMessage, canEdit } = usePlayerListLock();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState("");
  const [newPlayerLastName, setNewPlayerLastName] = useState("");
  const [newPlayerBirthDate, setNewPlayerBirthDate] = useState("");

  // Load players from database
  useEffect(() => {
    loadPlayers();
  }, [teamId]);

  const loadPlayers = async () => {
    const startTime = Date.now();
    const MIN_LOADING_TIME = 250; // Minimum 250ms loading time for better UX
    
    try {
      setLoading(true);
      const rows = await fetchPlayersForSession(teamId);
      const playersData: Player[] = rows.map((p) => ({
        player_id: p.player_id,
        first_name: p.first_name,
        last_name: p.last_name,
        birth_date: p.birth_date,
        team_id: p.team_id,
      }));
      setPlayers(playersData);
      console.log(`✅ Loaded ${playersData.length} players for team ${teamId}`);
    } catch (error) {
      toast({
        title: "Fout bij laden spelers",
        description: "Er is een fout opgetreden bij het laden van de spelers.",
        variant: "destructive",
      });
    } finally {
      // Ensure minimum loading time for better UX
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
      if (remainingTime > 0) {
        setTimeout(() => {
          setLoading(false);
        }, remainingTime);
      } else {
        setLoading(false);
      }
    }
  };

  const showLockWarning = () => {
    if (!isLocked) return;
    toast({
      title: "Spelerslijst vergrendeld",
      description:
        lockMessage ?? "Wijzigingen aan de spelerslijst zijn momenteel niet toegestaan.",
      variant: "destructive",
    });
  };

  const handleAddPlayer = async () => {
    if (!canEdit) {
      showLockWarning();
      return;
    }

    if (!newPlayerFirstName || !newPlayerLastName || !newPlayerBirthDate) {
      toast({
        title: "Fout",
        description: "Vul alle velden in",
        variant: "destructive",
      });
      return;
    }

    if (players.length >= 20) {
      toast({
        title: "Limiet bereikt",
        description: "U kunt maximaal 20 spelers toevoegen",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.rpc('insert_player_for_session', {
        ...getRpcSessionArgs(),
        p_first_name: newPlayerFirstName,
        p_last_name: newPlayerLastName,
        p_birth_date: newPlayerBirthDate,
        p_team_id: teamId,
      });

      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.success) {
        throw new Error(result?.message || 'Kon speler niet toevoegen');
      }

      setNewPlayerFirstName("");
      setNewPlayerLastName("");
      setNewPlayerBirthDate("");

      toast({
        title: "Speler toegevoegd",
        description: `${newPlayerFirstName} ${newPlayerLastName} is toegevoegd aan het team`,
      });

      // Reload players
      await loadPlayers();
    } catch (error) {
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het toevoegen van de speler.",
        variant: "destructive",
      });
    }
  };

  const handleRemovePlayer = async (playerId: number) => {
    if (!canEdit) {
      showLockWarning();
      return;
    }

    try {
      const { data, error } = await supabase.rpc('delete_player_for_session', {
        ...getRpcSessionArgs(),
        p_player_id: playerId,
      });

      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.success) {
        throw new Error(result?.message || 'Kon speler niet verwijderen');
      }

      toast({
        title: "Speler verwijderd",
        description: "De speler is permanent verwijderd uit het team",
      });

      // Reload players
      await loadPlayers();
    } catch (error) {
      toast({
        title: "Fout",
        description: "Er is een fout opgetreden bij het verwijderen van de speler.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Spelers worden geladen...</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Spelerslijst voor {teamName}
          {isLocked && (
            <Lock className="h-4 w-4 text-red-500" />
          )}
        </CardTitle>
        <CardDescription>
          Beheer tot 20 spelers voor uw team • Contact: {teamEmail}
          {isLocked && lockMessage && (
            <span className="block text-red-600 mt-1">{lockMessage}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="player-first-name" className="block text-sm font-medium">
                Voornaam
              </label>
              <Input
                id="player-first-name"
                value={newPlayerFirstName}
                onChange={(e) => setNewPlayerFirstName(e.target.value)}
                placeholder="Voer voornaam in"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="player-last-name" className="block text-sm font-medium">
                Achternaam
              </label>
              <Input
                id="player-last-name"
                value={newPlayerLastName}
                onChange={(e) => setNewPlayerLastName(e.target.value)}
                placeholder="Voer achternaam in"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="player-birth-date" className="block text-sm font-medium">
                Geboortedatum
              </label>
              <Input
                id="player-birth-date"
                type="date"
                value={newPlayerBirthDate}
                onChange={(e) => setNewPlayerBirthDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button onClick={handleAddPlayer} disabled={!canEdit}>
              Speler toevoegen
            </Button>
            <span className="text-sm text-muted-foreground">
              {players.length}/20 spelers
            </span>
          </div>

          <div className="rounded-md border">
            <div
              className="max-h-[50vh] sm:max-h-[60vh] md:max-h-[65vh] overflow-y-auto"
              role="region"
              aria-label={`Spelerslijst voor ${teamName}`}
            >
            <Table className="table w-full text-sm md:text-base">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 bg-inherit z-10">Naam</TableHead>
                  <TableHead className="hidden sticky top-0 bg-inherit z-10 sm:table-cell">
                    Geboortedatum
                  </TableHead>
                  <TableHead className="sticky top-0 bg-inherit z-10 text-right w-[88px]">
                    Actie
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                      Geen spelers toegevoegd
                    </TableCell>
                  </TableRow>
                ) : (
                  players.map((player) => (
                    <TableRow key={player.player_id}>
                      <TableCell className="font-medium">
                        <div className="min-w-0">
                          <div className="truncate">
                            {player.first_name} {player.last_name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground sm:hidden">
                            {formatDateShort(player.birth_date)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {formatDateShort(player.birth_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleRemovePlayer(player.player_id)}
                          disabled={!canEdit}
                          className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          aria-label={`${player.first_name} ${player.last_name} verwijderen`}
                        >
                          Verwijderen
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlayersList;
