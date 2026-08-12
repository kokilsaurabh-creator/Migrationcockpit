// frontend/src/services/rulesService.ts
import { supabase } from './supabaseClient';
import { FixedRuleRecord, MasterType } from '../types';
import { isKeyInMaster } from '../utils/schemaLoader';

export async function fetchProjectRules(projectName: string, masterType: MasterType): Promise<FixedRuleRecord[]> {
  try {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('project_fixed_rules')
        .select('*')
        .eq('project_name', projectName)
        .eq('master_type', masterType)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error || !data) break;
      
      allData = allData.concat(data);
      
      if (data.length < pageSize) break;
      
      page++;
      
      // Safety limit to prevent infinite loops (max 20k records = 20 pages)
      if (page >= 20) break;
    }

    return allData.map((r: any) => {
      const ruleObj = r.rule_data || {};
      const cleanRuleObj: Record<string, any> = {};

      for (const k of Object.keys(ruleObj)) {
        if (isKeyInMaster(k, masterType)) {
          cleanRuleObj[k] = ruleObj[k];
        }
      }

      return {
        id: r.id,
        project_name: r.project_name,
        master_type: r.master_type,
        ...cleanRuleObj
      };
    });
  } catch (err) {
    console.error('Error fetching rules:', err);
    return [];
  }
}

export async function saveProjectRules(
  projectName: string,
  masterType: MasterType,
  records: FixedRuleRecord[],
  onProgress?: (ratio: number) => void
): Promise<boolean> {
  try {
    // Delete existing rules for this project & master type to replace with new set
    await supabase
      .from('project_fixed_rules')
      .delete()
      .eq('project_name', projectName)
      .eq('master_type', masterType);

    const payload = records.map((r) => {
      const { id, project_name, master_type, ...ruleData } = r;
      const cleanRuleData: Record<string, any> = {};

      for (const k of Object.keys(ruleData)) {
        if (isKeyInMaster(k, masterType)) {
          cleanRuleData[k] = ruleData[k];
        }
      }

      return {
        project_name: projectName,
        master_type: masterType,
        rule_data: cleanRuleData
      };
    });

    const batchSize = 100;
    for (let i = 0; i < payload.length; i += batchSize) {
      const chunk = payload.slice(i, i + batchSize);
      await supabase.from('project_fixed_rules').insert(chunk);
      if (onProgress) {
        onProgress(Math.min((i + batchSize) / payload.length, 1.0));
      }
    }
    return true;
  } catch (err) {
    console.error('Error saving project rules:', err);
    return false;
  }
}

