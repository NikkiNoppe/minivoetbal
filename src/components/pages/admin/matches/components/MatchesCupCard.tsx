import React from "react";
import { Button } from "@/components/ui/button";
import MatchesCard from "./MatchesCard";
import { isCupWinnerPlaceholderName } from "@/lib/cupTeamSeeding";

interface CupMatchCardProps {
  id?: string;
  home: string;
  away: string;
  homeScore?: number | null;
  awayScore?: number | null;
  date?: string;
  time?: string;
  location?: string;
  nextMatch?: string;
  onEditMatch?: (matchId: string) => void;
  canEdit?: boolean;
  tournamentRound?: string;
}

const CupMatchCard: React.FC<CupMatchCardProps> = ({
  id,
  home,
  away,
  homeScore,
  awayScore,
  date,
  time,
  location,
  nextMatch,
  onEditMatch,
  canEdit = false,
  tournamentRound
}) => {
  const homePlaceholder = isCupWinnerPlaceholderName(home);
  const awayPlaceholder = isCupWinnerPlaceholderName(away);

  return (
    <div className="relative">
      <MatchesCard
        id={id}
        home={home}
        away={away}
        homeScore={homeScore}
        awayScore={awayScore}
        date={date}
        time={time}
        location={location}
        status={undefined}
        nextMatch={nextMatch}
        homeClassName={homePlaceholder ? "text-muted-foreground italic font-normal" : undefined}
        awayClassName={awayPlaceholder ? "text-muted-foreground italic font-normal" : undefined}
        badgeSlot={
          tournamentRound ? (
            <span className="text-xs px-2 py-0.5 rounded font-semibold bg-secondary text-secondary-foreground">
              {tournamentRound}
            </span>
          ) : (
            <div></div>
          )
        }
      />
      
      {canEdit && id && onEditMatch && (
        <div className="absolute top-1 right-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEditMatch(id)}
            className="h-6 px-2 text-xs"
          >
            Bewerken
          </Button>
        </div>
      )}
    </div>
  );
};

export default CupMatchCard;
