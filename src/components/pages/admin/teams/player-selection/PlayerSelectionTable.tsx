
import React from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UseFormReturn } from "react-hook-form";
import { FormData } from "./types";

interface PlayerSelectionTableProps {
  form: UseFormReturn<FormData>;
  onTogglePlayerSelection: (index: number, selected: boolean) => void;
  onToggleCaptain: (index: number) => void;
}

const PlayerSelectionTable: React.FC<PlayerSelectionTableProps> = ({
  form,
  onTogglePlayerSelection,
  onToggleCaptain,
}) => {
  const players = form.watch("players");

  return (
    <div className="rounded-md border min-w-0 overflow-hidden">
      <div
        className="max-h-[50vh] sm:max-h-[60vh] md:max-h-[65vh] overflow-y-auto"
        role="region"
        aria-label="Spelerselectie tabel"
      >
        <ul className="divide-y divide-border/60 sm:hidden" aria-label="Spelerselectie">
          {players.map((player, index) => (
            <li
              key={player.playerId}
              className={`flex items-center gap-3 px-3 py-2.5 ${player.selected ? "bg-muted/40" : ""}`}
            >
              <Checkbox
                checked={player.selected}
                onCheckedChange={(checked) => {
                  onTogglePlayerSelection(index, checked === true);
                }}
                className="min-h-[22px] min-w-[22px]"
                aria-label={`${player.playerName} selecteren`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{player.playerName}</p>
                <div className="mt-1.5 flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>Rugnr.</span>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      disabled={!player.selected}
                      {...form.register(`players.${index}.jerseyNumber`)}
                      className="h-9 w-14 text-center"
                      aria-label={`Rugnummer ${player.playerName}`}
                    />
                  </label>
                  <label className="flex min-h-[44px] items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Checkbox
                      checked={player.isCaptain}
                      disabled={!player.selected}
                      onCheckedChange={() => onToggleCaptain(index)}
                      className={player.isCaptain ? "border-primary" : ""}
                      aria-label={`${player.playerName} als kapitein`}
                    />
                    Kapitein
                  </label>
                </div>
              </div>
            </li>
          ))}
          {players.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              Geen spelers gevonden voor dit team.
            </li>
          ) : null}
        </ul>

        <Table className="table hidden w-full text-sm sm:table md:text-base">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 sticky top-0 bg-inherit z-10">Selectie</TableHead>
              <TableHead className="min-w-[140px] sticky top-0 bg-inherit z-10">Speler</TableHead>
              <TableHead className="w-24 text-center sticky top-0 bg-inherit z-10">Rugnr.</TableHead>
              <TableHead className="w-24 text-center sticky top-0 bg-inherit z-10">Kapitein</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {players.map((player, index) => (
              <TableRow key={player.playerId} className={player.selected ? "bg-muted/40" : ""}>
                <TableCell>
                  <Checkbox
                    checked={player.selected}
                    onCheckedChange={(checked) => {
                      onTogglePlayerSelection(index, checked === true);
                    }}
                  />
                </TableCell>
                <TableCell>{player.playerName}</TableCell>
                <TableCell>
                  <div className="flex justify-center">
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      disabled={!player.selected}
                      {...form.register(`players.${index}.jerseyNumber`)}
                      className="w-16 text-center"
                    />
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center">
                    <Checkbox
                      checked={player.isCaptain}
                      disabled={!player.selected}
                      onCheckedChange={() => onToggleCaptain(index)}
                      className={player.isCaptain ? "border-primary" : ""}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {players.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                  Geen spelers gevonden voor dit team.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default PlayerSelectionTable;
