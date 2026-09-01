import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";
import { fetchAllMatchesForSession } from "@/services/core/matchesSessionFetch";
import {
  cleanRefereeNoteForFingerprint,
  refereeNoteFingerprint,
} from "@/lib/adminRefereeNoteFingerprint";

export interface AdminRefereeNoteRow {
  match_id: number;
  match_date: string;
  referee_notes: string;
  referee: string | null;
  speeldag: string | null;
  home_team_name: string;
  away_team_name: string;
  note_fingerprint: string;
}

export interface AdminRefereeNoteAckRow {
  match_id: number;
  note_fingerprint: string;
  acknowledged_at: string;
}

export async function fetchAdminRefereeNoteAcks(): Promise<AdminRefereeNoteAckRow[]> {
  const { data, error } = await supabase.rpc("get_admin_referee_note_acks", getRpcSessionArgs());
  if (error) throw error;
  return (data ?? []) as AdminRefereeNoteAckRow[];
}

export async function setAdminRefereeNoteAck(
  matchId: number,
  acknowledged: boolean,
): Promise<void> {
  const { data, error } = await supabase.rpc("set_admin_referee_note_ack", {
    ...getRpcSessionArgs(),
    p_match_id: matchId,
    p_acknowledged: acknowledged,
  });
  if (error) throw error;
  const payload = data as { success?: boolean; error?: string } | null;
  if (!payload?.success) {
    throw new Error(payload?.error || "Kon afhandeling niet opslaan");
  }
}

export async function fetchAdminRefereeNotes(): Promise<AdminRefereeNoteRow[]> {
  const allMatches = await fetchAllMatchesForSession();
  const candidates = (allMatches || [])
    .filter(
      (m) =>
        m.is_submitted &&
        m.referee_notes &&
        cleanRefereeNoteForFingerprint(String(m.referee_notes)) !== "",
    )
    .sort((a, b) => b.match_date.localeCompare(a.match_date));

  const rows: AdminRefereeNoteRow[] = [];
  for (const m of candidates) {
    const cleaned = cleanRefereeNoteForFingerprint(String(m.referee_notes));
    rows.push({
      match_id: m.match_id,
      match_date: m.match_date,
      referee_notes: cleaned,
      referee: m.referee,
      speeldag: m.speeldag,
      home_team_name: m.home_team_name || "?",
      away_team_name: m.away_team_name || "?",
      note_fingerprint: await refereeNoteFingerprint(cleaned),
    });
  }
  return rows;
}
