// frontend/src/types/index.ts

export type Role = 'Admin' | 'User';

export type MasterType = 'Material Master' | 'Vendor Master' | 'Customer Master';

export interface AppUser {
  id: string;
  username: string;
  role: Role;
  is_locked: boolean;
  created_at?: string;
}

export interface MigrationProject {
  id?: string;
  project_name: string;
  master_type: MasterType;
  created_at?: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  project_name: string;
  master_type: MasterType;
}

export type MappingType =
  | 'Blank (Default)'
  | 'Keep Blank'
  | 'Fixed Values'
  | 'Based on Fixed Rules'
  | 'Based on User Input';

export interface FieldMapping {
  id?: string;
  project_name: string;
  view_name: string;
  field_name: string;
  mapping_type: MappingType;
  source_field?: string;
  fixed_value?: string;
  is_mandatory: boolean;
}

export interface SchemaField {
  field_name: string;
  description: string;
  data_type?: string;
  length?: string;
  is_mandatory: boolean;
}

export interface MasterSchema {
  [sheetName: string]: SchemaField[];
}

export interface FixedRuleRecord {
  id?: string;
  project_name?: string;
  master_type?: MasterType;
  [key: string]: any;
}

export interface MasterConfig {
  baseColumns: string[];
  ruleKeys: string[];
  primaryKey: string;
  xmlTemplateFile: string;
  badgeColor: string;
  badgeBg: string;
}

export interface SAPProjectConfig {
  project_id: string;
  project_name: string;
  base_url: string;
  bp_comm_user: string;
  bp_password_masked: string;
  material_comm_user: string;
  material_password_masked: string;
  custom_pan_endpoint?: string | null;
  pan_comm_user?: string | null;
  pan_password_masked?: string | null;
}

export interface ProjectConfigCreatePayload {
  project_id: string;
  project_name: string;
  base_url: string;
  bp_comm_user: string;
  bp_password?: string;
  material_comm_user: string;
  material_password?: string;
  custom_pan_endpoint?: string;
  pan_comm_user?: string;
  pan_password?: string;
}

export interface TestConnectionPayload {
  project_id?: string;
  service_type: 'BP' | 'MATERIAL' | 'PAN';
  base_url?: string;
  comm_user?: string;
  password?: string;
  custom_pan_endpoint?: string;
}

export interface TestConnectionResult {
  success: boolean;
  service_type: string;
  message: string;
  status_code: number;
}

export interface MatchedSAPRecord {
  sap_id: string;
  record_name: string;
  match_tier: 'HARD' | 'SOFT';
  match_reason: string;
  similarity_score: number;
  details: Record<string, any>;
}

export interface DuplicateCheckResult {
  has_duplicates: boolean;
  highest_risk_tier: 'HARD' | 'SOFT' | 'NONE';
  matches: MatchedSAPRecord[];
  summary: string;
}

export interface GenerationException {
  rowIndex: number;
  fieldName: string;
  expectedRule: string;
  currentValue: string;
}

export interface DataSanityException {
  id: string;
  rowIndex: number;
  checkType: 'PAN Format' | 'PIN Code Country' | 'GST-PAN Match';
  fieldName: string;
  viewName?: string;
  currentValue: string;
  message: string;
  allowed: boolean;
}
