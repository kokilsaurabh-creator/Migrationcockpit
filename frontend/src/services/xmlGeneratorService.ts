import type { FieldMapping, FixedRuleRecord, MasterSchema, MasterType } from '../types';
import type { PlantSLocMapping } from './plantStorageLocationService';
import { MASTER_CONFIGS } from '../utils/constants';
import { applySmartTextWrappingToRecord } from '../utils/textWrapper';
import { getFieldDescription, getTechnicalFieldName } from '../utils/schemaLoader';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeVal(val: any): string {
  if (val === null || val === undefined) return '';
  let s = String(val).trim();
  if (s.endsWith('.0')) {
    s = s.substring(0, s.length - 2);
  }
  return s;
}

/**
 * Expands wildcard '*' and multi-valued input records (comma/slash separated) into discrete records.
 * Supported Wildcard / Multi-Valued Fields:
 * - Material Master: Plant, Distribution Channel
 * - Customer Master: Distribution Channel, Division
 * - Vendor Master: Purchasing Organization, Company Code
 */
function expandSingleRecordFallback(record: Record<string, any>, fields: string[]): Record<string, any>[] {
  let currentBatch: Record<string, any>[] = [{ ...record }];

  fields.forEach((field) => {
    const nextBatch: Record<string, any>[] = [];
    currentBatch.forEach((item) => {
      const rawVal = normalizeVal(item[field]);
      if (rawVal !== '*' && (rawVal.includes(',') || rawVal.includes(';') || rawVal.includes('/'))) {
        const splitVals = rawVal.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
        splitVals.forEach((v) => {
          nextBatch.push({ ...item, [field]: v });
        });
      } else {
        nextBatch.push(item);
      }
    });
    currentBatch = nextBatch;
  });

  return currentBatch;
}

export function expandRawRecords(
  masterType: MasterType,
  savedRules: FixedRuleRecord[],
  uploadedRecords: Record<string, any>[],
  allMappings: FieldMapping[] = []
): Record<string, any>[] {
  const expandableFields: string[] = MASTER_CONFIGS[masterType]?.ruleKeys || [];

  if (expandableFields.length === 0 || savedRules.length === 0) {
    const result: Record<string, any>[] = [];
    uploadedRecords.forEach(r => result.push(...expandSingleRecordFallback(r, expandableFields)));
    return result;
  }

  const expandedRecords: Record<string, any>[] = [];

  uploadedRecords.forEach((record) => {
    // 1. Find compatible rules for this specific record
    const compatibleRules = savedRules.filter((rule) => {
      return expandableFields.every((field) => {
        const rVal = normalizeVal(rule[field]);
        
        let mVal = normalizeVal(record[field]);
        if (!mVal && allMappings.length > 0) {
          const mapping = allMappings.find(m => {
            const tName = getTechnicalFieldName(m.field_name, masterType).toLowerCase();
            const dName = getFieldDescription(m.field_name, masterType).toLowerCase();
            const fLower = field.toLowerCase();
            return tName === fLower || dName === fLower || m.field_name.toLowerCase() === fLower;
          });
          if (mapping) {
            if (mapping.mapping_type === 'Fixed Values' && mapping.fixed_value) {
              mVal = normalizeVal(mapping.fixed_value);
            } else if (mapping.mapping_type === 'Based on User Input' && mapping.source_field) {
              mVal = normalizeVal(record[mapping.source_field]);
            }
          }
        }
        
        if (!rVal || rVal === '*') return true; // Rule allows anything
        if (!mVal || mVal === '*') return true; // Record allows anything
        
        // Check if mVal is a comma-separated list containing rVal
        if (mVal.includes(',') || mVal.includes(';') || mVal.includes('/')) {
           const splitVals = mVal.split(/[,;/]+/).map(s => s.trim().toLowerCase());
           if (splitVals.includes(rVal.toLowerCase())) return true;
        }

        return rVal.toLowerCase() === mVal.toLowerCase();
      });
    });

    if (compatibleRules.length === 0) {
      // No rules match this record. Do a simple fallback expansion for comma-separated values, but leave '*' as '*'
      expandedRecords.push(...expandSingleRecordFallback(record, expandableFields));
      return;
    }

    // 2. Extract unique distinct combinations of expandable fields from compatible rules
    const uniqueCombinations = new Set<string>();
    const combinationObjects: Record<string, string>[] = [];

    compatibleRules.forEach(rule => {
      const combo: Record<string, string> = {};
      expandableFields.forEach(field => {
        let mVal = normalizeVal(record[field]);
        if (!mVal && allMappings.length > 0) {
          const mapping = allMappings.find(m => {
            const tName = getTechnicalFieldName(m.field_name, masterType).toLowerCase();
            const dName = getFieldDescription(m.field_name, masterType).toLowerCase();
            const fLower = field.toLowerCase();
            return tName === fLower || dName === fLower || m.field_name.toLowerCase() === fLower;
          });
          if (mapping) {
            if (mapping.mapping_type === 'Fixed Values' && mapping.fixed_value) {
              mVal = normalizeVal(mapping.fixed_value);
            } else if (mapping.mapping_type === 'Based on User Input' && mapping.source_field) {
              mVal = normalizeVal(record[mapping.source_field]);
            }
          }
        }
        
        if (mVal && mVal !== '*' && !mVal.includes(',') && !mVal.includes(';') && !mVal.includes('/')) {
           combo[field] = mVal;
        } else {
           combo[field] = normalizeVal(rule[field]);
        }
      });
      
      const comboKey = JSON.stringify(combo);
      if (!uniqueCombinations.has(comboKey)) {
        uniqueCombinations.add(comboKey);
        combinationObjects.push(combo);
      }
    });

    // 3. Emit expanded records for each unique combination
    combinationObjects.forEach(combo => {
      expandedRecords.push({ ...record, ...combo });
    });
  });

  return expandedRecords;
}

