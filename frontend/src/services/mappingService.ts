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

export interface FieldMappingItem {
  fieldName: string;
  fieldDescription?: string;
  mappingType: MappingType;
  sourceField?: string;
  fixedValue?: string;
  isMandatory?: boolean;
}

export async function saveMappingsBatch(
  projectName: string,
  viewName: string,
  items: FieldMappingItem[]
): Promise<number> {
  if (!projectName || !viewName || items.length === 0) return 0;
  try {
    const [cleanViewName] = getLegacyViewInfo(viewName);

    // Fetch existing rows for this project to inspect existing IDs and purge duplicates
    const { data: existingRows } = await supabase
      .from('field_mappings')
      .select('id, sap_structure, view_name, field_name')
      .eq('project_name', projectName);

    let savedCount = 0;

    for (const item of items) {
      const valToSave = item.fixedValue || item.sourceField || '';
      const techKey = item.fieldName.trim();
      const desc = (item.fieldDescription || '').trim();

      // Find matching rows for this view + field (either technical key or description)
      const matchingRows = (existingRows || []).filter((m) => {
        const [cleanMView] = getLegacyViewInfo(m.view_name);
        const isViewMatch = m.view_name === viewName || cleanMView === cleanViewName;
        const mKey = m.field_name.trim().toLowerCase();
        const isFieldMatch =
          mKey === techKey.toLowerCase() ||
          (desc && mKey === desc.toLowerCase());
        return isViewMatch && isFieldMatch;
      });

      const mainExisting = matchingRows[0];

      // Delete any duplicate extra rows from Supabase
      if (matchingRows.length > 1) {
        const extraIds = matchingRows.slice(1).map((r) => r.id);
        await supabase.from('field_mappings').delete().in('id', extraIds);
      }

      const payload = {
        project_name: projectName,
        sap_structure: mainExisting?.sap_structure || 'UNKNOWN',
        view_name: mainExisting?.view_name || viewName,
        field_name: techKey,
        mapping_type: item.mappingType,
        fixed_value: valToSave,
        is_mandatory: !!item.isMandatory
      };

      if (mainExisting && mainExisting.id) {
        const { error } = await supabase
          .from('field_mappings')
          .update(payload)
          .eq('id', mainExisting.id);
        if (!error) savedCount++;
      } else {
        const { error } = await supabase
          .from('field_mappings')
          .insert([payload]);
        if (!error) savedCount++;
      }
    }

    return savedCount;
  } catch (err) {
    console.error('Error in saveMappingsBatch:', err);
    return 0;
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
  const count = await saveMappingsBatch(projectName, viewName, [
    {
      fieldName,
      mappingType,
      sourceField,
      fixedValue,
      isMandatory
    }
  ]);
  return count > 0;
}
