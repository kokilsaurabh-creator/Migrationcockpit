// frontend/src/components/admin/SAPTenantAdmin.tsx
import React, { useState, useEffect } from 'react';
import {
  fetchSAPProjects,
  saveSAPProject,
  testSAPConnection
} from '../../services/sapAdminService';
import { fetchProjectsAndModulesForUser } from '../../services/projectService';
import type { SAPProjectConfig, ProjectConfigCreatePayload } from '../../types';
import { Toast } from '../common/Toast';
import {
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Building2,
  Package,
  FileSpreadsheet
} from 'lucide-react';

export const SAPTenantAdmin: React.FC = () => {
  const [dbProjects, setDbProjects] = useState<string[]>([]);
  const [sapConfigs, setSapConfigs] = useState<SAPProjectConfig[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('Material Master');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Form State
  const [projectId, setProjectId] = useState<string>('MATERIAL_MASTER');
  const [projectName, setProjectName] = useState<string>('Material Master');
  const [baseUrl, setBaseUrl] = useState<string>('https://my300000.s4hana.ondemand.com');

  // BP Credentials (SAP_COM_0008)
  const [bpCommUser, setBpCommUser] = useState<string>('BPU_DEV_0008');
  const [bpPassword, setBpPassword] = useState<string>('••••••••');
  const [bpTestStatus, setBpTestStatus] = useState<{ testing: boolean; result?: { success: boolean; msg: string } }>({ testing: false });

  // Material Credentials (SAP_COM_0009)
  const [materialCommUser, setMaterialCommUser] = useState<string>('MAT_DEV_0009');
  const [materialPassword, setMaterialPassword] = useState<string>('••••••••');
  const [materialTestStatus, setMaterialTestStatus] = useState<{ testing: boolean; result?: { success: boolean; msg: string } }>({ testing: false });

  // Custom PAN API Settings
  const [customPanEndpoint, setCustomPanEndpoint] = useState<string>('');
  const [panCommUser, setPanCommUser] = useState<string>('');
  const [panPassword, setPanPassword] = useState<string>('');
  const [panTestStatus, setPanTestStatus] = useState<{ testing: boolean; result?: { success: boolean; msg: string } }>({ testing: false });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const { projects: userProjects } = await fetchProjectsAndModulesForUser('', 'Admin');
      const sapData = await fetchSAPProjects();
      setSapConfigs(sapData);

      const combined = Array.from(
        new Set([
          ...userProjects,
          ...sapData.map((p) => p.project_name)
        ])
      );

      const finalProjects = combined.length > 0 ? combined : ['Material Master'];
      setDbProjects(finalProjects);

      if (finalProjects.length > 0) {
        selectAndPopulateProject(finalProjects[0], sapData);
      }
    } catch (err) {
      console.error('Failed to load project configurations:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectAndPopulateProject = (name: string, configs: SAPProjectConfig[]) => {
    setSelectedProjectName(name);
    setProjectName(name);

    const normName = name.trim().toLowerCase();
    const normId = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').toLowerCase();

    const matching = configs.find(
      (c) =>
        (c.project_name && c.project_name.trim().toLowerCase() === normName) ||
        (c.project_id && c.project_id.trim().toLowerCase() === normName) ||
        (c.project_id && c.project_id.trim().toLowerCase() === normId)
    );

    if (matching) {
      setProjectId(matching.project_id);
      setBaseUrl(matching.base_url || '');
      setBpCommUser(matching.bp_comm_user || '');
      setBpPassword(matching.bp_password_masked || '••••••••');
      setMaterialCommUser(matching.material_comm_user || '');
      setMaterialPassword(matching.material_password_masked || '••••••••');
      setCustomPanEndpoint(matching.custom_pan_endpoint || '');
      setPanCommUser(matching.pan_comm_user || '');
      setPanPassword(matching.pan_password_masked || '');
    } else {
      const derivedId = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      setProjectId(derivedId);
      setBaseUrl('');
      setBpCommUser('');
      setBpPassword('');
      setMaterialCommUser('');
      setMaterialPassword('');
      setCustomPanEndpoint('');
      setPanCommUser('');
      setPanPassword('');
    }

    setBpTestStatus({ testing: false });
    setMaterialTestStatus({ testing: false });
    setPanTestStatus({ testing: false });
  };

  const handleProjectSelect = (name: string) => {
    selectAndPopulateProject(name, sapConfigs);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload: ProjectConfigCreatePayload = {
      project_id: projectId,
      project_name: projectName,
      base_url: baseUrl,
      bp_comm_user: bpCommUser,
      bp_password: bpPassword,
      material_comm_user: materialCommUser,
      material_password: materialPassword,
      custom_pan_endpoint: customPanEndpoint || undefined,
      pan_comm_user: panCommUser || undefined,
      pan_password: panPassword || undefined
    };

    try {
      const saved = await saveSAPProject(payload);
      setToast({ type: 'success', msg: `Saved SAP Project Tenant '${saved.project_name}'` });

      const normName = saved.project_name.trim().toLowerCase();
      const normId = saved.project_id.trim().toLowerCase();

      let updated = false;
      const updatedList = sapConfigs.map((p) => {
        if (
          (p.project_name && p.project_name.trim().toLowerCase() === normName) ||
          (p.project_id && p.project_id.trim().toLowerCase() === normId)
        ) {
          updated = true;
          return saved;
        }
        return p;
      });

      if (!updated) {
        updatedList.push(saved);
      }
      setSapConfigs(updatedList);
      selectAndPopulateProject(saved.project_name, updatedList);
    } catch (err: any) {
      setToast({ type: 'error', msg: err.message || 'Failed to save SAP project credentials' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (type: 'BP' | 'MATERIAL' | 'PAN') => {
    if (type === 'BP') {
      setBpTestStatus({ testing: true });
      const res = await testSAPConnection({
        project_id: projectId,
        service_type: 'BP',
        base_url: baseUrl,
        comm_user: bpCommUser,
        password: bpPassword
      });
      setBpTestStatus({ testing: false, result: { success: res.success, msg: res.message } });
    } else if (type === 'MATERIAL') {
      setMaterialTestStatus({ testing: true });
      const res = await testSAPConnection({
        project_id: projectId,
        service_type: 'MATERIAL',
        base_url: baseUrl,
        comm_user: materialCommUser,
        password: materialPassword
      });
      setMaterialTestStatus({ testing: false, result: { success: res.success, msg: res.message } });
    } else if (type === 'PAN') {
      setPanTestStatus({ testing: true });
      const res = await testSAPConnection({
        project_id: projectId,
        service_type: 'PAN',
        base_url: baseUrl,
        comm_user: panCommUser,
        password: panPassword,
        custom_pan_endpoint: customPanEndpoint
      });
      setPanTestStatus({ testing: false, result: { success: res.success, msg: res.message } });
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Loading SAP Tenant Configurations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}

      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center">
            <Server className="w-5 h-5 mr-2 text-blue-600" />
            Project-Wise SAP S/4HANA Public Cloud Tenants
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure multi-credential communication scenarios (SAP_COM_0008, SAP_COM_0009, PAN API). Passwords encrypted at rest with AES-256 (Fernet).
          </p>
        </div>
      </div>

      {/* Main Credentials Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Project Info */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-3 flex items-center">
            <Building2 className="w-4 h-4 mr-2 text-blue-600" />
            1. Environment & Tenant Base Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Select Project *</label>
              <select
                value={selectedProjectName}
                onChange={(e) => handleProjectSelect(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {dbProjects.map((pName) => (
                  <option key={pName} value={pName}>
                    {pName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Project ID</label>
              <input
                type="text"
                value={projectId}
                readOnly
                className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl cursor-not-allowed select-none focus:outline-none"
                title="Project ID is automatically generated from the selected project"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tenant Base URL *</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://my123456.s4hana.ondemand.com"
              />
            </div>
          </div>
        </div>

        {/* Section 1: Business Partner Credentials (SAP_COM_0008) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <ShieldCheck className="w-4 h-4 mr-2 text-indigo-600" />
                Section 1: Business Partner Credentials (SAP_COM_0008)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">Used for Vendor & Customer Master Data OData queries and Duplicate Checking.</p>
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection('BP')}
              disabled={bpTestStatus.testing}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50 shrink-0"
            >
              {bpTestStatus.testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Testing BP...
                </>
              ) : (
                'Test BP Connection'
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Communication User (BP)</label>
              <input
                type="text"
                value={bpCommUser}
                onChange={(e) => setBpCommUser(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. BPU_DEV_0008"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Encrypted Password (AES-256)</label>
              <input
                type="password"
                value={bpPassword}
                onChange={(e) => setBpPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          {bpTestStatus.result && (
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center space-x-2 ${
              bpTestStatus.result.success ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
            }`}>
              {bpTestStatus.result.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{bpTestStatus.result.msg}</span>
            </div>
          )}
        </div>

        {/* Section 2: Material Master Credentials (SAP_COM_0009) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <Package className="w-4 h-4 mr-2 text-blue-600" />
                Section 2: Material Master Credentials (SAP_COM_0009)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">Used for Product Master API_PRODUCT_SRV OData queries and description fuzzy matching.</p>
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection('MATERIAL')}
              disabled={materialTestStatus.testing}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all disabled:opacity-50 shrink-0"
            >
              {materialTestStatus.testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Testing Material...
                </>
              ) : (
                'Test Material Connection'
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Communication User (Material)</label>
              <input
                type="text"
                value={materialCommUser}
                onChange={(e) => setMaterialCommUser(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. MAT_DEV_0009"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Encrypted Password (AES-256)</label>
              <input
                type="password"
                value={materialPassword}
                onChange={(e) => setMaterialPassword(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          {materialTestStatus.result && (
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center space-x-2 ${
              materialTestStatus.result.success ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
            }`}>
              {materialTestStatus.result.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{materialTestStatus.result.msg}</span>
            </div>
          )}
        </div>

        {/* Section 3: Custom PAN API Configuration */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <FileSpreadsheet className="w-4 h-4 mr-2 text-amber-600" />
                Section 3: Custom PAN API Settings (Optional)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">Dedicated endpoint for Indian PAN tax number verification & duplicate checks.</p>
            </div>

            <button
              type="button"
              onClick={() => handleTestConnection('PAN')}
              disabled={panTestStatus.testing || !customPanEndpoint}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all disabled:opacity-50 shrink-0"
            >
              {panTestStatus.testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Testing PAN API...
                </>
              ) : (
                'Test PAN Connection'
              )}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Custom PAN API Endpoint URL</label>
              <input
                type="url"
                value={customPanEndpoint}
                onChange={(e) => setCustomPanEndpoint(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="https://my123456.s4hana.ondemand.com/sap/opu/odata/sap/CUSTOM_PAN_SRV/ValidatePAN"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">PAN Communication User</label>
                <input
                  type="text"
                  value={panCommUser}
                  onChange={(e) => setPanCommUser(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="PAN_USER_01"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">PAN Encrypted Password</label>
                <input
                  type="password"
                  value={panPassword}
                  onChange={(e) => setPanPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          {panTestStatus.result && (
            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center space-x-2 ${
              panTestStatus.result.success ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-rose-50 text-rose-800 border-rose-300'
            }`}>
              {panTestStatus.result.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
              <span>{panTestStatus.result.msg}</span>
            </div>
          )}
        </div>

        {/* Save Button Bar */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-6 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 active:bg-black rounded-xl shadow-md transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Encrypting & Saving Config...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save SAP Tenant Credentials
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
