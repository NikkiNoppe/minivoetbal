import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppModal } from "@/components/modals/base/app-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Removed Textarea import as extra notes are no longer used
import { Checkbox } from "@/components/ui/checkbox";
import { Palette, Plus, Trash2, X } from "lucide-react";
import { seasonService } from "@/services";
import { cn } from "@/lib/utils";
import { joinContactEmails, parseContactEmails } from "@/lib/contactEmails";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/useOrganization";
import { getOrganizationFeatures } from "@/config/organizationFeatures";

interface TeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTeam?: {
    team_id: number;
    team_name: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    club_colors?: string;
    preferred_play_moments?: {
      days?: string[];
      timeslots?: string[];
      venues?: string[];
      notes?: string;
    };
  };
  onFormChange: (field: string, value: any) => void;
  onSave: () => void;
  formData: any;
  loading: boolean;
  hideTeamName?: boolean;
  /** Explicit override. Default: aan voor Harelbeke, uit voor Kuurne. */
  hidePreferences?: boolean;
}

interface LocalPreferences {
  days: string[];
  timeslots: string[];
  venues: string[];
  notes: string;
}

export const TeamModal: React.FC<TeamModalProps> = ({
  open,
  onOpenChange,
  editingTeam,
  formData,
  onFormChange,
  onSave,
  loading,
  hideTeamName = false,
  hidePreferences,
}) => {
  const { organizationId, organizationSlug } = useOrganization();
  const features = getOrganizationFeatures(organizationSlug);
  const hidePrefs = hidePreferences ?? !features.teamSlotPreferences;

  // State management
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [availableTimeslots, setAvailableTimeslots] = useState<Array<{id: string; label: string}>>([]);
  const [availableVenues, setAvailableVenues] = useState<Array<{venue_id: number; name: string; address: string}>>([]);
  const [isLoading, setIsLoading] = useState(loading);
  const [localPreferences, setLocalPreferences] = useState<LocalPreferences>({
    days: [],
    timeslots: [],
    venues: [],
    notes: ""
  });

  // Color picker state and refs
  const colorNameInputRef = useRef<HTMLInputElement>(null);
  const colorHexInputRef = useRef<HTMLInputElement>(null);
  const [colorName, setColorName] = useState('');
  const [colorHex1, setColorHex1] = useState('#000000');
  const [colorHex2, setColorHex2] = useState<string | null>(null);
  const [contactEmailFields, setContactEmailFields] = useState<string[]>([""]);

  // Helper functions for color handling
  const getHexFromColor = useCallback((color: string): string => {
    if (color.startsWith('#')) {
      return color;
    }
    if (color.startsWith('rgb')) {
      const result = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
      if (!result) return '#000000';
      const r = parseInt(result[1], 10);
      const g = parseInt(result[2], 10);
      const b = parseInt(result[3], 10);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }
    return '#000000';
  }, []);

  const isLightColor = useCallback((hex: string): boolean => {
    if (!hex || !hex.startsWith('#')) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }, []);

  const parseClubColors = useCallback((clubColors: string) => {
    if (!clubColors) return { name: '', hexColors: [] };
    const parts = clubColors.split('-').map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) return { name: '', hexColors: [] };
    
    const hexColors: string[] = [];
    const nameParts: string[] = [];
    
    for (const part of parts) {
      if (part.match(/^#[0-9A-Fa-f]{6}$/i) || part.match(/^rgb\(/i)) {
        const hex = getHexFromColor(part);
        if (hex) hexColors.push(hex);
      } else {
        nameParts.push(part);
      }
    }
    
    return {
      name: nameParts.join(' ').trim(),
      hexColors: hexColors
    };
  }, [getHexFromColor]);

  // Memoized computed values
  const isEditMode = useMemo(() => !!editingTeam, [editingTeam]);
  const modalTitle = useMemo(() => 
    isEditMode ? "Team gegevens bewerken" : "Nieuw team toevoegen", 
    [isEditMode]
  );
  const saveButtonText = useMemo(() => {
    if (isLoading) return "Opslaan...";
    return isEditMode ? "Opslaan" : "Team toevoegen";
  }, [isLoading, isEditMode]);
  const isFormValid = useMemo(() => {
    if (hideTeamName) {
      // If team name is hidden, form is always valid (for profile page)
      return true;
    }
    return !!(formData.name?.trim());
  }, [formData.name, hideTeamName]);

  // Memoized lookup maps for better performance
  const venueMap = useMemo(() => 
    new Map(availableVenues.map(v => [v.venue_id, v.name])), 
    [availableVenues]
  );
  const timeslotMap = useMemo(() => 
    new Map(availableTimeslots.map(t => [t.id, t.label])), 
    [availableTimeslots]
  );

  // Sync loading state
  useEffect(() => {
    setIsLoading(loading);
  }, [loading]);

  // Load season data when modal opens (alleen voor speelmoment-voorkeuren)
  useEffect(() => {
    if (!open || hidePrefs || organizationId == null) {
      return;
    }
    let cancelled = false;
    const loadSeasonData = async () => {
      try {
        const [days, timeslots, venues] = await Promise.all([
          seasonService.getAvailableDays(organizationId),
          seasonService.getAvailableTimeslots(organizationId),
          seasonService.getAvailableVenues(organizationId)
        ]);
        if (cancelled) return;
        
        setAvailableDays(Array.isArray(days) ? days : []);
        // Deduplicate timeslots by label and sort ascending by start time
        if (Array.isArray(timeslots)) {
          const seen = new Set<string>();
          const uniqueTimeslots: Array<{ id: string; label: string }> = [];
          const parseStartMinutes = (label: string): number => {
            const timeMatch = label.match(/(\d{1,2}):(\d{2})/);
            if (timeMatch) {
              const hours = parseInt(timeMatch[1], 10);
              const minutes = parseInt(timeMatch[2], 10);
              return hours * 60 + minutes;
            }
            const hourOnly = label.match(/(\d{1,2})/);
            if (hourOnly) {
              return parseInt(hourOnly[1], 10) * 60;
            }
            return Number.MAX_SAFE_INTEGER;
          };
          for (const t of timeslots) {
            const label = (t as any).label ?? String(t);
            const id = (t as any).id ?? label;
            if (!seen.has(label)) {
              seen.add(label);
              uniqueTimeslots.push({ id: String(id), label: String(label) });
            }
          }
          uniqueTimeslots.sort((a, b) => parseStartMinutes(a.label) - parseStartMinutes(b.label));
          setAvailableTimeslots(uniqueTimeslots);
        } else {
          setAvailableTimeslots([]);
        }
        setAvailableVenues(Array.isArray(venues) ? venues : []);
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading season data:', error);
        setAvailableDays([]);
        setAvailableTimeslots([]);
        setAvailableVenues([]);
      }
    };

    void loadSeasonData();
    return () => {
      cancelled = true;
    };
  }, [open, hidePrefs, organizationId]);

  // Initialize preferences when editing team (alleen zichtbaar als sectie actief is)
  useEffect(() => {
    if (!open || hidePrefs) return;

    if (editingTeam) {
      const preferences = editingTeam.preferred_play_moments || {};
      setLocalPreferences({
        days: preferences.days || [],
        timeslots: preferences.timeslots || [],
        venues: preferences.venues || [],
        notes: preferences.notes || ""
      });
    } else {
      setLocalPreferences({
        days: [],
        timeslots: [],
        venues: [],
        notes: ""
      });
    }
  }, [editingTeam, open, hidePrefs]);

  // Sync formData with editingTeam when modal opens to ensure all data is displayed
  useEffect(() => {
    if (!open || !editingTeam) return;

    // Always sync from editingTeam when modal opens to ensure data is fresh
    // This ensures that even if formData was set before, we use the latest editingTeam data
    // Only sync fields that are visible (not hidden by hideTeamName or hidePreferences)
    onFormChange('contact_person', editingTeam.contact_person || '');
    onFormChange('contact_email', editingTeam.contact_email || '');
    onFormChange('contact_phone', editingTeam.contact_phone || '');
    onFormChange('club_colors', editingTeam.club_colors || '');
    if (!hideTeamName) {
      onFormChange('name', editingTeam.team_name || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingTeam?.team_id, editingTeam?.contact_person, editingTeam?.contact_email, editingTeam?.contact_phone, editingTeam?.club_colors, editingTeam?.team_name, hideTeamName]);

  useEffect(() => {
    if (!open) return;
    const raw = formData?.contact_email ?? editingTeam?.contact_email ?? "";
    setContactEmailFields(parseContactEmails(raw));
  }, [open, editingTeam?.contact_email, editingTeam?.team_id, formData?.contact_email]);

  const syncContactEmails = useCallback(
    (fields: string[]) => {
      setContactEmailFields(fields);
      onFormChange("contact_email", joinContactEmails(fields));
    },
    [onFormChange],
  );

  const handleContactEmailChange = useCallback(
    (index: number, value: string) => {
      const next = [...contactEmailFields];
      next[index] = value;
      syncContactEmails(next);
    },
    [contactEmailFields, syncContactEmails],
  );

  const handleAddContactEmail = useCallback(() => {
    syncContactEmails([...contactEmailFields, ""]);
  }, [contactEmailFields, syncContactEmails]);

  const handleRemoveContactEmail = useCallback(
    (index: number) => {
      const next = contactEmailFields.filter((_, i) => i !== index);
      syncContactEmails(next.length > 0 ? next : [""]);
    },
    [contactEmailFields, syncContactEmails],
  );

  // Sync colors from formData when modal opens or formData changes
  useEffect(() => {
    if (!open) return;

    // Use formData.club_colors if available, otherwise fall back to editingTeam.club_colors
    // This ensures colors are always initialized when modal opens
    const clubColorsToParse = formData?.club_colors || editingTeam?.club_colors || '';
    const parsed = parseClubColors(clubColorsToParse);
    setColorName(parsed.name);
    setColorHex1(parsed.hexColors[0] || '#000000');
    setColorHex2(parsed.hexColors[1] || null);
  }, [open, formData?.club_colors, editingTeam?.club_colors, editingTeam?.team_id, parseClubColors]);

  // Optimized preference selection check
  const isPreferenceSelected = useCallback((type: 'days' | 'timeslots' | 'venues', value: string | number): boolean => {
    switch (type) {
      case 'venues':
        const venueName = venueMap.get(value as number) || String(value);
        return localPreferences.venues.includes(venueName);
      case 'timeslots':
        const timeslotLabel = timeslotMap.get(value as string) || String(value);
        return localPreferences.timeslots.includes(timeslotLabel);
      case 'days':
        return localPreferences.days.includes(value as string);
      default:
        return false;
    }
  }, [localPreferences, venueMap, timeslotMap]);

  // Optimized preference change handler
  const handlePreferenceChange = useCallback((type: 'days' | 'timeslots' | 'venues', value: string | number, checked: boolean) => {
    setLocalPreferences(prev => {
      let newPreferences: LocalPreferences;
      
      switch (type) {
        case 'venues': {
          const venueName = venueMap.get(value as number) || String(value);
          const newArray = checked 
            ? [...prev.venues, venueName]
            : prev.venues.filter(item => item !== venueName);
          newPreferences = { ...prev, venues: newArray };
          break;
        }
        case 'timeslots': {
          const timeslotLabel = timeslotMap.get(value as string) || String(value);
          const newArray = checked 
            ? [...prev.timeslots, timeslotLabel]
            : prev.timeslots.filter(item => item !== timeslotLabel);
          newPreferences = { ...prev, timeslots: newArray };
          break;
        }
        case 'days': {
          const newArray = checked 
            ? [...prev.days, value as string]
            : prev.days.filter(item => item !== value);
          newPreferences = { ...prev, days: newArray };
          break;
        }
        default:
          return prev;
      }
      
      // Sync to parent immediately
      onFormChange('preferred_play_moments', newPreferences);
      return newPreferences;
    });
  }, [venueMap, timeslotMap, onFormChange]);

  // Optimized input change handler
  const handleInputChange = useCallback((field: string, value: string) => {
    onFormChange(field, value);
  }, [onFormChange]);

  // Notes field removed (not used)

  // Optimized save handler
  const handleSave = useCallback(() => {
    // Calculate latest club_colors from current color state
    const parts: string[] = [];
    if (colorName.trim()) parts.push(colorName.trim());
    if (colorHex1) parts.push(colorHex1);
    if (colorHex2) parts.push(colorHex2);
    const clubColors = parts.join('-');
    
    // Sync all data immediately before saving
    // Sync preferred_play_moments
    if (!hidePrefs) {
      onFormChange('preferred_play_moments', localPreferences);
    }
    
    // Sync club_colors from current color state to ensure latest changes are saved
    // This is critical because color changes might not have been synced to formData yet
    // Call onFormChange to update the ref immediately
    onFormChange('club_colors', clubColors);
    
    // Use a small delay to ensure the ref update is processed
    // The ref is updated synchronously in handleFormChange, but we need to ensure
    // React has processed the state update before calling onSave
    setTimeout(() => {
      // Call onFormChange again to ensure ref is definitely updated
      onFormChange('club_colors', clubColors);
      // Then call onSave after a tiny delay to ensure ref is synced
      setTimeout(() => {
        onSave();
      }, 10);
    }, 10);
  }, [localPreferences, colorName, colorHex1, colorHex2, hidePrefs, onFormChange, onSave]);

  // Optimized close handler
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Memoized form sections to prevent unnecessary re-renders
  const teamNameSection = useMemo(() => (
    <div className="space-y-2">
      <label className="text-brand-dark font-medium">Team naam *</label>
      <Input
        placeholder="Voer team naam in"
        className="modal__input"
        value={formData.name || ''}
        onChange={(e) => handleInputChange('name', e.target.value)}
        disabled={isLoading}
      />
    </div>
  ), [formData.name, handleInputChange, isLoading]);

  // Color change handlers
  const handleColorNameChange = useCallback((value: string) => {
    setColorName(value);
    updateClubColors(value, colorHex1, colorHex2);
  }, [colorHex1, colorHex2]);

  const handleColorHex1Change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newHex1 = e.target.value;
    setColorHex1(newHex1);
    updateClubColors(colorName, newHex1, colorHex2);
  }, [colorName, colorHex2]);

  const handleColorHex2Change = useCallback((value: string) => {
    setColorHex2(value);
    updateClubColors(colorName, colorHex1, value);
  }, [colorName, colorHex1]);

  const handleColorHex2Remove = useCallback(() => {
    setColorHex2(null);
    updateClubColors(colorName, colorHex1, null);
  }, [colorName, colorHex1]);

  const updateClubColors = useCallback((name: string, hex1: string, hex2: string | null) => {
    const parts: string[] = [];
    if (name.trim()) parts.push(name.trim());
    if (hex1) parts.push(hex1);
    if (hex2) parts.push(hex2);
    const clubColors = parts.join('-');
    handleInputChange('club_colors', clubColors);
  }, [handleInputChange]);

  const handleColorHex1Click = useCallback(() => {
    colorHexInputRef.current?.click();
  }, []);

  const handleColorHex2Click = useCallback(() => {
    const secondInput = document.createElement('input');
    secondInput.type = 'color';
    secondInput.value = colorHex2 || colorHex1;
    secondInput.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      handleColorHex2Change(target.value);
    };
    secondInput.click();
  }, [colorHex1, colorHex2, handleColorHex2Change]);

  const handleAddSecondColor = useCallback(() => {
    const secondInput = document.createElement('input');
    secondInput.type = 'color';
    secondInput.value = colorHex1;
    secondInput.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      handleColorHex2Change(target.value);
    };
    secondInput.click();
  }, [colorHex1, handleColorHex2Change]);

  const contactSection = useMemo(() => {
    // Use formData if available, otherwise fall back to editingTeam
    const contactPerson = formData?.contact_person ?? editingTeam?.contact_person ?? '';
    const contactPhone = formData?.contact_phone ?? editingTeam?.contact_phone ?? '';
    
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-brand-dark font-medium">Contactpersoon</label>
            <Input
              placeholder="Naam contactpersoon"
              className="modal__input min-h-[44px]"
              value={contactPerson}
              onChange={(e) => handleInputChange('contact_person', e.target.value)}
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-brand-dark font-medium">Telefoon</label>
            <Input
              placeholder="Telefoonnummer"
              className="modal__input min-h-[44px]"
              value={contactPhone}
              onChange={(e) => handleInputChange('contact_phone', e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-brand-dark font-medium">E-mail</label>
          <div className="space-y-2">
            {contactEmailFields.map((email, index) => (
              <div key={`contact-email-${index}`} className="flex items-center gap-2">
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={index === 0 ? "E-mailadres" : "Extra e-mailadres"}
                  className="modal__input !mb-0 h-11 min-h-11 flex-1 min-w-0"
                  value={email}
                  onChange={(e) => handleContactEmailChange(index, e.target.value)}
                  disabled={isLoading}
                  aria-label={index === 0 ? "E-mailadres" : `Extra e-mailadres ${index + 1}`}
                />
                {contactEmailFields.length > 1 && (
                  <Button
                    type="button"
                    variant="unstyled"
                    className="btn btn--icon btn--danger shrink-0"
                    onClick={() => handleRemoveContactEmail(index)}
                    disabled={isLoading}
                    aria-label={`Verwijder e-mailadres ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="unstyled"
            className="btn btn--outline min-h-[44px] w-full"
            onClick={handleAddContactEmail}
            disabled={isLoading}
          >
            <Plus className="h-4 w-4 mr-2" aria-hidden />
            E-mailadres toevoegen
          </Button>
        </div>
      </>
    );
  }, [formData, editingTeam, handleInputChange, isLoading, contactEmailFields, handleContactEmailChange, handleAddContactEmail, handleRemoveContactEmail]);

  const clubColorsSection = useMemo(() => (
    <div className="space-y-2">
      <Label htmlFor="club_colors" className="text-brand-dark font-medium">Clubkleuren</Label>
      <div className="flex items-center gap-3">
        {/* Color name input (left) */}
        <div className="flex items-center gap-2 flex-1">
          <Input
            ref={colorNameInputRef}
            id="color_name"
            value={colorName}
            onChange={(e) => handleColorNameChange(e.target.value)}
            placeholder="bijv. blauw"
            className="flex-1"
            disabled={isLoading}
          />
        </div>
        
        {/* Color hex pickers (right) */}
        <div className="flex items-center gap-2">
          {/* First hex color picker */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleColorHex1Click}
              className={cn(
                "w-10 h-10 rounded border border-primary/30 shadow-sm flex-shrink-0 relative overflow-hidden",
                "hover:border-primary/50 hover:shadow-md transition-all duration-200",
                "cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              style={{ backgroundColor: colorHex1 }}
              title="Klik om eerste kleur te kiezen"
              aria-label="Eerste kleur kiezer openen"
              disabled={isLoading}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <Palette className="h-4 w-4 text-white drop-shadow-md opacity-80" />
              </div>
            </button>
            <input
              ref={colorHexInputRef}
              type="color"
              value={colorHex1}
              onChange={handleColorHex1Change}
              className="hidden"
              disabled={isLoading}
            />
          </div>
          
          {/* Divider and second color picker if second color exists */}
          {colorHex2 && colorHex2 !== colorHex1 && (
            <>
              <div className="w-[2px] h-10 bg-primary/30 flex-shrink-0" />
              {/* Second hex color picker with integrated remove button */}
              <div className="relative group flex items-center">
                <button
                  type="button"
                  onClick={handleColorHex2Click}
                  className={cn(
                    "w-10 h-10 rounded border border-primary/30 shadow-sm flex-shrink-0 relative overflow-hidden",
                    "hover:border-primary/50 hover:shadow-md transition-all duration-200",
                    "cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ backgroundColor: colorHex2 }}
                  title="Klik om tweede kleur te kiezen"
                  aria-label="Tweede kleur kiezer openen"
                  disabled={isLoading}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Palette 
                      className={cn(
                        "h-4 w-4 drop-shadow-md opacity-80",
                        isLightColor(colorHex2) ? "text-gray-900" : "text-white"
                      )} 
                    />
                  </div>
                </button>
                {/* Remove button overlay - visible on hover, positioned outside the color picker button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleColorHex2Remove();
                  }}
                  className={cn(
                    "absolute top-0 right-0 w-4 h-4 rounded-bl-sm bg-red-500/90 hover:bg-red-600",
                    "flex items-center justify-center opacity-0 group-hover:opacity-100",
                    "transition-opacity duration-200 cursor-pointer z-10",
                    "shadow-sm border border-red-600/50",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                  style={{ 
                    top: '-2px',
                    right: '-2px'
                  }}
                  title="Verwijder tweede kleur"
                  aria-label="Verwijder tweede kleur"
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={isLoading}
                >
                  <X 
                    className={cn(
                      "h-2.5 w-2.5",
                      "text-white"
                    )} 
                    strokeWidth={2.5} 
                  />
                </button>
              </div>
            </>
          )}
          
          {/* Add second color button if no second color exists */}
          {!colorHex2 && (
            <button
              type="button"
              onClick={handleAddSecondColor}
              className={cn(
                "w-10 h-10 rounded border-2 border-dashed border-primary/30 shadow-sm flex-shrink-0",
                "hover:border-primary/50 hover:shadow-md transition-all duration-200",
                "cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
                "bg-muted flex items-center justify-center",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              title="Klik om tweede kleur toe te voegen"
              aria-label="Tweede kleur toevoegen"
              disabled={isLoading}
            >
              <span className="text-primary/50 text-xl font-bold">+</span>
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Kies één of twee kleuren.
      </p>
    </div>
  ), [colorName, colorHex1, colorHex2, isLoading, handleColorNameChange, handleColorHex1Click, handleColorHex1Change, handleColorHex2Click, handleColorHex2Remove, handleAddSecondColor, isLightColor]);

  const preferencesSection = useMemo(() => (
    <div className="space-y-6 pt-2">
      <div>
        <h3 className="text-brand-dark font-medium mb-1">Speelmoment voorkeuren</h3>
        <p className="text-xs text-muted-foreground">Selecteer je voorkeuren voor speeldagen, tijdsloten en locaties</p>
      </div>
      
      {/* Days */}
      {availableDays.length > 0 && (
        <div className="space-y-3">
          <label className="text-brand-dark font-medium">Voorkeur dagen</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {availableDays.map((day) => {
              const selected = isPreferenceSelected('days', day);
              return (
                <label 
                  key={day} 
                  htmlFor={`day-${day}`} 
                  className={cn(
                    "relative flex items-center gap-3 p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer",
                    "min-h-[48px] touch-manipulation",
                    selected 
                      ? "border-primary bg-primary/10 shadow-sm" 
                      : "bg-white border-[var(--color-200)] hover:border-primary/50 hover:bg-muted",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="relative flex-shrink-0 flex items-center justify-center">
                    <Checkbox
                      id={`day-${day}`}
                      className={cn(
                        "rounded border-2 transition-all [&>svg]:hidden [&_[data-radix-checkbox-indicator]]:hidden",
                        "h-5 w-5 min-h-5 min-w-5",
                        selected 
                          ? "border-primary bg-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white" 
                          : "border-[var(--color-300)] bg-white"
                      )}
                      checked={selected}
                      onCheckedChange={(checked) => handlePreferenceChange('days', day, checked as boolean)}
                      disabled={isLoading}
                    />
                    {selected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <svg 
                          width="12" 
                          height="12" 
                          viewBox="0 0 20 20" 
                          fill="none" 
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ color: 'white' }}
                        >
                          <path 
                            d="M16.7071 5.29289C17.0976 5.68342 17.0976 6.31658 16.7071 6.70711L8.70711 14.7071C8.31658 15.0976 7.68342 15.0976 7.29289 14.7071L3.29289 10.7071C2.90237 10.3166 2.90237 9.68342 3.29289 9.29289C3.68342 8.90237 4.31658 8.90237 4.70711 9.29289L8 12.5858L15.2929 5.29289C15.6834 4.90237 16.3166 4.90237 16.7071 5.29289Z" 
                            fill="white"
                            stroke="white"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className={cn(
                    "text-sm font-medium flex-1",
                    selected ? "text-brand-dark" : "text-foreground"
                  )}
                  >
                    {day}
                  </span>
                  {selected && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeslots */}
      {availableTimeslots.length > 0 && (
        <div className="space-y-3">
          <label className="text-brand-dark font-medium">Voorkeur tijdsloten</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {availableTimeslots.map((timeslot) => {
              const selected = isPreferenceSelected('timeslots', timeslot.id);
              return (
                <label 
                  key={timeslot.id} 
                  htmlFor={`timeslot-${timeslot.id}`}
                  className={cn(
                    "relative flex items-center gap-3 p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer",
                    "min-h-[48px] touch-manipulation",
                    selected 
                      ? "border-primary bg-primary/10 shadow-sm" 
                      : "bg-white border-[var(--color-200)] hover:border-primary/50 hover:bg-muted",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="relative flex-shrink-0 flex items-center justify-center">
                    <Checkbox
                      id={`timeslot-${timeslot.id}`}
                      className={cn(
                        "rounded border-2 transition-all [&>svg]:hidden [&_[data-radix-checkbox-indicator]]:hidden",
                        "h-5 w-5 min-h-5 min-w-5",
                        selected 
                          ? "border-primary bg-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white" 
                          : "border-[var(--color-300)] bg-white"
                      )}
                      checked={selected}
                      onCheckedChange={(checked) => handlePreferenceChange('timeslots', timeslot.id, checked as boolean)}
                      disabled={isLoading}
                    />
                    {selected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <svg 
                          width="12" 
                          height="12" 
                          viewBox="0 0 20 20" 
                          fill="none" 
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ color: 'white' }}
                        >
                          <path 
                            d="M16.7071 5.29289C17.0976 5.68342 17.0976 6.31658 16.7071 6.70711L8.70711 14.7071C8.31658 15.0976 7.68342 15.0976 7.29289 14.7071L3.29289 10.7071C2.90237 10.3166 2.90237 9.68342 3.29289 9.29289C3.68342 8.90237 4.31658 8.90237 4.70711 9.29289L8 12.5858L15.2929 5.29289C15.6834 4.90237 16.3166 4.90237 16.7071 5.29289Z" 
                            fill="white"
                            stroke="white"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className={cn(
                    "text-sm font-medium flex-1",
                    selected ? "text-brand-dark" : "text-foreground"
                  )}
                  >
                    {timeslot.label}
                  </span>
                  {selected && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Venues */}
      {availableVenues.length > 0 && (
        <div className="space-y-3">
          <label className="text-brand-dark font-medium">Voorkeur locaties</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {availableVenues.map((venue) => {
              const selected = isPreferenceSelected('venues', venue.venue_id);
              return (
                <label 
                  key={venue.venue_id} 
                  htmlFor={`venue-${venue.venue_id}`}
                  className={cn(
                    "relative flex items-start gap-3 p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer",
                    "min-h-[48px] touch-manipulation",
                    selected 
                      ? "border-primary bg-primary/10 shadow-sm" 
                      : "bg-white border-[var(--color-200)] hover:border-primary/50 hover:bg-muted",
                    isLoading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="relative flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Checkbox
                      id={`venue-${venue.venue_id}`}
                      className={cn(
                        "rounded border-2 transition-all [&>svg]:hidden [&_[data-radix-checkbox-indicator]]:hidden",
                        "h-5 w-5 min-h-5 min-w-5",
                        selected 
                          ? "border-primary bg-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white" 
                          : "border-[var(--color-300)] bg-white"
                      )}
                      checked={selected}
                      onCheckedChange={(checked) => handlePreferenceChange('venues', venue.venue_id, checked as boolean)}
                      disabled={isLoading}
                    />
                    {selected && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <svg 
                          width="12" 
                          height="12" 
                          viewBox="0 0 20 20" 
                          fill="none" 
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ color: 'white' }}
                        >
                          <path 
                            d="M16.7071 5.29289C17.0976 5.68342 17.0976 6.31658 16.7071 6.70711L8.70711 14.7071C8.31658 15.0976 7.68342 15.0976 7.29289 14.7071L3.29289 10.7071C2.90237 10.3166 2.90237 9.68342 3.29289 9.29289C3.68342 8.90237 4.31658 8.90237 4.70711 9.29289L8 12.5858L15.2929 5.29289C15.6834 4.90237 16.3166 4.90237 16.7071 5.29289Z" 
                            fill="white"
                            stroke="white"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      "text-sm font-medium block",
                      selected ? "text-brand-dark" : "text-foreground"
                    )}
                    >
                      {venue.name}
                    </span>
                    {venue.address && (
                      <span className={cn(
                        "text-xs block mt-0.5 text-muted-foreground"
                      )}
                      >
                        {venue.address}
                      </span>
                    )}
                  </div>
                  {selected && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full flex-shrink-0 bg-primary" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  ), [availableDays, availableTimeslots, availableVenues, isPreferenceSelected, handlePreferenceChange, isLoading]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={modalTitle}
      subtitle={
        hideTeamName && hidePrefs
          ? "Bewerk de contactgegevens en clubkleuren van je team."
          : hidePrefs
            ? "Vul de teamgegevens in: naam, contact en clubkleuren."
            : "Vul de teamgegevens in. Speelmoment-voorkeuren zijn optioneel."
      }
      size="lg"
      primaryAction={{
        label: saveButtonText,
        onClick: handleSave,
        variant: "primary",
        disabled: isLoading || !isFormValid,
        loading: isLoading,
      }}
      secondaryAction={{
        label: "Annuleren",
        onClick: handleClose,
        variant: "secondary",
        disabled: isLoading,
      }}
    >
      <form className="space-y-4">
        {!hideTeamName && teamNameSection}
        {contactSection}
        {clubColorsSection}
        {!hidePrefs && preferencesSection}
      </form>
    </AppModal>
  );
};

