import React from "react";
import { Clock, MapPin, CheckCircle } from "lucide-react";
import AutoFitText from "@/components/ui/auto-fit-text";
import { formatDateWithDay } from "@/lib/dateUtils";


export type MatchCardStatus = 'completed' | 'upcoming' | 'pending';

interface MatchCardProps {
  id?: string;
  home: string;
  away: string;
  homeScore?: number | null;
  awayScore?: number | null;
  date?: string;
  time?: string;
  location?: string;
  status?: MatchCardStatus;
  nextMatch?: string;
  badgeSlot?: React.ReactNode;
}

const getStatusBadge = (status: MatchCardStatus, nextMatch?: string) => {
  switch (status) {
    case "completed":
      return {
        label: "Afgerond",
        className: "bg-success text-success-foreground border border-success/30",
        icon: CheckCircle,
      };
    case "upcoming":
      return {
        label: nextMatch ? `→ ${nextMatch}` : "Aankomend",
        className: "bg-warning/25 text-foreground border border-warning/50",
        icon: Clock,
      };
    case "pending":
      return {
        label: "In afwachting",
        className: "bg-accent text-accent-foreground border border-primary/25",
        icon: Clock,
      };
    default:
      return {
        label: "Onbekend",
        className: "bg-muted text-muted-foreground border border-border",
        icon: Clock,
      };
  }
};

const MatchCard: React.FC<MatchCardProps> = ({
  id,
  home,
  away,
  homeScore,
  awayScore,
  date,
  time,
  location,
  status = "pending",
  nextMatch,
  badgeSlot
}) => {
  const badge = getStatusBadge(status, nextMatch);
  const StatusIcon = badge.icon;
  return (
    <div className="match-card">
      <div className="match-card-header flex items-center justify-end mb-2">
        {badgeSlot ? badgeSlot : (
          <span className={`match-card-status-badge ${badge.className} text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-1`}>
            <StatusIcon className="h-3 w-3 shrink-0" aria-hidden />
            {badge.label}
          </span>
        )}
      </div>
      <div className="match-card-teams">
        <div className="team-name-container text-right max-w-[47%]">
          <AutoFitText 
            text={home}
            maxFontSize={16}
            minFontSize={7}
            className="text-responsive-team font-medium text-right"
          />
        </div>
        <span className="text-xs mx-1 min-w-[20px] text-center">vs</span>
        <div className="team-name-container text-left max-w-[47%]">
          <AutoFitText 
            text={away}
            maxFontSize={16}
            minFontSize={7}
            className="text-responsive-team font-medium text-left"
          />
        </div>
      </div>
      <div className="match-card-score">
        {homeScore !== undefined && awayScore !== undefined && homeScore !== null && awayScore !== null
          ? `${homeScore} - ${awayScore}`
          : "-"}
      </div>
      <div className="match-card-meta">
        <span className="text-responsive-small"><Clock className="inline h-3 w-3 mr-1" />{date ? formatDateWithDay(date) : "-"}</span>
        <span className="text-responsive-small">{time || "-"}</span>
      </div>
      <div className="match-card-location">
        <MapPin className="inline h-3 w-3 mr-1" />
        <span className="text-responsive-small">{location}</span>
      </div>
    </div>
  );
};

export default React.memo(MatchCard); 