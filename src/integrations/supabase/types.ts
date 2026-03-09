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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_analysis_runs: {
        Row: {
          agent_type: Database["public"]["Enums"]["agent_type"]
          analysis_result: string | null
          case_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          findings: Json | null
          id: string
          sources_used: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["agent_run_status"]
          summary: string | null
          tokens_used: number | null
          updated_at: string
        }
        Insert: {
          agent_type: Database["public"]["Enums"]["agent_type"]
          analysis_result?: string | null
          case_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          findings?: Json | null
          id?: string
          sources_used?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          summary?: string | null
          tokens_used?: number | null
          updated_at?: string
        }
        Update: {
          agent_type?: Database["public"]["Enums"]["agent_type"]
          analysis_result?: string | null
          case_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          findings?: Json | null
          id?: string
          sources_used?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["agent_run_status"]
          summary?: string | null
          tokens_used?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_analysis_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_findings: {
        Row: {
          case_id: string
          created_at: string
          description: string
          evidence_refs: string[] | null
          finding_type: string
          id: string
          legal_basis: string[] | null
          metadata: Json | null
          page_references: string[] | null
          recommendation: string | null
          run_id: string
          severity: string | null
          title: string
          volume_refs: string[] | null
        }
        Insert: {
          case_id: string
          created_at?: string
          description: string
          evidence_refs?: string[] | null
          finding_type: string
          id?: string
          legal_basis?: string[] | null
          metadata?: Json | null
          page_references?: string[] | null
          recommendation?: string | null
          run_id: string
          severity?: string | null
          title: string
          volume_refs?: string[] | null
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string
          evidence_refs?: string[] | null
          finding_type?: string
          id?: string
          legal_basis?: string[] | null
          metadata?: Json | null
          page_references?: string[] | null
          recommendation?: string | null
          run_id?: string
          severity?: string | null
          title?: string
          volume_refs?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_findings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_jobs: {
        Row: {
          case_id: string
          created_at: string
          error: string | null
          id: string
          job_type: string
          payload: Json
          progress: Json | null
          request_id: string
          result: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          error?: string | null
          id?: string
          job_type: string
          payload?: Json
          progress?: Json | null
          request_id: string
          result?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          error?: string | null
          id?: string
          job_type?: string
          payload?: Json
          progress?: Json | null
          request_id?: string
          result?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_jobs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      aggregated_reports: {
        Row: {
          agent_runs: string[] | null
          case_id: string
          created_by: string | null
          defense_strategy: string | null
          evidence_summary: string | null
          executive_summary: string | null
          full_report: string | null
          generated_at: string
          id: string
          prosecution_weaknesses: string | null
          recommendations: string | null
          report_type: string
          statistics: Json | null
          title: string
          violations_summary: string | null
        }
        Insert: {
          agent_runs?: string[] | null
          case_id: string
          created_by?: string | null
          defense_strategy?: string | null
          evidence_summary?: string | null
          executive_summary?: string | null
          full_report?: string | null
          generated_at?: string
          id?: string
          prosecution_weaknesses?: string | null
          recommendations?: string | null
          report_type?: string
          statistics?: Json | null
          title: string
          violations_summary?: string | null
        }
        Update: {
          agent_runs?: string[] | null
          case_id?: string
          created_by?: string | null
          defense_strategy?: string | null
          evidence_summary?: string | null
          executive_summary?: string | null
          full_report?: string | null
          generated_at?: string
          id?: string
          prosecution_weaknesses?: string | null
          recommendations?: string | null
          report_type?: string
          statistics?: Json | null
          title?: string
          violations_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aggregated_reports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_analysis: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          id: string
          prompt_used: string | null
          response_text: string
          role: string
          sources_used: Json | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_used?: string | null
          response_text: string
          role: string
          sources_used?: Json | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          prompt_used?: string | null
          response_text?: string
          role?: string
          sources_used?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_versions: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          id: string
          prompt_id: string
          prompt_text: string
          version_number: number
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          prompt_id: string
          prompt_text: string
          version_number: number
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          prompt_id?: string
          prompt_text?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "ai_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompts: {
        Row: {
          created_at: string
          created_by: string | null
          current_version: number
          description: string | null
          function_name: string
          id: string
          is_active: boolean
          module_type: string
          name_en: string | null
          name_hy: string
          name_ru: string
          prompt_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          function_name: string
          id?: string
          is_active?: boolean
          module_type: string
          name_en?: string | null
          name_hy: string
          name_ru: string
          prompt_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          function_name?: string
          id?: string
          is_active?: boolean
          module_type?: string
          name_en?: string | null
          name_hy?: string
          name_ru?: string
          prompt_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          created_at: string
          estimated_cost: number | null
          id: string
          model_name: string | null
          request_metadata: Json | null
          service_type: string
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          model_name?: string | null
          request_metadata?: Json | null
          service_type: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          model_name?: string | null
          request_metadata?: Json | null
          service_type?: string
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      armenian_dictionary: {
        Row: {
          created_at: string
          definition: string | null
          examples: Json | null
          forms: Json | null
          id: string
          lemma: string
          lemma_norm: string
          part_of_speech: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          definition?: string | null
          examples?: Json | null
          forms?: Json | null
          id?: string
          lemma: string
          lemma_norm: string
          part_of_speech?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          definition?: string | null
          examples?: Json | null
          forms?: Json | null
          id?: string
          lemma?: string
          lemma_norm?: string
          part_of_speech?: string | null
          source?: string | null
        }
        Relationships: []
      }
      audio_transcriptions: {
        Row: {
          confidence: number | null
          created_at: string
          duration_seconds: number | null
          file_id: string
          id: string
          language: string | null
          needs_review: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          speaker_labels: Json | null
          transcription_text: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          duration_seconds?: number | null
          file_id: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          speaker_labels?: Json | null
          transcription_text: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          duration_seconds?: number | null
          file_id?: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          speaker_labels?: Json | null
          transcription_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_transcriptions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "case_files"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      case_comments: {
        Row: {
          author_id: string
          case_id: string
          content: string
          created_at: string
          id: string
          is_internal: boolean
          updated_at: string
        }
        Insert: {
          author_id: string
          case_id: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_comments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_files: {
        Row: {
          case_id: string
          created_at: string
          deleted_at: string | null
          file_size: number | null
          file_type: string | null
          filename: string
          hash_sha256: string | null
          id: string
          notes: string | null
          original_filename: string
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          case_id: string
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          filename: string
          hash_sha256?: string | null
          id?: string
          notes?: string | null
          original_filename: string
          storage_path: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          case_id?: string
          created_at?: string
          deleted_at?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string
          hash_sha256?: string | null
          id?: string
          notes?: string | null
          original_filename?: string
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_files_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_volumes: {
        Row: {
          case_id: string
          created_at: string
          description: string | null
          file_id: string | null
          id: string
          ocr_completed: boolean | null
          ocr_text: string | null
          page_count: number | null
          title: string
          updated_at: string
          volume_number: number
        }
        Insert: {
          case_id: string
          created_at?: string
          description?: string | null
          file_id?: string | null
          id?: string
          ocr_completed?: boolean | null
          ocr_text?: string | null
          page_count?: number | null
          title: string
          updated_at?: string
          volume_number: number
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string | null
          file_id?: string | null
          id?: string
          ocr_completed?: boolean | null
          ocr_text?: string | null
          page_count?: number | null
          title?: string
          updated_at?: string
          volume_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "case_volumes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_volumes_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "case_files"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          appeal_party_role: string | null
          case_number: string
          case_type: Database["public"]["Enums"]["case_type"] | null
          client_id: string | null
          court: string | null
          court_date: string | null
          court_name: string | null
          created_at: string
          current_stage: string | null
          deleted_at: string | null
          description: string | null
          facts: string | null
          id: string
          lawyer_id: string | null
          legal_question: string | null
          notes: string | null
          party_role: string | null
          priority: Database["public"]["Enums"]["case_priority"]
          status: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at: string
        }
        Insert: {
          appeal_party_role?: string | null
          case_number: string
          case_type?: Database["public"]["Enums"]["case_type"] | null
          client_id?: string | null
          court?: string | null
          court_date?: string | null
          court_name?: string | null
          created_at?: string
          current_stage?: string | null
          deleted_at?: string | null
          description?: string | null
          facts?: string | null
          id?: string
          lawyer_id?: string | null
          legal_question?: string | null
          notes?: string | null
          party_role?: string | null
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at?: string
        }
        Update: {
          appeal_party_role?: string | null
          case_number?: string
          case_type?: Database["public"]["Enums"]["case_type"] | null
          client_id?: string | null
          court?: string | null
          court_date?: string | null
          court_name?: string | null
          created_at?: string
          current_stage?: string | null
          deleted_at?: string | null
          description?: string | null
          facts?: string | null
          id?: string
          lawyer_id?: string | null
          legal_question?: string | null
          notes?: string | null
          party_role?: string | null
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      dictionary_import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          error_report: Json | null
          failed: number
          file_type: string
          id: string
          inserted: number
          mode: string
          processed: number
          skipped: number
          source: string | null
          status: string
          total_rows: number
          updated: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_report?: Json | null
          failed?: number
          file_type: string
          id?: string
          inserted?: number
          mode?: string
          processed?: number
          skipped?: number
          source?: string | null
          status?: string
          total_rows?: number
          updated?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_report?: Json | null
          failed?: number
          file_type?: string
          id?: string
          inserted?: number
          mode?: string
          processed?: number
          skipped?: number
          source?: string | null
          status?: string
          total_rows?: number
          updated?: number
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_hy: string
          name_ru: string
          required_fields: string[]
          subcategory: string | null
          template_structure: Json
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_hy: string
          name_ru: string
          required_fields?: string[]
          subcategory?: string | null
          template_structure?: Json
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_hy?: string
          name_ru?: string
          required_fields?: string[]
          subcategory?: string | null
          template_structure?: Json
          updated_at?: string
        }
        Relationships: []
      }
      encrypted_pii: {
        Row: {
          created_at: string
          encrypted_value: string
          field_name: string
          id: string
          iv: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_value: string
          field_name: string
          id?: string
          iv: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_value?: string
          field_name?: string
          id?: string
          iv?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          case_id: string | null
          created_at: string
          error_details: Json | null
          error_message: string
          error_type: string
          file_id: string | null
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          user_id: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          error_details?: Json | null
          error_message: string
          error_type: string
          file_id?: string | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string
          error_details?: Json | null
          error_message?: string
          error_type?: string
          file_id?: string | null
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "case_files"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_cases: {
        Row: {
          created_at: string
          description: string | null
          expected_language: string | null
          id: string
          input_payload: Json
          invariants: Json
          is_active: boolean
          mode: string
          name: string
          reference_date: string | null
          suite_id: string
          tags: string[]
          target_function: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expected_language?: string | null
          id?: string
          input_payload?: Json
          invariants?: Json
          is_active?: boolean
          mode?: string
          name: string
          reference_date?: string | null
          suite_id: string
          tags?: string[]
          target_function: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expected_language?: string | null
          id?: string
          input_payload?: Json
          invariants?: Json
          is_active?: boolean
          mode?: string
          name?: string
          reference_date?: string | null
          suite_id?: string
          tags?: string[]
          target_function?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eval_cases_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "eval_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_run_results: {
        Row: {
          case_id: string
          created_at: string
          error_message: string | null
          http_status: number | null
          id: string
          invariant_results: Json
          latency_ms: number | null
          raw_response: Json | null
          response_headers: Json | null
          run_id: string
          status: string
          temporal_metadata_source: string | null
          temporal_violations: Json | null
        }
        Insert: {
          case_id: string
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          invariant_results?: Json
          latency_ms?: number | null
          raw_response?: Json | null
          response_headers?: Json | null
          run_id: string
          status?: string
          temporal_metadata_source?: string | null
          temporal_violations?: Json | null
        }
        Update: {
          case_id?: string
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          invariant_results?: Json
          latency_ms?: number | null
          raw_response?: Json | null
          response_headers?: Json | null
          run_id?: string
          status?: string
          temporal_metadata_source?: string | null
          temporal_violations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "eval_run_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "eval_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_run_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "eval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          failed: number
          id: string
          metadata: Json
          passed: number
          skipped: number
          started_at: string | null
          status: string
          suite_id: string
          total_cases: number
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed?: number
          id?: string
          metadata?: Json
          passed?: number
          skipped?: number
          started_at?: string | null
          status?: string
          suite_id: string
          total_cases?: number
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed?: number
          id?: string
          metadata?: Json
          passed?: number
          skipped?: number
          started_at?: string | null
          status?: string
          suite_id?: string
          total_cases?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eval_runs_suite_id_fkey"
            columns: ["suite_id"]
            isOneToOne: false
            referencedRelation: "eval_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_suites: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      evidence_registry: {
        Row: {
          admissibility_notes: string | null
          admissibility_status:
            | Database["public"]["Enums"]["evidence_status"]
            | null
          ai_analysis: string | null
          case_id: string
          created_at: string
          created_by: string | null
          date_obtained: string | null
          defense_arguments: string | null
          description: string | null
          evidence_number: number
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          id: string
          metadata: Json | null
          obtained_by: string | null
          page_reference: string | null
          prosecution_position: string | null
          related_articles: string[] | null
          source_document: string | null
          title: string
          updated_at: string
          violations_found: string[] | null
          volume_id: string | null
        }
        Insert: {
          admissibility_notes?: string | null
          admissibility_status?:
            | Database["public"]["Enums"]["evidence_status"]
            | null
          ai_analysis?: string | null
          case_id: string
          created_at?: string
          created_by?: string | null
          date_obtained?: string | null
          defense_arguments?: string | null
          description?: string | null
          evidence_number: number
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          id?: string
          metadata?: Json | null
          obtained_by?: string | null
          page_reference?: string | null
          prosecution_position?: string | null
          related_articles?: string[] | null
          source_document?: string | null
          title: string
          updated_at?: string
          violations_found?: string[] | null
          volume_id?: string | null
        }
        Update: {
          admissibility_notes?: string | null
          admissibility_status?:
            | Database["public"]["Enums"]["evidence_status"]
            | null
          ai_analysis?: string | null
          case_id?: string
          created_at?: string
          created_by?: string | null
          date_obtained?: string | null
          defense_arguments?: string | null
          description?: string | null
          evidence_number?: number
          evidence_type?: Database["public"]["Enums"]["evidence_type"]
          id?: string
          metadata?: Json | null
          obtained_by?: string | null
          page_reference?: string | null
          prosecution_position?: string | null
          related_articles?: string[] | null
          source_document?: string | null
          title?: string
          updated_at?: string
          violations_found?: string[] | null
          volume_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_registry_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_registry_volume_id_fkey"
            columns: ["volume_id"]
            isOneToOne: false
            referencedRelation: "case_volumes"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          case_id: string | null
          content_text: string
          created_at: string
          id: string
          metadata: Json | null
          recipient_name: string | null
          recipient_organization: string | null
          recipient_position: string | null
          sender_address: string | null
          sender_contact: string | null
          sender_name: string | null
          source_text: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          content_text: string
          created_at?: string
          id?: string
          metadata?: Json | null
          recipient_name?: string | null
          recipient_organization?: string | null
          recipient_position?: string | null
          sender_address?: string | null
          sender_contact?: string | null
          sender_name?: string | null
          source_text?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          content_text?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          recipient_name?: string | null
          recipient_organization?: string | null
          recipient_position?: string | null
          sender_address?: string | null
          sender_contact?: string | null
          sender_name?: string | null
          source_text?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_versions: {
        Row: {
          article_number: string | null
          category: Database["public"]["Enums"]["kb_category"]
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          content_text: string
          id: string
          kb_id: string
          source_name: string | null
          source_url: string | null
          title: string
          version_date: string | null
          version_number: number
        }
        Insert: {
          article_number?: string | null
          category: Database["public"]["Enums"]["kb_category"]
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          content_text: string
          id?: string
          kb_id: string
          source_name?: string | null
          source_url?: string | null
          title: string
          version_date?: string | null
          version_number?: number
        }
        Update: {
          article_number?: string | null
          category?: Database["public"]["Enums"]["kb_category"]
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          content_text?: string
          id?: string
          kb_id?: string
          source_name?: string | null
          source_url?: string | null
          title?: string
          version_date?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_versions_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          article_number: string | null
          category: Database["public"]["Enums"]["kb_category"]
          content_hash: string | null
          content_text: string
          created_at: string
          current_version: number | null
          effective_from: string | null
          effective_to: string | null
          embedding: string | null
          embedding_attempts: number
          embedding_error: string | null
          embedding_last_attempt: string | null
          embedding_legacy_768: string | null
          embedding_status: string
          id: string
          is_active: boolean
          source_name: string | null
          source_url: string | null
          supersedes_doc_id: string | null
          title: string
          tsv: unknown
          updated_at: string
          uploaded_by: string | null
          version_date: string | null
        }
        Insert: {
          article_number?: string | null
          category?: Database["public"]["Enums"]["kb_category"]
          content_hash?: string | null
          content_text: string
          created_at?: string
          current_version?: number | null
          effective_from?: string | null
          effective_to?: string | null
          embedding?: string | null
          embedding_attempts?: number
          embedding_error?: string | null
          embedding_last_attempt?: string | null
          embedding_legacy_768?: string | null
          embedding_status?: string
          id?: string
          is_active?: boolean
          source_name?: string | null
          source_url?: string | null
          supersedes_doc_id?: string | null
          title: string
          tsv?: unknown
          updated_at?: string
          uploaded_by?: string | null
          version_date?: string | null
        }
        Update: {
          article_number?: string | null
          category?: Database["public"]["Enums"]["kb_category"]
          content_hash?: string | null
          content_text?: string
          created_at?: string
          current_version?: number | null
          effective_from?: string | null
          effective_to?: string | null
          embedding?: string | null
          embedding_attempts?: number
          embedding_error?: string | null
          embedding_last_attempt?: string | null
          embedding_legacy_768?: string | null
          embedding_status?: string
          id?: string
          is_active?: boolean
          source_name?: string | null
          source_url?: string | null
          supersedes_doc_id?: string | null
          title?: string
          tsv?: unknown
          updated_at?: string
          uploaded_by?: string | null
          version_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_supersedes_doc_id_fkey"
            columns: ["supersedes_doc_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_chunks: {
        Row: {
          case_number: string | null
          char_end: number
          char_start: number
          chunk_hash: string | null
          chunk_index: number
          chunk_text: string
          chunk_type: string
          court_name: string | null
          created_at: string
          decision_date: string | null
          id: string
          is_active: boolean
          kb_id: string
          label: string | null
          overlap_prev: number | null
          rechunk_version: string | null
          source_anchor: string | null
        }
        Insert: {
          case_number?: string | null
          char_end?: number
          char_start?: number
          chunk_hash?: string | null
          chunk_index?: number
          chunk_text: string
          chunk_type?: string
          court_name?: string | null
          created_at?: string
          decision_date?: string | null
          id?: string
          is_active?: boolean
          kb_id: string
          label?: string | null
          overlap_prev?: number | null
          rechunk_version?: string | null
          source_anchor?: string | null
        }
        Update: {
          case_number?: string | null
          char_end?: number
          char_start?: number
          chunk_hash?: string | null
          chunk_index?: number
          chunk_text?: string
          chunk_type?: string
          court_name?: string | null
          created_at?: string
          decision_date?: string | null
          id?: string
          is_active?: boolean
          kb_id?: string
          label?: string | null
          overlap_prev?: number | null
          rechunk_version?: string | null
          source_anchor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_chunks_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_chunks: {
        Row: {
          case_number: string | null
          char_end: number
          char_start: number
          chunk_hash: string | null
          chunk_index: number
          chunk_text: string
          chunk_type: string
          court_name: string | null
          created_at: string
          decision_date: string | null
          doc_id: string
          doc_type: string
          embedding: string | null
          embedding_legacy_768: string | null
          id: string
          is_active: boolean
          label: string | null
          metadata: Json | null
          norm_refs: Json | null
          overlap_prev: number | null
          rechunk_version: string | null
          source_anchor: string | null
          updated_at: string
        }
        Insert: {
          case_number?: string | null
          char_end?: number
          char_start?: number
          chunk_hash?: string | null
          chunk_index?: number
          chunk_text: string
          chunk_type?: string
          court_name?: string | null
          created_at?: string
          decision_date?: string | null
          doc_id: string
          doc_type: string
          embedding?: string | null
          embedding_legacy_768?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          metadata?: Json | null
          norm_refs?: Json | null
          overlap_prev?: number | null
          rechunk_version?: string | null
          source_anchor?: string | null
          updated_at?: string
        }
        Update: {
          case_number?: string | null
          char_end?: number
          char_start?: number
          chunk_hash?: string | null
          chunk_index?: number
          chunk_text?: string
          chunk_type?: string
          court_name?: string | null
          created_at?: string
          decision_date?: string | null
          doc_id?: string
          doc_type?: string
          embedding?: string | null
          embedding_legacy_768?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          metadata?: Json | null
          norm_refs?: Json | null
          overlap_prev?: number | null
          rechunk_version?: string | null
          source_anchor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_legal_chunks_doc"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          applied_articles: Json | null
          branch: string
          content_text: string
          court_meta: Json | null
          created_at: string
          date_adopted: string | null
          date_effective: string | null
          decision_map: Json | null
          doc_type: string
          document_number: string | null
          id: string
          ingestion_meta: Json | null
          is_active: boolean
          jurisdiction: string
          key_violations: string[] | null
          legal_reasoning_summary: string | null
          source_hash: string | null
          source_name: string | null
          source_url: string | null
          title: string
          title_alt: string | null
          updated_at: string
        }
        Insert: {
          applied_articles?: Json | null
          branch?: string
          content_text: string
          court_meta?: Json | null
          created_at?: string
          date_adopted?: string | null
          date_effective?: string | null
          decision_map?: Json | null
          doc_type: string
          document_number?: string | null
          id?: string
          ingestion_meta?: Json | null
          is_active?: boolean
          jurisdiction?: string
          key_violations?: string[] | null
          legal_reasoning_summary?: string | null
          source_hash?: string | null
          source_name?: string | null
          source_url?: string | null
          title: string
          title_alt?: string | null
          updated_at?: string
        }
        Update: {
          applied_articles?: Json | null
          branch?: string
          content_text?: string
          court_meta?: Json | null
          created_at?: string
          date_adopted?: string | null
          date_effective?: string | null
          decision_map?: Json | null
          doc_type?: string
          document_number?: string | null
          id?: string
          ingestion_meta?: Json | null
          is_active?: boolean
          jurisdiction?: string
          key_violations?: string[] | null
          legal_reasoning_summary?: string | null
          source_hash?: string | null
          source_name?: string | null
          source_url?: string | null
          title?: string
          title_alt?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      legal_practice_kb: {
        Row: {
          application_scope: string | null
          applied_articles: Json | null
          case_number_anonymized: string | null
          chunk_index_meta: Json | null
          content_chunks: string[] | null
          content_hash: string | null
          content_text: string
          court_name: string | null
          court_type: Database["public"]["Enums"]["court_type"]
          created_at: string
          decision_date: string | null
          decision_map: Json | null
          description: string | null
          echr_article: string[] | null
          echr_case_id: string | null
          echr_principle_formula: string | null
          echr_test_applied: string | null
          embedding: string | null
          embedding_attempts: number
          embedding_error: string | null
          embedding_last_attempt: string | null
          embedding_legacy_768: string | null
          embedding_status: string
          facts_hy: string | null
          id: string
          import_ref: string | null
          interpreted_norms: Json | null
          is_active: boolean
          is_anonymized: boolean
          judgment_hy: string | null
          key_paragraphs: Json | null
          key_violations: string[] | null
          keywords: string[] | null
          legal_principle: string | null
          legal_reasoning_summary: string | null
          limitations_of_application: string | null
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          precedent_authority_level: string | null
          procedural_aspect: string | null
          ratio_decidendi: string | null
          related_cases: string[] | null
          source_name: string | null
          source_url: string | null
          summary_hy: string | null
          text_hy: string | null
          title: string
          translation_errors: string | null
          translation_provider: string | null
          translation_status: string | null
          translation_ts: string | null
          tsv: unknown
          updated_at: string
          uploaded_by: string | null
          violation_type: string | null
          visibility: string
        }
        Insert: {
          application_scope?: string | null
          applied_articles?: Json | null
          case_number_anonymized?: string | null
          chunk_index_meta?: Json | null
          content_chunks?: string[] | null
          content_hash?: string | null
          content_text: string
          court_name?: string | null
          court_type: Database["public"]["Enums"]["court_type"]
          created_at?: string
          decision_date?: string | null
          decision_map?: Json | null
          description?: string | null
          echr_article?: string[] | null
          echr_case_id?: string | null
          echr_principle_formula?: string | null
          echr_test_applied?: string | null
          embedding?: string | null
          embedding_attempts?: number
          embedding_error?: string | null
          embedding_last_attempt?: string | null
          embedding_legacy_768?: string | null
          embedding_status?: string
          facts_hy?: string | null
          id?: string
          import_ref?: string | null
          interpreted_norms?: Json | null
          is_active?: boolean
          is_anonymized?: boolean
          judgment_hy?: string | null
          key_paragraphs?: Json | null
          key_violations?: string[] | null
          keywords?: string[] | null
          legal_principle?: string | null
          legal_reasoning_summary?: string | null
          limitations_of_application?: string | null
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          precedent_authority_level?: string | null
          procedural_aspect?: string | null
          ratio_decidendi?: string | null
          related_cases?: string[] | null
          source_name?: string | null
          source_url?: string | null
          summary_hy?: string | null
          text_hy?: string | null
          title: string
          translation_errors?: string | null
          translation_provider?: string | null
          translation_status?: string | null
          translation_ts?: string | null
          tsv?: unknown
          updated_at?: string
          uploaded_by?: string | null
          violation_type?: string | null
          visibility?: string
        }
        Update: {
          application_scope?: string | null
          applied_articles?: Json | null
          case_number_anonymized?: string | null
          chunk_index_meta?: Json | null
          content_chunks?: string[] | null
          content_hash?: string | null
          content_text?: string
          court_name?: string | null
          court_type?: Database["public"]["Enums"]["court_type"]
          created_at?: string
          decision_date?: string | null
          decision_map?: Json | null
          description?: string | null
          echr_article?: string[] | null
          echr_case_id?: string | null
          echr_principle_formula?: string | null
          echr_test_applied?: string | null
          embedding?: string | null
          embedding_attempts?: number
          embedding_error?: string | null
          embedding_last_attempt?: string | null
          embedding_legacy_768?: string | null
          embedding_status?: string
          facts_hy?: string | null
          id?: string
          import_ref?: string | null
          interpreted_norms?: Json | null
          is_active?: boolean
          is_anonymized?: boolean
          judgment_hy?: string | null
          key_paragraphs?: Json | null
          key_violations?: string[] | null
          keywords?: string[] | null
          legal_principle?: string | null
          legal_reasoning_summary?: string | null
          limitations_of_application?: string | null
          outcome?: Database["public"]["Enums"]["case_outcome"]
          practice_category?: Database["public"]["Enums"]["practice_category"]
          precedent_authority_level?: string | null
          procedural_aspect?: string | null
          ratio_decidendi?: string | null
          related_cases?: string[] | null
          source_name?: string | null
          source_url?: string | null
          summary_hy?: string | null
          text_hy?: string | null
          title?: string
          translation_errors?: string | null
          translation_provider?: string | null
          translation_status?: string | null
          translation_ts?: string | null
          tsv?: unknown
          updated_at?: string
          uploaded_by?: string | null
          violation_type?: string | null
          visibility?: string
        }
        Relationships: []
      }
      legal_practice_kb_chunks: {
        Row: {
          chunk_hash: string | null
          chunk_index: number
          chunk_text: string
          created_at: string
          doc_id: string
          id: string
          overlap_prev: number | null
          rechunk_version: string | null
          source_anchor: string | null
          title: string | null
        }
        Insert: {
          chunk_hash?: string | null
          chunk_index: number
          chunk_text: string
          created_at?: string
          doc_id: string
          id?: string
          overlap_prev?: number | null
          rechunk_version?: string | null
          source_anchor?: string | null
          title?: string | null
        }
        Update: {
          chunk_hash?: string | null
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          doc_id?: string
          id?: string
          overlap_prev?: number | null
          rechunk_version?: string | null
          source_anchor?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_practice_kb_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "legal_practice_kb"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          notification_type: string
          reminder_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type?: string
          reminder_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type?: string
          reminder_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_results: {
        Row: {
          confidence: number | null
          created_at: string
          extracted_text: string
          file_id: string
          id: string
          language: string | null
          needs_review: boolean
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extracted_text: string
          file_id: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extracted_text?: string
          file_id?: string
          id?: string
          language?: string | null
          needs_review?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "case_files"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_chunk_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          document_id: string
          id: string
          job_type: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          next_run_at: string | null
          source_table: string
          started_at: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          document_id: string
          id?: string
          job_type?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          next_run_at?: string | null
          source_table?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          document_id?: string
          id?: string
          job_type?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          next_run_at?: string | null
          source_table?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auditor_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          encrypted_address: string | null
          encrypted_passport: string | null
          encrypted_ssn: string | null
          full_name: string | null
          id: string
          notification_preferences: Json | null
          phone: string | null
          telegram_chat_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          auditor_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          encrypted_address?: string | null
          encrypted_passport?: string | null
          encrypted_ssn?: string | null
          full_name?: string | null
          id: string
          notification_preferences?: Json | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          auditor_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          encrypted_address?: string | null
          encrypted_passport?: string | null
          encrypted_ssn?: string | null
          full_name?: string | null
          id?: string
          notification_preferences?: Json | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          case_id: string | null
          created_at: string
          description: string | null
          event_datetime: string
          id: string
          notify_before: number[]
          priority: Database["public"]["Enums"]["case_priority"]
          reminder_type: Database["public"]["Enums"]["reminder_type"]
          status: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          event_datetime: string
          id?: string
          notify_before?: number[]
          priority?: Database["public"]["Enums"]["case_priority"]
          reminder_type?: Database["public"]["Enums"]["reminder_type"]
          status?: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          description?: string | null
          event_datetime?: string
          id?: string
          notify_before?: number[]
          priority?: Database["public"]["Enums"]["case_priority"]
          reminder_type?: Database["public"]["Enums"]["reminder_type"]
          status?: Database["public"]["Enums"]["reminder_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      role_limits: {
        Row: {
          created_at: string
          hourly_limit: number
          monthly_cost_limit: number
          monthly_token_limit: number
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hourly_limit?: number
          monthly_cost_limit?: number
          monthly_token_limit?: number
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hourly_limit?: number
          monthly_cost_limit?: number
          monthly_token_limit?: number
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          leader_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          leader_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_uploads: {
        Row: {
          caption: string | null
          created_at: string
          file_size: number | null
          file_type: string | null
          filename: string
          id: string
          original_filename: string
          storage_path: string
          telegram_chat_id: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          filename: string
          id?: string
          original_filename: string
          storage_path: string
          telegram_chat_id: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: string | null
          filename?: string
          id?: string
          original_filename?: string
          storage_path?: string
          telegram_chat_id?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_verification_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      translations_cache: {
        Row: {
          cache_key: string
          created_at: string
          field_name: string
          id: string
          provider: string
          source_text: string
          translated_text: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          field_name: string
          id?: string
          provider?: string
          source_text: string
          translated_text: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          field_name?: string
          id?: string
          provider?: string
          source_text?: string
          translated_text?: string
        }
        Relationships: []
      }
      user_feedback: {
        Row: {
          analysis_id: string | null
          case_id: string | null
          comment: string | null
          created_at: string
          id: string
          rating: number | null
          user_id: string | null
        }
        Insert: {
          analysis_id?: string | null
          case_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          analysis_id?: string | null
          case_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "ai_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feedback_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notes: {
        Row: {
          content_html: string
          content_text: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_html?: string
          content_text?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_html?: string
          content_text?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      admin_pipeline_stats: {
        Row: {
          dead_letter_count: number | null
          job_count: number | null
          job_type: string | null
          last_error_at: string | null
          oldest_pending_age_seconds: number | null
          oldest_pending_at: string | null
          status: string | null
          total_attempts: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      avg_chunks_per_kb_doc: { Args: never; Returns: number }
      avg_chunks_per_practice_doc: { Args: never; Returns: number }
      check_budget_alert: { Args: { budget_limit?: number }; Returns: boolean }
      chunk_coverage_stats: {
        Args: never
        Returns: {
          avg_chunks_per_doc: number
          coverage_pct: number
          docs_with_chunks: number
          docs_without_chunks: number
          source: string
          total_chunks: number
          total_docs: number
        }[]
      }
      claim_chunk_jobs: {
        Args: {
          p_lease_minutes?: number
          p_limit?: number
          p_source_table?: string
        }
        Returns: {
          attempts: number
          document_id: string
          id: string
          max_attempts: number
          source_table: string
        }[]
      }
      claim_pipeline_jobs: {
        Args: {
          p_job_type: string
          p_lease_minutes?: number
          p_limit?: number
          p_source_table?: string
        }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          document_id: string
          id: string
          job_type: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          next_run_at: string | null
          source_table: string
          started_at: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "practice_chunk_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      count_docs_without_chunks: { Args: never; Returns: number }
      count_kb_docs_without_chunks: { Args: never; Returns: number }
      decrypt_pii: {
        Args: { _field_name: string; _user_id: string }
        Returns: string
      }
      dictionary_search: {
        Args: { q_norm: string; search_limit?: number; search_offset?: number }
        Returns: {
          definition: string
          examples: Json
          forms: Json
          id: string
          lemma: string
          match_type: string
          part_of_speech: string
          similarity_score: number
        }[]
      }
      encrypt_pii: {
        Args: { _field_name: string; _user_id: string; _value: string }
        Returns: boolean
      }
      enqueue_batch_kb: { Args: { p_limit?: number }; Returns: number }
      enqueue_batch_practice: { Args: { p_limit?: number }; Returns: number }
      get_admin_pipeline_stats: {
        Args: never
        Returns: {
          dead_letter_count: number
          job_count: number
          job_type: string
          last_error_at: string
          oldest_pending_age_seconds: number
          oldest_pending_at: string
          status: string
          total_attempts: number
        }[]
      }
      get_docs_needing_rechunk: {
        Args: {
          _cursor_id?: string
          _page_size?: number
          _source?: string
          _target_version?: string
        }
        Returns: {
          content_length: number
          doc_id: string
          doc_type: string
          title: string
        }[]
      }
      get_kb_chunk: {
        Args: { chunk_idx: number; doc_id: string }
        Returns: {
          chunk_index: number
          chunk_meta: Json
          chunk_text: string
          id: string
          total_chunks: number
        }[]
      }
      get_kb_chunk_full: {
        Args: { p_chunk_index: number; p_kb_id: string }
        Returns: Json
      }
      get_kb_docs_needing_rechunk: {
        Args: {
          _cursor_id?: string
          _page_size?: number
          _target_version?: string
        }
        Returns: {
          content_length: number
          doc_id: string
          title: string
        }[]
      }
      get_kb_docs_without_chunks: {
        Args: { batch_limit?: number }
        Returns: {
          id: string
        }[]
      }
      get_kb_docs_without_v1_chunks: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      get_led_team_ids: { Args: { _user_id: string }; Returns: string[] }
      get_monthly_usage: {
        Args: never
        Returns: {
          service_type: string
          total_cost: number
          total_requests: number
          total_tokens: number
        }[]
      }
      get_monthly_usage_summary: {
        Args: { _month_start: string; _user_id: string }
        Returns: {
          total_cost: number
          total_tokens: number
        }[]
      }
      get_practice_docs_without_chunks: {
        Args: { batch_limit?: number }
        Returns: {
          id: string
        }[]
      }
      get_practice_docs_without_v1_chunks: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      get_practice_total_chunks: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          total_chunks: number
        }[]
      }
      get_team_member_ids: { Args: { _leader_id: string }; Returns: string[] }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      invoke_chunk_enqueue: {
        Args: { p_batch_limit?: number }
        Returns: undefined
      }
      invoke_chunk_orchestrator: { Args: never; Returns: undefined }
      invoke_chunk_worker: { Args: { p_max_jobs?: number }; Returns: undefined }
      invoke_pipeline_orchestrator: { Args: never; Returns: undefined }
      invoke_pipeline_tick: { Args: never; Returns: undefined }
      is_team_leader: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      kb_docs_without_chunks: {
        Args: never
        Returns: {
          application_scope: string | null
          applied_articles: Json | null
          case_number_anonymized: string | null
          chunk_index_meta: Json | null
          content_chunks: string[] | null
          content_hash: string | null
          content_text: string
          court_name: string | null
          court_type: Database["public"]["Enums"]["court_type"]
          created_at: string
          decision_date: string | null
          decision_map: Json | null
          description: string | null
          echr_article: string[] | null
          echr_case_id: string | null
          echr_principle_formula: string | null
          echr_test_applied: string | null
          embedding: string | null
          embedding_attempts: number
          embedding_error: string | null
          embedding_last_attempt: string | null
          embedding_legacy_768: string | null
          embedding_status: string
          facts_hy: string | null
          id: string
          import_ref: string | null
          interpreted_norms: Json | null
          is_active: boolean
          is_anonymized: boolean
          judgment_hy: string | null
          key_paragraphs: Json | null
          key_violations: string[] | null
          keywords: string[] | null
          legal_principle: string | null
          legal_reasoning_summary: string | null
          limitations_of_application: string | null
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          precedent_authority_level: string | null
          procedural_aspect: string | null
          ratio_decidendi: string | null
          related_cases: string[] | null
          source_name: string | null
          source_url: string | null
          summary_hy: string | null
          text_hy: string | null
          title: string
          translation_errors: string | null
          translation_provider: string | null
          translation_status: string | null
          translation_ts: string | null
          tsv: unknown
          updated_at: string
          uploaded_by: string | null
          violation_type: string | null
          visibility: string
        }[]
        SetofOptions: {
          from: "*"
          to: "legal_practice_kb"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_api_usage: {
        Args: {
          _estimated_cost?: number
          _metadata?: Json
          _model_name?: string
          _service_type: string
          _tokens_used?: number
        }
        Returns: string
      }
      log_audit: {
        Args: {
          _action: string
          _details?: Json
          _record_id?: string
          _table_name?: string
        }
        Returns: string
      }
      log_error: {
        Args: {
          _case_id?: string
          _error_details?: Json
          _error_message: string
          _error_type: string
          _file_id?: string
        }
        Returns: string
      }
      match_knowledge_base: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: Database["public"]["Enums"]["kb_category"]
          content_text: string
          id: string
          similarity: number
          source_name: string
          title: string
          version_date: string
        }[]
      }
      match_legal_practice: {
        Args: {
          category_filter?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          applied_articles: Json
          case_number_anonymized: string
          content_snippet: string
          court_name: string
          court_type: Database["public"]["Enums"]["court_type"]
          decision_date: string
          id: string
          key_violations: string[]
          legal_reasoning_summary: string
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          similarity: number
          title: string
        }[]
      }
      normalize_hy: { Args: { input: string }; Returns: string }
      pipeline_job_monitor: {
        Args: never
        Returns: {
          job_count: number
          job_type: string
          newest_job: string
          oldest_job: string
          source_table: string
          status: string
        }[]
      }
      pipeline_pending_counts: { Args: never; Returns: Json }
      release_backfill_lock: { Args: never; Returns: undefined }
      release_pipeline_lock: { Args: never; Returns: undefined }
      replace_doc_chunks: {
        Args: { _doc_id: string; _source?: string; _target_version?: string }
        Returns: number
      }
      retrieve_decrypted_pii: {
        Args: { p_field_name: string; p_user_id: string }
        Returns: string
      }
      search_kb_chunks: {
        Args: {
          p_category?: string
          p_chunks_per_doc?: number
          p_limit_chunks?: number
          p_limit_docs?: number
          p_query: string
        }
        Returns: Json
      }
      search_knowledge_base: {
        Args: {
          reference_date?: string
          result_limit?: number
          search_query: string
        }
        Returns: {
          category: Database["public"]["Enums"]["kb_category"]
          content_text: string
          effective_from: string
          effective_to: string
          id: string
          is_current: boolean
          rank: number
          source_name: string
          title: string
          version_date: string
        }[]
      }
      search_legal_chunks: {
        Args: {
          filter_chunk_types?: string[]
          filter_doc_types?: string[]
          filter_norm_article?: string
          legislation_budget?: number
          match_count?: number
          match_threshold?: number
          practice_budget?: number
          query_embedding: string
        }
        Returns: Json
      }
      search_legal_practice: {
        Args: {
          category?: Database["public"]["Enums"]["practice_category"]
          court?: Database["public"]["Enums"]["court_type"]
          result_limit?: number
          search_query: string
        }
        Returns: {
          applied_articles: Json
          content_snippet: string
          court_type: Database["public"]["Enums"]["court_type"]
          id: string
          key_violations: string[]
          legal_reasoning_summary: string
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          relevance_rank: number
          title: string
        }[]
      }
      search_legal_practice_chunks: {
        Args: {
          category_filter?: string
          p_chunks_per_doc?: number
          p_limit_chunks?: number
          p_limit_docs?: number
          p_query: string
        }
        Returns: Json
      }
      search_legal_practice_kb: {
        Args: {
          category_filter?: string
          limit_docs?: number
          search_query: string
        }
        Returns: {
          applied_articles: Json
          chunk_index_meta: Json
          content_chunks: string[]
          court_type: Database["public"]["Enums"]["court_type"]
          decision_map: Json
          description: string
          id: string
          key_paragraphs: Json
          key_violations: string[]
          legal_reasoning_summary: string
          outcome: Database["public"]["Enums"]["case_outcome"]
          practice_category: Database["public"]["Enums"]["practice_category"]
          relevance_score: number
          title: string
          total_chunks: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_case: { Args: { p_case_id: string }; Returns: undefined }
      soft_delete_case_file: { Args: { p_file_id: string }; Returns: undefined }
      store_encrypted_pii: {
        Args: { p_field_name: string; p_user_id: string; p_value: string }
        Returns: boolean
      }
      try_acquire_pipeline_lock: { Args: never; Returns: boolean }
      try_backfill_lock: { Args: never; Returns: boolean }
      user_can_access_case: { Args: { _case_id: string }; Returns: boolean }
      user_can_access_case_as: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      agent_run_status: "pending" | "running" | "completed" | "failed"
      agent_type:
        | "evidence_collector"
        | "evidence_admissibility"
        | "charge_qualification"
        | "procedural_violations"
        | "substantive_violations"
        | "defense_strategy"
        | "prosecution_weaknesses"
        | "rights_violations"
        | "aggregator"
      app_role: "admin" | "lawyer" | "client" | "auditor"
      case_outcome:
        | "granted"
        | "rejected"
        | "partial"
        | "remanded"
        | "discontinued"
      case_priority: "low" | "medium" | "high" | "urgent"
      case_status: "open" | "in_progress" | "pending" | "closed" | "archived"
      case_type: "criminal" | "civil" | "administrative" | "echr"
      court_type:
        | "first_instance"
        | "appeal"
        | "cassation"
        | "constitutional"
        | "echr"
      document_category:
        | "general"
        | "civil_process"
        | "criminal_process"
        | "administrative_process"
        | "constitutional"
        | "international"
        | "pre_trial"
        | "contract"
      evidence_status:
        | "admissible"
        | "inadmissible"
        | "questionable"
        | "pending_review"
      evidence_type:
        | "document"
        | "testimony"
        | "expert_conclusion"
        | "physical"
        | "protocol"
        | "audio_video"
        | "other"
      kb_category:
        | "constitution"
        | "civil_code"
        | "criminal_code"
        | "labor_code"
        | "family_code"
        | "administrative_code"
        | "tax_code"
        | "court_practice"
        | "legal_commentary"
        | "other"
        | "criminal_procedure_code"
        | "civil_procedure_code"
        | "administrative_procedure_code"
        | "administrative_violations_code"
        | "land_code"
        | "forest_code"
        | "water_code"
        | "urban_planning_code"
        | "electoral_code"
        | "state_duty_law"
        | "citizenship_law"
        | "public_service_law"
        | "human_rights_law"
        | "anti_corruption_body_law"
        | "corruption_prevention_law"
        | "mass_media_law"
        | "education_law"
        | "healthcare_law"
        | "echr"
        | "eaeu_customs_code"
        | "judicial_code"
        | "constitutional_law"
        | "real_estate_code"
        | "housing_code"
        | "criminal_economic_code"
        | "justice_ministry_code"
        | "economic_code"
        | "cassation_criminal"
        | "cassation_civil"
        | "cassation_administrative"
        | "subsoil_code"
        | "penal_enforcement_code"
        | "constitutional_court_decisions"
        | "echr_judgments"
        | "government_decisions"
        | "central_electoral_commission_decisions"
        | "prime_minister_decisions"
        | "arlis_am"
        | "datalex_am"
        | "ministry_of_health"
        | "statistics_registry_decisions"
      practice_category:
        | "criminal"
        | "civil"
        | "administrative"
        | "echr"
        | "constitutional"
        | "bankruptcy"
      reminder_status: "active" | "completed" | "dismissed"
      reminder_type: "court_hearing" | "deadline" | "task" | "meeting" | "other"
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
      agent_run_status: ["pending", "running", "completed", "failed"],
      agent_type: [
        "evidence_collector",
        "evidence_admissibility",
        "charge_qualification",
        "procedural_violations",
        "substantive_violations",
        "defense_strategy",
        "prosecution_weaknesses",
        "rights_violations",
        "aggregator",
      ],
      app_role: ["admin", "lawyer", "client", "auditor"],
      case_outcome: [
        "granted",
        "rejected",
        "partial",
        "remanded",
        "discontinued",
      ],
      case_priority: ["low", "medium", "high", "urgent"],
      case_status: ["open", "in_progress", "pending", "closed", "archived"],
      case_type: ["criminal", "civil", "administrative", "echr"],
      court_type: [
        "first_instance",
        "appeal",
        "cassation",
        "constitutional",
        "echr",
      ],
      document_category: [
        "general",
        "civil_process",
        "criminal_process",
        "administrative_process",
        "constitutional",
        "international",
        "pre_trial",
        "contract",
      ],
      evidence_status: [
        "admissible",
        "inadmissible",
        "questionable",
        "pending_review",
      ],
      evidence_type: [
        "document",
        "testimony",
        "expert_conclusion",
        "physical",
        "protocol",
        "audio_video",
        "other",
      ],
      kb_category: [
        "constitution",
        "civil_code",
        "criminal_code",
        "labor_code",
        "family_code",
        "administrative_code",
        "tax_code",
        "court_practice",
        "legal_commentary",
        "other",
        "criminal_procedure_code",
        "civil_procedure_code",
        "administrative_procedure_code",
        "administrative_violations_code",
        "land_code",
        "forest_code",
        "water_code",
        "urban_planning_code",
        "electoral_code",
        "state_duty_law",
        "citizenship_law",
        "public_service_law",
        "human_rights_law",
        "anti_corruption_body_law",
        "corruption_prevention_law",
        "mass_media_law",
        "education_law",
        "healthcare_law",
        "echr",
        "eaeu_customs_code",
        "judicial_code",
        "constitutional_law",
        "real_estate_code",
        "housing_code",
        "criminal_economic_code",
        "justice_ministry_code",
        "economic_code",
        "cassation_criminal",
        "cassation_civil",
        "cassation_administrative",
        "subsoil_code",
        "penal_enforcement_code",
        "constitutional_court_decisions",
        "echr_judgments",
        "government_decisions",
        "central_electoral_commission_decisions",
        "prime_minister_decisions",
        "arlis_am",
        "datalex_am",
        "ministry_of_health",
        "statistics_registry_decisions",
      ],
      practice_category: [
        "criminal",
        "civil",
        "administrative",
        "echr",
        "constitutional",
        "bankruptcy",
      ],
      reminder_status: ["active", "completed", "dismissed"],
      reminder_type: ["court_hearing", "deadline", "task", "meeting", "other"],
    },
  },
} as const
