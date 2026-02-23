export type UserRole = 'teacher' | 'student' | 'admin';
export type CourseStatus = 'draft' | 'processing' | 'ready' | 'failed';
export type AssetStatus = 'uploaded' | 'processing' | 'processed' | 'failed';
export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string;
          name: string;
          owner_id: string | null;
          settings: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id?: string | null;
          settings?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string | null;
          settings?: Record<string, any>;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          school_id: string | null;
          avatar_url: string | null;
          email: string | null;
          phone: string | null;
          bio: string | null;
          last_login_at: string | null;
          is_active: boolean;
          preferences: Record<string, any>;
          metadata: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          full_name: string;
          school_id?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          phone?: string | null;
          bio?: string | null;
          last_login_at?: string | null;
          is_active?: boolean;
          preferences?: Record<string, any>;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          full_name?: string;
          school_id?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          phone?: string | null;
          bio?: string | null;
          last_login_at?: string | null;
          is_active?: boolean;
          preferences?: Record<string, any>;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      courses: {
        Row: {
          id: string;
          school_id: string;
          owner_id: string;
          title: string;
          description: string;
          status: CourseStatus;
          settings: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          owner_id: string;
          title: string;
          description?: string;
          status?: CourseStatus;
          settings?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          owner_id?: string;
          title?: string;
          description?: string;
          status?: CourseStatus;
          settings?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      course_assets: {
        Row: {
          id: string;
          course_id: string;
          file_type: string;
          storage_path: string;
          original_name: string;
          size_bytes: number;
          status: AssetStatus;
          metadata: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          file_type: string;
          storage_path: string;
          original_name: string;
          size_bytes?: number;
          status?: AssetStatus;
          metadata?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          file_type?: string;
          storage_path?: string;
          original_name?: string;
          size_bytes?: number;
          status?: AssetStatus;
          metadata?: Record<string, any>;
          created_at?: string;
        };
      };
      course_sections: {
        Row: {
          id: string;
          course_id: string;
          title: string;
          order_index: number;
          source_slide_id: string | null;
          metadata: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          title: string;
          order_index?: number;
          source_slide_id?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          title?: string;
          order_index?: number;
          source_slide_id?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
        };
      };
      course_pages: {
        Row: {
          id: string;
          course_id: string;
          section_id: string | null;
          order_index: number;
          html_content: string;
          source_refs: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          section_id?: string | null;
          order_index?: number;
          html_content?: string;
          source_refs?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          section_id?: string | null;
          order_index?: number;
          html_content?: string;
          source_refs?: Record<string, any>;
          created_at?: string;
        };
      };
      questions: {
        Row: {
          id: string;
          course_id: string;
          page_id: string | null;
          type: QuestionType;
          prompt: string;
          options: any[];
          suggested_answer: any;
          correct_answer: any;
          confidence: number;
          reviewed_by_teacher: boolean;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          page_id?: string | null;
          type?: QuestionType;
          prompt: string;
          options?: any[];
          suggested_answer?: any;
          correct_answer?: any;
          confidence?: number;
          reviewed_by_teacher?: boolean;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          page_id?: string | null;
          type?: QuestionType;
          prompt?: string;
          options?: any[];
          suggested_answer?: any;
          correct_answer?: any;
          confidence?: number;
          reviewed_by_teacher?: boolean;
          reviewed_at?: string | null;
          created_at?: string;
        };
      };
      shares: {
        Row: {
          id: string;
          course_id: string;
          share_token: string;
          expires_at: string | null;
          settings: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          share_token?: string;
          expires_at?: string | null;
          settings?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          share_token?: string;
          expires_at?: string | null;
          settings?: Record<string, any>;
          created_at?: string;
        };
      };
      attempts: {
        Row: {
          id: string;
          course_id: string;
          student_identifier: string;
          started_at: string;
          finished_at: string | null;
          score_percent: number | null;
          metadata: Record<string, any>;
        };
        Insert: {
          id?: string;
          course_id: string;
          student_identifier: string;
          started_at?: string;
          finished_at?: string | null;
          score_percent?: number | null;
          metadata?: Record<string, any>;
        };
        Update: {
          id?: string;
          course_id?: string;
          student_identifier?: string;
          started_at?: string;
          finished_at?: string | null;
          score_percent?: number | null;
          metadata?: Record<string, any>;
        };
      };
      answers: {
        Row: {
          id: string;
          attempt_id: string;
          question_id: string;
          selected_options: any[];
          is_correct: boolean;
          answered_at: string;
        };
        Insert: {
          id?: string;
          attempt_id: string;
          question_id: string;
          selected_options?: any[];
          is_correct?: boolean;
          answered_at?: string;
        };
        Update: {
          id?: string;
          attempt_id?: string;
          question_id?: string;
          selected_options?: any[];
          is_correct?: boolean;
          answered_at?: string;
        };
      };
      jobs: {
        Row: {
          id: string;
          course_id: string;
          asset_id: string | null;
          type: string;
          status: JobStatus;
          progress: number;
          error: string | null;
          metadata: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          asset_id?: string | null;
          type: string;
          status?: JobStatus;
          progress?: number;
          error?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          asset_id?: string | null;
          type?: string;
          status?: JobStatus;
          progress?: number;
          error?: string | null;
          metadata?: Record<string, any>;
          created_at?: string;
          updated_at?: string;
        };
      };
      processing_logs: {
        Row: {
          id: string;
          job_id: string;
          level: LogLevel;
          message: string;
          meta: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          level?: LogLevel;
          message: string;
          meta?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          level?: LogLevel;
          message?: string;
          meta?: Record<string, any>;
          created_at?: string;
        };
      };
      integrations: {
        Row: {
          id: string;
          school_id: string;
          provider: string;
          status: IntegrationStatus;
          tokens_encrypted: string | null;
          last_sync_at: string | null;
          settings: Record<string, any>;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          provider: string;
          status?: IntegrationStatus;
          tokens_encrypted?: string | null;
          last_sync_at?: string | null;
          settings?: Record<string, any>;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          provider?: string;
          status?: IntegrationStatus;
          tokens_encrypted?: string | null;
          last_sync_at?: string | null;
          settings?: Record<string, any>;
          created_at?: string;
        };
      };
    };
  };
}
