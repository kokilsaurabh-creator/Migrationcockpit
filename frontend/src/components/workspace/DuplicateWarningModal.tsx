// frontend/src/components/workspace/DuplicateWarningModal.tsx
import React from 'react';
import type { DuplicateCheckResult } from '../../types';
import { ShieldAlert, AlertTriangle, XCircle, ArrowRight, Ban, CheckCircle2 } from 'lucide-react';

interface DuplicateWarningModalProps {
  result: DuplicateCheckResult;
  inputRecord?: Record<string, any>;
  onCancel: () => void;
  onProceed: () => void;
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  result,
  inputRecord = {},
  onCancel,
  onProceed
}) => {
  const isHardMatch = result.highest_risk_tier === 'HARD';
  const matches = result.matches || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white max-w-4xl w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-0 my-8">
        {/* Modal Header */}
        <div
          className={`p-6 text-white flex items-start justify-between ${
            isHardMatch
              ? 'bg-rose-900 border-b border-rose-800'
              : 'bg-amber-900 border-b border-amber-800'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`p-3 rounded-xl border ${
                isHardMatch
                  ? 'bg-rose-600/30 text-rose-300 border-rose-500/30'
                  : 'bg-amber-600/30 text-amber-300 border-amber-500/30'
              }`}
            >
              {isHardMatch ? <ShieldAlert className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span
                  className={`px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md ${
                    isHardMatch ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-900'
                  }`}
                >
                  {isHardMatch ? 'HARD MATCH (PROHIBITED)' : 'SOFT MATCH (WARN)'}
                </span>
                <h2 className="text-lg font-extrabold tracking-tight">
                  {isHardMatch
                    ? 'CRITICAL: SAP Duplicate Block Activated'
                    : 'WARNING: Potential SAP Duplicate Detected'}
                </h2>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-1">
                {result.summary}
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Risk Alert Box */}
          <div
            className={`p-4 rounded-xl border flex items-start space-x-3 ${
              isHardMatch
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {isHardMatch ? (
              <Ban className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="text-xs font-medium space-y-1">
              <p className="font-bold">
                {isHardMatch
                  ? 'XML Generation Disabled: Exact Tax/Financial identifier already exists in SAP.'
                  : 'Review Required: Record shares similar name/address attributes with existing SAP data.'}
              </p>
              <p className="text-slate-600">
                {isHardMatch
                  ? 'To prevent corrupted master data or SAP posting failures, you cannot proceed with XML generation until the duplicate input data is corrected.'
                  : 'You may choose to cancel and edit your input file, or ignore this warning to proceed.'}
              </p>
            </div>
          </div>

          {/* Matches Comparison Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Input Data vs. Existing SAP Master Data Records ({matches.length} Matches)
            </h3>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Risk Tier</th>
                    <th className="p-3">Match Reason</th>
                    <th className="p-3">Existing SAP Record ID</th>
                    <th className="p-3">SAP Record Name</th>
                    <th className="p-3 text-right">Similarity Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {matches.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black ${
                            m.match_tier === 'HARD'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {m.match_tier} MATCH
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{m.match_reason}</td>
                      <td className="p-3 font-mono font-bold text-blue-600">{m.sap_id}</td>
                      <td className="p-3 font-medium text-slate-900">{m.record_name}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700">
                        {Math.round(m.similarity_score * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 font-semibold">
            {isHardMatch ? (
              <span className="text-rose-600 font-bold flex items-center">
                <Ban className="w-3.5 h-3.5 mr-1" />
                Hard match policy active. XML export locked.
              </span>
            ) : (
              <span className="text-amber-700 font-bold flex items-center">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                Soft match policy active. User override permitted.
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button
              onClick={onCancel}
              className="flex-1 sm:flex-none px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors"
            >
              Cancel & Edit Input Data
            </button>

            <button
              onClick={onProceed}
              disabled={isHardMatch}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center px-5 py-2 text-xs font-bold text-white rounded-xl transition-all shadow-md ${
                isHardMatch
                  ? 'bg-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
              }`}
            >
              <span>Ignore & Proceed to XML</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
