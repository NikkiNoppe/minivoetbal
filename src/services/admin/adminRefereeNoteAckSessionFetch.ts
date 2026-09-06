import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";

export interface AdminRefereeNoteRow {
  match_id: number;
  match_date: string;
  referee_notes: string;
  referee: string | null;
  speeldag: string | null;
  home_team_name: string;
  away_team_name: string;
  note_fingerprint: string;
  season_label?: string | null;
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
  const { data, error } = await supabase.rpc(
    "get_admin_referee_notes_for_session",
    getRpcSessionArgs(),
  );
  if (error) throw error;

  return ((data ?? []) as Array<{
    match_id: number;
    match_date: string;
    referee_notes: string;
    referee: string | null;
    speeldag: string | null;
    home_team_name: string;
    away_team_name: string;
    note_fingerprint: string;
    season_label: string | null;
  }>).map((row) => ({
    match_id: row.match_id,
    match_date: row.match_date,
    referee_notes: row.referee_notes,
    referee: row.referee,
    speeldag: row.speeldag,
    home_team_name: row.home_team_name || "?",
    away_team_name: row.away_team_name || "?",
    note_fingerprint: row.note_fingerprint,
    season_label: row.season_label,
  }));
}
