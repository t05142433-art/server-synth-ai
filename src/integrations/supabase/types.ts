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
      endpoints: {
        Row: {
          action_key: string | null
          body_template: string | null
          chain_to_action: string | null
          created_at: string
          description: string | null
          extract_regex: string | null
          extract_token_path: string | null
          extract_token_prefix: string | null
          extract_token_var: string | null
          forward_body: boolean
          forward_query: boolean
          headers: Json
          id: string
          method: string
          name: string
          server_id: string
          sort_order: number
          target_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_key?: string | null
          body_template?: string | null
          chain_to_action?: string | null
          created_at?: string
          description?: string | null
          extract_regex?: string | null
          extract_token_path?: string | null
          extract_token_prefix?: string | null
          extract_token_var?: string | null
          forward_body?: boolean
          forward_query?: boolean
          headers?: Json
          id?: string
          method?: string
          name?: string
          server_id: string
          sort_order?: number
          target_url?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_key?: string | null
          body_template?: string | null
          chain_to_action?: string | null
          created_at?: string
          description?: string | null
          extract_regex?: string | null
          extract_token_path?: string | null
          extract_token_prefix?: string | null
          extract_token_var?: string | null
          forward_body?: boolean
          forward_query?: boolean
          headers?: Json
          id?: string
          method?: string
          name?: string
          server_id?: string
          sort_order?: number
          target_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "endpoints_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          description: string | null
          html: string
          id: string
          maintenance_message: string | null
          maintenance_mode: boolean
          server_id: string | null
          slug: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          html?: string
          id?: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          server_id?: string | null
          slug: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          html?: string
          id?: string
          maintenance_message?: string | null
          maintenance_mode?: boolean
          server_id?: string | null
          slug?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      request_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          ip: string | null
          method: string | null
          path: string | null
          request_body: string | null
          response_body: string | null
          server_id: string
          status: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip?: string | null
          method?: string | null
          path?: string | null
          request_body?: string | null
          response_body?: string | null
          server_id: string
          status?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          ip?: string | null
          method?: string | null
          path?: string | null
          request_body?: string | null
          response_body?: string | null
          server_id?: string
          status?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_logs_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          ai_prompt: string | null
          api_key: string | null
          banned_ips: string[]
          body_template: string | null
          created_at: string
          description: string | null
          enabled: boolean
          extract_regex: string | null
          forward_body: boolean
          forward_query: boolean
          headers: Json
          id: string
          logo_url: string | null
          maintenance_message: string | null
          maintenance_mode: boolean
          method: string
          name: string
          rate_limit_per_min: number
          require_api_key: boolean
          slug: string
          target_url: string
          updated_at: string
          user_id: string
          variables: Json
        }
        Insert: {
          ai_prompt?: string | null
          api_key?: string | null
          banned_ips?: string[]
          body_template?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          extract_regex?: string | null
          forward_body?: boolean
          forward_query?: boolean
          headers?: Json
          id?: string
          logo_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          method?: string
          name: string
          rate_limit_per_min?: number
          require_api_key?: boolean
          slug: string
          target_url?: string
          updated_at?: string
          user_id: string
          variables?: Json
        }
        Update: {
          ai_prompt?: string | null
          api_key?: string | null
          banned_ips?: string[]
          body_template?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          extract_regex?: string | null
          forward_body?: boolean
          forward_query?: boolean
          headers?: Json
          id?: string
          logo_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean
          method?: string
          name?: string
          rate_limit_per_min?: number
          require_api_key?: boolean
          slug?: string
          target_url?: string
          updated_at?: string
          user_id?: string
          variables?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
