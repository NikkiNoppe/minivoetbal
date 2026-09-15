import React, { useState, useMemo, useEffect } from "react";
import { AppModal } from "@/components/modals/base/app-modal";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SectionCollapsibleCard } from "@/components/layout";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionHeaders } from "@/lib/authSession";
import { fetchTeamRecipientsForSession } from "@/services/core/userProfileSessionFetch";
import { fetchRefereesForSession } from "@/services/scheidsrechter/scheidsSessionFetch";

import { fetchTeamsForSession } from "@/services/core/teamsSessionFetch";
import { parseContactEmails } from "@/lib/contactEmails";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2, Copy, MessageCircle } from "lucide-react";

const DEFAULT_RECIPIENTS = [
  "noppe.nikki@icloud.com",
  "sandrine.vergote@harelbeke.be",
];

interface TeamManager {
  email: string;
  username: string;
  teamName: string;
}

const addTeamRecipient = (
  list: TeamManager[],
  seen: Set<string>,
  recipient: { team_id: number; team_name?: string | null; email?: string | null; username?: string | null }
) => {
  const email = recipient.email?.trim();
  if (!email) return;

  const key = `${email.toLowerCase()}|${recipient.team_id}`;
  if (seen.has(key)) return;

  seen.add(key);
  list.push({
    email,
    username: recipient.username?.trim() || "Team contact",
    teamName: recipient.team_name ?? "",
  });
};

export interface ForfaitEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  homeTeamId?: number;
  awayTeamId?: number;
  homeTeamName: string;
  awayTeamName: string;
  forfaitTeamName: string;
  matchDate?: string | null;
  matchTime?: string | null;
  location?: string | null;
  /** Scheidsrechter die aan de wedstrijd was toegewezen (voor forfait de toewijzing werd opgeheven). */
  refereeUsername?: string | null;
}

