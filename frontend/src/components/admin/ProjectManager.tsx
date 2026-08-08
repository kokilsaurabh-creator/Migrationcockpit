// frontend/src/components/admin/ProjectManager.tsx
import React, { useState, useEffect } from 'react';
import {
  fetchProjectsAndModulesForUser,
  fetchProjectMasterLockStatuses,
  setProjectMasterLockStatus,
  isProjectMasterLocked,
  deleteProject
} from '../../services/projectService';
import { MasterType } from '../../types';
import { Toast } from '../common/Toast';
import { Modal } from '../common/Modal';
import {
  FolderCog,
  Lock,
  Unlock,
  Trash2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Database,
  Layers
} from 'lucide-react';

const ALL_MASTER_TYPES: MasterType[] = ['Material Master', 'Vendor Master', 'Customer Master'];

export const ProjectManager: React.FC = () => {
  const [projects, setProjects] = useState<string[]>([]);
  const [allowedMastersMap, setAllowedMastersMap] = useState<Record<string, MasterType[]>>({});
  const [masterLocksMap, setMasterLocksMap] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { projects: projList, allowedMastersMap: mastersMap } =
        await fetchProjectsAndModulesForUser('', 'Admin');
      const locksMap = await fetchProjectMasterLockStatuses();

      setProjects(projList);
      setAllowedMastersMap(mastersMap);
      setMasterLocksMap(locksMap);
    } catch (err) {
      console.error('Error loading projects in ProjectManager:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMasterLock = async (projectName: string, masterType: MasterType) => {
    const currentLocked = isProjectMasterLocked(projectName, masterType);
    const newLocked = !currentLocked;

    await setProjectMasterLockStatus(projectName, masterType, newLocked);
    setMasterLocksMap((prev) => ({
      ...prev,
      [projectName]: {
        ...(prev[projectName] || {}),
        [masterType]: newLocked
      }
    }));

    setToast({
      type: 'success',
      msg: newLocked
        ? `🔒 Locked '${masterType}' for project '${projectName}'. Mappings & Rules are now read-only.`
        : `🔓 Unlocked '${masterType}' for project '${projectName}'. Mappings & Rules can now be edited.`
    });
  };

  const handleOpenDeleteModal = (projectName: string) => {
    setDeleteTarget(projectName);
    setConfirmInput('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (confirmInput.trim() !== deleteTarget.trim()) {
      setToast({ type: 'error', msg: `Project name does not match. Type '${deleteTarget}' to confirm.` });
      return;
    }

    setDeleting(true);
    const { success, error } = await deleteProject(deleteTarget);
    setDeleting(false);

    if (success) {
      setToast({
        type: 'success',
        msg: `Successfully deleted project '${deleteTarget}' and purged all associated DB records!`
      });
      setDeleteTarget(null);
      loadData();
    } else {
      setToast({ type: 'error', msg: error || `Failed to delete project '${deleteTarget}'.` });
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Loading Project Governance Hub...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}

      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center">
            <FolderCog className="w-5 h-5 mr-2 text-blue-600" />
            Project Lifecycle & Master Lock Governance Hub
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Lock field mapping and rule engines specifically per Master Data Module (Material, Vendor, Customer) to prevent unauthorized changes, or delete projects and purge DB records.
          </p>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center">
            <Database className="w-4 h-4 mr-2 text-slate-500" />
            Registered Projects ({projects.length})
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            No projects registered in the database yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Project Space</th>
                  <th className="py-3 px-4">Master Data Modules & Governance Controls</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                {projects.map((proj) => {
                  const registeredModules = allowedMastersMap[proj] || ['Material Master'];
                  // Display all master types so admin can control locks for Material, Vendor, Customer
                  const displayModules = ALL_MASTER_TYPES;

                  return (
                    <tr key={proj} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4 font-bold text-slate-900 align-top">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="text-sm font-extrabold text-slate-900">{proj}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {displayModules.map((masterType) => {
                            const isLocked = isProjectMasterLocked(proj, masterType);
                            const isRegistered = registeredModules.includes(masterType);

                            return (
                              <div
                                key={masterType}
                                className={`p-2.5 rounded-xl border flex flex-col justify-between space-y-2 transition-all ${
                                  isLocked
                                    ? 'bg-amber-50/70 border-amber-200 text-amber-900 shadow-2xs'
                                    : 'bg-slate-50 border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-[11px] text-slate-900">
                                    {masterType}
                                  </span>
                                  {isLocked ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-200 text-amber-900">
                                      <Lock className="w-2.5 h-2.5 mr-1" />
                                      LOCKED
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800">
                                      <Unlock className="w-2.5 h-2.5 mr-1" />
                                      EDITABLE
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleToggleMasterLock(proj, masterType)}
                                  className={`w-full py-1 px-2 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center ${
                                    isLocked
                                      ? 'bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                                      : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-2xs'
                                  }`}
                                >
                                  {isLocked ? (
                                    <>
                                      <Unlock className="w-3 h-3 mr-1 text-amber-600" />
                                      Unlock {masterType.split(' ')[0]}
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3 h-3 mr-1 text-slate-500" />
                                      Lock {masterType.split(' ')[0]}
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-right align-top">
                        <button
                          onClick={() => handleOpenDeleteModal(proj)}
                          className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-600" />
                          Delete Project
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <Modal
          isOpen={!!deleteTarget}
          onClose={() => !deleting && setDeleteTarget(null)}
          title={`Confirm Project Deletion: '${deleteTarget}'`}
        >
          <div className="space-y-4">
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start space-x-3 text-rose-900 text-xs">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">CRITICAL WARNING: Permanent Database Purge</p>
                <p className="mt-1 text-rose-800">
                  Deleting <strong className="underline">{deleteTarget}</strong> will permanently remove all associated records from the database:
                </p>
                <ul className="list-disc list-inside mt-1.5 space-y-0.5 text-[11px] font-semibold text-rose-700">
                  <li>Project Field Mappings (<code className="font-mono text-[10px]">field_mappings</code>)</li>
                  <li>Fixed Rules (<code className="font-mono text-[10px]">project_fixed_rules</code>)</li>
                  <li>Plant & Storage Location Mappings (<code className="font-mono text-[10px]">PlantStorageLocationMapping</code>)</li>
                  <li>User RBAC Permissions (<code className="font-mono text-[10px]">user_permissions</code>)</li>
                  <li>Project Entry (<code className="font-mono text-[10px]">migration_projects</code>)</li>
                  <li>SAP Tenant Credentials</li>
                </ul>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Type <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">{deleteTarget}</span> to confirm deletion:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={deleteTarget}
                className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting || confirmInput.trim() !== deleteTarget.trim()}
                className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Purging Database Data...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Delete Project & Purge DB Data
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
