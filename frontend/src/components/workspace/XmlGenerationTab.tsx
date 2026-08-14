// frontend/src/components/workspace/XmlGenerationTab.tsx
import React, { useEffect, useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import { loadMasterSchema, getFieldDescription } from '../../utils/schemaLoader';
import { fetchMappingsForProject } from '../../services/mappingService';
import { fetchProjectRules } from '../../services/rulesService';
import { fetchPlantSLocMappings } from '../../services/plantStorageLocationService';
import { generateXmlPayload, expandRawRecords, validateXmlPayload } from '../../services/xmlGeneratorService';
import { checkMasterDataDuplicates } from '../../services/duplicateCheckService';
import { validateDataSanity } from '../../services/dataSanityService';
import { MASTER_CONFIGS } from '../../utils/constants';
import { FieldMapping, FixedRuleRecord, DuplicateCheckResult, GenerationException, DataSanityException } from '../../types';
import { DataGrid } from '../common/DataGrid';
import { Toast } from '../common/Toast';
import { DuplicateWarningModal } from './DuplicateWarningModal';
import { ExceptionAlertModal } from './ExceptionAlertModal';
import * as XLSX from 'xlsx';
import { FileCode, Download, Upload, Play, CheckCircle2, Loader2, FileSpreadsheet, Sparkles, ShieldAlert, ShieldCheck } from 'lucide-react';

export const XmlGenerationTab: React.FC = () => {
  const { currentProject, selectedMaster } = useProject();
  const config = MASTER_CONFIGS[selectedMaster];
  const schema = loadMasterSchema(selectedMaster);

  const [allMappings, setAllMappings] = useState<FieldMapping[]>([]);
  const [savedRules, setSavedRules] = useState<FixedRuleRecord[]>([]);

  const [templateColumns, setTemplateColumns] = useState<string[]>(config.baseColumns);
  const [uploadedRecords, setUploadedRecords] = useState<Record<string, any>[]>([]);
  const [expandedCount, setExpandedCount] = useState<number>(0);
  const [generatedXml, setGeneratedXml] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [executing, setExecuting] = useState<boolean>(false);
  const [duplicateChecking, setDuplicateChecking] = useState<boolean>(false);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState<boolean>(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [exceptions, setExceptions] = useState<GenerationException[]>([]);
  const [sanityExceptions, setSanityExceptions] = useState<DataSanityException[]>([]);
  const [showExceptionModal, setShowExceptionModal] = useState<boolean>(false);

  useEffect(() => {
    if (!currentProject) return;
    setLoading(true);

    Promise.all([
      fetchMappingsForProject(currentProject, selectedMaster),
      fetchProjectRules(currentProject, selectedMaster)
    ]).then(([mappings, rules]) => {
      setAllMappings(mappings);
      setSavedRules(rules);

      const validMasterFields = new Set<string>();
      Object.keys(schema).forEach((viewName) => {
        const fields = schema[viewName] || [];
        fields.forEach((f) => {
          if (f.field_name) validMasterFields.add(f.field_name);
          if (f.description) validMasterFields.add(f.description);
        });
      });

      const userMappedFields: string[] = [];
      mappings.forEach((m) => {
        if (
          m.mapping_type === 'Based on User Input' &&
          validMasterFields.has(m.field_name)
        ) {
          const desc = getFieldDescription(m.field_name, selectedMaster);
          if (!config.baseColumns.includes(desc) && !userMappedFields.includes(desc)) {
            userMappedFields.push(desc);
          }
        }
      });

      setTemplateColumns([...config.baseColumns, ...userMappedFields]);
      setLoading(false);
    });
  }, [currentProject, selectedMaster]);

  // Download Upload Template Excel
  const handleDownloadTemplate = () => {
    const emptyRow: Record<string, string> = {};
    templateColumns.forEach((col) => (emptyRow[col] = ''));
    const worksheet = XLSX.utils.json_to_sheet([emptyRow]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'User Data');
    XLSX.writeFile(
      workbook,
      `${currentProject}_${selectedMaster.replace(/\s+/g, '_')}_Upload_Template.xlsx`
    );
  };

  // Handle Excel Upload
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

        setUploadedRecords(data);
        const expanded = expandRawRecords(selectedMaster, savedRules, data, allMappings);
        setExpandedCount(expanded.length);
        setGeneratedXml(null);
        setDuplicateResult(null);
        setToast({
          type: 'success',
          msg: `Loaded ${data.length} raw records (${expanded.length} total expanded combinations via * wildcard logic)!`
        });
      } catch (err: any) {
        setToast({ type: 'error', msg: `Failed to parse Excel file: ${err.message}` });
      }
    };
    reader.readAsBinaryString(file);
  };

  // Duplicate Check Handler
  const handleCheckDuplicates = async () => {
    if (uploadedRecords.length === 0) {
      setToast({ type: 'error', msg: 'Please upload raw data Excel file first.' });
      return;
    }

    setDuplicateChecking(true);
    setToast(null);

    try {
      const allMatches: any[] = [];
      let highestRiskTier: 'NONE' | 'SOFT' | 'HARD' = 'NONE';

      for (const rec of uploadedRecords) {
        const result = await checkMasterDataDuplicates(
          currentProject || 'LANDMARK_QA',
          selectedMaster,
          rec
        );

        if (result.has_duplicates && result.matches.length > 0) {
          allMatches.push(...result.matches);
          if (result.highest_risk_tier === 'HARD') highestRiskTier = 'HARD';
          else if (result.highest_risk_tier === 'SOFT' && highestRiskTier !== 'HARD') highestRiskTier = 'SOFT';
        }
      }

      const aggregatedResult: DuplicateCheckResult = {
        has_duplicates: allMatches.length > 0,
        highest_risk_tier: highestRiskTier,
        summary: allMatches.length > 0
          ? `Found ${allMatches.length} duplicate match(es) in SAP S/4HANA across ${uploadedRecords.length} record(s).`
          : '✅ SAP Duplicate Check Passed: No duplicates found in SAP S/4HANA!',
        matches: allMatches
      };

      setDuplicateResult(aggregatedResult);
      setDuplicateChecking(false);

      if (aggregatedResult.has_duplicates) {
        setShowDuplicateModal(true);
      } else {
        setToast({
          type: 'success',
          msg: '✅ SAP Duplicate Check Passed: No duplicates found in SAP S/4HANA!'
        });
      }
    } catch (err: any) {
      setDuplicateChecking(false);
      setToast({ type: 'error', msg: `Duplicate Check Error: ${err.message}` });
    }
  };

  // Execute Transformation & XML Payload Generation
  const handleExecuteMigration = async (recordsToUse?: Record<string, any>[], overrideAllowedSanityIds?: Set<string>) => {
    const records = recordsToUse || uploadedRecords;
    if (records.length === 0) {
      setToast({ type: 'error', msg: 'Please upload raw data Excel file first.' });
      return;
    }

    setExecuting(true);
    setToast(null);

    try {
      // 1. Rule & Mandatory Field Exceptions
      const validationExceptions = validateXmlPayload(selectedMaster, schema, allMappings, savedRules, records);

      // 2. Data Sanity Checks (PAN format, Country PIN code, GST-PAN embedding match)
      const dataSanityResult = validateDataSanity(selectedMaster, records, schema, allMappings);

      // Apply any user-approved 'Allowed' overrides
      const updatedSanityResult = dataSanityResult.map((item) => ({
        ...item,
        allowed: overrideAllowedSanityIds?.has(item.id) || item.allowed
      }));

      const unallowedSanityExceptions = updatedSanityResult.filter((s) => !s.allowed);

      if (validationExceptions.length > 0 || unallowedSanityExceptions.length > 0) {
        setExceptions(validationExceptions);
        setSanityExceptions(updatedSanityResult);
        setShowExceptionModal(true);
        setExecuting(false);
        return;
      }

      const plantSLocMappings = await fetchPlantSLocMappings(currentProject || '');
      const xmlResult = await generateXmlPayload(
        selectedMaster,
        schema,
        allMappings,
        savedRules,
        records,
        plantSLocMappings
      );

      const expanded = expandRawRecords(selectedMaster, savedRules, records, allMappings);
      setExpandedCount(expanded.length);
      setGeneratedXml(xmlResult);
      setExecuting(false);
      setToast({
        type: 'success',
        msg: `Payload generated successfully for ${expanded.length} record combinations (${records.length} raw records)!`
      });
    } catch (err: any) {
      setExecuting(false);
      setToast({ type: 'error', msg: `XML Payload Generation error: ${err.message}` });
    }
  };

  const handleApplyCorrections = (corrections: Record<number, Record<string, string>>, deletedIndices: Set<number>, allowedSanityIds: Set<string>) => {
    setShowExceptionModal(false);
    
    // Apply edits
    const updatedRecords = [...uploadedRecords];
    Object.keys(corrections).forEach((rowIndexStr) => {
      const rowIndex = parseInt(rowIndexStr, 10);
      const rowCorrections = corrections[rowIndex];
      if (updatedRecords[rowIndex]) {
        updatedRecords[rowIndex] = {
          ...updatedRecords[rowIndex],
          ...rowCorrections
        };
      }
    });

    // Remove deleted rows
    const filteredRecords = updatedRecords.filter((_, idx) => !deletedIndices.has(idx));
    
    setUploadedRecords(filteredRecords);
    handleExecuteMigration(filteredRecords, allowedSanityIds);
  };

  // Download XML file
  const handleDownloadXml = () => {
    if (!generatedXml) return;
    const blob = new Blob([generatedXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${currentProject}_${selectedMaster.replace(/\s+/g, '_')}_Payload.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const gridColumns = templateColumns.map((col) => ({
    key: col,
    header: col
  }));

  const wildcardInfo =
    selectedMaster === 'Material Master'
      ? 'Plant & Distribution Channel'
      : selectedMaster === 'Customer Master'
      ? 'Distribution Channel & Division'
      : 'Purchasing Organization & Company Code';

  return (
    <div className="space-y-6">
      {toast && <Toast type={toast.type} message={toast.msg} onClose={() => setToast(null)} />}

      <ExceptionAlertModal
        isOpen={showExceptionModal}
        exceptions={exceptions}
        sanityExceptions={sanityExceptions}
        uploadedRecords={uploadedRecords}
        templateColumns={templateColumns}
        onClose={() => setShowExceptionModal(false)}
        onSaveAndRetry={handleApplyCorrections}
      />

      {/* Duplicate Warning Modal */}
      {showDuplicateModal && duplicateResult && (
        <DuplicateWarningModal
          result={duplicateResult}
          inputRecord={uploadedRecords[0]}
          onCancel={() => setShowDuplicateModal(false)}
          onProceed={(allowedSapIds: string[]) => {
            setShowDuplicateModal(false);
            const allowedSet = new Set(allowedSapIds.map((id) => id.trim().toUpperCase()));

            const filtered = uploadedRecords.filter((rec) => {
              const recId = String(
                rec.Product ||
                rec.MATNR ||
                rec['Product Number'] ||
                rec.Product_Number ||
                rec.Material_Code ||
                rec['Material Code'] ||
                rec.Material ||
                rec.GSTIN ||
                rec.STCD3 ||
                rec.Name1 ||
                ''
              ).trim().toUpperCase();

              const wasMatched = duplicateResult.matches.some(
                (m) => m.sap_id.trim().toUpperCase() === recId
              );

              if (wasMatched) {
                return allowedSet.has(recId);
              }
              return true;
            });

            setUploadedRecords(filtered);
            setToast({
              type: 'success',
              msg: `Proceeding with ${filtered.length} allowed records (${uploadedRecords.length - filtered.length} disallowed entries omitted).`
            });

            handleExecuteMigration(filtered);
          }}
        />
      )}

      {/* Step 1: Upload Template Download Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center">
            <FileSpreadsheet className="w-5 h-5 mr-2 text-blue-600" />
            1. Source Data Template
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Download standard Excel template with base and user-mapped fields for{' '}
            <span className="font-bold text-slate-700">{selectedMaster}</span>.
          </p>
        </div>

        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors shrink-0"
        >
          <Download className="w-4 h-4 mr-1.5 text-blue-600" />
          Download Upload Template
        </button>
      </div>

      {/* Step 2: Upload Raw Data & Execute Transformation */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800 flex items-center">
              <Upload className="w-5 h-5 mr-2 text-blue-600" />
              2. Upload Raw Data & Execute Pipeline
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Upload populated Excel file. Auto-expands <span className="font-bold text-blue-600">*</span> wildcards for{' '}
              <span className="font-bold text-slate-700">{wildcardInfo}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl cursor-pointer transition-colors">
              <Upload className="w-4 h-4 mr-1.5 text-blue-600" />
              <span>Select Raw Excel File</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </label>

            {/* Check Duplicates Button */}
            <button
              onClick={handleCheckDuplicates}
              disabled={duplicateChecking || uploadedRecords.length === 0}
              className="inline-flex items-center px-4 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 border border-amber-300 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {duplicateChecking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Checking SAP...
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 mr-1.5 text-amber-600" />
                  Check Duplicates
                </>
              )}
            </button>

            {/* Execute Migration Button */}
            <button
              onClick={() => handleExecuteMigration()}
              disabled={executing || uploadedRecords.length === 0}
              className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Executing Logic...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Generate XML
                </>
              )}
            </button>
          </div>
        </div>

        {/* Uploaded Data Summary */}
        {uploadedRecords.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-slate-700">
                  Detected {uploadedRecords.length} Raw Records ({expandedCount} Total Expanded Combinations via * Logic)
                </span>
              </div>

              {duplicateResult && (
                <div className="flex items-center space-x-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                      duplicateResult.highest_risk_tier === 'HARD'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : duplicateResult.highest_risk_tier === 'SOFT'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    {duplicateResult.highest_risk_tier === 'HARD' ? (
                      <ShieldAlert className="w-3.5 h-3.5 mr-1 text-rose-600" />
                    ) : duplicateResult.highest_risk_tier === 'SOFT' ? (
                      <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    )}
                    SAP Duplicate Status: {duplicateResult.highest_risk_tier} RISK
                  </span>
                </div>
              )}
            </div>
            <DataGrid data={uploadedRecords} columns={gridColumns} pageSize={10} />
          </div>
        )}
      </div>

      {/* Step 3: XML Payload Ready & Download */}
      {generatedXml && (
        <div className="bg-emerald-50/80 p-6 rounded-2xl border border-emerald-300 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-emerald-900">
                SAP Migration Cockpit Payload Ready!
              </h3>
              <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                XML migration payload generated for {expandedCount} expanded record combinations. Basic/General data deduplicated with valid ExpandedRowCount.
              </p>
            </div>
          </div>

          <button
            onClick={handleDownloadXml}
            className="inline-flex items-center px-6 py-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-lg transition-all shrink-0"
          >
            <Download className="w-4 h-4 mr-2" />
            Download SAP XML Payload
          </button>
        </div>
      )}
    </div>
  );
};