export const ForfaitEmailModal: React.FC<ForfaitEmailModalProps> = ({
  open,
  onOpenChange,
  homeTeamId,
  awayTeamId,
  homeTeamName,
  awayTeamName,
  forfaitTeamName,
  matchDate,
  matchTime,
  location,
  refereeUsername,
}) => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [managers, setManagers] = useState<TeamManager[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [referee, setReferee] = useState<{ email: string; username: string } | null>(null);
  const [waOpen, setWaOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setReferee(null);
      return;
    }
    const name = refereeUsername?.trim();
    if (!name) {
      setReferee(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const referees = await fetchRefereesForSession();
        const match = referees.find(
          (r) => r.username?.trim().toLowerCase() === name.toLowerCase(),
        );
        if (!cancelled && match?.email?.trim()) {
          setReferee({ email: match.email.trim(), username: match.username });
        }
      } catch (e) {
        console.warn("[forfait-email] kon scheidsrechter e-mail niet ophalen", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, refereeUsername]);


  useEffect(() => {
    if (!open) return;
    const teamIds = [homeTeamId, awayTeamId].filter(
      (id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0
    );
    const teamNames = [homeTeamName, awayTeamName].map((name) => name.trim()).filter(Boolean);
    if (teamIds.length === 0 && teamNames.length === 0) {
      setManagers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingManagers(true);
      const list: TeamManager[] = [];
      const seen = new Set<string>();
      try {
        if (teamIds.length > 0) {
          const data = await fetchTeamRecipientsForSession(teamIds);

          for (const row of (data ?? []) as Array<{
            team_id: number;
            team_name: string;
            email: string;
            username: string;
          }>) {
            addTeamRecipient(list, seen, row);
          }
        }
      } catch (e) {
        console.warn("[forfait-email] RPC recipients unavailable, falling back to teams.contact_email", e);
      }

      try {
        const allTeams = await fetchTeamsForSession();
        const contactRows = allTeams.filter((row) => {
          if (teamIds.length > 0 && teamIds.includes(row.team_id)) return true;
          if (teamNames.length > 0 && teamNames.includes(row.team_name)) return true;
          return false;
        });

        contactRows.forEach((row) => {
          const emails = parseContactEmails(row.contact_email).filter(Boolean);
          if (emails.length === 0) {
            addTeamRecipient(list, seen, {
              team_id: row.team_id,
              team_name: row.team_name,
              email: row.contact_email,
              username: row.contact_person || "Team contact",
            });
            return;
          }
          emails.forEach((email) =>
            addTeamRecipient(list, seen, {
              team_id: row.team_id,
              team_name: row.team_name,
              email,
              username: row.contact_person || "Team contact",
            }),
          );
        });

        if (!cancelled) setManagers(list);
      } catch (e) {
        console.error("[forfait-email] load team contacts failed", e);
        if (!cancelled) setManagers(list);
      } finally {
        if (!cancelled) setLoadingManagers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, homeTeamId, awayTeamId, homeTeamName, awayTeamName]);

  const allRecipients = useMemo(() => {
    const set = new Set<string>(DEFAULT_RECIPIENTS);
    managers.forEach((m) => set.add(m.email));
    return Array.from(set);
  }, [managers]);

  const selectedEmails = useMemo(
    () => allRecipients.filter((e) => selected[e]),
    [selected, allRecipients]
  );

  const toggle = (email: string) =>
    setSelected((prev) => ({ ...prev, [email]: !prev[email] }));

  const handleSend = async () => {
    if (selectedEmails.length === 0) {
      toast({
        title: "Geen ontvangers geselecteerd",
        description: "Selecteer minstens één email adres.",
        variant: "destructive",
      });
      return;
    }
    const recipients = [...selectedEmails];

    // Sluit de modal meteen
    setSelected({});
    onOpenChange(false);

    const pending = toast({
      title: "Forfait melding versturen...",
      description: `Bezig met versturen naar ${recipients.length} ontvanger(s).`,
    });

    let results: Array<{ recipient: string; ok: boolean; error?: string }> = [];
    try {
      const { data, error } = await supabase.functions.invoke("send-forfait-notification", {
        body: {
          recipients,
          homeTeamId: homeTeamId ?? null,
          awayTeamId: awayTeamId ?? null,
          homeTeamName,
          awayTeamName,
          forfaitTeamName,
          matchDate: matchDate ?? null,
          matchTime: matchTime ?? null,
          location: location ?? null,
        },
        headers: getEdgeFunctionHeaders(),
      });
      if (error) throw error;
      results = ((data as any)?.results as typeof results) ?? recipients.map((r) => ({ recipient: r, ok: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Onbekende fout";
      results = recipients.map((r) => ({ recipient: r, ok: false, error: msg }));
    }

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const allOk = failCount === 0;
    const allFail = okCount === 0;

    pending.dismiss();
    toast({
      title: allOk
        ? "Forfait melding verzonden"
        : allFail
        ? "Versturen mislukt"
        : "Gedeeltelijk verzonden",
      description: (
        <div className="mt-1 space-y-1 text-sm">
          <div className="font-medium">
            {okCount} verzonden · {failCount} mislukt
          </div>
          <ul className="space-y-0.5">
            {results.map((r) => (
              <li key={r.recipient} className="flex items-start gap-2">
                <span>{r.ok ? "✅" : "❌"}</span>
                <span className="break-all">{r.recipient}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
      variant: allOk ? "default" : "destructive",
      duration: allOk ? 6000 : 10000,
    });
  };

  const managersByEmail = useMemo(() => {
    const map = new Map<string, TeamManager[]>();
    managers.forEach((m) => {
      const arr = map.get(m.email) ?? [];
      arr.push(m);
      map.set(m.email, arr);
    });
    return map;
  }, [managers]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Forfait melding versturen"
      size="md"
      primaryAction={{
        label: sending ? "Versturen..." : `Verstuur (${selectedEmails.length})`,
        onClick: handleSend,
        loading: sending,
        disabled: sending || selectedEmails.length === 0,
        variant: "destructive",
      }}
      secondaryAction={{
        label: "Annuleren",
        onClick: () => onOpenChange(false),
        variant: "secondary",
        disabled: sending,
      }}
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Belangrijke beslissing</p>
            <p className="mt-1">
              Je staat op het punt een email te versturen waarin gemeld wordt dat de
              wedstrijd <strong>{homeTeamName} - {awayTeamName}</strong> niet meer doorgaat
              omdat <strong>{forfaitTeamName}</strong> forfait heeft gegeven. Controleer de
              ontvangers zorgvuldig.
            </p>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Standaard ontvangers</Label>
          <div className="mt-2 space-y-1 rounded-md border p-3">
            {DEFAULT_RECIPIENTS.map((email) => (
              <label
                key={email}
                className="flex cursor-pointer items-center gap-3 rounded p-2 hover:bg-muted"
              >
                <Checkbox
                  checked={!!selected[email]}
                  onCheckedChange={() => toggle(email)}
                  disabled={sending}
                />
                <span className="text-sm">{email}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Teamverantwoordelijken</Label>
          <div className="mt-2 space-y-1 rounded-md border p-3">
            {loadingManagers ? (
              <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Laden...
              </div>
            ) : managers.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">
                Geen teamverantwoordelijken gevonden voor deze teams.
              </p>
            ) : (
              Array.from(managersByEmail.entries()).map(([email, ms]) => (
                <label
                  key={email}
                  className="flex cursor-pointer items-start gap-3 rounded p-2 hover:bg-muted"
                >
                  <Checkbox
                    checked={!!selected[email]}
                    onCheckedChange={() => toggle(email)}
                    disabled={sending}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">{email}</span>
                    <span className="text-xs text-muted-foreground">
                      {ms.map((m) => `${m.username} (${m.teamName})`).join(", ")}
                    </span>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {(() => {
          const dateStr = matchDate
            ? new Date(matchDate + "T00:00:00").toLocaleDateString("nl-BE", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : null;
          const lines: string[] = [
            `⚠️ *Forfait* — ${homeTeamName} - ${awayTeamName}`,
            "",
            `Het team *${forfaitTeamName}* heeft forfait gegeven. De wedstrijd gaat *niet* door.`,
          ];
          if (dateStr) lines.push("", `📅 ${dateStr}${matchTime ? ` om ${matchTime}` : ""}`);
          if (location) lines.push(`📍 ${location}`);
          lines.push("", "Gelieve hier rekening mee te houden.", "", "— Harelbeekse Minivoetbal");
          const message = lines.join("\n");
          const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

          const copyText = async () => {
            try {
              await navigator.clipboard.writeText(message);
              toast({ title: "Gekopieerd", description: "Bericht staat in je klembord." });
            } catch {
              toast({ title: "Kopiëren mislukt", variant: "destructive" });
            }
          };

          return (
            <SectionCollapsibleCard
              title={
                <span className="flex flex-col gap-0.5 min-w-0 text-left">
                  <span>WhatsApp / copy bericht</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Kant-en-klare tekst om door te sturen via WhatsApp.
                  </span>
                </span>
              }
              open={waOpen}
              onOpenChange={setWaOpen}
              contentClassName="space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2"
                  onClick={copyText}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Kopieer
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 bg-[#25D366] px-2 text-white hover:bg-[#1ebe57]"
                  onClick={() => window.open(waUrl, "_blank", "noopener,noreferrer")}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Open WhatsApp
                </Button>
              </div>
              <textarea
                readOnly
                value={message}
                className="min-h-[140px] w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onFocus={(event) => event.currentTarget.select()}
              />
            </SectionCollapsibleCard>
          );
        })()}
      </div>
    </AppModal>
  );
};
