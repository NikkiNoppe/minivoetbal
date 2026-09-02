import React from "react";
import { CalendarDays, Clock, Loader2, MapPin, UserCheck, Hash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlinePlayerRetry } from "@/components/modals";
import { MatchFormSectionCard } from "@/components/modals/matches/MatchFormSectionCard";
import { formatDateWithDay } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { Referee } from "@/services/core";

const fieldLabelClass = "text-xs font-medium text-[var(--color-700)]";
const fieldInputClass = "input-login-style h-9 min-h-[44px] text-sm";

function formatMatchDateDisplay(date: string): string {
  if (!date?.trim()) return "—";
  return formatDateWithDay(date);
}

function formatMatchTimeDisplay(time: string): string {
  if (!time?.trim()) return "—";
  return time.slice(0, 5);
}

function formatDisplayValue(value: string, emptyLabel = "—"): string {
  const trimmed = value?.trim();
  return trimmed || emptyLabel;
}

interface MatchInfoReadOnlyFieldProps {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  label: string;
  value: string;
  className?: string;
}

function MatchInfoReadOnlyField({
  icon: Icon,
  label,
  value,
  className,
}: MatchInfoReadOnlyFieldProps) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
        {label}
      </dt>
      <dd className="break-words text-sm font-semibold leading-snug text-[var(--color-700)]">
        {value}
      </dd>
    </div>
  );
}

interface MatchFormWedstrijdinfoReadOnlyProps {
  date: string;
  time: string;
  location: string;
  matchday: string;
  selectedReferee?: string;
}

function MatchFormWedstrijdinfoReadOnly({
  date,
  time,
  location,
  matchday,
  selectedReferee,
}: MatchFormWedstrijdinfoReadOnlyProps) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
      <MatchInfoReadOnlyField
        icon={CalendarDays}
        label="Datum"
        value={formatMatchDateDisplay(date)}
      />
      <MatchInfoReadOnlyField
        icon={Clock}
        label="Tijd"
        value={formatMatchTimeDisplay(time)}
      />
      <MatchInfoReadOnlyField
        icon={Hash}
        label="Speeldag"
        value={formatDisplayValue(matchday)}
      />
      {selectedReferee !== undefined && (
        <MatchInfoReadOnlyField
          icon={UserCheck}
          label="Scheidsrechter"
          value={formatDisplayValue(selectedReferee, "Nog niet toegewezen")}
        />
      )}
      <MatchInfoReadOnlyField
        icon={MapPin}
        label="Locatie"
        value={formatDisplayValue(location)}
        className="sm:col-span-2"
      />
    </dl>
  );
}

interface MatchFormRefereeSelectProps {
  refereeSelectValue: string;
  selectedReferee: string;
  onRefereeChange: (value: string) => void;
  canEdit: boolean;
  loadingReferees: boolean;
  referees: Referee[];
  refereesError: Error | null;
  onRefetchReferees: () => Promise<unknown>;
  selectedRefereeExists: boolean;
}

function MatchFormRefereeSelect({
  refereeSelectValue,
  selectedReferee,
  onRefereeChange,
  canEdit,
  loadingReferees,
  referees,
  refereesError,
  onRefetchReferees,
  selectedRefereeExists,
}: MatchFormRefereeSelectProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor="match-referee" className={fieldLabelClass}>
        Scheidsrechter
      </Label>
      <Select
        value={refereeSelectValue}
        onValueChange={(v) => onRefereeChange(v === "__none__" ? "" : v)}
        disabled={!canEdit || loadingReferees}
      >
        <SelectTrigger
          id="match-referee"
          className="dropdown-login-style h-9 min-h-[44px] w-full text-sm"
        >
          <SelectValue
            placeholder={
              loadingReferees
                ? "Laden…"
                : selectedReferee || "Selecteer scheidsrechter"
            }
          />
          {loadingReferees && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          )}
        </SelectTrigger>
        <SelectContent
          className="dropdown-content-login-style z-modal bg-card"
          style={{ backgroundColor: "white" }}
        >
          {loadingReferees ? (
            <SelectItem
              value="loading"
              disabled
              className="dropdown-item-login-style text-center"
              aria-busy="true"
            >
              <div className="flex items-center justify-center gap-2 py-1">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">Laden…</span>
              </div>
            </SelectItem>
          ) : (
            <>
              <SelectItem value="__none__" className="dropdown-item-login-style text-muted-foreground">
                Geen scheidsrechter
              </SelectItem>
              {selectedReferee && !selectedRefereeExists && (
                <SelectItem value={selectedReferee} className="dropdown-item-login-style opacity-75">
                  {selectedReferee}
                </SelectItem>
              )}
              {referees.length > 0 ? (
                referees.map((referee) => (
                  <SelectItem
                    key={referee.user_id}
                    value={referee.username}
                    className="dropdown-item-login-style"
                  >
                    {referee.username}
                  </SelectItem>
                ))
              ) : (
                <SelectItem
                  value="no-referees"
                  disabled
                  className="dropdown-item-login-style text-center text-muted-foreground"
                >
                  Geen scheidsrechters beschikbaar
                </SelectItem>
              )}
            </>
          )}
        </SelectContent>
      </Select>
      {!loadingReferees && referees.length === 0 && !selectedReferee && (
        refereesError ? (
          <InlinePlayerRetry
            onRetry={async () => { await onRefetchReferees(); }}
            isLoading={loadingReferees}
            error={refereesError}
            itemCount={referees.length}
            emptyMessage="Geen scheidsrechters gevonden"
            className="mt-1"
          />
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Nog geen scheidsrechter toegewezen</p>
        )
      )}
    </div>
  );
}

interface MatchFormWedstrijdinfoSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  time: string;
  location: string;
  matchday: string;
  onFieldChange: (field: "date" | "time" | "location" | "matchday", value: string) => void;
  isAdmin: boolean;
  isReferee?: boolean;
  isTeamManager: boolean;
  canEdit: boolean;
  /** Toon hint alleen als andere scheids (niet toegewezen) wijzigingen wil doen */
  showRefereeClaimHint?: boolean;
  refereeSelectValue: string;
  selectedReferee: string;
  onRefereeChange: (value: string) => void;
  loadingReferees: boolean;
  referees: Referee[];
  refereesError: Error | null;
  onRefetchReferees: () => Promise<unknown>;
  selectedRefereeExists: boolean;
}

export function MatchFormWedstrijdinfoSection({
  open,
  onOpenChange,
  date,
  time,
  location,
  matchday,
  onFieldChange,
  isAdmin,
  isReferee = false,
  isTeamManager,
  canEdit,
  canEditReferee,
  showRefereeClaimHint = false,
  refereeSelectValue,
  selectedReferee,
  onRefereeChange,
  loadingReferees,
  referees,
  refereesError,
  onRefetchReferees,
  selectedRefereeExists,
}: MatchFormWedstrijdinfoSectionProps) {
  const refereeEditable = canEditReferee ?? (isAdmin || isReferee || canEdit);
  const refereeSelectProps: MatchFormRefereeSelectProps = {
    refereeSelectValue,
    selectedReferee,
    onRefereeChange,
    canEdit: refereeEditable,
    loadingReferees,
    referees,
    refereesError,
    onRefetchReferees,
    selectedRefereeExists,
  };

  return (
    <MatchFormSectionCard open={open} onOpenChange={onOpenChange} title="Wedstrijdinfo" compact>
      {isTeamManager ? (
        <MatchFormWedstrijdinfoReadOnly
          date={date}
          time={time}
          location={location}
          matchday={matchday}
          selectedReferee={selectedReferee}
        />
      ) : isAdmin ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="match-date" className={fieldLabelClass}>
                Datum
              </Label>
              <Input
                id="match-date"
                type="date"
                value={date}
                onChange={(e) => onFieldChange("date", e.target.value)}
                className={fieldInputClass}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="match-time" className={fieldLabelClass}>
                Tijd
              </Label>
              <Input
                id="match-time"
                type="time"
                value={time}
                onChange={(e) => onFieldChange("time", e.target.value)}
                className={fieldInputClass}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="match-matchday" className={fieldLabelClass}>
                Speeldag
              </Label>
              <Input
                id="match-matchday"
                value={matchday}
                onChange={(e) => onFieldChange("matchday", e.target.value)}
                placeholder="Speeldag"
                className={fieldInputClass}
              />
            </div>

            <MatchFormRefereeSelect {...refereeSelectProps} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="match-location" className={fieldLabelClass}>
              Locatie
            </Label>
            <Input
              id="match-location"
              value={location}
              onChange={(e) => onFieldChange("location", e.target.value)}
              placeholder="Wedstrijdlocatie"
              className={fieldInputClass}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <MatchFormWedstrijdinfoReadOnly
            date={date}
            time={time}
            location={location}
            matchday={matchday}
          />
          <MatchFormRefereeSelect {...refereeSelectProps} />
          {showRefereeClaimHint && (
            <p className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
              Je bent niet de toegewezen scheidsrechter. Wijzig eerst de scheidsrechter
              naar jezelf voordat je spelers of andere wijzigingen kunt doorvoeren.
            </p>
          )}
        </div>
      )}
    </MatchFormSectionCard>
  );
}
