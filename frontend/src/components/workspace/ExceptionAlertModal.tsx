import React, { useState, useEffect, useMemo } from 'react';
import { GenerationException, DataSanityException } from '../../types';
import { ShieldAlert, X, AlertTriangle, Save, Trash2, CheckCircle2, XCircle, CheckSquare, Square, Filter } from 'lucide-react';

interface ExceptionAlertModalProps {
  isOpen: boolean;
  exceptions: GenerationException[];
  sanityExceptions?: DataSanityException[];
  uploadedRecords: Record<string, any>[];
  templateColumns: string[];
  onClose: () => void;
  onSaveAndRetry: (
    corrections: Record<number, Record<string, string>>,
    deletedIndices: Set<number>,
    allowedSanityIds: Set<string>
  ) => void;
}

export const ExceptionAlertModal: React.FC<ExceptionAlertModalProps> = ({
  isOpen,
  exceptions,
  sanityExceptions = [],
  uploadedRecords,
  templateColumns,
  onClose,
  onSaveAndRetry,
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'sanity'>('rules');
  const [corrections, setCorrections] = useState<Record<number, Record<string, string>>>({});
  const [deletedRowIndices, setDeletedRowIndices] = useState<Set<number>>(new Set());
  const [allowedSanityIds, setAllowedSanityIds] = useState<Set<string>>(new Set());

  // Default tab based on available exceptions
  useEffect(() => {
    setCorrections({});
    setDeletedRowIndices(new Set());
    setAllowedSanityIds(new Set());

    if (exceptions.length === 0 && sanityExceptions.length > 0) {
      setActiveTab('sanity');
    } else {
      setActiveTab('rules');
    }
  }, [exceptions, sanityExceptions, isOpen]);

  const uniqueFailingRowIndices = useMemo(() => {
    return Array.from(new Set(exceptions.map(ex => ex.rowIndex))).sort((a, b) => a - b);
  }, [exceptions]);

  const columnsToRender = useMemo(() => {
    const allCols = new Set([...templateColumns, ...exceptions.map(ex => ex.fieldName)]);
    return Array.from(allCols);
  }, [templateColumns, exceptions]);

  if (!isOpen) return null;

  const handleInputChange = (rowIndex: number, fieldName: string, value: string) => {
    setCorrections((prev) => ({
      ...prev,
      [rowIndex]: {
        ...prev[rowIndex],
        [fieldName]: value,
      },
    }));
  };

  const handleDeleteRow = (rowIndex: number) => {
    setDeletedRowIndices(prev => {
      const next = new Set(prev);
      next.add(rowIndex);
      return next;
    });
  };

  // Selective Allow / Disallow toggle for Data Sanity checks
  const toggleSanityAllowed = (id: string) => {
    setAllowedSanityIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Global Allow All for Data Sanity
  const handleAllowAllSanity = () => {
    const allIds = new Set(sanityExceptions.map(s => s.id));
    setAllowedSanityIds(allIds);
  };

  // Global Disallow All for Data Sanity
  const handleDisallowAllSanity = () => {
    setAllowedSanityIds(new Set());
  };

  const handleSave = () => {
    onSaveAndRetry(corrections, deletedRowIndices, allowedSanityIds);
  };

  const activeRows = uniqueFailingRowIndices.filter(idx => !deletedRowIndices.has(idx));
  const activeSanityExceptions = sanityExceptions.filter(s => !deletedRowIndices.has(s.rowIndex));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-7xl max-h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100 bg-rose-50/50 flex-shrink-0">
          <div className="flex items-center space-x-3 text-rose-700">
            <div className="p-2 bg-rose-100 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">XML Generation Pre-flight Validation</h2>
              <p className="text-sm text-rose-600/80 font-medium">
                {exceptions.length > 0 && `${exceptions.length} rule exception(s) across ${uniqueFailingRowIndices.length} records. `}
                {sanityExceptions.length > 0 && `${sanityExceptions.length} data sanity check(s) flagged.`}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 bg-slate-100 border-b border-slate-200 gap-2 pt-2 flex-shrink-0">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'rules'
                ? 'bg-white border-slate-200 text-rose-700 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            Rule & Required Fields
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              exceptions.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'
            }`}>
              {exceptions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('sanity')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all flex items-center gap-2 border-t border-x ${
              activeTab === 'sanity'
                ? 'bg-white border-slate-200 text-blue-700 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Data Sanity & Quality Checks
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
              sanityExceptions.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
            }`}>
              {sanityExceptions.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden p-6 bg-slate-50 flex flex-col">
          {activeTab === 'rules' ? (
            /* TAB 1: Rule & Mandatory Exceptions Table */
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col">
              <div className="overflow-auto flex-1 relative">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 font-semibold sticky left-0 bg-slate-50 z-30 shadow-[1px_0_0_0_#e2e8f0]">Row #</th>
                      {columnsToRender.map(col => (
                        <th key={col} className="px-4 py-3 font-semibold whitespace-nowrap min-w-[200px] border-l border-slate-200">
                          {col}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-semibold sticky right-0 bg-slate-50 z-30 shadow-[-1px_0_0_0_#e2e8f0] text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {activeRows.length === 0 ? (
                      <tr>
                        <td colSpan={columnsToRender.length + 2} className="px-6 py-8 text-center text-slate-500 font-medium">
                          {exceptions.length === 0 ? 'No rule exceptions found.' : 'All failing rule rows have been deleted.'}
                        </td>
                      </tr>
                    ) : (
                      activeRows.map(rowIndex => {
                        const rowData = uploadedRecords[rowIndex] || {};
                        const rowExceptions = exceptions.filter(ex => ex.rowIndex === rowIndex);
                        
                        return (
                          <tr key={rowIndex} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-4 py-3 font-medium text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50/50 z-10 shadow-[1px_0_0_0_#e2e8f0]">
                              {rowIndex + 1}
                            </td>
                            {columnsToRender.map(col => {
                              const isException = rowExceptions.some(ex => ex.fieldName === col);
                              const currentValue = corrections[rowIndex]?.[col] !== undefined 
                                ? corrections[rowIndex][col] 
                                : (rowData[col] || '');
                                
                              return (
                                <td key={col} className="px-4 py-2 border-l border-slate-200">
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={currentValue}
                                      onChange={(e) => handleInputChange(rowIndex, col, e.target.value)}
                                      placeholder={isException ? `Missing fixed value...` : ''}
                                      className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${
                                        isException 
                                          ? 'border-rose-400 bg-rose-50 focus:border-rose-500 focus:ring-rose-500/20' 
                                          : 'bg-white border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white bg-slate-50/50'
                                      }`}
                                    />
                                    {isException && (
                                      <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500 pointer-events-none" />
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-4 py-2 sticky right-0 bg-white group-hover:bg-slate-50/50 z-10 shadow-[-1px_0_0_0_#e2e8f0] text-center">
                              <button
                                onClick={() => handleDeleteRow(rowIndex)}
                                title="Delete Row"
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* TAB 2: Data Sanity & Quality Checks Table */
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col">
              {/* Sanity Controls Bar: Allow All, Disallow All, Status Summary */}
              <div className="px-5 py-3 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-3 text-xs font-semibold text-slate-700">
                  <span>Data Sanity Governance Controls:</span>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold">
                    {allowedSanityIds.size} Allowed
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                    {activeSanityExceptions.length - allowedSanityIds.size} Disallowed
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleAllowAllSanity}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors shadow-sm"
                    title="Allow all data sanity warnings and proceed"
                  >
                    <CheckSquare className="w-3.5 h-3.5 mr-1.5" />
                    Allow All
                  </button>
                  <button
                    onClick={handleDisallowAllSanity}
                    className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-300 rounded-lg hover:bg-rose-100 transition-colors shadow-sm"
                    title="Disallow all data sanity warnings"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" />
                    Disallow All
                  </button>
                </div>
              </div>

              {/* Data Sanity Table */}
              <div className="overflow-auto flex-1 relative">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                    <tr>
                      <th className="px-4 py-3 font-semibold sticky left-0 bg-slate-50 z-30 shadow-[1px_0_0_0_#e2e8f0]">Row #</th>
                      <th className="px-4 py-3 font-semibold">Check Type</th>
                      <th className="px-4 py-3 font-semibold">Field Name</th>
                      <th className="px-4 py-3 font-semibold min-w-[180px]">Current Value</th>
                      <th className="px-4 py-3 font-semibold min-w-[320px]">Validation Issue</th>
                      <th className="px-4 py-3 font-semibold text-center min-w-[140px]">Governance Status</th>
                      <th className="px-4 py-3 font-semibold sticky right-0 bg-slate-50 z-30 shadow-[-1px_0_0_0_#e2e8f0] text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {activeSanityExceptions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-slate-500 font-medium">
                          No data sanity warnings found. All checks passed cleanly.
                        </td>
                      </tr>
                    ) : (
                      activeSanityExceptions.map((item) => {
                        const isAllowed = allowedSanityIds.has(item.id);
                        const rowData = uploadedRecords[item.rowIndex] || {};
                        const valInCorrections = corrections[item.rowIndex]?.[item.fieldName];
                        const displayVal = valInCorrections !== undefined ? valInCorrections : item.currentValue;

                        return (
                          <tr key={item.id} className={`hover:bg-slate-50/70 transition-colors ${isAllowed ? 'bg-emerald-50/20' : 'bg-rose-50/20'}`}>
                            <td className="px-4 py-3 font-mono font-bold text-slate-900 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#e2e8f0]">
                              {item.rowIndex + 1}
                            </td>
                            <td className="px-4 py-3 font-bold text-amber-700 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200 font-mono">
                                {item.checkType}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                              {item.fieldName}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={displayVal}
                                onChange={(e) => handleInputChange(item.rowIndex, item.fieldName, e.target.value)}
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900 font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-rose-700 font-medium leading-relaxed">
                              {item.message}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <button
                                onClick={() => toggleSanityAllowed(item.id)}
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
                                  isAllowed
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-rose-600 text-white hover:bg-rose-700'
                                }`}
                              >
                                {isAllowed ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Allowed
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5 mr-1" /> Disallowed
                                  </>
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 sticky right-0 bg-white z-10 shadow-[-1px_0_0_0_#e2e8f0] text-center">
                              <button
                                onClick={() => handleDeleteRow(item.rowIndex)}
                                title="Delete Record"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0">
          <div className="text-sm text-slate-500 font-medium flex items-center gap-4">
            {deletedRowIndices.size > 0 && (
              <span className="text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-100 font-semibold">
                {deletedRowIndices.size} row(s) marked for deletion
              </span>
            )}
            <button
              onClick={() => {
                const allFailing = new Set([
                  ...exceptions.map(ex => ex.rowIndex),
                  ...sanityExceptions.filter(s => !allowedSanityIds.has(s.id)).map(s => s.rowIndex)
                ]);
                setDeletedRowIndices(allFailing);
              }}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-medium text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 hover:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-colors"
              title="Delete all records with active unallowed issues"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Disallowed Records
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors shadow-sm"
            >
              <Save className="w-4 h-4 mr-2" />
              Apply & Generate XML
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

