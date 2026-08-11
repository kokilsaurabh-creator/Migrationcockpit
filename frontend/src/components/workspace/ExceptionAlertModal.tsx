import React, { useState, useEffect, useMemo } from 'react';
import { GenerationException } from '../../types';
import { ShieldAlert, X, AlertTriangle, Save, Trash2 } from 'lucide-react';

interface ExceptionAlertModalProps {
  isOpen: boolean;
  exceptions: GenerationException[];
  uploadedRecords: Record<string, any>[];
  templateColumns: string[];
  onClose: () => void;
  onSaveAndRetry: (corrections: Record<number, Record<string, string>>, deletedIndices: Set<number>) => void;
}

export const ExceptionAlertModal: React.FC<ExceptionAlertModalProps> = ({
  isOpen,
  exceptions,
  uploadedRecords,
  templateColumns,
  onClose,
  onSaveAndRetry,
}) => {
  const [corrections, setCorrections] = useState<Record<number, Record<string, string>>>({});
  const [deletedRowIndices, setDeletedRowIndices] = useState<Set<number>>(new Set());

  // Reset corrections and deletions when modal opens with new exceptions
  useEffect(() => {
    setCorrections({});
    setDeletedRowIndices(new Set());
  }, [exceptions, isOpen]);

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

  const handleSave = () => {
    onSaveAndRetry(corrections, deletedRowIndices);
  };

  const activeRows = uniqueFailingRowIndices.filter(idx => !deletedRowIndices.has(idx));

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
              <h2 className="text-xl font-bold tracking-tight">XML Generation Paused</h2>
              <p className="text-sm text-rose-600/80 font-medium">
                {exceptions.length} exception(s) found across {uniqueFailingRowIndices.length} records. Please correct the highlighted errors or delete invalid records.
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

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 bg-slate-50 flex flex-col">
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
                      <td colSpan={columnsToRender.length + 2} className="px-6 py-8 text-center text-slate-500">
                        No active records. You have deleted all failing rows.
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0">
          <div className="text-sm text-slate-500 font-medium flex items-center gap-4">
            {deletedRowIndices.size > 0 && (
              <span className="text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-100">
                {deletedRowIndices.size} row(s) deleted
              </span>
            )}
            <button
              onClick={() => {
                const allFailing = new Set(exceptions.map(ex => ex.rowIndex));
                setDeletedRowIndices(allFailing);
              }}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 hover:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition-colors"
              title="Delete all failing records"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All Invalid
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
              Save & Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
