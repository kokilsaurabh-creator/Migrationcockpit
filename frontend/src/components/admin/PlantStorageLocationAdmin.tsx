// frontend/src/components/admin/PlantStorageLocationAdmin.tsx
import React, { useEffect, useState, useRef } from 'react';
import {
  fetchPlantSLocMappings,
  uploadPlantSLocMappingsBatch,
  deletePlantSLocMapping,
  clearProjectPlantSLocMappings,
  downloadPlantSLocCsvTemplate,
  exportPlantSLocMappingsCsv,
  PlantSLocMapping
} from '../../services/plantStorageLocationService';
import { fetchProjects } from '../../services/projectService';
import { MigrationProject } from '../../types';
import { Toast } from '../common/Toast';
import {
  Building2,
  Download,
  Upload,
  FileSpreadsheet,
  Search,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  RefreshCw,
  Layers,
  Database
} from 'lucide-react';

export const PlantStorageLocationAdmin: React.FC = () => {
  const [projects, setProjects] = useState<MigrationProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [mappings, setMappings] = useState<PlantSLocMapping[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedCsvRows, setParsedCsvRows] = useState<{ plant_code: string; storage_location_code: string }[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    fetchProjects().then((projs: MigrationProject[]) => {
      setProjects(projs);
      if (projs.length > 0) {
        setSelectedProject(projs[0].project_name);
      }
    });
  }, []);

  const loadMappings = async (projectName: string) => {
    if (!projectName) return;
    setLoading(true);
    const data = await fetchPlantSLocMappings(projectName);
    setMappings(data);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedProject) {
      loadMappings(selectedProject);
    }
  }, [selectedProject]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r\n|\n/);
      const parsed: { plant_code: string; storage_location_code: string }[] = [];

      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Skip header row if it contains headers
        if (
          index === 0 &&
          (trimmed.toLowerCase().includes('plant') || trimmed.toLowerCase().includes('storage'))
        ) {
          return;
        }

        const cols = trimmed.split(/[,;\t]+/).map((c) => c.replace(/^"|"$/g, '').trim());
        if (cols.length >= 2) {
          const plant = cols[0].toUpperCase();
          const sloc = cols[1].toUpperCase();
          if (plant && sloc && plant !== 'NAN' && plant !== 'NULL') {
            parsed.push({ plant_code: plant, storage_location_code: sloc });
          }
        }
      });

      if (parsed.length === 0) {
        setToast({ type: 'error', msg: 'No valid Plant to Storage Location rows detected in CSV file.' });
        return;
      }

      setParsedCsvRows(parsed);
      setShowPreviewModal(true);
    };

    reader.readAsText(file);
    // Reset file input value so re-uploading same file triggers change event
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCommitUpload = async () => {
    if (!selectedProject || parsedCsvRows.length === 0) return;
    setUploading(true);

    const res = await uploadPlantSLocMappingsBatch(selectedProject, parsedCsvRows);
    setUploading(false);
    setShowPreviewModal(false);

    if (res.error) {
      setToast({ type: 'error', msg: `Failed to upload mappings: ${res.error}` });
    } else {
      setToast({
        type: 'success',
        msg: `Successfully processed ${parsedCsvRows.length} CSV rows. Added ${res.addedCount} new mapping(s) to project '${selectedProject}'!`
      });
      loadMappings(selectedProject);
    }
    setParsedCsvRows([]);
  };

  const handleDeleteItem = async (id?: string) => {
    if (!id) return;
    const ok = await deletePlantSLocMapping(id);
    if (ok) {
      setToast({ type: 'success', msg: 'Mapping row deleted successfully.' });
      setMappings((prev) => prev.filter((m) => m.id !== id));
    } else {
      setToast({ type: 'error', msg: 'Failed to delete mapping record.' });
    }
  };

  const handleClearAll = async () => {
    if (!selectedProject) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ALL Plant to Storage Location mappings for project '${selectedProject}'? This action cannot be undone.`
      )
    ) {
      return;
    }

    setLoading(true);
    const ok = await clearProjectPlantSLocMappings(selectedProject);
    setLoading(false);

    if (ok) {
      setToast({ type: 'success', msg: `All mappings cleared for project '${selectedProject}'.` });
      setMappings([]);
    } else {
      setToast({ type: 'error', msg: 'Failed to clear project mappings.' });
    }
  };

  const filteredMappings = mappings.filter((m) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      m.plant_code.toLowerCase().includes(q) ||
      m.storage_location_code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}

      {/* Header & Controls Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-800 flex items-center">
              <Building2 className="w-5 h-5 mr-2.5 text-blue-600" />
              Plant to Storage Location Mapping
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure Plant $\rightarrow$ Storage Location lookup tables per project for automated wildcard (<code className="font-mono text-blue-600 font-bold">*</code>) Storage Location expansion during XML generation.
            </p>
          </div>

          {/* Project Selection Dropdown */}
          <div className="min-w-[240px]">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Target Migration Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {projects.map((p) => (
                <option key={p.project_name} value={p.project_name}>
                  {p.project_name} ({p.master_type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Download Template Button */}
            <button
              onClick={downloadPlantSLocCsvTemplate}
              className="inline-flex items-center px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 shadow-sm"
              title="Download empty CSV template format"
            >
              <Download className="w-4 h-4 mr-1.5 text-slate-600" />
              Download CSV Template
            </button>

            {/* Export Existing Mappings Button */}
            <button
              onClick={() => exportPlantSLocMappingsCsv(selectedProject, mappings)}
              disabled={mappings.length === 0}
              className="inline-flex items-center px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export currently saved project mappings to CSV"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
              Export Mappings (CSV)
            </button>

            {/* Upload CSV Trigger Button */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all"
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Upload CSV Mappings
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => loadMappings(selectedProject)}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              title="Refresh grid"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {mappings.length > 0 && (
              <button
                onClick={handleClearAll}
                className="inline-flex items-center px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Clear All Mappings
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Audit Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-3 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
              Configured Mappings ({mappings.length} Records)
            </h4>
          </div>

          {/* Search Filter */}
          <div className="relative min-w-[260px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Plant or Storage Location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table View */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 font-bold text-slate-700 uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3">Plant Code</th>
                <th className="p-3">Storage Location Code</th>
                <th className="p-3">Created Date</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
                    Loading Plant-SLoc mappings...
                  </td>
                </tr>
              ) : filteredMappings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-400 italic">
                    {searchTerm
                      ? `No mappings match search query "${searchTerm}"`
                      : `No Plant to Storage Location mappings configured for project '${selectedProject}'. Click 'Upload CSV Mappings' to add.`}
                  </td>
                </tr>
              ) : (
                filteredMappings.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-700">
                      <span className="inline-block bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-lg text-xs">
                        {item.plant_code}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-800">
                      <span className="inline-block bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5 rounded-lg text-xs">
                        {item.storage_location_code}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 font-mono text-[11px]">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="text-rose-600 hover:text-rose-800 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Delete mapping record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV Preview & Confirmation Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-extrabold text-slate-800">
                  Preview Plant-SLoc CSV Upload
                </h3>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl text-xs text-blue-900 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Parsed <strong>{parsedCsvRows.length}</strong> Plant to Storage Location records from file <strong className="font-mono">{fileName}</strong> for project <strong>{selectedProject}</strong>.
              </span>
            </div>

            {/* Preview Table */}
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 sticky top-0 font-bold text-slate-700 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Plant Code</th>
                    <th className="p-2.5">Storage Location Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {parsedCsvRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-bold text-blue-700">{row.plant_code}</td>
                      <td className="p-2.5 font-bold text-slate-800">{row.storage_location_code}</td>
                    </tr>
                  ))}
                  {parsedCsvRows.length > 50 && (
                    <tr>
                      <td colSpan={3} className="p-2 text-center text-slate-400 italic text-[11px]">
                        ... and {parsedCsvRows.length - 50} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitUpload}
                disabled={uploading}
                className="inline-flex items-center px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-1.5" />
                    Confirm & Save to DB
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
