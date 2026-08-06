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
      chatbot_credentials: {
        Row: {
          claude_api_key: string | null
          gemini_api_key: string | null
          id: number
          openai_api_key: string | null
          updated_at: string
        }
        Insert: {
          claude_api_key?: string | null
          gemini_api_key?: string | null
          id?: number
          openai_api_key?: string | null
          updated_at?: string
        }
        Update: {
          claude_api_key?: string | null
          gemini_api_key?: string | null
          id?: number
          openai_api_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chatbot_settings: {
        Row: {
          ai_provider: string
          api_key_configured: boolean
          id: number
          is_active: boolean
          model_name: string
          product_knowledge: string | null
          tone_instruction: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_provider?: string
          api_key_configured?: boolean
          id?: number
          is_active?: boolean
          model_name?: string
          product_knowledge?: string | null
          tone_instruction?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_provider?: string
          api_key_configured?: boolean
          id?: number
          is_active?: boolean
          model_name?: string
          product_knowledge?: string | null
          tone_instruction?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      followup_sequences: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      followup_steps: {
        Row: {
          created_at: string
          day_offset: number
          id: string
          media_type: string | null
          media_url: string | null
          message_template: string
          sequence_id: string
          step_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_offset: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_template: string
          sequence_id: string
          step_order: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_offset?: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_template?: string
          sequence_id?: string
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_followups: {
        Row: {
          created_at: string
          day_offset: number | null
          error_message: string | null
          id: string
          lead_id: string
          provider_message_id: string | null
          rendered_message: string | null
          scheduled_at: string
          sender_id_used: string | null
          sent_at: string | null
          sequence_id: string | null
          status: string
          step_id: string | null
          step_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_offset?: number | null
          error_message?: string | null
          id?: string
          lead_id: string
          provider_message_id?: string | null
          rendered_message?: string | null
          scheduled_at: string
          sender_id_used?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string
          step_id?: string | null
          step_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_offset?: number | null
          error_message?: string | null
          id?: string
          lead_id?: string
          provider_message_id?: string | null
          rendered_message?: string | null
          scheduled_at?: string
          sender_id_used?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string
          step_id?: string | null
          step_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_followups_sender_id_used_fkey"
            columns: ["sender_id_used"]
            isOneToOne: false
            referencedRelation: "whatsapp_senders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_followups_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_followups_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "followup_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_messages: {
        Row: {
          content: string | null
          created_at: string
          direction: string
          id: string
          is_read: boolean
          lead_id: string
          media_url: string | null
          message_type: string
          provider_message_id: string | null
          sender_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          direction: string
          id?: string
          is_read?: boolean
          lead_id: string
          media_url?: string | null
          message_type?: string
          provider_message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean
          lead_id?: string
          media_url?: string | null
          message_type?: string
          provider_message_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_senders"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_sender_id: string | null
          car_model: string | null
          chatbot_paused: boolean
          created_at: string
          created_by: string | null
          followup_sequence_id: string | null
          followup_status: string
          id: string
          lead_type: string
          name: string
          notes: string | null
          phone: string
          product: string | null
          updated_at: string
          whatsapp_name: string | null
          whatsapp_pp_url: string | null
        }
        Insert: {
          assigned_sender_id?: string | null
          car_model?: string | null
          chatbot_paused?: boolean
          created_at?: string
          created_by?: string | null
          followup_sequence_id?: string | null
          followup_status?: string
          id?: string
          lead_type?: string
          name: string
          notes?: string | null
          phone: string
          product?: string | null
          updated_at?: string
          whatsapp_name?: string | null
          whatsapp_pp_url?: string | null
        }
        Update: {
          assigned_sender_id?: string | null
          car_model?: string | null
          chatbot_paused?: boolean
          created_at?: string
          created_by?: string | null
          followup_sequence_id?: string | null
          followup_status?: string
          id?: string
          lead_type?: string
          name?: string
          notes?: string | null
          phone?: string
          product?: string | null
          updated_at?: string
          whatsapp_name?: string | null
          whatsapp_pp_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_sender_id_fkey"
            columns: ["assigned_sender_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_senders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_followup_sequence_id_fkey"
            columns: ["followup_sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_api_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          followup_id: string | null
          id: string
          lead_id: string | null
          method: string
          ok: boolean
          phone: string | null
          request_body: Json | null
          response_body: string | null
          response_status: number | null
          sender: string | null
          sender_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          followup_id?: string | null
          id?: string
          lead_id?: string | null
          method?: string
          ok?: boolean
          phone?: string | null
          request_body?: Json | null
          response_body?: string | null
          response_status?: number | null
          sender?: string | null
          sender_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          followup_id?: string | null
          id?: string
          lead_id?: string | null
          method?: string
          ok?: boolean
          phone?: string | null
          request_body?: Json | null
          response_body?: string | null
          response_status?: number | null
          sender?: string | null
          sender_id?: string | null
        }
        Relationships: []
      }
      whatsapp_credentials: {
        Row: {
          api_key: string | null
          id: number
          sender_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key?: string | null
          id?: number
          sender_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key?: string | null
          id?: number
          sender_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      whatsapp_send_windows: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_enabled: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time?: string
          id?: string
          is_enabled?: boolean
          start_time?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_enabled?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_senders: {
        Row: {
          batch_size: number
          connection_status: string
          consecutive_failures: number
          created_at: string
          current_lead_count: number
          daily_limit: number
          gap_seconds: number
          id: string
          is_active: boolean
          label: string
          last_checked_at: string | null
          last_sent_at: string | null
          phone_number: string
          rest_minutes: number
          resume_at: string | null
          stopper_enabled: boolean
          typing_seconds: number
          updated_at: string
        }
        Insert: {
          batch_size?: number
          connection_status?: string
          consecutive_failures?: number
          created_at?: string
          current_lead_count?: number
          daily_limit?: number
          gap_seconds?: number
          id?: string
          is_active?: boolean
          label: string
          last_checked_at?: string | null
          last_sent_at?: string | null
          phone_number: string
          rest_minutes?: number
          resume_at?: string | null
          stopper_enabled?: boolean
          typing_seconds?: number
          updated_at?: string
        }
        Update: {
          batch_size?: number
          connection_status?: string
          consecutive_failures?: number
          created_at?: string
          current_lead_count?: number
          daily_limit?: number
          gap_seconds?: number
          id?: string
          is_active?: boolean
          label?: string
          last_checked_at?: string | null
          last_sent_at?: string | null
          phone_number?: string
          rest_minutes?: number
          resume_at?: string | null
          stopper_enabled?: boolean
          typing_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_settings: {
        Row: {
          api_key_configured: boolean
          automation_enabled: boolean
          id: number
          send_timezone: string
          sender_number: string | null
          updated_at: string
        }
        Insert: {
          api_key_configured?: boolean
          automation_enabled?: boolean
          id?: number
          send_timezone?: string
          sender_number?: string | null
          updated_at?: string
        }
        Update: {
          api_key_configured?: boolean
          automation_enabled?: boolean
          id?: number
          send_timezone?: string
          sender_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_my_phone: { Args: { raw: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "staff"
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
      app_role: ["admin", "staff"],
    },
  },
} as const
