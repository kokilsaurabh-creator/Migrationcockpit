// frontend/src/services/rulesService.ts
import { supabase } from './supabaseClient';
import { FixedRuleRecord, MasterType } from '../types';

export async function fetchProjectRules(projectName: string, masterType: MasterType): Promise<FixedRuleRecord[]> {
  try {
    const { data, error } = await supabase
      .from('project_fixed_rules')
      .select('*')
      .eq('project_name', projectName)
      .eq('master_type', masterType);

    if (error || !data) return [];
    return data.map((r: any) => {
      const ruleObj = r.rule_data || {};
      return {
        id: r.id,
        project_name: r.project_name,
        master_type: r.master_type,
        ...ruleObj
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
      return {
        project_name: projectName,
        master_type: masterType,
        rule_data: ruleData
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
