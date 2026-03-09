import type { Database } from '@/integrations/supabase/types';

export type KbCategory = Database['public']['Enums']['kb_category'];

// Filtered list of categories to display in the UI
export const allowedCategories: KbCategory[] = [
  'eaeu_customs_code',
  'forest_code',
  'labor_code',
  'judicial_code',
  'subsoil_code',
  'family_code',
  'electoral_code',
  'tax_code',
  'land_code',
  'water_code',
  'constitution',
  'administrative_procedure_code',
  'civil_procedure_code',
  'civil_code',
  'criminal_procedure_code',
  'criminal_code',
  'penal_enforcement_code',
  'echr',
  'administrative_violations_code',
  'cassation_criminal',
  'cassation_civil',
  'cassation_administrative',
  'constitutional_court_decisions',
  'echr_judgments',
  'government_decisions',
  'central_electoral_commission_decisions',
  'prime_minister_decisions',
  'arlis_am',
  'datalex_am',
  'ministry_of_health',
  'statistics_registry_decisions',
];

export const kbCategoryOptions = allowedCategories.map((value) => ({
  value,
  labelKey: `category_${value}`,
}));
