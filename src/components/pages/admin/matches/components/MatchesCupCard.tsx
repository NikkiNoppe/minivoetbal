import React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MatchesCard from "./MatchesCard";
import { isCupWinnerPlaceholderName } from "@/lib/cupTeamSeeding";
import { cn } from "@/lib/utils";

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
        badgeSlot={<div></div>}
      />
      
      {/* Tournament round badge - positioned absolutely at top right */}
      {tournamentRound && (
        <div className="absolute top-2 right-2">
          <Badge
            variant="outline"
            className={cn(
              "text-xs bg-brand-100 text-brand-700 border-brand-300 shadow-sm",
              /^Voorronde\s+\d+/i.test(tournamentRound) && "font-semibold tracking-tight",
            )}
          >
            {tournamentRound}
          </Badge>
        </div>
      )}
      
      {/* Next match badge - positioned below tournament round */}
      {nextMatch && (
        <div className="absolute top-2 right-2" style={{ marginTop: tournamentRound ? '24px' : '0' }}>
          <Badge variant="secondary" className="text-xs max-w-[11rem] truncate">
            <ArrowRight className="h-3 w-3 mr-1 shrink-0" aria-hidden />
            {nextMatch.replace(/^→\s*/, "")}
          </Badge>
        </div>
      )}
      
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
