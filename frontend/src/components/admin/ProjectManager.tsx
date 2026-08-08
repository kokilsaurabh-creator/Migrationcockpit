// frontend/src/components/admin/ProjectManager.tsx
import React, { useState, useEffect } from 'react';
import {
  fetchProjectsAndModulesForUser,
  fetchProjectLockStatuses,
  setProjectLockStatus,
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

export const ProjectManager: React.FC = () => {
  const [projects, setProjects] = useState<string[]>([]);
  const [allowedMastersMap, setAllowedMastersMap] = useState<Record<string, MasterType[]>>({});
  const [lockStatuses, setLockStatuses] = useState<Record<string, boolean>>({});
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
      const locks = await fetchProjectLockStatuses();

      setProjects(projList);
      setAllowedMastersMap(mastersMap);
      setLockStatuses(locks);
    } catch (err) {
      console.error('Error loading projects in ProjectManager:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLock = async (projectName: string) => {
    const currentLocked = !!lockStatuses[projectName];
    const newLocked = !currentLocked;

    await setProjectLockStatus(projectName, newLocked);
    setLockStatuses((prev) => ({ ...prev, [projectName]: newLocked }));

    setToast({
      type: 'success',
      msg: newLocked
        ? `🔒 Locked project '${projectName}'. Field Mappings & Rule Engine are now read-only.`
        : `🔓 Unlocked project '${projectName}'. Field Mappings & Rule Engine can now be edited.`
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
            Project Lifecycle & Lock Governance Hub
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Lock field mapping and rule engines to prevent unauthorized changes, or permanently delete projects and purge all database records.
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
                  <th className="py-3 px-4">Master Data Modules</th>
                  <th className="py-3 px-4">Mapping & Rules Status</th>
                  <th className="py-3 px-4 text-right">Governance Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-700">
                {projects.map((proj) => {
                  const isLocked = !!lockStatuses[proj];
                  const modules = allowedMastersMap[proj] || ['Material Master'];

                  return (
                    <tr key={proj} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center">
                        <span className="w-2 h-2 rounded-full mr-2.5 bg-blue-500 shrink-0" />
                        {proj}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {modules.map((m) => (
                            <span
                              key={m}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isLocked ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <Lock className="w-3.5 h-3.5 mr-1 text-amber-600" />
                            🔒 Locked (Read Only)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <Unlock className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            🔓 Unlocked (Editable)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-2">
                        {/* Lock / Unlock Toggle Button */}
                        <button
                          onClick={() => handleToggleLock(proj)}
                          className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                            isLocked
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                          }`}
                        >
                          {isLocked ? (
                            <>
                              <Unlock className="w-3.5 h-3.5 mr-1 text-amber-700" />
                              Unlock Project
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 mr-1 text-slate-600" />
                              Lock Project
                            </>
                          )}
                        </button>

                        {/* Delete Project Trigger */}
                        <button
                          onClick={() => handleOpenDeleteModal(proj)}
                          className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all shadow-sm"
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
