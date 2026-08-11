// frontend/src/components/workspace/DuplicateWarningModal.tsx
import React, { useState } from 'react';
import type { DuplicateCheckResult } from '../../types';
import { ShieldAlert, AlertTriangle, XCircle, ArrowRight, Ban, CheckCircle2, CheckSquare, Square } from 'lucide-react';

interface DuplicateWarningModalProps {
  result: DuplicateCheckResult;
  inputRecord?: Record<string, any>;
  onCancel: () => void;
  onProceed: (allowedSapIds: string[]) => void;
}

export const DuplicateWarningModal: React.FC<DuplicateWarningModalProps> = ({
  result,
  inputRecord = {},
  onCancel,
  onProceed
}) => {
  const isHardMatch = result.highest_risk_tier === 'HARD';
  const matches = result.matches || [];

  // Selective allow/disallow map for each matched record by index
  const [allowedMap, setAllowedMap] = useState<Record<string, boolean>>(() => {
    const initialMap: Record<string, boolean> = {};
    matches.forEach((m, idx) => {
      initialMap[`${m.sap_id}||${idx}`] = true; // default all entries to ALLOWED
    });
    return initialMap;
  });

  const toggleEntry = (key: string) => {
    setAllowedMap((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const allowAll = () => {
    const updated: Record<string, boolean> = {};
    matches.forEach((m, idx) => {
      updated[`${m.sap_id}||${idx}`] = true;
    });
    setAllowedMap(updated);
  };

  const disallowAll = () => {
    const updated: Record<string, boolean> = {};
    matches.forEach((m, idx) => {
      updated[`${m.sap_id}||${idx}`] = false;
    });
    setAllowedMap(updated);
  };

  const allowedCount = matches.filter((m, idx) => allowedMap[`${m.sap_id}||${idx}`]).length;
  const disallowedCount = matches.length - allowedCount;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white max-w-5xl w-full rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-0 my-8">
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
                  {isHardMatch ? 'HARD MATCH (OVERRIDE PERMITTED)' : 'SOFT MATCH (WARN)'}
                </span>
                <h2 className="text-lg font-extrabold tracking-tight">
                  Selective Entry Duplicate Review
                </h2>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-1">
                {result.summary} Toggle entries below to <span className="font-bold text-emerald-400">ALLOW</span> or <span className="font-bold text-rose-300">DISALLOW</span> into XML generation.
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
          {/* Risk Alert & Action Box */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isHardMatch
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-start space-x-3">
              {isHardMatch ? (
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-medium space-y-0.5">
                <p className="font-bold">
                  Selective Entry Override Active
                </p>
                <p className="text-slate-600">
                  Selectively mark each duplicate record as <span className="font-bold text-emerald-700">ALLOW</span> to include in XML payload generation, or <span className="font-bold text-rose-700">DISALLOW</span> to exclude it.
                </p>
              </div>
            </div>

            {/* Quick Bulk Action Buttons */}
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={allowAll}
                className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-all shadow-sm"
              >
                Allow All ({matches.length})
              </button>
              <button
                type="button"
                onClick={disallowAll}
                className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 border border-rose-300 rounded-lg transition-all shadow-sm"
              >
                Disallow All
              </button>
            </div>
          </div>

          {/* Matches Comparison Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Input Data vs. Existing SAP Master Data Records ({matches.length} Matches)
              </h3>
              <div className="text-xs font-bold space-x-3">
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                  Allowed: {allowedCount}
                </span>
                <span className="text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded border border-rose-200">
                  Disallowed: {disallowedCount}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                  <tr>
                    <th className="p-3 text-center">Entry Decision</th>
                    <th className="p-3">Risk Tier</th>
                    <th className="p-3">Match Reason</th>
                    <th className="p-3">Existing SAP Record ID</th>
                    <th className="p-3">SAP Record Name</th>
                    <th className="p-3 text-right">Similarity Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {matches.map((m, idx) => {
                    const key = `${m.sap_id}||${idx}`;
                    const isAllowed = !!allowedMap[key];

                    return (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          isAllowed ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : 'bg-rose-50/30 hover:bg-rose-50/60'
                        }`}
                      >
                        {/* Interactive Selective Toggle Button */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleEntry(key)}
                            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                              isAllowed
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500'
                                : 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {isAllowed ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-white" />
                                ALLOW ENTRY
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                                DISALLOW
                              </>
                            )}
                          </button>
                        </td>

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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 font-semibold">
            <span className="text-emerald-700 font-bold flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Selective entry policy enabled. {allowedCount} of {matches.length} entries set to ALLOW.
            </span>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            <button
              onClick={onCancel}
              className="flex-1 sm:flex-none px-5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors"
            >
              Cancel & Edit Input Data
            </button>

            <button
              onClick={() => {
                const allowedSapIds = matches
                  .filter((m, idx) => allowedMap[`${m.sap_id}||${idx}`])
                  .map((m) => m.sap_id);
                onProceed(allowedSapIds);
              }}
              disabled={allowedCount === 0}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center px-5 py-2 text-xs font-bold text-white rounded-xl transition-all shadow-md ${
                allowedCount === 0
                  ? 'bg-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
              }`}
            >
              <span>Proceed with {allowedCount} Allowed Entries</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
