// frontend/src/services/projectService.ts
import { supabase } from './supabaseClient';
import { MasterType, MigrationProject, UserPermission } from '../types';

export async function fetchProjects(): Promise<MigrationProject[]> {
  try {
    const { data, error } = await supabase.from('migration_projects').select('*');
    if (error || !data) return [];
    return data as MigrationProject[];
  } catch (err) {
    console.error('Error fetching projects:', err);
    return [];
  }
}

export async function fetchProjectsAndModulesForUser(userId: string, role: string): Promise<{
  projects: string[];
  allowedMastersMap: Record<string, MasterType[]>;
}> {
  const projects: string[] = [];
  const allowedMastersMap: Record<string, MasterType[]> = {};

  try {
    if (role === 'Admin') {
      const { data } = await supabase
        .from('migration_projects')
        .select('project_name, master_type');

      if (data) {
        for (const row of data) {
          const p = row.project_name;
          const m = row.master_type as MasterType;
          if (!projects.includes(p)) projects.push(p);
          if (!allowedMastersMap[p]) allowedMastersMap[p] = [];
          if (!allowedMastersMap[p].includes(m)) allowedMastersMap[p].push(m);
        }
      }
    } else {
      const { data } = await supabase
        .from('user_permissions')
        .select('project_name, master_type')
        .eq('user_id', userId);

      if (data) {
        for (const row of data) {
          const p = row.project_name;
          const m = row.master_type as MasterType;
          if (!projects.includes(p)) projects.push(p);
          if (!allowedMastersMap[p]) allowedMastersMap[p] = [];
          if (!allowedMastersMap[p].includes(m)) allowedMastersMap[p].push(m);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching projects:', err);
  }

  return { projects, allowedMastersMap };
}

export async function createProject(projectName: string, masterType: MasterType): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase.from('migration_projects').insert({
      project_name: projectName,
      master_type: masterType
    });

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchAllPermissions(): Promise<{
  permissions: UserPermission[];
  userMap: Record<string, string>;
}> {
  const { data: usersData } = await supabase.from('app_users').select('id, username').eq('role', 'User');
  const userMap: Record<string, string> = {};
  if (usersData) {
    usersData.forEach((u) => {
      userMap[u.id] = u.username;
    });
  }

  const { data: permsData } = await supabase.from('user_permissions').select('*');
  const permissions: UserPermission[] = permsData ? (permsData as UserPermission[]) : [];

  return { permissions, userMap };
}

export async function grantUserPermissions(
  userId: string,
  projects: string[],
  modules: MasterType[]
): Promise<number> {
  let count = 0;
  for (const project of projects) {
    for (const moduleType of modules) {
      try {
        const { error } = await supabase.from('user_permissions').upsert(
          {
            user_id: userId,
            project_name: project,
            master_type: moduleType
          },
          { onConflict: 'user_id,project_name,master_type' }
        );
        if (!error) count++;
      } catch (err) {
        console.error('Error granting perm:', err);
      }
    }
  }
  return count;
}

export async function revokePermission(permissionId: string): Promise<boolean> {
  const { error } = await supabase.from('user_permissions').delete().eq('id', permissionId);
  return !error;
}

export function isProjectMasterLocked(projectName: string, masterType: MasterType): boolean {
  if (!projectName || !masterType) return false;
  try {
    const pName = projectName.trim();
    const mType = masterType.trim();
    const specificVal = localStorage.getItem(`project_lock_${pName}__${mType}`);
    if (specificVal !== null) {
      return specificVal === 'true';
    }
    // Fallback: check global project lock
    const globalVal = localStorage.getItem(`project_lock_${pName}`);
    return globalVal === 'true';
  } catch (e) {
    return false;
  }
}

export function isProjectLocked(projectName: string, masterType?: MasterType): boolean {
  if (!projectName) return false;
  if (masterType) {
    return isProjectMasterLocked(projectName, masterType);
  }
  const masters: MasterType[] = ['Material Master', 'Vendor Master', 'Customer Master'];
  return masters.some((m) => isProjectMasterLocked(projectName, m));
}

export async function fetchProjectMasterLockStatuses(): Promise<Record<string, Record<string, boolean>>> {
  const result: Record<string, Record<string, boolean>> = {};
  try {
    // 1. Fetch from project_fixed_rules table with master_type = '__LOCK__' in Supabase
    const { data: lockRows } = await supabase
      .from('project_fixed_rules')
      .select('id, project_name, rule_data')
      .eq('master_type', '__LOCK__');

    if (lockRows && lockRows.length > 0) {
      lockRows.forEach((row: any) => {
        const pName = (row.project_name || '').trim();
        const ruleData = row.rule_data || {};
        if (pName) {
          if (!result[pName]) result[pName] = {};
          Object.keys(ruleData).forEach((mType) => {
            const isLocked = Boolean(ruleData[mType]);
            result[pName][mType] = isLocked;
            try {
              localStorage.setItem(`project_lock_${pName}__${mType}`, isLocked ? 'true' : 'false');
            } catch (e) {}
          });
        }
      });
    }
  } catch (e) {
    console.warn('Error fetching lock statuses from Supabase:', e);
  }

  // Fallback / merge with local storage cache
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('project_lock_')) {
        const raw = key.replace('project_lock_', '');
        if (raw.includes('__')) {
          const [pName, mType] = raw.split('__');
          if (!result[pName]) result[pName] = {};
          if (result[pName][mType] === undefined) {
            result[pName][mType] = localStorage.getItem(key) === 'true';
          }
        } else {
          const isLocked = localStorage.getItem(key) === 'true';
          if (!result[raw]) result[raw] = {};
          ['Material Master', 'Vendor Master', 'Customer Master'].forEach((m) => {
            if (result[raw][m] === undefined) {
              result[raw][m] = isLocked;
            }
          });
        }
      }
    }
  } catch (e) {}

  return result;
}

