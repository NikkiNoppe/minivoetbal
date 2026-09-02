import React from "react";
import {
  AppModal,
} from "@/components/modals/base/app-modal";
import { Input } from "@/components/ui/input";

interface PlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newPlayer: {
    firstName: string;
    lastName: string;
    birthDate: string;
  };
  onPlayerChange: (newData: { firstName: string; lastName: string; birthDate: string }) => void;
  onSave: () => Promise<boolean> | void;
  editingPlayer?: {
    player_id: number;
    firstName: string;
    lastName: string;
    birthDate: string;
  } | null;
  onEditPlayerChange?: (newData: { player_id: number; firstName: string; lastName: string; birthDate: string }) => void;
  onEditSave?: () => void;
}

const isValid = ({
  firstName,
  lastName,
  birthDate,
}: {
  firstName: string;
  lastName: string;
  birthDate: string;
}) => {
  return (
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!birthDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(birthDate) &&
    !isNaN(Date.parse(birthDate))
  );
};

export const PlayerModal: React.FC<PlayerModalProps> = ({
  open,
  onOpenChange,
  newPlayer,
  onPlayerChange,
  onSave,
  editingPlayer,
  onEditPlayerChange,
  onEditSave
}) => {
  const isEdit = !!editingPlayer?.player_id;
  const formData = isEdit ? editingPlayer! : newPlayer;
  const allFieldsValid = isValid(formData);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Speler bewerken" : "Nieuwe speler toevoegen"}
      size="md"
      aria-describedby={isEdit ? "edit-player-description" : "add-player-description"}
      primaryAction={{
        label: isEdit ? "Opslaan" : "Speler toevoegen",
        onClick: async () => {
          if (isEdit && onEditSave) {
            onEditSave();
          } else {
            await onSave();
          }
        },
        disabled: !allFieldsValid,
        variant: "primary",
      }}
      secondaryAction={{
        label: "Annuleren",
        onClick: () => onOpenChange(false),
        variant: "secondary",
      }}
    >
      <div className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (allFieldsValid) {
              if (isEdit && onEditSave) {
                onEditSave();
              } else {
                onSave();
              }
            }
          }}
          className="space-y-4"
        >
          <div id={isEdit ? "edit-player-description" : "add-player-description"} className="sr-only">
            {isEdit ? "Bewerk de gegevens van de speler" : "Voeg een nieuwe speler toe aan het team"}
          </div>
          <div className="space-y-2">
            <label className="text-brand-dark">Voornaam</label>
            <Input
              placeholder="Voornaam van de speler"
              className="modal__input bg-white placeholder:text-brand-200 min-h-[44px]"
              value={formData.firstName}
              onChange={(e) =>
                isEdit && onEditPlayerChange
                  ? onEditPlayerChange({ ...editingPlayer!, firstName: e.target.value })
                  : onPlayerChange({ ...newPlayer, firstName: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-brand-dark">Achternaam</label>
            <Input
              placeholder="Achternaam van de speler"
              className="modal__input bg-white placeholder:text-brand-200 min-h-[44px]"
              value={formData.lastName}
              onChange={(e) =>
                isEdit && onEditPlayerChange
                  ? onEditPlayerChange({ ...editingPlayer!, lastName: e.target.value })
                  : onPlayerChange({ ...newPlayer, lastName: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-brand-dark">Geboortedatum</label>
            <Input
              type="date"
              className="modal__input bg-white placeholder:text-brand-200 min-h-[44px]"
              value={formData.birthDate}
              onChange={(e) =>
                isEdit && onEditPlayerChange
                  ? onEditPlayerChange({ ...editingPlayer!, birthDate: e.target.value })
                  : onPlayerChange({ ...newPlayer, birthDate: e.target.value })
              }
            />
          </div>
        </form>
      </div>
    </AppModal>
  );
};

