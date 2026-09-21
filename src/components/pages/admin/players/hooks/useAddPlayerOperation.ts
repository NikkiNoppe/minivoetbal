
import { useToast } from "@/hooks/use-toast";
import { NewPlayerData } from "../types";
import { usePlayerCRUD } from "./usePlayerCRUD";
import { isTeamRosterFull, MAX_TEAM_PLAYERS } from "../utils/playerUtils";

export const useAddPlayerOperation = (
  selectedTeam: number | null,
  refreshPlayers: () => Promise<void>,
  canEdit: boolean,
  showLockWarning: () => void,
  newPlayer: NewPlayerData,
  setNewPlayer: (player: NewPlayerData) => void,
  rosterSize?: number,
  isAdmin?: boolean,
) => {
  const { toast } = useToast();
  const { addPlayer } = usePlayerCRUD(refreshPlayers);

  const handleAddPlayer = async (): Promise<boolean> => {
    if (!canEdit) {
      showLockWarning();
      return false;
    }

    if (rosterSize !== undefined && isTeamRosterFull(rosterSize)) {
      toast({
        title: "Limiet bereikt",
        description: `Een team mag maximaal ${MAX_TEAM_PLAYERS} spelers hebben.`,
        variant: "destructive",
      });
      return false;
    }

    if (!selectedTeam) {
      toast({
        title: "Geen team geselecteerd",
        description: "Selecteer eerst een team",
        variant: "destructive",
      });
      return false;
    }

    const success = await addPlayer(
      newPlayer.firstName,
      newPlayer.lastName,
      newPlayer.birthDate,
      selectedTeam
    );

    if (success) {
      setNewPlayer({ firstName: "", lastName: "", birthDate: "" });
      return true;
    } else {
      return false;
    }
  };

  return { handleAddPlayer };
};
