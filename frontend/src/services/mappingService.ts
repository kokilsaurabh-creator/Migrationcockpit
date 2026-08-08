// frontend/src/services/mappingService.ts
import { supabase } from './supabaseClient';
import { FieldMapping, MappingType } from '../types';
import { getLegacyViewInfo } from '../utils/schemaLoader';

export async function fetchMappingsForProject(projectName: string): Promise<FieldMapping[]> {
  try {
    const { data, error } = await supabase
      .from('field_mappings')
      .select('*')
      .eq('project_name', projectName);

    if (error || !data) return [];
    return data as FieldMapping[];
  } catch (err) {
    console.error('Error fetching mappings:', err);
    return [];
  }
}

export async function saveMapping(
  projectName: string,
  viewName: string,
  fieldName: string,
  mappingType: MappingType,
  sourceField: string,
  fixedValue: string,
  isMandatory: boolean
): Promise<boolean> {
  try {
    const valToSave = fixedValue || sourceField || '';
    const [cleanViewName] = getLegacyViewInfo(viewName);

    // Fetch existing mappings for this project to check if a row already exists
    const { data: existingRows } = await supabase
      .from('field_mappings')
      .select('id, sap_structure, view_name, field_name')
      .eq('project_name', projectName);

    const existing = existingRows?.find((m) => {
      const [cleanMView] = getLegacyViewInfo(m.view_name);
      const isViewMatch = m.view_name === viewName || cleanMView === cleanViewName;
      const isFieldMatch =
        m.field_name.trim().toLowerCase() === fieldName.trim().toLowerCase() ||
        (sourceField && m.field_name.trim().toLowerCase() === sourceField.trim().toLowerCase());
      return isViewMatch && isFieldMatch;
    });

    const payload: any = {
      project_name: projectName,
      sap_structure: existing?.sap_structure || 'UNKNOWN',
      view_name: existing?.view_name || viewName,
      field_name: fieldName,
      mapping_type: mappingType,
      fixed_value: valToSave,
      is_mandatory: isMandatory
    };

    let error;
    if (existing && existing.id) {
      const res = await supabase
        .from('field_mappings')
        .update(payload)
        .eq('id', existing.id);
      error = res.error;
    } else {
      const res = await supabase
        .from('field_mappings')
        .insert([payload]);
      error = res.error;
    }

    if (error) {
      console.error(`Error saving mapping for ${fieldName}:`, error);
    }
    return !error;
  } catch (err) {
    console.error(`Error saving mapping for ${fieldName}:`, err);
    return false;
  }
}
