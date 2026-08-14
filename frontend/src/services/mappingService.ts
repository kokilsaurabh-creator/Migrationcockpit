// frontend/src/services/mappingService.ts
import { supabase } from './supabaseClient';
import { FieldMapping, MappingType, MasterType } from '../types';
import { getLegacyViewInfo, getTechnicalFieldName, isFieldInMasterSchema } from '../utils/schemaLoader';
import { isProjectMasterLocked, isProjectMasterLockedAsync } from './projectService';

export async function fetchMappingsForProject(
  projectName: string,
  masterType: MasterType = 'Material Master'
): Promise<FieldMapping[]> {
  try {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('field_mappings')
        .select('*')
        .eq('project_name', projectName)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error || !data) break;
      allData = allData.concat(data);
      if (data.length < pageSize) break;
      page++;
      if (page >= 10) break;
    }

    // Filter out rows that do not belong to masterType schema
    const filteredData = allData.filter((item) =>
      isFieldInMasterSchema(item.view_name, item.field_name, masterType)
    );

    // Normalize field_name to technical SAP field name for all returned items
    const normalizedData = filteredData.map((item) => {
      const techKey = getTechnicalFieldName(item.field_name, masterType);
      return {
        ...item,
        field_name: techKey || item.field_name
      };
    });

    return normalizedData as FieldMapping[];
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
  items: FieldMappingItem[],
  masterType: MasterType = 'Material Master'
): Promise<{ count: number; error?: string }> {
  if (!projectName || !viewName || items.length === 0) return { count: 0 };
  
  const isLocked = await isProjectMasterLockedAsync(projectName, masterType);
  if (isLocked) {
    return {
      count: 0,
      error: `Project '${projectName}' is locked by Admin for '${masterType}'. Changes cannot be saved.`
    };
  }

  try {
    const [cleanViewName] = getLegacyViewInfo(viewName);

    // Fetch existing rows for this project to inspect existing IDs and purge duplicates
    const { data: existingRows } = await supabase
      .from('field_mappings')
      .select('id, sap_structure, view_name, field_name')
      .eq('project_name', projectName);

    let savedCount = 0;
    let lastError: string | undefined = undefined;

    for (const item of items) {
      if (!isFieldInMasterSchema(viewName, item.fieldName, masterType)) {
        console.warn(`Skipping saving field '${item.fieldName}' as it is not valid for view '${viewName}' in ${masterType}`);
        continue;
      }
      const valToSave = item.fixedValue || item.sourceField || '';
      const techKey = (getTechnicalFieldName(item.fieldName, masterType) || item.fieldName).trim();
      const desc = (item.fieldDescription || '').trim();

      // Find all matching existing rows for this project (by technical key or description string)
      const allFieldMatches = (existingRows || []).filter((m) => {
        const mKey = m.field_name.trim().toLowerCase();
        return mKey === techKey.toLowerCase() || (desc && mKey === desc.toLowerCase());
      });

      // Prefer exact techKey match or view match as main existing record
      let mainExisting: any = allFieldMatches.find((m) => {
        const [cleanMView] = getLegacyViewInfo(m.view_name);
        const isViewMatch = m.view_name === viewName || cleanMView === cleanViewName;
        return isViewMatch && m.field_name.trim().toLowerCase() === techKey.toLowerCase();
      }) || allFieldMatches[0];

      // Delete any duplicate extra rows (e.g. legacy description rows) from Supabase
      if (allFieldMatches.length > 1) {
        const extraIds = allFieldMatches
          .filter((r) => r.id !== mainExisting?.id)
          .map((r) => r.id);
        if (extraIds.length > 0) {
          await supabase.from('field_mappings').delete().in('id', extraIds);
        }
      }

      const payload = {
        project_name: projectName,
        sap_structure: mainExisting?.sap_structure || cleanViewName || viewName,
        view_name: mainExisting?.view_name || viewName,
        field_name: techKey,
        mapping_type: item.mappingType,
        fixed_value: item.mappingType === 'Fixed Values' ? (item.fixedValue || '') : item.mappingType === 'Based on User Input' ? (item.sourceField || item.fixedValue || '') : '',
        is_mandatory: !!item.isMandatory
      };

      if (mainExisting && mainExisting.id) {
        const { error } = await supabase
          .from('field_mappings')
          .update(payload)
          .eq('id', mainExisting.id);
        if (!error) {
          savedCount++;
        } else {
          console.error('Supabase update error, falling back to upsert:', error);
          const { error: upsertErr } = await supabase
            .from('field_mappings')
            .upsert([payload], { onConflict: 'project_name,sap_structure,field_name' });
          if (!upsertErr) {
            savedCount++;
          } else {
            console.error('Supabase upsert error:', upsertErr);
            lastError = upsertErr.message || JSON.stringify(upsertErr);
          }
        }
      } else {
        const { error } = await supabase
          .from('field_mappings')
          .upsert([payload], { onConflict: 'project_name,sap_structure,field_name' });
        if (!error) {
          savedCount++;
        } else {
          console.error('Supabase upsert error:', error);
          lastError = error.message || JSON.stringify(error);
        }
      }
    }

    return { count: savedCount, error: lastError };
  } catch (err: any) {
    console.error('Error in saveMappingsBatch:', err);
    return { count: 0, error: err?.message || String(err) };
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
  const result = await saveMappingsBatch(projectName, viewName, [
    {
      fieldName,
      mappingType,
      sourceField,
      fixedValue,
      isMandatory
    }
  ]);
  return result.count > 0;
}
