export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_referee_note_acknowledgements: {
        Row: {
          acknowledged_at: string
          match_id: number
          note_fingerprint: string
          organization_id: number
          user_id: number
        }
        Insert: {
          acknowledged_at?: string
          match_id: number
          note_fingerprint: string
          organization_id: number
          user_id: number
        }
        Update: {
          acknowledged_at?: string
          match_id?: number
          note_fingerprint?: string
          organization_id?: number
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "admin_referee_note_acknowledgements_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "admin_referee_note_acknowledgements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_referee_note_acknowledgements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_referee_note_acknowledgements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      application_settings: {
        Row: {
          id: number
          organization_id: number
          setting_category: string
          setting_name: string
          setting_value: Json
        }
        Insert: {
          id?: number
          organization_id: number
          setting_category: string
          setting_name: string
          setting_value?: Json
        }
        Update: {
          id?: number
          organization_id?: number
          setting_category?: string
          setting_name?: string
          setting_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "application_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_rate_limits: {
        Row: {
          attempt_count: number
          rate_key: string
          window_start: string
        }
        Insert: {
          attempt_count?: number
          rate_key: string
          window_start?: string
        }
        Update: {
          attempt_count?: number
          rate_key?: string
          window_start?: string
        }
        Relationships: []
      }
      costs: {
        Row: {
          amount: number | null
          category: string
          id: number
          name: string
          organization_id: number
        }
        Insert: {
          amount?: number | null
          category: string
          id?: number
          name: string
          organization_id: number
        }
        Update: {
          amount?: number | null
          category?: string
          id?: number
          name?: string
          organization_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: number
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: never
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: never
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: number
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          assigned_referee_id: number | null
          away_players: Json | null
          away_position: number | null
          away_score: number | null
          away_team_id: number | null
          home_players: Json | null
          home_position: number | null
          home_score: number | null
          home_team_id: number | null
          is_cup_match: boolean | null
          is_locked: boolean | null
          is_playoff_finalized: boolean | null
          is_playoff_match: boolean | null
          is_submitted: boolean | null
          location: string | null
          match_date: string
          match_id: number
          organization_id: number
          playoff_type: string | null
          poll_group_id: string | null
          poll_month: string | null
          referee: string | null
          referee_notes: string | null
          season_label: string | null
          skip_auto_match_costs: boolean
          speeldag: string | null
          unique_number: string | null
        }
        Insert: {
          assigned_referee_id?: number | null
          away_players?: Json | null
          away_position?: number | null
          away_score?: number | null
          away_team_id?: number | null
          home_players?: Json | null
          home_position?: number | null
          home_score?: number | null
          home_team_id?: number | null
          is_cup_match?: boolean | null
          is_locked?: boolean | null
          is_playoff_finalized?: boolean | null
          is_playoff_match?: boolean | null
          is_submitted?: boolean | null
          location?: string | null
          match_date: string
          match_id?: number
          organization_id: number
          playoff_type?: string | null
          poll_group_id?: string | null
          poll_month?: string | null
          referee?: string | null
          referee_notes?: string | null
          season_label?: string | null
          skip_auto_match_costs?: boolean
          speeldag?: string | null
          unique_number?: string | null
        }
        Update: {
          assigned_referee_id?: number | null
          away_players?: Json | null
          away_position?: number | null
          away_score?: number | null
          away_team_id?: number | null
          home_players?: Json | null
          home_position?: number | null
          home_score?: number | null
          home_team_id?: number | null
          is_cup_match?: boolean | null
          is_locked?: boolean | null
          is_playoff_finalized?: boolean | null
          is_playoff_match?: boolean | null
          is_submitted?: boolean | null
          location?: string | null
          match_date?: string
          match_id?: number
          organization_id?: number
          playoff_type?: string | null
          poll_group_id?: string | null
          poll_month?: string | null
          referee?: string | null
          referee_notes?: string | null
          season_label?: string | null
          skip_auto_match_costs?: boolean
          speeldag?: string | null
          unique_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding_settings: Json
          id: number
          name: string
          slug: string
        }
        Insert: {
          branding_settings?: Json
          id: number
          name: string
          slug: string
        }
        Update: {
          branding_settings?: Json
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: number
          requested_email: string
          token: string
          used_at: string | null
          user_id: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: never
          requested_email: string
          token: string
          used_at?: string | null
          user_id: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: never
          requested_email?: string
          token?: string
          used_at?: string | null
          user_id?: number
        }
        Relationships: []
      }
      players: {
        Row: {
          birth_date: string
          first_name: string
          last_name: string
          organization_id: number
          player_id: number
          red_cards: number | null
          suspended_matches_remaining: number
          team_id: number | null
          yellow_cards: number | null
        }
        Insert: {
          birth_date: string
          first_name: string
          last_name: string
          organization_id: number
          player_id?: number
          red_cards?: number | null
          suspended_matches_remaining?: number
          team_id?: number | null
          yellow_cards?: number | null
        }
        Update: {
          birth_date?: string
          first_name?: string
          last_name?: string
          organization_id?: number
          player_id?: number
          red_cards?: number | null
          suspended_matches_remaining?: number
          team_id?: number | null
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      referee_matches: {
        Row: {
          assigned_at: string | null
          assigned_by: number | null
          id: number
          is_available: boolean | null
          match_id: number | null
          organization_id: number
          poll_group_id: string | null
          poll_month: string | null
          referee_id: number
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: number | null
          id?: number
          is_available?: boolean | null
          match_id?: number | null
          organization_id: number
          poll_group_id?: string | null
          poll_month?: string | null
          referee_id: number
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: number | null
          id?: number
          is_available?: boolean | null
          match_id?: number | null
          organization_id?: number
          poll_group_id?: string | null
          poll_month?: string | null
          referee_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "referee_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: number
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_costs: {
        Row: {
          amount: number | null
          cost_setting_id: number | null
          id: number
          is_auto_card_penalty: boolean
          match_id: number | null
          organization_id: number
          season_label: string | null
          team_id: number | null
          transaction_date: string
        }
        Insert: {
          amount?: number | null
          cost_setting_id?: number | null
          id?: number
          is_auto_card_penalty?: boolean
          match_id?: number | null
          organization_id: number
          season_label?: string | null
          team_id?: number | null
          transaction_date?: string
        }
        Update: {
          amount?: number | null
          cost_setting_id?: number | null
          id?: number
          is_auto_card_penalty?: boolean
          match_id?: number | null
          organization_id?: number
          season_label?: string | null
          team_id?: number | null
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_costs_cost_setting_id_fkey"
            columns: ["cost_setting_id"]
            isOneToOne: false
            referencedRelation: "costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_costs_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "team_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_costs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_users: {
        Row: {
          id: number
          organization_id: number
          team_id: number | null
          user_id: number | null
        }
        Insert: {
          id?: number
          organization_id: number
          team_id?: number | null
          user_id?: number | null
        }
        Update: {
          id?: number
          organization_id?: number
          team_id?: number | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_managers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "team_managers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_managers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "team_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_users_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
        ]
      }
      teams: {
        Row: {
          club_colors: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          organization_id: number
          preferred_play_moments: Json | null
          team_id: number
          team_name: string
        }
        Insert: {
          club_colors?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          organization_id: number
          preferred_play_moments?: Json | null
          team_id?: number
          team_name: string
        }
        Update: {
          club_colors?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          organization_id?: number
          preferred_play_moments?: Json | null
          team_id?: number
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      truukcity_bbq_events: {
        Row: {
          adult_price: number
          child_price: number
          created_at: string
          currency: string
          event_date: string
          id: string
          is_active: boolean
          location: string
          name: string
          updated_at: string
        }
        Insert: {
          adult_price: number
          child_price: number
          created_at?: string
          currency?: string
          event_date: string
          id?: string
          is_active?: boolean
          location?: string
          name: string
          updated_at?: string
        }
        Update: {
          adult_price?: number
          child_price?: number
          created_at?: string
          currency?: string
          event_date?: string
          id?: string
          is_active?: boolean
          location?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      truukcity_bbq_orders: {
        Row: {
          adults: number
          children: number
          created_at: string
          email: string
          event_id: string
          id: string
          mollie_payment_id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          adults: number
          children: number
          created_at?: string
          email: string
          event_id: string
          id?: string
          mollie_payment_id: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          adults?: number
          children?: number
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          mollie_payment_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "truukcity_bbq_orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "truukcity_bbq_events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          acting_organization_id: number | null
          created_at: string
          expires_at: string
          session_id: string
          user_id: number
        }
        Insert: {
          acting_organization_id?: number | null
          created_at?: string
          expires_at: string
          session_id?: string
          user_id: number
        }
        Update: {
          acting_organization_id?: number | null
          created_at?: string
          expires_at?: string
          session_id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_acting_organization_id_fkey"
            columns: ["acting_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_uid: string | null
          email: string | null
          organization_id: number
          password: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: number
          username: string
        }
        Insert: {
          auth_uid?: string | null
          email?: string | null
          organization_id: number
          password: string
          role: Database["public"]["Enums"]["user_role"]
          user_id?: number
          username: string
        }
        Update: {
          auth_uid?: string | null
          email?: string | null
          organization_id?: number
          password?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: number
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles: {
        Row: {
          auth_uid: string | null
          email: string | null
          organization_id: number | null
          role: Database["public"]["Enums"]["user_role"] | null
          user_id: number | null
          username: string | null
        }
        Insert: {
          auth_uid?: string | null
          email?: string | null
          organization_id?: number | null
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id?: number | null
          username?: string | null
        }
        Update: {
          auth_uid?: string | null
          email?: string | null
          organization_id?: number | null
          role?: Database["public"]["Enums"]["user_role"] | null
          user_id?: number | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_team_cost: {
        Args: {
          p_amount: number
          p_category?: string
          p_cost_name: string
          p_match_id?: number
          p_team_id: number
        }
        Returns: number
      }
      add_team_cost_for_session: {
        Args: {
          p_amount: number
          p_cost_setting_id: number
          p_match_id: number
          p_session_token: string
          p_team_id: number
          p_transaction_date: string
        }
        Returns: Json
      }
      add_team_deposit: {
        Args: { p_amount: number; p_deposit_name: string; p_team_id: number }
        Returns: number
      }
      admin_clear_skip_auto_match_costs_for_session: {
        Args: { p_match_id: number; p_session_token: string }
        Returns: Json
      }
      admin_get_referee_availability: {
        Args: { p_poll_month: string; p_session_token: string }
        Returns: {
          is_available: boolean
          match_id: number
          poll_group_id: string
          user_id: number
        }[]
      }
      admin_set_referee_availability: {
        Args: {
          p_is_available: boolean
          p_match_id: number
          p_notes: string
          p_poll_group_id: string
          p_poll_month: string
          p_referee_id: number
          p_session_token: string
        }
        Returns: boolean
      }
      apply_app_user_context: {
        Args: {
          p_organization_id?: number
          p_role: string
          p_team_ids: string
          p_user_id: number
          p_username?: string
        }
        Returns: undefined
      }
      apply_suspension_after_match: {
        Args: { match_id_param: number }
        Returns: undefined
      }
      assign_referee_to_match: {
        Args: {
          p_match_id: number
          p_notes: string
          p_referee_id: number
          p_session_token: string
        }
        Returns: Json
      }
      assign_referee_to_session: {
        Args: {
          p_match_id: number
          p_notes: string
          p_referee_id: number
          p_session_token: string
        }
        Returns: Json
      }
      bulk_manage_matches_for_session: {
        Args: { p_operation: string; p_payload: Json; p_session_token: string }
        Returns: Json
      }
      calculate_team_balance: {
        Args: { team_id_param: number }
        Returns: number
      }
      calculate_team_balance_final: {
        Args: { team_id_param: number }
        Returns: number
      }
      calculate_team_balance_updated: {
        Args: { team_id_param: number }
        Returns: number
      }
      can_access_organization: {
        Args: { p_organization_id: number }
        Returns: boolean
      }
      can_current_user_manage_player: {
        Args: { player_team_id: number }
        Returns: boolean
      }
      can_read_player_for_match: {
        Args: { player_team_id: number }
        Returns: boolean
      }
      check_batch_players_suspended: {
        Args: {
          match_date_param: string
          p_session_token: string
          player_ids: number[]
        }
        Returns: {
          is_suspended: boolean
          player_id: number
        }[]
      }
      check_email_rate_limit: {
        Args: {
          p_action?: string
          p_email: string
          p_max_attempts?: number
          p_window_minutes?: number
        }
        Returns: boolean
      }
      check_referee_conflict: {
        Args: { p_match_id: number; p_referee_id: number }
        Returns: boolean
      }
      clear_app_user_context: { Args: never; Returns: undefined }
      close_season_for_session: {
        Args: {
          p_cutoff_date: string
          p_season_label: string
          p_session_token: string
          p_target_capital?: number
        }
        Returns: Json
      }
      cost_name_implies_match_cost_suppression: {
        Args: { p_name: string }
        Returns: boolean
      }
      cost_name_is_admin_match_cost: {
        Args: { p_name: string }
        Returns: boolean
      }
      cost_name_is_forfait_verwittigd: {
        Args: { p_name: string }
        Returns: boolean
      }
      create_user_for_session: {
        Args: {
          email_param: string
          p_session_token: string
          password_param: string
          role_param?: Database["public"]["Enums"]["user_role"]
          username_param: string
        }
        Returns: {
          auth_uid: string | null
          email: string | null
          organization_id: number
          password: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: number
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_player_for_session: {
        Args: { p_player_id: number; p_session_token: string }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      delete_team_cost_as_admin: {
        Args: { p_cost_id: number; p_user_id: number }
        Returns: Json
      }
      delete_team_for_session: {
        Args: { p_session_token: string; p_team_id: number }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      delete_user_for_session: {
        Args: { p_session_token: string; p_user_id: number }
        Returns: Json
      }
      establish_app_session_from_supabase_auth: {
        Args: never
        Returns: {
          email: string
          role: string
          session_token: string
          team_ids: number[]
          user_id: number
          username: string
        }[]
      }
      export_season_backup_for_session: {
        Args: {
          p_season_label?: string
          p_session_token: string
          p_target_capital?: number
        }
        Returns: Json
      }
      get_admin_database_backup_for_session: {
        Args: { p_session_token: string }
        Returns: Json
      }
      get_admin_referee_note_acks: {
        Args: { p_session_token: string }
        Returns: {
          acknowledged_at: string
          match_id: number
          note_fingerprint: string
        }[]
      }
      get_all_users_for_admin: {
        Args: { p_session_token: string }
        Returns: {
          email: string
          organization_id: number
          role: string
          team_users: Json
          user_id: number
          username: string
        }[]
      }
      get_available_referees_for_match: {
        Args: { p_match_id: number; p_session_token: string }
        Returns: {
          has_conflict: boolean
          is_available: boolean
          user_id: number
          username: string
        }[]
      }
      get_costs_for_session: {
        Args: { p_category: string; p_session_token: string }
        Returns: {
          amount: number
          category: string
          id: number
          name: string
        }[]
      }
      get_current_user_organization_id: { Args: never; Returns: number }
      get_current_user_role: { Args: never; Returns: string }
      get_current_user_team_ids: { Args: never; Returns: number[] }
      get_latest_season_backup_for_session: {
        Args: { p_season_label?: string; p_session_token: string }
        Returns: Json
      }
      get_match_card_events: {
        Args: { p_session_token: string }
        Returns: {
          card_type: string
          match_date: string
          match_id: number
          player_id: number
          player_name: string
          team_name: string
          unique_number: string
        }[]
      }
      get_match_teams_contact_for_session: {
        Args: {
          p_away_team_id: number
          p_home_team_id: number
          p_session_token: string
        }
        Returns: {
          club_colors: string
          contact_email: string
          contact_person: string
          contact_phone: string
          team_id: number
          team_name: string
        }[]
      }
      get_matches_for_forms: {
        Args: {
          p_competition_type?: string
          p_has_elevated_permissions?: boolean
          p_referee_user_id?: number
          p_referee_username?: string
          p_session_token: string
          p_team_id?: number
        }
        Returns: {
          assigned_referee_id: number
          away_players: Json
          away_score: number
          away_team_id: number
          away_team_name: string
          home_players: Json
          home_score: number
          home_team_id: number
          home_team_name: string
          is_cup_match: boolean
          is_locked: boolean
          is_playoff_match: boolean
          is_submitted: boolean
          location: string
          match_date: string
          match_id: number
          poll_group_id: string
          poll_month: string
          referee: string
          referee_notes: string
          speeldag: string
          unique_number: string
        }[]
      }
      get_matches_for_session: {
        Args: { p_filters?: Json; p_session_token: string }
        Returns: {
          assigned_referee_id: number | null
          away_players: Json | null
          away_position: number | null
          away_score: number | null
          away_team_id: number | null
          home_players: Json | null
          home_position: number | null
          home_score: number | null
          home_team_id: number | null
          is_cup_match: boolean | null
          is_locked: boolean | null
          is_playoff_finalized: boolean | null
          is_playoff_match: boolean | null
          is_submitted: boolean | null
          location: string | null
          match_date: string
          match_id: number
          organization_id: number
          playoff_type: string | null
          poll_group_id: string | null
          poll_month: string | null
          referee: string | null
          referee_notes: string | null
          season_label: string | null
          skip_auto_match_costs: boolean
          speeldag: string | null
          unique_number: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "matches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_monthly_polls_for_session: {
        Args: { p_session_token: string }
        Returns: {
          created_at: string
          created_by: number
          deadline: string
          id: number
          notes: string
          poll_month: string
          status: string
          updated_at: string
        }[]
      }
      get_player_cards_for_admin: {
        Args: { p_session_token: string }
        Returns: {
          first_name: string
          last_name: string
          player_id: number
          red_cards: number
          suspended_matches_remaining: number
          team_id: number
          team_name: string
          yellow_cards: number
        }[]
      }
      get_players_for_session: {
        Args: { p_session_token: string; p_team_id?: number }
        Returns: {
          birth_date: string
          first_name: string
          last_name: string
          player_id: number
          red_cards: number
          suspended_matches_remaining: number
          team_id: number
          yellow_cards: number
        }[]
      }
      get_poll_dates_for_session: {
        Args: { p_poll_id: number; p_session_token: string }
        Returns: {
          created_at: string
          id: number
          location: string
          match_count: number
          match_date: string
          poll_id: number
          time_slot: string
        }[]
      }
      get_poll_match_dates_for_session: {
        Args: { p_poll_month: string; p_session_token: string }
        Returns: {
          location: string
          match_date: string
        }[]
      }
      get_profile_polls_for_session: {
        Args: { p_organization_id: number; p_session_token: string }
        Returns: Json
      }
      get_public_application_settings: {
        Args: { p_categories?: string[]; p_organization_id?: number }
        Returns: {
          id: number
          setting_category: string
          setting_name: string
          setting_value: Json
        }[]
      }
      get_public_matches: {
        Args: { p_organization_id?: number }
        Returns: {
          away_position: number
          away_score: number
          away_team_id: number
          away_team_name: string
          home_position: number
          home_score: number
          home_team_id: number
          home_team_name: string
          is_cup_match: boolean
          is_locked: boolean
          is_playoff_finalized: boolean
          is_playoff_match: boolean
          is_submitted: boolean
          location: string
          match_date: string
          match_id: number
          playoff_type: string
          referee: string
          speeldag: string
          unique_number: string
        }[]
      }
      get_public_teams: {
        Args: { p_organization_id: number }
        Returns: {
          club_colors: string
          team_id: number
          team_name: string
        }[]
      }
      get_referee_assignments_for_session: {
        Args: { p_month: string; p_session_token: string }
        Returns: {
          assigned_at: string
          assigned_by: number
          away_team_name: string
          home_team_name: string
          id: number
          location: string
          match_date: string
          match_id: number
          referee_id: number
        }[]
      }
      get_referee_availability_for_session: {
        Args: { p_poll_month: string; p_session_token: string }
        Returns: {
          is_available: boolean
          match_id: number
          poll_group_id: string
          user_id: number
        }[]
      }
      get_referees_for_session: {
        Args: { p_session_token: string; p_user_id?: number }
        Returns: {
          user_id: number
          username: string
        }[]
      }
      get_scheids_assignment_stats_for_session: {
        Args: { p_month: string; p_session_token: string }
        Returns: {
          referee_id: number
          referee_name: string
          total_assignments: number
        }[]
      }
      get_scheids_availability_stats_for_session: {
        Args: { p_poll_month: string; p_session_token: string }
        Returns: Json
      }
      get_scheids_poll_overview_for_session: {
        Args: { p_poll_id: number; p_session_token: string }
        Returns: Json
      }
      get_scheids_schedule_for_session: {
        Args: { p_month: string; p_session_token: string }
        Returns: {
          assigned_referee_id: number
          away_team_id: number
          away_team_name: string
          home_team_id: number
          home_team_name: string
          location: string
          match_date: string
          match_id: number
          poll_group_id: string
          referee: string
        }[]
      }
      get_scheids_workload_stats_for_session: {
        Args: { p_poll_month: string; p_session_token: string }
        Returns: {
          month_count: number
          referee_id: number
          season_count: number
        }[]
      }
      get_team_balance_for_session: {
        Args: { p_session_token: string; p_team_id: number }
        Returns: number
      }
      get_team_costs_for_match: {
        Args: { p_match_id: number; p_session_token: string }
        Returns: {
          amount: number
          cost_category: string
          cost_default_amount: number
          cost_name: string
          cost_setting_id: number
          id: number
          match_id: number
          team_id: number
          transaction_date: string
        }[]
      }
      get_team_costs_revision_for_session: {
        Args: { p_session_token: string }
        Returns: {
          amount_sum: number
          max_id: number
          row_count: number
        }[]
      }
      get_team_costs_transactions: {
        Args: { p_session_token: string; p_team_id?: number }
        Returns: {
          amount: number
          away_team_id: number
          away_team_name: string
          cost_category: string
          cost_default_amount: number
          cost_name: string
          cost_setting_id: number
          home_team_id: number
          home_team_name: string
          id: number
          match_date: string
          match_id: number
          match_unique_number: string
          season_label: string
          team_id: number
          transaction_date: string
        }[]
      }
      get_team_recipients: {
        Args: { p_team_ids: number[] }
        Returns: {
          email: string
          source: string
          team_id: number
          team_name: string
          username: string
        }[]
      }
      get_team_recipients_for_session: {
        Args: { p_session_token: string; p_team_ids: number[] }
        Returns: {
          email: string
          source: string
          team_id: number
          team_name: string
          username: string
        }[]
      }
      get_teams_for_session: {
        Args: { p_session_token: string; p_team_id?: number }
        Returns: {
          club_colors: string
          contact_email: string
          contact_person: string
          contact_phone: string
          preferred_play_moments: Json
          team_id: number
          team_name: string
        }[]
      }
      get_user_profile_for_session: {
        Args: { p_session_token: string }
        Returns: Json
      }
      get_user_team_ids_secure: {
        Args: { p_session_token: string }
        Returns: number[]
      }
      has_real_players: { Args: { player_data: Json }; Returns: boolean }
      insert_player_for_session: {
        Args: {
          p_birth_date: string
          p_first_name: string
          p_last_name: string
          p_session_token: string
          p_team_id: number
        }
        Returns: {
          message: string
          player_id: number
          success: boolean
        }[]
      }
      insert_team_for_session: {
        Args: { p_session_token: string; p_team_data: Json }
        Returns: {
          message: string
          success: boolean
          team_id: number
        }[]
      }
      is_admin_user: { Args: never; Returns: boolean }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_player_list_locked: {
        Args: { p_organization_id: number }
        Returns: boolean
      }
      is_player_suspended: {
        Args: {
          match_date_param: string
          p_session_token: string
          player_id_param: number
        }
        Returns: boolean
      }
      log_cost_setting_change: {
        Args: {
          p_cost_setting_id: number
          p_new_amount: number
          p_old_amount: number
          p_user_id?: number
        }
        Returns: undefined
      }
      login_super_admin: {
        Args: { p_password: string }
        Returns: {
          session_token: string
        }[]
      }
      login_user: {
        Args: {
          input_password: string
          input_username_or_email: string
          p_organization_id?: number
        }
        Returns: {
          email: string
          organization_id: number
          role: string
          session_token: string
          team_ids: number[]
          user_id: number
          username: string
        }[]
      }
      logout_user: { Args: { p_session_token: string }; Returns: undefined }
      manage_application_settings_for_session: {
        Args: {
          p_category?: string
          p_id?: number
          p_operation: string
          p_session_token: string
          p_setting_name?: string
          p_setting_value?: Json
        }
        Returns: Json
      }
      manage_blog_post: {
        Args: {
          p_id?: number
          p_operation: string
          p_published?: boolean
          p_setting_value?: Json
          p_user_id: number
        }
        Returns: Json
      }
      manage_cost_settings_for_session: {
        Args: {
          p_amount?: number
          p_cascade_amount?: boolean
          p_category?: string
          p_id?: number
          p_name?: string
          p_operation: string
          p_session_token: string
        }
        Returns: Json
      }
      manage_poll_for_session: {
        Args: { p_operation: string; p_payload: Json; p_session_token: string }
        Returns: Json
      }
      manage_profile_poll_for_session: {
        Args: {
          p_operation: string
          p_organization_id: number
          p_payload?: Json
          p_poll_id?: number
          p_session_token: string
        }
        Returns: Json
      }
      manage_referee_matches_for_session: {
        Args: { p_operation: string; p_payload: Json; p_session_token: string }
        Returns: Json
      }
      manage_team_cost_for_session: {
        Args: {
          p_amount: number
          p_cost_id: number
          p_cost_setting_id: number
          p_operation: string
          p_session_token: string
          p_team_id: number
          p_transaction_date: string
        }
        Returns: Json
      }
      manage_team_user_for_session:
        | {
            Args: {
              p_operation: string
              p_session_token: string
              p_team_id: number
              p_user_id: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_operation: string
              p_session_token: string
              p_team_id?: number
              p_team_ids?: number[]
              p_user_id: number
            }
            Returns: Json
          }
      match_has_forfait_penalty: {
        Args: { p_match_id: number }
        Returns: boolean
      }
      match_played_with_scores: {
        Args: { p_match_id: number }
        Returns: boolean
      }
      preview_close_season_for_session: {
        Args: { p_cutoff_date: string; p_session_token: string }
        Returns: Json
      }
      remove_referee_assignment: {
        Args: { p_assignment_id: number; p_session_token: string }
        Returns: Json
      }
      remove_referee_from_session: {
        Args: { p_match_id: number; p_session_token: string }
        Returns: Json
      }
      reset_password_with_token: {
        Args: { p_new_password: string; p_token: string }
        Returns: Json
      }
      resolve_session_for_costs: {
        Args: { p_session_token: string }
        Returns: {
          role: string
          team_ids: number[]
          user_id: number
        }[]
      }
      resolve_session_role: {
        Args: { p_session_token: string }
        Returns: {
          role: string
          user_id: number
        }[]
      }
      restore_user_session: {
        Args: { p_session_token: string }
        Returns: boolean
      }
      set_admin_referee_note_ack: {
        Args: {
          p_acknowledged?: boolean
          p_match_id: number
          p_session_token: string
        }
        Returns: Json
      }
      set_config: {
        Args: { parameter: string; value: string }
        Returns: undefined
      }
      set_current_user_context: {
        Args: { p_role: string; p_team_ids?: string; p_user_id: number }
        Returns: undefined
      }
      set_super_admin_acting_organization: {
        Args: { p_organization_id: number; p_session_token: string }
        Returns: boolean
      }
      submit_profile_poll_response_for_session: {
        Args: {
          p_option_ids: string[]
          p_organization_id: number
          p_poll_id: number
          p_session_token: string
        }
        Returns: Json
      }
      update_match_for_session: {
        Args: {
          p_match_id: number
          p_session_token: string
          p_update_data: Json
        }
        Returns: {
          match_id: number
          message: string
          success: boolean
        }[]
      }
      update_player_cards: { Args: never; Returns: undefined }
      update_player_for_session: {
        Args: {
          p_birth_date: string
          p_first_name: string
          p_last_name: string
          p_player_id: number
          p_session_token: string
        }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      update_player_suspension_for_session: {
        Args: {
          p_player_id: number
          p_session_token: string
          p_suspended_matches_remaining: number
        }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      update_team_balances: { Args: never; Returns: undefined }
      update_team_cost_as_admin: {
        Args: {
          p_amount?: number
          p_cost_id: number
          p_cost_setting_id?: number
          p_transaction_date?: string
          p_user_id: number
        }
        Returns: Json
      }
      update_team_for_session: {
        Args: { p_session_token: string; p_team_data: Json; p_team_id: number }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      update_user_for_session: {
        Args: {
          p_email?: string
          p_role?: Database["public"]["Enums"]["user_role"]
          p_session_token: string
          p_user_id: number
          p_username?: string
        }
        Returns: Json
      }
      update_user_password_for_session: {
        Args: {
          new_password: string
          p_session_token: string
          user_id_param: number
        }
        Returns: boolean
      }
      upsert_organization_for_super_admin: {
        Args: {
          p_branding_settings?: Json
          p_name: string
          p_organization_id: number
          p_session_token: string
          p_slug: string
        }
        Returns: Json
      }
      upsert_referee_availability_for_session: {
        Args: {
          p_is_available: boolean
          p_match_id: number
          p_poll_group_id: string
          p_poll_month: string
          p_session_token: string
        }
        Returns: boolean
      }
      upsert_season_archive_for_session: {
        Args: {
          p_field: string
          p_season_label: string
          p_session_token: string
          p_value: Json
        }
        Returns: Json
      }
      validate_player_data:
        | {
            Args: {
              p_birth_date: string
              p_exclude_player_id?: number
              p_first_name: string
              p_last_name: string
              p_team_id: number
            }
            Returns: boolean
          }
        | { Args: { p_name: string; p_team_id?: number }; Returns: boolean }
      validate_session: {
        Args: { p_session_token: string }
        Returns: {
          is_valid: boolean
          role: string
          user_id: number
        }[]
      }
    }
    Enums: {
      card_type: "yellow" | "red"
      user_role: "admin" | "referee" | "player_manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      card_type: ["yellow", "red"],
      user_role: ["admin", "referee", "player_manager"],
    },
  },
} as const
