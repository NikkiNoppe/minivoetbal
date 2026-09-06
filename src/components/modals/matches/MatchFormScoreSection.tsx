import React, { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TeamKitColorBar } from "@/components/common/ColorPreview";
import {
  hasMatchTeamContact,
  MatchFormTeamContactDetails,
} from "@/components/modals/matches/MatchFormTeamContactDetails";
import type { MatchTeamContactRow } from "@/services/match/matchTeamsContactSessionFetch";

type TeamSide = "home" | "away";

interface MatchFormScoreSectionProps {
  homeTeamName: string;
  awayTeamName: string;
  homeClubColors: string | null;
  awayClubColors: string | null;
  homeColumnStyle?: React.CSSProperties;
  awayColumnStyle?: React.CSSProperties;
  homeTeamContact?: MatchTeamContactRow | null;
  awayTeamContact?: MatchTeamContactRow | null;
  homeContactEnabled?: boolean;
  awayContactEnabled?: boolean;
  canEditScore: boolean;
  isTeamManager: boolean;
  displayHomeScore: string;
  displayAwayScore: string;
  homeScoreClassName: string;
  awayScoreClassName: string;
  onHomeScoreChange: (value: string) => void;
  onAwayScoreChange: (value: string) => void;
}

interface TeamScoreColumnProps {
  side: TeamSide;
  teamName: string;
  clubColors: string | null;
  columnStyle?: React.CSSProperties;
  contact?: MatchTeamContactRow | null;
  contactEnabled: boolean;
  contactOpen: boolean;
  onToggleContact: (side: TeamSide) => void;
  canEditScore: boolean;
  displayScore: string;
  scoreClassName: string;
  onScoreChange: (value: string) => void;
  scoreInputId: string;
}

function TeamScoreColumn({
  side,
  teamName,
  clubColors,
  columnStyle,
  contact,
  contactEnabled,
  contactOpen,
  onToggleContact,
  canEditScore,
  displayScore,
  scoreClassName,
  onScoreChange,
  scoreInputId,
}: TeamScoreColumnProps) {
  const showContactControl = contactEnabled;
  const hasContact = hasMatchTeamContact(contact);

  const teamNameControl = showContactControl ? (
    <button
      type="button"
      onClick={() => onToggleContact(side)}
      className={cn(
        "flex min-h-[44px] w-full min-w-0 items-center justify-center gap-1 rounded-md px-1 text-sm font-semibold text-[var(--color-700)] transition-colors",
        "hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
      aria-expanded={contactOpen}
      aria-controls={`match-form-${side}-contact`}
      aria-label={
        hasContact
          ? `Contactgegevens ${teamName}${contactOpen ? " verbergen" : " tonen"}`
          : `Contact voor ${teamName} — niet beschikbaar`
      }
    >
      <span className="min-w-0 max-w-full text-center text-xs leading-tight break-words [overflow-wrap:anywhere] sm:text-sm">
        {teamName}
      </span>
      <ChevronDown
        className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", contactOpen && "rotate-180")}
        aria-hidden
      />
    </button>
  ) : canEditScore ? (
    <Label
      htmlFor={scoreInputId}
      className="flex min-h-[44px] w-full min-w-0 items-center justify-center text-center text-sm font-semibold text-[var(--color-700)]"
    >
      <span className="min-w-0 max-w-full text-center text-xs leading-tight break-words [overflow-wrap:anywhere] sm:text-sm">
        {teamName}
      </span>
    </Label>
  ) : (
    <p className="flex min-h-[44px] w-full min-w-0 items-center justify-center text-center text-sm font-semibold text-[var(--color-700)]">
      <span className="min-w-0 max-w-full text-center text-xs leading-tight break-words [overflow-wrap:anywhere] sm:text-sm">
        {teamName}
      </span>
    </p>
  );

  return (
    <div
      className="flex min-w-0 w-full flex-col space-y-2 rounded-lg p-3 transition-colors"
      style={columnStyle}
    >
      {teamNameControl}
      {contactOpen && showContactControl && (
        <div id={`match-form-${side}-contact`} className="min-w-0 w-full">
          <MatchFormTeamContactDetails contact={contact} />
        </div>
      )}
      <TeamKitColorBar clubColors={clubColors} />
      <div className="relative w-full min-w-0 pt-1">
        {canEditScore ? (
          <Input
            id={scoreInputId}
            type="number"
            min="0"
            max="99"
            value={displayScore}
            onChange={(e) => onScoreChange(e.target.value)}
            className={cn(scoreClassName, "w-full")}
            style={{ fontSize: "2rem", fontWeight: "700", padding: "1rem" }}
            aria-label={`Score voor ${teamName}`}
          />
        ) : (
          <div
            className={cn(
              scoreClassName,
              "flex min-h-16 w-full items-center justify-center bg-[var(--color-50)]/80",
            )}
            role="status"
            aria-label={`Score voor ${teamName}: ${displayScore || "nog niet ingevuld"}`}
          >
            <span className="text-3xl font-bold text-[var(--color-700)]">{displayScore || "—"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function MatchFormScoreSection({
  homeTeamName,
  awayTeamName,
  homeClubColors,
  awayClubColors,
  homeColumnStyle,
  awayColumnStyle,
  homeTeamContact,
  awayTeamContact,
  homeContactEnabled = true,
  awayContactEnabled = true,
  canEditScore,
  isTeamManager,
  displayHomeScore,
  displayAwayScore,
  homeScoreClassName,
  awayScoreClassName,
  onHomeScoreChange,
  onAwayScoreChange,
}: MatchFormScoreSectionProps) {
  const [openContactSide, setOpenContactSide] = useState<TeamSide | null>(null);

  const toggleContact = useCallback((side: TeamSide) => {
    setOpenContactSide((current) => (current === side ? null : side));
  }, []);

  return (
    <>
      <h3 className="mb-4 hidden text-center text-xl font-semibold text-brand-dark md:block">Score</h3>
      <div className="space-y-4 rounded-xl border border-primary/20 p-4 pb-2 shadow-lg card-hover sm:p-5">
        <div className="relative">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 md:gap-4">
          <TeamScoreColumn
            side="home"
            teamName={homeTeamName}
            clubColors={homeClubColors}
            columnStyle={homeColumnStyle}
            contact={homeTeamContact}
            contactEnabled={homeContactEnabled}
            contactOpen={openContactSide === "home"}
            onToggleContact={toggleContact}
            canEditScore={canEditScore}
            displayScore={displayHomeScore}
            scoreClassName={homeScoreClassName}
            onScoreChange={onHomeScoreChange}
            scoreInputId="home-score"
          />

          <div className="flex items-center justify-center self-end pb-3">
            <span className="text-2xl font-bold text-[var(--color-700)]" aria-label="tegen">
              -
            </span>
          </div>

          <TeamScoreColumn
            side="away"
            teamName={awayTeamName}
            clubColors={awayClubColors}
            columnStyle={awayColumnStyle}
            contact={awayTeamContact}
            contactEnabled={awayContactEnabled}
            contactOpen={openContactSide === "away"}
            onToggleContact={toggleContact}
            canEditScore={canEditScore}
            displayScore={displayAwayScore}
            scoreClassName={awayScoreClassName}
            onScoreChange={onAwayScoreChange}
            scoreInputId="away-score"
          />
        </div>

        {isTeamManager && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Score wordt ingevuld door de scheidsrechter.
          </p>
        )}
        </div>
      </div>
    </>
  );
}
