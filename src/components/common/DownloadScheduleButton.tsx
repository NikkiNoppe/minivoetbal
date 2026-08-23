import { memo, useCallback } from "react";
import { CalendarPlus, Download, FileSpreadsheet } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SCHEDULE_DOWNLOAD_BUTTON_DISABLED,
  SCHEDULE_DOWNLOAD_MENU,
  SCHEDULE_DOWNLOAD_MENU_HINT,
  SCHEDULE_DOWNLOAD_MENU_ICON,
  SCHEDULE_DOWNLOAD_MENU_ITEM,
  SCHEDULE_DOWNLOAD_MENU_LABEL,
  SCHEDULE_DOWNLOAD_MENU_SEPARATOR,
  SCHEDULE_DOWNLOAD_TRIGGER,
} from "@/components/common/scheduleControlStyles";
import { downloadICalFile, downloadCSVFile, type ICalEvent } from "@/lib/icalUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ScheduleMatch {
  matchId: number;
  homeTeamName: string;
  awayTeamName: string;
  date: string;
  time: string;
  location: string;
  matchday?: string;
  uniqueNumber?: string;
}

interface DownloadScheduleButtonProps {
  matches: ScheduleMatch[];
  filename?: string;
  calendarName?: string;
  competitionType?: "competitie" | "playoff";
  className?: string;
  /** Download alleen mogelijk na teamkeuze (niet bij "Alle teams") */
  requiresTeamSelection?: boolean;
  hasTeamSelected?: boolean;
  selectedTeamLabel?: string;
}

const matchToICalEvent = (match: ScheduleMatch, competitionType: string): ICalEvent => ({
  id: match.matchId,
  title: `${match.homeTeamName} vs ${match.awayTeamName}`,
  date: match.date,
  time: match.time || "19:00",
  location: match.location || "Harelbekese Minivoetbal",
  description: match.matchday
    ? `${match.matchday} - ${competitionType === "playoff" ? "Play-Off" : "Competitie"}${match.uniqueNumber ? ` (${match.uniqueNumber})` : ""}`
    : undefined,
  duration: 90,
});

const DownloadScheduleButton = memo(({
  matches,
  filename = "speelschema",
  calendarName,
  competitionType = "competitie",
  className = "",
  requiresTeamSelection = false,
  hasTeamSelected = true,
  selectedTeamLabel,
}: DownloadScheduleButtonProps) => {
  const validMatches = matches.filter(
    (m) => m.date && m.homeTeamName && m.awayTeamName,
  );
  const hasMatches = validMatches.length > 0;
  const needsTeamSelection = requiresTeamSelection && !hasTeamSelected;
  const canDownload = hasMatches && !needsTeamSelection;

  const handleDownloadAgenda = useCallback(() => {
    if (needsTeamSelection) {
      toast.error("Selecteer eerst een team", {
        description: "Kies een team in het filter om het speelschema te downloaden",
      });
      return;
    }
    if (!hasMatches) {
      toast.error("Geen wedstrijden om te downloaden");
      return;
    }

    const events = validMatches.map((m) => matchToICalEvent(m, competitionType));
    const success = downloadICalFile(events, filename, calendarName || "Speelschema");

    if (success) {
      toast.success(
        `${validMatches.length} wedstrijd${validMatches.length === 1 ? "" : "en"} gedownload`,
        { description: "Open het bestand om toe te voegen aan je agenda" },
      );
    } else {
      toast.error("Kon geen agenda bestand aanmaken", {
        description: "Controleer of de wedstrijden geldige datums hebben",
      });
    }
  }, [needsTeamSelection, hasMatches, validMatches, filename, calendarName, competitionType]);

  const handleDownloadExcel = useCallback(() => {
    if (needsTeamSelection) {
      toast.error("Selecteer eerst een team", {
        description: "Kies een team in het filter om het speelschema te downloaden",
      });
      return;
    }
    if (!hasMatches) {
      toast.error("Geen wedstrijden om te downloaden");
      return;
    }

    const events = validMatches.map((m) => matchToICalEvent(m, competitionType));
    const success = downloadCSVFile(events, filename);

    if (success) {
      toast.success(
        `${validMatches.length} wedstrijd${validMatches.length === 1 ? "" : "en"} geëxporteerd`,
        { description: "Open het CSV bestand in Excel" },
      );
    } else {
      toast.error("Kon geen Excel bestand aanmaken", {
        description: "Controleer of de wedstrijden geldige datums hebben",
      });
    }
  }, [needsTeamSelection, hasMatches, validMatches, filename, competitionType]);

  const downloadAriaLabel = needsTeamSelection
    ? "Download speelschema — selecteer eerst een team"
    : "Download speelschema";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={!canDownload}
          className={cn(
            SCHEDULE_DOWNLOAD_TRIGGER,
            className,
            needsTeamSelection && SCHEDULE_DOWNLOAD_BUTTON_DISABLED,
          )}
          aria-label={downloadAriaLabel}
          aria-haspopup="menu"
        >
          <CalendarPlus
            className={cn(
              "h-4 w-4 shrink-0",
              needsTeamSelection ? "opacity-50" : "opacity-80",
            )}
            aria-hidden="true"
          />
          <span>{needsTeamSelection ? "Niet beschikbaar" : "Download"}</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className={SCHEDULE_DOWNLOAD_MENU}
      >
        <DropdownMenuLabel className={SCHEDULE_DOWNLOAD_MENU_LABEL}>
          {selectedTeamLabel
            ? `Exporteer — ${selectedTeamLabel}`
            : "Exporteer speelschema"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className={SCHEDULE_DOWNLOAD_MENU_SEPARATOR} />

        <DropdownMenuItem
          onClick={handleDownloadAgenda}
          disabled={!canDownload}
          className={SCHEDULE_DOWNLOAD_MENU_ITEM}
        >
          <span className={SCHEDULE_DOWNLOAD_MENU_ICON} aria-hidden="true">
            <Download className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span>Agenda (.ics)</span>
            <span className={SCHEDULE_DOWNLOAD_MENU_HINT}>
              Google Calendar, Apple, Outlook
            </span>
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={handleDownloadExcel}
          disabled={!canDownload}
          className={SCHEDULE_DOWNLOAD_MENU_ITEM}
        >
          <span className={SCHEDULE_DOWNLOAD_MENU_ICON} aria-hidden="true">
            <FileSpreadsheet className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span>Excel (.csv)</span>
            <span className={SCHEDULE_DOWNLOAD_MENU_HINT}>
              Spreadsheet met wedstrijden
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

DownloadScheduleButton.displayName = "DownloadScheduleButton";

export default DownloadScheduleButton;
