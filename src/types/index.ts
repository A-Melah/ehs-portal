// ─── Database Entity Types ────────────────────────────────────────────────────

export type UserRole = 'inspector' | 'ehs_manager' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  created_at: string;
}

export type AssetStatus = 'active' | 'inactive' | 'maintenance';

export interface Asset {
  id: string;
  tag_number: string;
  name: string;
  type: string;
  location: string;
  status?: AssetStatus; // Added '?' to make it optional
  qr_code?: string;
  created_at?: string;  // Added '?' to make it optional
}

export interface Regulation {
  id: string;
  statute_title: string;
  section: string;
  content: string;
  embedding?: number[];
  created_at: string;
}

export interface ChecklistTemplate {
  id: string;
  asset_type: string;
  question_text: string;
  category: string;
  is_critical: boolean;
  legal_ref_id?: string;
  regulation?: Regulation;
  order_index: number;
}

export type ComplianceScore = number; // 0–100

export interface Inspection {
  id: string;
  asset_id: string;
  inspector_id: string;
  compliance_score: ComplianceScore;
  status: 'in_progress' | 'completed' | 'flagged';
  notes?: string;
  created_at: string;
  asset?: Asset;
  inspector?: User;
  responses?: Response[];
}

export interface Response {
  id: string;
  inspection_id: string;
  question_id: string;
  value: boolean; // pass = true, fail = false
  media_url?: string;
  ai_verdict?: string;
  ai_breach_level?: 'none' | 'minor' | 'moderate' | 'critical';
  created_at: string;
  question?: ChecklistTemplate;
}

// ─── AI / RAG Types ───────────────────────────────────────────────────────────

export interface AIAuditResult {
  breach_detected: boolean;
  breach_level: 'none' | 'minor' | 'moderate' | 'critical';
  legal_references: string[];
  verdict: string;
  recommended_actions: string[];
}

// ─── Dashboard / Analytics Types ──────────────────────────────────────────────

export interface ComplianceSummary {
  total_inspections: number;
  average_score: number;
  critical_failures: number;
  assets_inspected: number;
}

export interface HeatmapCell {
  asset_id: string;
  asset_name: string;
  date: string;
  score: number;
}

export interface IncidentTrend {
  date: string;
  minor: number;
  moderate: number;
  critical: number;
}

// ─── Form / UI Types ──────────────────────────────────────────────────────────

export interface InspectionFormState {
  asset_id: string;
  responses: Record<string, { value: boolean | null; media_url?: string }>;
}
