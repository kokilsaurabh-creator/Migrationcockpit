// frontend/src/components/workspace/FieldMappingTab.tsx
import React, { useEffect, useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import { getLegacyViewInfo, loadMasterSchema, getTechnicalFieldName } from '../../utils/schemaLoader';
import { fetchMappingsForProject, saveMappingsBatch, FieldMappingItem } from '../../services/mappingService';
import { isProjectLocked } from '../../services/projectService';
import { FieldMapping, MappingType, SchemaField } from '../../types';
import { MAPPING_OPTIONS } from '../../utils/constants';
import { StatusBadge } from '../common/StatusBadge';
import { Toast } from '../common/Toast';
import {
  Save,
  Filter,
  Eye,
  CheckCircle2,
  Loader2,
  Layers,
  Search,
  X,
  BarChart2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Lock
} from 'lucide-react';

export const FieldMappingTab: React.FC = () => {
  const { currentProject, selectedMaster } = useProject();
  const [isLocked, setIsLocked] = useState<boolean>(() =>
    isProjectLocked(currentProject || '', selectedMaster)
  );

  useEffect(() => {
    const updateLock = () => {
      setIsLocked(isProjectLocked(currentProject || '', selectedMaster));
    };
    updateLock();
    window.addEventListener('project_lock_updated', updateLock);
    return () => window.removeEventListener('project_lock_updated', updateLock);
  }, [currentProject, selectedMaster]);

  const schema = loadMasterSchema(selectedMaster);

  const viewOptions = Object.keys(schema);
  const [selectedView, setSelectedView] = useState<string>(viewOptions[0] || '');
  const [filterMandatory, setFilterMandatory] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showSavedContext, setShowSavedContext] = useState<boolean>(false);

  // Dirty Field Tracking State (remembers modified fields to optimize saving)
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  // Saved Drawer Filter & Sorting State
  const [drawerSearch, setDrawerSearch] = useState<string>('');
  const [drawerRuleFilter, setDrawerRuleFilter] = useState<string>('all');
  const [drawerViewFilter, setDrawerViewFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'view_name' | 'field_name' | 'is_mandatory' | 'mapping_type' | 'fixed_value'>('view_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [savedMappings, setSavedMappings] = useState<FieldMapping[]>([]);
  const [currentFormState, setCurrentFormState] = useState<
    Record<string, { mappingType: MappingType; fixedValue: string; sourceField: string }>
  >({});

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    const currentViews = Object.keys(loadMasterSchema(selectedMaster));
    setSearchTerm('');
    if (currentViews.length > 0) {
      if (!selectedView || !currentViews.includes(selectedView)) {
        setSelectedView(currentViews[0]);
      }
    } else {
      setSelectedView('');
    }
    setDirtyFields(new Set());
  }, [selectedMaster]);

  // Load existing saved mappings for project
  useEffect(() => {
    if (!currentProject) return;
    setLoading(true);
    fetchMappingsForProject(currentProject, selectedMaster).then((mappings) => {
      setSavedMappings(mappings);

      // Populate current form state for selected view matching either raw or normalized view name
      const [cleanSelectedView] = getLegacyViewInfo(selectedView);
      const stateMap: Record<string, { mappingType: MappingType; fixedValue: string; sourceField: string }> = {};

      const currentViewFields = schema[selectedView] || [];

      // Sort mappings so exact technical key rows are processed after legacy description rows
      const sortedMappings = [...mappings].sort((a, b) => {
        const isTechA = currentViewFields.some((f) => f.field_name.toLowerCase() === a.field_name.trim().toLowerCase());
        const isTechB = currentViewFields.some((f) => f.field_name.toLowerCase() === b.field_name.trim().toLowerCase());
        if (!isTechA && isTechB) return -1;
        if (isTechA && !isTechB) return 1;
        return 0;
      });

      sortedMappings.forEach((m) => {
        const [cleanMView] = getLegacyViewInfo(m.view_name);
        if (m.view_name === selectedView || cleanMView === cleanSelectedView) {
          if (m.field_name) {
            const entry = {
              mappingType: m.mapping_type,
              fixedValue: m.fixed_value || '',
              sourceField: m.source_field || (m.mapping_type === 'Based on User Input' ? m.fixed_value : '') || ''
            };

            const techKey = getTechnicalFieldName(m.field_name, selectedMaster);
            stateMap[techKey] = entry;
            stateMap[m.field_name] = entry;

            // Also associate by description if available in schema
            const sf = currentViewFields.find(
              (f) => f.field_name === m.field_name || f.description === m.field_name || f.field_name === techKey
            );
            if (sf && sf.description) {
              stateMap[sf.description] = entry;
            }
          }
        }
      });
      setCurrentFormState(stateMap);
      setDirtyFields(new Set());
      setLoading(false);
    });
  }, [currentProject, selectedMaster, selectedView]);

  const masterSchemaKeys = Object.keys(schema);
  const masterCleanKeys = masterSchemaKeys.map((k) => getLegacyViewInfo(k)[0]);

  const filteredSavedMappings = savedMappings.filter((m) => {
    const [cleanMView] = getLegacyViewInfo(m.view_name);
    return masterSchemaKeys.includes(m.view_name) || masterCleanKeys.includes(cleanMView);
  });

  // KPI Metrics
  const totalSavedCount = filteredSavedMappings.length;
  const mandatoryCount = filteredSavedMappings.filter((m) => m.is_mandatory).length;
  const userInputCount = filteredSavedMappings.filter((m) => m.mapping_type === 'Based on User Input').length;
  const fixedValCount = filteredSavedMappings.filter((m) => m.mapping_type === 'Fixed Values').length;
  const blankCount = filteredSavedMappings.filter((m) => m.mapping_type === 'Blank (Default)').length;

  // Filter & Sort Drawer Rows
  const displayedSavedMappings = filteredSavedMappings
    .filter((m) => {
      if (drawerViewFilter !== 'all') {
        const [cleanMView] = getLegacyViewInfo(m.view_name);
        const [cleanTarget] = getLegacyViewInfo(drawerViewFilter);
        if (m.view_name !== drawerViewFilter && cleanMView !== cleanTarget) return false;
      }
      if (drawerRuleFilter !== 'all' && m.mapping_type !== drawerRuleFilter) return false;
      if (drawerSearch.trim()) {
        const query = drawerSearch.toLowerCase().trim();
        const matchView = m.view_name.toLowerCase().includes(query);
        const matchField = m.field_name.toLowerCase().includes(query);
        const matchSource = (m.source_field || '').toLowerCase().includes(query);
        const matchVal = (m.fixed_value || '').toLowerCase().includes(query);

        let matchDesc = false;
        const viewFields = schema[m.view_name] || [];
        const sf = viewFields.find(
          (f) => f.field_name === m.field_name || f.description === m.field_name
        );
        if (sf && sf.description) {
          matchDesc = sf.description.toLowerCase().includes(query);
        }

        if (!matchView && !matchField && !matchSource && !matchVal && !matchDesc) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let valA: any = a[sortField] ?? '';
      let valB: any = b[sortField] ?? '';
      if (typeof valA === 'boolean') valA = valA ? 1 : 0;
      if (typeof valB === 'boolean') valB = valB ? 1 : 0;
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const handleSort = (field: 'view_name' | 'field_name' | 'is_mandatory' | 'mapping_type' | 'fixed_value') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const activeFields: SchemaField[] = (schema[selectedView] || [])
    .filter((f) => !filterMandatory || f.is_mandatory)
    .filter((f) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const matchName = f.field_name.toLowerCase().includes(term);
      const matchDesc = (f.description || '').toLowerCase().includes(term);
      const matchDataType = (f.data_type || '').toLowerCase().includes(term);
      return matchName || matchDesc || matchDataType;
    });

  const getFieldState = (field: SchemaField) => {
    return (
      currentFormState[field.field_name] ||
      (field.description ? currentFormState[field.description] : undefined) || {
        mappingType: 'Blank (Default)',
        fixedValue: '',
        sourceField: ''
      }
    );
  };

  const handleFieldChange = (
    field: SchemaField,
    key: 'mappingType' | 'fixedValue' | 'sourceField',
    val: string
  ) => {
    const currentState = getFieldState(field);
    const updatedState = {
      mappingType: key === 'mappingType' ? (val as MappingType) : currentState.mappingType,
      fixedValue: key === 'fixedValue' ? val : currentState.fixedValue,
      sourceField: key === 'sourceField' ? val : currentState.sourceField
    };

    setCurrentFormState((prev) => ({
      ...prev,
      [field.field_name]: updatedState,
      ...(field.description ? { [field.description]: updatedState } : {})
    }));

    // Mark field as dirty/modified
    setDirtyFields((prev) => {
      const next = new Set(prev);
      next.add(field.field_name);
      return next;
    });
  };

  const handleSaveAll = async () => {
    if (!currentProject || !selectedView) return;
    if (isLocked) {
      setToast({
        type: 'error',
        msg: `Project '${currentProject}' is LOCKED by Admin. Unlock the project in Admin Panel to commit mapping changes.`
      });
      return;
    }

    const fieldsInView = schema[selectedView] || [];
    const changedFields = fieldsInView.filter((f) => dirtyFields.has(f.field_name));

    if (changedFields.length === 0) {
      setToast({
        type: 'success',
        msg: `No mapping changes detected for ${selectedView}.`
      });
      return;
    }

    setSaving(true);
    setToast(null);

    const itemsToSave: FieldMappingItem[] = changedFields.map((field) => {
      const state = getFieldState(field);
      return {
        fieldName: field.field_name,
        fieldDescription: field.description,
        mappingType: state.mappingType,
        sourceField: state.sourceField,
        fixedValue: state.fixedValue,
        isMandatory: field.is_mandatory
      };
    });

    const result = await saveMappingsBatch(currentProject, selectedView, itemsToSave, selectedMaster);

    setSaving(false);
    if (result.count > 0) {
      setToast({
        type: 'success',
        msg: `Successfully saved & updated ${result.count} modified field mapping(s) for ${selectedView}!`
      });
      setDirtyFields(new Set());
      // Refresh saved mappings from DB
      fetchMappingsForProject(currentProject, selectedMaster).then(setSavedMappings);
    } else {
      setToast({
        type: 'error',
        msg: result.error ? `Failed to save field mappings: ${result.error}` : 'Failed to save field mappings.'
      });
    }
  };

  return (
    <div className="space-y-6">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}

      {/* Lock Status Warning Banner */}
      {isLocked && (
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex items-center justify-between text-amber-900 shadow-sm">
          <div className="flex items-center space-x-3">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wide">Project Field Mappings Locked</h4>
              <p className="text-[11px] font-medium text-amber-800 mt-0.5">
                Admin has locked changes for project '{currentProject}'. Field mappings are view-only and cannot be committed.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[10px] font-extrabold bg-amber-200 text-amber-900 rounded-lg uppercase shrink-0">
            🔒 Read Only
          </span>
        </div>
      )}

      {/* Header & Controls Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center">
            <Layers className="w-5 h-5 mr-2 text-blue-600" />
            Field Mapping Configuration
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure SAP target fields for <span className="font-bold text-slate-700">{selectedMaster}</span> view structures.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowSavedContext(!showSavedContext)}
            className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors"
          >
            <Eye className="w-4 h-4 mr-1.5 text-slate-500" />
            {showSavedContext ? 'Hide Context' : 'View Saved Mappings'}
          </button>

          <button
            onClick={handleSaveAll}
            disabled={saving || isLocked}
            className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : isLocked ? (
              <>
                <Lock className="w-4 h-4 mr-1.5" />
                Mappings Locked
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                Save View Mappings
              </>
            )}
          </button>
        </div>
      </div>

      {/* Saved Mappings Audit & Analytics Hub */}
      {showSavedContext && (
        <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          {/* Top Banner / Metrics */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <BarChart2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-extrabold tracking-wide uppercase text-white">
                  Saved Mappings Analytics & Audit ({totalSavedCount} Fields Configured)
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Real-time snapshot of saved target mappings for <span className="font-bold text-blue-300">{selectedMaster}</span> across all SAP views.
              </p>
            </div>

            {/* Quick KPI Stat Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Mandatory</span>
                <span className="text-xs font-black text-rose-400">{mandatoryCount}</span>
              </div>
              <div className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">User Input</span>
                <span className="text-xs font-black text-blue-400">{userInputCount}</span>
              </div>
              <div className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Fixed Value</span>
                <span className="text-xs font-black text-purple-400">{fixedValCount}</span>
              </div>
              <div className="bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-xl text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Default</span>
                <span className="text-xs font-black text-slate-400">{blankCount}</span>
              </div>
            </div>
          </div>

          {/* Drawer Filter Controls Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center bg-slate-800/50 p-3 rounded-xl border border-slate-800">
            {/* View Filter Dropdown (4 cols) */}
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Filter by View
              </label>
              <select
                value={drawerViewFilter}
                onChange={(e) => setDrawerViewFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All SAP Views ({viewOptions.length})</option>
                {viewOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Rule Filter Dropdown (4 cols) */}
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Filter by Rule
              </label>
              <select
                value={drawerRuleFilter}
                onChange={(e) => setDrawerRuleFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Mapping Rules</option>
                {MAPPING_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input (4 cols) */}
            <div className="sm:col-span-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Search Saved Mappings
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter view, field name, value..."
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
                />
                {drawerSearch && (
                  <button
                    onClick={() => setDrawerSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Sorted Table */}
          {displayedSavedMappings.length === 0 ? (
            <div className="py-8 text-center text-slate-400 italic bg-slate-800/40 rounded-xl border border-slate-800 text-xs">
              No saved mappings match your selected filters.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/80">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 sticky top-0 font-bold text-slate-300 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th
                      onClick={() => handleSort('view_name')}
                      className="p-2.5 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center space-x-1">
                        <span>SAP View</span>
                        {sortField === 'view_name' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('field_name')}
                      className="p-2.5 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Field Name</span>
                        {sortField === 'field_name' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('is_mandatory')}
                      className="p-2.5 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Requirement</span>
                        {sortField === 'is_mandatory' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('mapping_type')}
                      className="p-2.5 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Mapping Rule</span>
                        {sortField === 'mapping_type' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('fixed_value')}
                      className="p-2.5 cursor-pointer hover:text-white transition-colors"
                    >
                      <div className="flex items-center space-x-1">
                        <span>Configured Value</span>
                        {sortField === 'fixed_value' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-600" />
                        )}
                      </div>
                    </th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {displayedSavedMappings.map((m, i) => (
                    <tr key={i} className="hover:bg-slate-900/90 transition-colors group">
                      <td className="p-2.5 text-slate-300 font-semibold">{m.view_name}</td>
                      <td className="p-2.5 text-slate-100 font-mono">{m.field_name}</td>
                      <td className="p-2.5">
                        <StatusBadge type="mandatory" value={String(m.is_mandatory)} />
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            m.mapping_type === 'Based on User Input'
                              ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                              : m.mapping_type === 'Fixed Values'
                              ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {m.mapping_type}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-amber-300">
                        {m.fixed_value || <span className="text-slate-600 italic">-</span>}
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => {
                            const match = viewOptions.find(
                              (v) => v === m.view_name || getLegacyViewInfo(v)[0] === getLegacyViewInfo(m.view_name)[0]
                            );
                            if (match) {
                              setSelectedView(match);
                              setSearchTerm(m.field_name);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 inline-flex items-center text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-opacity"
                          title="Jump to field in editor"
                        >
                          Edit Field <ChevronRight className="w-3 h-3 ml-0.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View Selector & Search Row */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* View Selector (5 Cols) */}
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Select SAP Structure / View
            </label>
            <select
              value={selectedView}
              onChange={(e) => {
                setSelectedView(e.target.value);
                setSearchTerm('');
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            >
              {viewOptions.map((view) => (
                <option key={view} value={view}>
                  {view}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input Bar (5 Cols) */}
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Search Field in View
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by field name or description (e.g. WERKS, Plant)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Mandatory Checkbox (2 Cols) */}
          <div className="md:col-span-2 flex items-end h-full pt-2 md:pt-0 justify-start md:justify-end">
            <label className="inline-flex items-center cursor-pointer space-x-2 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors w-full justify-center md:w-auto">
              <input
                type="checkbox"
                checked={filterMandatory}
                onChange={(e) => setFilterMandatory(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span className="whitespace-nowrap">Mandatory Only</span>
            </label>
          </div>
        </div>

        {/* Counter Badge / Active Filter status bar */}
        {(searchTerm || filterMandatory) && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <div className="flex items-center space-x-2">
              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                {activeFields.length} of {(schema[selectedView] || []).length} fields match
              </span>
              {searchTerm && (
                <span>
                  Filter: "<span className="text-slate-800 font-semibold">{searchTerm}</span>"
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterMandatory(false);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Fields Mapping Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">SAP Field</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Data Type & Len</th>
                <th className="py-3 px-4">Requirement</th>
                <th className="py-3 px-4">Mapping Rule</th>
                <th className="py-3 px-4">Fixed Value / User Field</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                    Loading view fields...
                  </td>
                </tr>
              ) : activeFields.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 space-y-2">
                    <Search className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                    <p className="text-xs font-semibold text-slate-600">No fields match your search term "{searchTerm}"</p>
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setFilterMandatory(false);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold underline"
                    >
                      Clear search filter
                    </button>
                  </td>
                </tr>
              ) : (
                activeFields.map((field) => {
                  const state = getFieldState(field);

                  return (
                    <tr key={field.field_name} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {field.field_name}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {field.description}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                        {field.data_type} {field.length ? `(${field.length})` : ''}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge type="mandatory" value={String(field.is_mandatory)} />
                      </td>
                      <td className="py-3 px-4 min-w-[200px]">
                        <select
                          value={state.mappingType}
                          onChange={(e) =>
                            handleFieldChange(field, 'mappingType', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {MAPPING_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4 min-w-[220px]">
                        {state.mappingType === 'Fixed Values' ? (
                          <input
                            type="text"
                            placeholder="Enter fixed value"
                            value={state.fixedValue}
                            onChange={(e) =>
                              handleFieldChange(field, 'fixedValue', e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : state.mappingType === 'Based on User Input' ? (
                          <input
                            type="text"
                            placeholder="Source field name"
                            value={state.sourceField}
                            onChange={(e) =>
                              handleFieldChange(field, 'sourceField', e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">- Automatic -</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
