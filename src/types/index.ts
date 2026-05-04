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
  status: AssetStatus;
  qr_code?: string;
  created_at: string;
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

// ─── Hazard Report Types ──────────────────────────────────────────────────────

export type HazardSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type HazardStatus   = 'open' | 'in_review' | 'resolved';

export interface HazardReport {
  id: string;
  reporter_id: string | null;  // null = anonymous submission
  location: string;
  description: string;
  severity: HazardSeverity;
  evidence_url?: string;
  status: HazardStatus;
  created_at: string;
  reporter?: User;
}

// ─── Compliance Audit Types ───────────────────────────────────────────────────

export type ComplianceArea = 'Safety' | 'Health' | 'Environment';
export type LineItemStatus = 'compliant' | 'non_compliant' | 'not_applicable' | 'not_assessed';
export type AuditStatus    = 'in_progress' | 'completed' | 'submitted';

export interface FacilitySection {
  id:          string;
  name:        string;
  description: string;
  active:      boolean;
  order_index: number;
}

export interface LegalRequirement {
  id:                   string;
  area:                 ComplianceArea;
  legal_document:       string;
  source_section:       string;
  specific_requirement: string;
  compliance_measures:  string;
  owner:                string;
  default_frequency:    string;
  applies_to_sections:  string[];
}

export interface ComplianceAudit {
  id:            string;
  title:         string;
  auditor_id:    string;
  sections:      string[];
  status:        AuditStatus;
  overall_score: number | null;
  notes:         string | null;
  period:        string | null;
  created_at:    string;
  completed_at:  string | null;
  auditor?:      User;
}

export interface AuditLineItem {
  id:                 string;
  audit_id:           string;
  requirement_id:     string;
  section:            string;
  status:             LineItemStatus;
  inspector_notes:    string | null;
  evidence_url:       string | null;
  ai_verdict:         string | null;
  ai_override_status: LineItemStatus | null;
  ai_override_reason: string | null;
  responsible_person: string | null;
  due_date:           string | null;
  requirement?:       LegalRequirement;
}

export interface ComplianceSummaryByArea {
  area:          ComplianceArea;
  total:         number;
  compliant:     number;
  non_compliant: number;
  not_assessed:  number;
  score:         number;
}