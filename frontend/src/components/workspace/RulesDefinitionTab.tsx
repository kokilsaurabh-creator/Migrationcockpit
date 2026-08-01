// frontend/src/components/workspace/RulesDefinitionTab.tsx
import React, { useEffect, useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import { fetchProjectRules, saveProjectRules } from '../../services/rulesService';
import { fetchMappingsForProject } from '../../services/mappingService';
import { FixedRuleRecord } from '../../types';
import { MASTER_CONFIGS } from '../../utils/constants';
import { Toast } from '../common/Toast';
import * as XLSX from 'xlsx';
import {
  Sliders,
  Download,
  Upload,
  Plus,
  Trash2,
  Save,
  Loader2,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Filter,
  Sparkles,
  Database,
  RotateCcw,
  CheckSquare
} from 'lucide-react';

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  label,
  options,
  selected,
  onChange
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase().trim())
  );

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((item) => item !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="relative space-y-1">
      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider truncate">
        🔑 {label}
      </label>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-medium flex items-center justify-between transition-all ${
          selected.length > 0
            ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold shadow-sm'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <span className="truncate">
          {selected.length === 0
            ? `All (${options.length})`
            : selected.length === 1
            ? selected[0]
            : `${selected.length} Selected`}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform text-slate-400 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-20 p-2.5 space-y-2 text-xs">
            {/* Search inside popover */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={`Search ${label}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 font-semibold">
              <button
                type="button"
                onClick={() => onChange([...options])}
                className="text-blue-600 hover:text-blue-800"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            </div>

            {/* Option List */}
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
              {filteredOptions.length === 0 ? (
                <div className="p-2 text-slate-400 italic text-[11px]">No options match</div>
              ) : (
                filteredOptions.map((opt) => {
                  const isChecked = selected.includes(opt);
                  return (
                    <label
                      key={opt}
                      className="flex items-center px-2 py-1.5 hover:bg-slate-50 cursor-pointer rounded transition-colors text-slate-800 font-medium"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOption(opt)}
                        className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mr-2"
                      />
                      <span className="truncate">{opt}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const RulesDefinitionTab: React.FC = () => {
  const { currentProject, selectedMaster } = useProject();
  const config = MASTER_CONFIGS[selectedMaster];
  const ruleKeys = config.ruleKeys;

  const [ruleFields, setRuleFields] = useState<string[]>([]);
  const [ruleRecords, setRuleRecords] = useState<FixedRuleRecord[]>([]);

  // Multi-Select Search & Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [multiFilters, setMultiFilters] = useState<Record<string, string[]>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (!currentProject) return;
    setLoading(true);

    // Fetch mappings configured as 'Based on Fixed Rules' to get target rule fields
    fetchMappingsForProject(currentProject).then((mappings) => {
      const targetFields = mappings
        .filter((m) => m.mapping_type === 'Based on Fixed Rules')
        .map((m) => m.field_name);

      const uniqueFields = Array.from(new Set(targetFields));
      setRuleFields(uniqueFields);
    });

    // Fetch saved rules from DB
    fetchProjectRules(currentProject, selectedMaster).then((rules) => {
      setRuleRecords(rules);
      setLoading(false);
    });
  }, [currentProject, selectedMaster]);

  const allColumns = [...ruleKeys, ...ruleFields];

  // Extract unique distinct options for each key for multi-select dropdown filters
  const uniqueKeyOptions: Record<string, string[]> = {};
  ruleKeys.forEach((key) => {
    const vals = ruleRecords
      .map((r) => String(r[key] || '').trim())
      .filter((v) => v !== '');
    uniqueKeyOptions[key] = Array.from(new Set(vals)).sort();
  });

  // Filtered Rules Logic (Multi-Select + Comma-Separated Support)
  const filteredRecords = ruleRecords.filter((record) => {
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim();
      const matchAny = allColumns.some((col) =>
        String(record[col] || '')
          .toLowerCase()
          .includes(query)
      );
      if (!matchAny) return false;
    }

    // Multi-Select Condition Keys matching
    for (const key of ruleKeys) {
      const selectedVals = multiFilters[key] || [];
      if (selectedVals.length > 0) {
        const cellVal = String(record[key] || '').trim();
        if (!selectedVals.includes(cellVal)) {
          return false;
        }
      }
    }

    // In-Header Column Text Filters (Supports Comma-Separated OR Filtering: e.g. "VW58, VW57")
    for (const col of allColumns) {
      const colFilterVal = (columnFilters[col] || '').trim().toLowerCase();
      if (colFilterVal) {
        const terms = colFilterVal.split(',').map((t) => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          const cellVal = String(record[col] || '').trim().toLowerCase();
          const matchAnyTerm = terms.some((t) => cellVal.includes(t));
          if (!matchAnyTerm) return false;
        }
      }
    }

    return true;
  });

  // Pagination calculation
  const totalRecords = filteredRecords.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleMultiFilterChange = (key: string, selected: string[]) => {
    setMultiFilters((prev) => ({
      ...prev,
      [key]: selected
    }));
    setCurrentPage(1);
  };

  const handleColumnFilterChange = (col: string, val: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [col]: val
    }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setMultiFilters({});
    setColumnFilters({});
    setCurrentPage(1);
  };

  const activeFilterCount =
    (searchTerm ? 1 : 0) +
    Object.values(multiFilters).filter((arr) => arr.length > 0).length +
    Object.values(columnFilters).filter((v) => v.trim() !== '').length;

  const handleAddRow = () => {
    const newRecord: FixedRuleRecord = {
      project_name: currentProject || '',
      master_type: selectedMaster
    };
    allColumns.forEach((col) => (newRecord[col] = ''));
    setRuleRecords((prev) => [newRecord, ...prev]);
    setCurrentPage(1);
  };

  const handleRemoveRow = (actualIndex: number) => {
    setRuleRecords((prev) => prev.filter((_, i) => i !== actualIndex));
  };

  const handleCellChange = (actualIndex: number, col: string, val: string) => {
    setRuleRecords((prev) => {
      const copy = [...prev];
      copy[actualIndex] = { ...copy[actualIndex], [col]: val };
      return copy;
    });
  };

  // Excel Template / Data Download
  const handleDownloadTemplate = () => {
    const exportData =
      ruleRecords.length > 0
        ? ruleRecords.map((r) => {
            const row: Record<string, string> = {};
            allColumns.forEach((col) => (row[col] = String(r[col] || '')));
            return row;
          })
        : [allColumns.reduce((acc, col) => ({ ...acc, [col]: '' }), {})];

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fixed Rules');
    XLSX.writeFile(workbook, `${currentProject}_${selectedMaster.replace(/\s+/g, '_')}_Rules.xlsx`);
  };

  // Excel File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        const importedRules: FixedRuleRecord[] = data.map((row) => ({
          ...row,
          project_name: currentProject || '',
          master_type: selectedMaster
        }));

        setRuleRecords(importedRules);
        setCurrentPage(1);
        setToast({ type: 'success', msg: `Successfully loaded ${importedRules.length.toLocaleString()} rules from Excel!` });
      } catch (err: any) {
        setToast({ type: 'error', msg: `Failed to parse Excel file: ${err.message}` });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveRules = async () => {
    if (!currentProject) return;
    setSaving(true);
    setProgress(0);

    const ok = await saveProjectRules(
      currentProject,
      selectedMaster,
      ruleRecords,
      (ratio) => setProgress(ratio)
    );

    setSaving(false);
    if (ok) {
      setToast({ type: 'success', msg: `Successfully saved ${ruleRecords.length.toLocaleString()} rule mappings to database!` });
    } else {
      setToast({ type: 'error', msg: 'Error saving rules to database.' });
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}

      {/* Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center">
            <Sliders className="w-5 h-5 mr-2 text-blue-600" />
            Fixed Rules Engine Definition
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage and edit conditional default rules for <span className="font-bold text-slate-700">{selectedMaster}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors"
          >
            <Download className="w-4 h-4 mr-1.5 text-slate-500" />
            Download Excel Rules
          </button>

          <label className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl cursor-pointer transition-colors">
            <Upload className="w-4 h-4 mr-1.5 text-slate-500" />
            <span>Upload Rules Excel</span>
            <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleSaveRules}
            disabled={saving}
            className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving ({Math.round(progress * 100)}%)...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                Save Rules Matrix
              </>
            )}
          </button>
        </div>
      </div>

      {/* Multi-Select Condition Key Filter Bar */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
            <CheckSquare className="w-4 h-4 mr-1.5 text-blue-600" />
            Rule Condition Filters
          </span>

          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center text-xs font-semibold text-rose-600 hover:text-rose-800 transition-colors"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset All Filters ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {ruleKeys.map((key) => (
            <MultiSelectFilter
              key={key}
              label={key}
              options={uniqueKeyOptions[key] || []}
              selected={multiFilters[key] || []}
              onChange={(selected) => handleMultiFilterChange(key, selected)}
            />
          ))}
        </div>
      </div>

      {/* Rules Table & Toolbar Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
        {/* Search, Rows Per Page & Add Row Toolbar */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-1 items-center space-x-3 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search across all fields (e.g. ZSPR, VW58, 3150)..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 font-medium"
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

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2 text-xs text-slate-600 font-semibold">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
              </select>
            </div>

            <button
              onClick={handleAddRow}
              className="inline-flex items-center px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Rule Row
            </button>
          </div>
        </div>

        {/* Data Grid with Header Column Filters */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              {/* Header Titles */}
              <tr className="bg-slate-100/90 text-slate-700 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                <th className="py-3 px-3 w-12 text-center">#</th>
                {ruleKeys.map((key) => (
                  <th key={key} className="py-3 px-3 bg-blue-50/70 text-blue-900 border-r border-blue-100">
                    🔑 {key}
                  </th>
                ))}
                {ruleFields.map((f) => (
                  <th key={f} className="py-3 px-3 bg-emerald-50/70 text-emerald-900 border-r border-emerald-100">
                    🎯 {f}
                  </th>
                ))}
                <th className="py-3 px-3 w-16 text-center">Action</th>
              </tr>

              {/* In-Header Column Filter Inputs (Supports Comma Separation, e.g. "VW58, VW57") */}
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-1 text-center font-normal text-slate-400">
                  <Filter className="w-3 h-3 mx-auto text-slate-400" />
                </th>
                {allColumns.map((col) => (
                  <th key={col} className="p-1">
                    <input
                      type="text"
                      placeholder={`Filter ${col} (e.g. A, B)...`}
                      value={columnFilters[col] || ''}
                      onChange={(e) => handleColumnFilterChange(col, e.target.value)}
                      className={`w-full px-2 py-1 border rounded text-[11px] font-normal focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        columnFilters[col] ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold' : 'bg-white border-slate-300 text-slate-700'
                      }`}
                    />
                  </th>
                ))}
                <th className="p-1"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={allColumns.length + 2} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                    Loading rules from database...
                  </td>
                </tr>
              ) : paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={allColumns.length + 2} className="py-12 text-center text-slate-400 italic">
                    {activeFilterCount > 0
                      ? 'No rule records match your selected multi-filters. Click "Reset All Filters" above.'
                      : 'No rules saved in database yet. Click "Add Rule Row" or upload an Excel file.'}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record, pageIdx) => {
                  const actualIndex = startIndex + pageIdx;

                  return (
                    <tr key={actualIndex} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px] font-semibold">
                        {actualIndex + 1}
                      </td>
                      {ruleKeys.map((key) => (
                        <td key={key} className="py-2 px-2 border-r border-slate-100">
                          <input
                            type="text"
                            value={record[key] || ''}
                            onChange={(e) => handleCellChange(actualIndex, key, e.target.value)}
                            className="w-full px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                      {ruleFields.map((f) => (
                        <td key={f} className="py-2 px-2 border-r border-slate-100">
                          <input
                            type="text"
                            value={record[f] || ''}
                            onChange={(e) => handleCellChange(actualIndex, f, e.target.value)}
                            className="w-full px-2.5 py-1 bg-emerald-50/40 border border-emerald-300 rounded-lg text-xs font-mono text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </td>
                      ))}
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => handleRemoveRow(actualIndex)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete Rule Row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-600">
          <div>
            Showing <span className="font-bold text-slate-800">{totalRecords > 0 ? startIndex + 1 : 0}</span> to{' '}
            <span className="font-bold text-slate-800">{Math.min(startIndex + pageSize, totalRecords)}</span> of{' '}
            <span className="font-bold text-slate-800">{totalRecords.toLocaleString()}</span> saved rules
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span>
              Page <span className="font-bold text-slate-800">{currentPage}</span> of{' '}
              <span className="font-bold text-slate-800">{totalPages}</span>
            </span>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
