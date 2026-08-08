// frontend/src/services/projectService.ts
import { supabase } from './supabaseClient';
import { MasterType, MigrationProject, UserPermission } from '../types';

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

export function isProjectLocked(projectName: string): boolean {
  if (!projectName) return false;
  try {
    const val = localStorage.getItem('project_lock_' + projectName.trim());
    return val === 'true';
  } catch (e) {
    return false;
  }
}

export async function fetchProjectLockStatuses(): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('project_lock_')) {
        const pName = key.replace('project_lock_', '');
        result[pName] = localStorage.getItem(key) === 'true';
      }
    }
  } catch (e) {}
  return result;
}

export async function setProjectLockStatus(projectName: string, locked: boolean): Promise<boolean> {
  try {
    const cleanName = projectName.trim();
    localStorage.setItem('project_lock_' + cleanName, locked ? 'true' : 'false');
    try {
      await supabase.from('migration_projects').update({ is_locked: locked }).eq('project_name', cleanName);
    } catch (e) {}
    return true;
  } catch (e) {
    console.warn('Error setting project lock status:', e);
    return true;
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