export async function generateXmlPayload(
  masterType: MasterType,
  schema: MasterSchema,
  allMappings: FieldMapping[],
  savedRules: FixedRuleRecord[],
  uploadedRecords: Record<string, any>[],
  plantSLocMappings: PlantSLocMapping[] = []
): Promise<string> {
  const config = MASTER_CONFIGS[masterType];
  const templateFileName = config.xmlTemplateFile;
  const primaryKey = config.primaryKey;
  const ruleKeys = config.ruleKeys;
  const baseColumns = config.baseColumns;

  // 1. Fetch XML template content
  const response = await fetch(`/templates/${encodeURIComponent(templateFileName)}`);
  if (!response.ok) {
    throw new Error(`Failed to load core XML template: ${templateFileName}`);
  }
  let xmlContent = await response.text();

  if (!xmlContent.includes('<Workbook') || !xmlContent.includes('<?xml')) {
    throw new Error(
      `Received invalid template content for ${templateFileName}. Ensure template XML exists in public/templates directory.`
    );
  }

  // 2. Expand raw records using '*' wildcard logic for Plant, Distribution Channel, Division
  const expandedRecords = expandRawRecords(masterType, savedRules, uploadedRecords, allMappings);

  // 3. Build final_sap_data structure
  const finalSapData: Record<string, Record<string, string>[]> = {};

  const validMasterDbViews = Object.keys(schema).map((view) =>
    view.includes('. ') ? view.split('. ')[1] : view
  );

  // Deduplicate mappings by (sheetName, field_name), prioritizing active non-blank mapping types
  const mappingMap = new Map<string, FieldMapping>();
  allMappings.forEach((m) => {
    const sheetName = m.view_name.includes('. ') ? m.view_name.split('. ')[1] : m.view_name;
    const isMasterView = validMasterDbViews.includes(sheetName) || Object.keys(schema).includes(sheetName);
    if (!isMasterView) return;

    const key = `${sheetName}||${m.field_name}`;
    const existing = mappingMap.get(key);

    if (!existing) {
      mappingMap.set(key, m);
    } else {
      // If existing mapping is 'Blank (Default)', overwrite with active non-blank mapping
      if (existing.mapping_type === 'Blank (Default)' && m.mapping_type !== 'Blank (Default)') {
        mappingMap.set(key, m);
      }
    }
  });

  const activeMappings = Array.from(mappingMap.values());

  expandedRecords.forEach((material, matIndex) => {
    // Find matching rule with wildcard '*' support (in both saved rules AND raw material input)
    let matchedRule: FixedRuleRecord = {};
    for (const rule of savedRules) {
      let isMatch = true;
      for (const key of ruleKeys) {
        const rVal = normalizeVal(rule[key]);
        
        let mVal = normalizeVal(material[key]);
        if (!mVal && allMappings.length > 0) {
          const mapping = allMappings.find(m => {
            const tName = getTechnicalFieldName(m.field_name, masterType).toLowerCase();
            const dName = getFieldDescription(m.field_name, masterType).toLowerCase();
            const fLower = key.toLowerCase();
            return tName === fLower || dName === fLower || m.field_name.toLowerCase() === fLower;
          });
          if (mapping) {
            if (mapping.mapping_type === 'Fixed Values' && mapping.fixed_value) {
              mVal = normalizeVal(mapping.fixed_value);
            } else if (mapping.mapping_type === 'Based on User Input' && mapping.source_field) {
              mVal = normalizeVal(material[mapping.source_field]);
            }
          }
        }
        
        // '*' or empty value in rule (rVal) OR in input material (mVal) matches ANY value
        if (
          rVal &&
          rVal !== '*' &&
          mVal &&
          mVal !== '*' &&
          rVal.toLowerCase() !== mVal.toLowerCase()
        ) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        matchedRule = rule;
        break;
      }
    }

    // Determine primary key value for this record
    const pkVal =
      normalizeVal(material[primaryKey]) ||
      normalizeVal(material['Product Number']) ||
      normalizeVal(material['PRODUCT']) ||
      normalizeVal(material['MATNR']) ||
      normalizeVal(material['Material']) ||
      normalizeVal(material['Customer Number']) ||
      normalizeVal(material['Customer']) ||
      normalizeVal(material['Supplier Number']) ||
      normalizeVal(material['Vendor Code']);

    // Resolve mappings for each field across all sheets
    activeMappings.forEach((mapConfig) => {
      const rawView = mapConfig.view_name;
      const sheetName = rawView.includes('. ') ? rawView.split('. ')[1] : rawView;

      if (!schema[sheetName]) return;

      const fieldName = mapConfig.field_name;
      const mappingType = mapConfig.mapping_type;
      const viewSchemaFields = schema[sheetName] || [];
      const sf = viewSchemaFields.find(
        (f) => f.field_name === fieldName || f.description === fieldName
      );
      const descName = sf?.description || fieldName;

      if (!finalSapData[sheetName]) {
        finalSapData[sheetName] = [];
      }

      while (finalSapData[sheetName].length <= matIndex) {
        finalSapData[sheetName].push({});
      }

      const rowDict = finalSapData[sheetName][matIndex];

      // Auto-populate primary key on child sheet row if present
      if (pkVal) {
        rowDict[primaryKey] = pkVal;
        rowDict['PRODUCT'] = pkVal;
        rowDict['Product Number'] = pkVal;
        rowDict['Customer Number'] = pkVal;
        rowDict['Supplier Number'] = pkVal;
        rowDict['Vendor Code'] = pkVal;
      }

      // Auto-populate global plant to prevent data isolation issues on child sheets
      const globalPlant = normalizeVal(material['WERKS']) || normalizeVal(material['Plant']);
      if (globalPlant) {
        rowDict['__GLOBAL_PLANT'] = globalPlant;
      }

      let resolvedValue = '';
      if (mappingType === 'Fixed Values') {
        resolvedValue = mapConfig.fixed_value || '';
      } else if (mappingType === 'Based on Fixed Rules') {
        const techName = getTechnicalFieldName(fieldName, masterType);
        const descStr = getFieldDescription(fieldName, masterType);

        let valFromRule =
          normalizeVal(matchedRule[fieldName]) ||
          normalizeVal(matchedRule[descName]) ||
          normalizeVal(matchedRule[techName]) ||
          normalizeVal(matchedRule[descStr]);

        if (!valFromRule && matchedRule) {
          // Fallback: Case-insensitive search across matchedRule keys
          const targetKeys = [fieldName, descName, techName, descStr]
            .filter(Boolean)
            .map((k) => k.toLowerCase().trim());

          for (const rKey of Object.keys(matchedRule)) {
            const cleanRKey = rKey.toLowerCase().trim();
            if (targetKeys.includes(cleanRKey)) {
              valFromRule = normalizeVal(matchedRule[rKey]);
              if (valFromRule) break;
            }
          }
        }

        resolvedValue = valFromRule;
      } else if (mappingType === 'Based on User Input') {
        resolvedValue =
          normalizeVal(material[fieldName]) ||
          normalizeVal(material[descName]) ||
          (mapConfig.fixed_value && normalizeVal(material[mapConfig.fixed_value])) ||
          (mapConfig.source_field && normalizeVal(material[mapConfig.source_field])) ||
          '';
      }

      // Fallback for key columns (Plant, Distribution Channel, Sales Org, etc.)
      if (
        !resolvedValue &&
        (baseColumns.includes(fieldName) ||
          baseColumns.includes(descName) ||
          material[fieldName] !== undefined ||
          material[descName] !== undefined)
      ) {
        resolvedValue = normalizeVal(material[fieldName]) || normalizeVal(material[descName]);
      }

      // Automatic Valuation Area (BWKEY) = Plant (WERKS) rule for Material Master
      if (
        masterType === 'Material Master' &&
        (fieldName === 'BWKEY' || fieldName === 'Valuation Area' || descName === 'Valuation Area') &&
        (!resolvedValue || resolvedValue === '*')
      ) {
        resolvedValue =
          normalizeVal(material['WERKS']) ||
          normalizeVal(material['Plant']) ||
          normalizeVal(rowDict['WERKS']) ||
          normalizeVal(rowDict['Plant']) ||
          normalizeVal(material['BWKEY']) ||
          normalizeVal(material['Valuation Area']);
          
        if (resolvedValue === '*') {
          resolvedValue = '';
        }
      }

      // Assign to both technical field_name AND description so both lookups succeed
      if (resolvedValue !== '') {
        rowDict[fieldName] = resolvedValue;
        if (sf) {
          if (sf.field_name) rowDict[sf.field_name] = resolvedValue;
          if (sf.description) rowDict[sf.description] = resolvedValue;
        }
      }
    });
  });

  // 4. Apply smart text wrapping on Name and Street fields across all sheets & rows
  for (const sheetName of Object.keys(finalSapData)) {
    finalSapData[sheetName] = finalSapData[sheetName].map((row) => applySmartTextWrappingToRecord(row));
  }

  // 4.5. Wildcard '*' Storage Location Expansion for Plant Data / Store Location sheet
  if (masterType === 'Material Master' && plantSLocMappings.length > 0) {
    for (const sheetName of Object.keys(finalSapData)) {
      const isSLocSheet =
        sheetName.toLowerCase().includes('store location') ||
        sheetName.toLowerCase().includes('storage location');

      if (!isSLocSheet) continue;

      const rowsList = finalSapData[sheetName];
      const expandedSLocRows: Record<string, string>[] = [];

      rowsList.forEach((row) => {
        const slocVal = (row['LGORT'] || row['Storage Location'] || '').trim();
        const plantVal = (row['WERKS'] || row['Plant'] || row['Valuation Area'] || row['__GLOBAL_PLANT'] || '').trim().toUpperCase();

        if ((slocVal === '*' || slocVal === '') && plantVal && plantVal !== '*') {
          const matchedSLocs = plantSLocMappings
            .filter((m: PlantSLocMapping) => m.plant_code.trim().toUpperCase() === plantVal)
            .map((m: PlantSLocMapping) => m.storage_location_code.trim().toUpperCase());

          if (matchedSLocs.length > 0) {
            matchedSLocs.forEach((slocCode: string) => {
              const newRow = { ...row };
              newRow['LGORT'] = slocCode;
              newRow['Storage Location'] = slocCode;
              expandedSLocRows.push(newRow);
            });
          } else {
            expandedSLocRows.push(row);
          }
        } else {
          expandedSLocRows.push(row);
        }
      });

      finalSapData[sheetName] = expandedSLocRows;
    }
  }

  // 4.6. Ensure Valuation Area (BWKEY) is automatically set to Plant (WERKS) for Material Master
  if (masterType === 'Material Master') {
    for (const sheetName of Object.keys(finalSapData)) {
      finalSapData[sheetName].forEach((row) => {
        const plantVal = (row['WERKS'] || row['Plant'] || row['__GLOBAL_PLANT'] || '').trim();
        const currentBwkey = (row['BWKEY'] || row['Valuation Area'] || '').trim();

        if (plantVal && plantVal !== '*') {
          if (!currentBwkey || currentBwkey === '*') {
            row['BWKEY'] = plantVal;
            row['Valuation Area'] = plantVal;
          }
        }
      });
    }
  }

  // 5. Process each sheet and inject XML rows with deduplication
  for (const sheetName of Object.keys(finalSapData)) {
    const rowsList = finalSapData[sheetName];
    const sheetStartTag = `<Worksheet ss:Name="${sheetName}"`;

    if (!xmlContent.includes(sheetStartTag)) continue;

    const hasPrimaryKeyVal = (rowDict: Record<string, string>): boolean => {
      const val = rowDict[primaryKey];
      if (val && String(val).trim()) return true;
      const alternatives = [
        'Vendor Code',
        'Vendor code',
        'Supplier Number',
        'Vendor Number',
        'Supplier',
        'Product Number',
        'Customer Number',
        'Product',
        'Customer',
        'Vendor',
        'PRODUCT',
        'MATNR'
      ];
      for (const alt of alternatives) {
        if (rowDict[alt] && String(rowDict[alt]).trim()) return true;
      }
      return false;
    };

    const validRows = rowsList.filter(hasPrimaryKeyVal);
    if (validRows.length === 0) continue;

    const schemaFields = schema[sheetName] || [];
    const exactColumnOrder = schemaFields.map((f) => f.description || f.field_name);

    // DEDUPLICATION LOGIC
    const dedupedRows: Record<string, string>[] = [];
    const seenKeys = new Set<string>();
    const seenTuples = new Set<string>();
    const isHeaderSheet = sheetName === 'Basic Data' || sheetName === 'General Data';

    for (const r of validRows) {
      let pkVal = normalizeVal(r[primaryKey]);
      if (!pkVal) {
        for (const alt of [
          'Vendor Code',
          'Vendor code',
          'Supplier Number',
          'Vendor Number',
          'Supplier',
          'Product Number',
          'Customer Number',
          'Product',
          'Customer',
          'Vendor',
          'PRODUCT',
          'MATNR'
        ]) {
          pkVal = normalizeVal(r[alt]);
          if (pkVal) break;
        }
      }

      if (isHeaderSheet && pkVal) {
        if (seenKeys.has(pkVal)) continue;
        seenKeys.add(pkVal);
      }

      const rowTuple = exactColumnOrder
        .map((field) => {
          const sf = schemaFields.find((f) => (f.description || f.field_name) === field);
          const v =
            r[field] ||
            (sf && sf.field_name ? r[sf.field_name] : '') ||
            (sf && sf.description ? r[sf.description] : '') ||
            '';
          return normalizeVal(v);
        })
        .join('||');

      if (seenTuples.has(rowTuple)) continue;
      seenTuples.add(rowTuple);

      dedupedRows.push(r);
    }

    const numNewRows = dedupedRows.length;
    if (numNewRows === 0) continue;

    let sheetXmlRows = '';
    for (const rowDict of dedupedRows) {
      sheetXmlRows += '    <Row>\n';
      for (const field of exactColumnOrder) {
        const sf = schemaFields.find((f) => (f.description || f.field_name) === field);
        const val =
          rowDict[field] ||
          (sf && sf.field_name ? rowDict[sf.field_name] : '') ||
          (sf && sf.description ? rowDict[sf.description] : '') ||
          '';
        const safeVal = escapeXml(val);
        sheetXmlRows += `        <Cell><Data ss:Type="String">${safeVal}</Data></Cell>\n`;
      }
      sheetXmlRows += '    </Row>\n';
    }

    const parts = xmlContent.split(sheetStartTag);
    const beforeSheet = parts[0];
    const sheetAndAfter = parts[1];

    const tableParts = sheetAndAfter.split('</Table>');
    let insideTable = tableParts[0];
    const afterTable = tableParts.slice(1).join('</Table>');

    // Update ExpandedRowCount
    insideTable = insideTable.replace(/ss:ExpandedRowCount="(\d+)"/, (_, oldCount) => {
      const newCount = parseInt(oldCount, 10) + numNewRows;
      return `ss:ExpandedRowCount="${newCount}"`;
    });

    xmlContent = `${beforeSheet}${sheetStartTag}${insideTable}${sheetXmlRows}    </Table>${afterTable}`;
  }

  return xmlContent;
}