export async function fetchProjectLockStatuses(): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  try {
    const masterLocks = await fetchProjectMasterLockStatuses();
    Object.keys(masterLocks).forEach((pName) => {
      const locksObj = masterLocks[pName];
      result[pName] = Object.values(locksObj).some(Boolean);
    });
  } catch (e) {}
  return result;
}

export async function setProjectMasterLockStatus(
  projectName: string,
  masterType: MasterType,
  locked: boolean
): Promise<boolean> {
  try {
    const pName = projectName.trim();
    const mType = masterType.trim();

    // 1. Cache in local storage
    localStorage.setItem(`project_lock_${pName}__${mType}`, locked ? 'true' : 'false');

    // 2. Persist to project_fixed_rules table with master_type = '__LOCK__' in Supabase
    try {
      const { data: existing } = await supabase
        .from('project_fixed_rules')
        .select('id, rule_data')
        .eq('project_name', pName)
        .eq('master_type', '__LOCK__');

      if (existing && existing.length > 0) {
        const currentData = existing[0].rule_data || {};
        const updatedData = { ...currentData, [mType]: locked };
        await supabase
          .from('project_fixed_rules')
          .update({ rule_data: updatedData })
          .eq('id', existing[0].id);
      } else {
        await supabase.from('project_fixed_rules').insert({
          project_name: pName,
          master_type: '__LOCK__',
          rule_data: { [mType]: locked }
        });
      }
    } catch (e) {
      console.error('Failed to persist lock to Supabase:', e);
    }

    try {
      window.dispatchEvent(new Event('project_lock_updated'));
    } catch (e) {}
    return true;
  } catch (e) {
    console.warn('Error setting master lock status:', e);
    return false;
  }
}

export async function setProjectLockStatus(projectName: string, locked: boolean): Promise<boolean> {
  try {
    const pName = projectName.trim();
    localStorage.setItem('project_lock_' + pName, locked ? 'true' : 'false');
    const masters: MasterType[] = ['Material Master', 'Vendor Master', 'Customer Master'];

    for (const m of masters) {
      await setProjectMasterLockStatus(pName, m, locked);
    }

    try {
      window.dispatchEvent(new Event('project_lock_updated'));
    } catch (e) {}
    return true;
  } catch (e) {
    console.warn('Error setting project lock status:', e);
    return false;
  }
}

export async function deleteProject(projectName: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const cleanName = projectName.trim();

    // 1. Delete from migration_projects
    await supabase.from('migration_projects').delete().eq('project_name', cleanName);

    // 2. Delete permissions
    await supabase.from('user_permissions').delete().eq('project_name', cleanName);

    // 3. Delete field mappings
    await supabase.from('field_mappings').delete().eq('project_name', cleanName);

    // 4. Delete fixed rules
    await supabase.from('project_fixed_rules').delete().eq('project_name', cleanName);

    // 5. Delete plant/storage location mappings
    try {
      await supabase.from('PlantStorageLocationMapping').delete().eq('project_name', cleanName);
    } catch (e) {}

    // 6. Delete local lock status
    localStorage.removeItem('project_lock_' + cleanName);

    // 7. Delete local SAP tenant config for this project
    try {
      const localSap = localStorage.getItem('sap_tenant_configs_v1');
      if (localSap) {
        const configs = JSON.parse(localSap);
        const filtered = configs.filter(
          (c: any) =>
            (c.project_name && c.project_name.trim().toLowerCase() !== cleanName.toLowerCase()) &&
            (c.project_id && c.project_id.trim().toLowerCase() !== cleanName.toLowerCase())
        );
        localStorage.setItem('sap_tenant_configs_v1', JSON.stringify(filtered));
      }
    } catch (e) {}

    return { success: true, error: null };
  } catch (err: any) {
    console.error('Error deleting project:', err);
    return { success: false, error: err.message || 'Failed to delete project and purge DB data' };
  }
}
