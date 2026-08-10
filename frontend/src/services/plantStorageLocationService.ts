// frontend/src/services/plantStorageLocationService.ts
import { supabase } from './supabaseClient';

export interface PlantSLocMapping {
  id?: string;
  project_name: string;
  plant_code: string;
  storage_location_code: string;
  created_at?: string;
}

/**
 * Fetches all Plant to Storage Location mappings for a given project from Supabase.
 */
export async function fetchPlantSLocMappings(projectName: string): Promise<PlantSLocMapping[]> {
  if (!projectName) return [];
  try {
    const { data, error } = await supabase
      .from('PlantStorageLocationMapping')
      .select('*')
      .eq('project_name', projectName)
      .order('plant_code', { ascending: true })
      .order('storage_location_code', { ascending: true });

    if (error) {
      console.error('Error fetching Plant-SLoc mappings:', error);
      return [];
    }
    return (data || []) as PlantSLocMapping[];
  } catch (err) {
    console.error('Exception fetching Plant-SLoc mappings:', err);
    return [];
  }
}

/**
 * Bulk uploads / upserts Plant to Storage Location mappings into Supabase.
 */
export async function uploadPlantSLocMappingsBatch(
  projectName: string,
  items: { plant_code: string; storage_location_code: string }[]
): Promise<{ addedCount: number; error?: string }> {
  if (!projectName || items.length === 0) return { addedCount: 0 };
  try {
    // 1. Fetch existing mappings to avoid duplicate insertions
    const existing = await fetchPlantSLocMappings(projectName);
    const existingSet = new Set(
      existing.map((row) => `${row.plant_code.trim().toUpperCase()}||${row.storage_location_code.trim().toUpperCase()}`)
    );

    const toInsert: { project_name: string; plant_code: string; storage_location_code: string }[] = [];

    for (const item of items) {
      const p = (item.plant_code || '').trim().toUpperCase();
      const s = (item.storage_location_code || '').trim().toUpperCase();

      if (!p || p === 'NAN' || p === 'NULL') continue;

      const key = `${p}||${s}`;
      if (!existingSet.has(key)) {
        toInsert.push({
          project_name: projectName,
          plant_code: p,
          storage_location_code: s
        });
        existingSet.add(key);
      }
    }

    if (toInsert.length === 0) {
      return { addedCount: 0 };
    }

    // Insert in chunks of 500
    const chunkSize = 500;
    let addedCount = 0;

    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const { error } = await supabase.from('PlantStorageLocationMapping').insert(chunk);

      if (error) {
        console.error('Supabase batch insert error:', error);
        return { addedCount, error: error.message || JSON.stringify(error) };
      }
      addedCount += chunk.length;
    }

    return { addedCount };
  } catch (err: any) {
    console.error('Exception in uploadPlantSLocMappingsBatch:', err);
    return { addedCount: 0, error: err?.message || String(err) };
  }
}

/**
 * Deletes a single Plant-SLoc mapping record by ID.
 */
export async function deletePlantSLocMapping(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('PlantStorageLocationMapping')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting Plant-SLoc mapping:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception deleting Plant-SLoc mapping:', err);
    return false;
  }
}

/**
 * Clears all Plant-SLoc mappings for a specific project.
 */
export async function clearProjectPlantSLocMappings(projectName: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('PlantStorageLocationMapping')
      .delete()
      .eq('project_name', projectName);

    if (error) {
      console.error('Error clearing Plant-SLoc mappings:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception clearing Plant-SLoc mappings:', err);
    return false;
  }
}

/**
 * Generates and triggers download of CSV template file for Plant to Storage Location mapping.
 */
export function downloadPlantSLocCsvTemplate(): void {
  const csvHeader = 'Plant Code,Storage Location Code\n';
  const csvSampleRows = '1000,0001\n1000,0002\n2000,0001\n2000,0002\n';
  const blob = new Blob([csvHeader + csvSampleRows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'Plant_Storage_Location_Mapping_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Exports existing Plant-SLoc mappings for a project to a downloadable CSV file.
 */
export function exportPlantSLocMappingsCsv(projectName: string, items: PlantSLocMapping[]): void {
  let csvContent = 'Plant Code,Storage Location Code,Created At\n';

  items.forEach((item) => {
    const p = item.plant_code || '';
    const s = item.storage_location_code || '';
    const c = item.created_at || '';
    csvContent += `"${p}","${s}","${c}"\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${projectName}_Plant_Storage_Location_Mappings.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
