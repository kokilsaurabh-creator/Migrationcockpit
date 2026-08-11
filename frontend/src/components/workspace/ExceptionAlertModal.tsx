import React, { useState, useEffect } from 'react';
import { GenerationException } from '../../types';
import { ShieldAlert, X, AlertTriangle, Save } from 'lucide-react';

interface ExceptionAlertModalProps {
  isOpen: boolean;
  exceptions: GenerationException[];
  onClose: () => void;
  onSaveAndRetry: (corrections: Record<number, Record<string, string>>) => void;
}

export const ExceptionAlertModal: React.FC<ExceptionAlertModalProps> = ({
  isOpen,
  exceptions,
  onClose,
  onSaveAndRetry,
}) => {
  const [corrections, setCorrections] = useState<Record<number, Record<string, string>>>({});

  // Reset corrections when modal opens with new exceptions
  useEffect(() => {
    setCorrections({});
  }, [exceptions, isOpen]);

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

  const handleSave = () => {
    onSaveAndRetry(corrections);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100 bg-rose-50/50">
          <div className="flex items-center space-x-3 text-rose-700">
            <div className="p-2 bg-rose-100 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">XML Generation Paused</h2>
              <p className="text-sm text-rose-600/80 font-medium">
                {exceptions.length} exception(s) found during rule validation.
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
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Row #</th>
                    <th className="px-6 py-4 font-semibold">Affected Field</th>
                    <th className="px-6 py-4 font-semibold">Reason</th>
                    <th className="px-6 py-4 font-semibold">Inline Correction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {exceptions.map((ex, i) => (
                    <tr key={`${ex.rowIndex}-${ex.fieldName}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {ex.rowIndex + 1}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-medium text-xs border border-blue-100">
                          {ex.fieldName}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span>Missing Fixed Rule Value</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={corrections[ex.rowIndex]?.[ex.fieldName] || ''}
                          onChange={(e) => handleInputChange(ex.rowIndex, ex.fieldName, e.target.value)}
                          placeholder={`Enter ${ex.fieldName}...`}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-200 bg-white space-x-3">
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
  );
};
