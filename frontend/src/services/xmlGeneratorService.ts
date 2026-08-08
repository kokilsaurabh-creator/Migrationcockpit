// frontend/src/services/xmlGeneratorService.ts
import type { FieldMapping, FixedRuleRecord, MasterSchema, MasterType } from '../types';
import { MASTER_CONFIGS } from '../utils/constants';
import { applySmartTextWrappingToRecord } from '../utils/textWrapper';

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
export function expandRawRecords(
  masterType: MasterType,
  savedRules: FixedRuleRecord[],
  uploadedRecords: Record<string, any>[]
): Record<string, any>[] {
  let expandableFields: string[] = [];
  if (masterType === 'Material Master') {
    expandableFields = ['Plant', 'Distribution Channel'];
  } else if (masterType === 'Customer Master') {
    expandableFields = ['Distribution Channel', 'Division'];
  } else if (masterType === 'Vendor Master') {
    expandableFields = ['Purchasing Organization', 'Company Code'];
  }

  // Extract unique distinct non-wildcard values from savedRules for each expandable field
  const uniqueValuesMap: Record<string, string[]> = {};
  expandableFields.forEach((field) => {
    const vals = savedRules
      .map((r) => normalizeVal(r[field]))
      .filter((v) => v !== '' && v !== '*');
    uniqueValuesMap[field] = Array.from(new Set(vals));
  });

  const expandedRecords: Record<string, any>[] = [];

  uploadedRecords.forEach((record) => {
    let currentBatch: Record<string, any>[] = [{ ...record }];

    expandableFields.forEach((field) => {
      const nextBatch: Record<string, any>[] = [];

      currentBatch.forEach((item) => {
        const rawVal = normalizeVal(item[field]);

        if (rawVal === '*') {
          // Wildcard '*': Expand across ALL unique values found in savedRules for this field
          const targetValues = uniqueValuesMap[field] || [];
          if (targetValues.length > 0) {
            targetValues.forEach((v) => {
              nextBatch.push({ ...item, [field]: v });
            });
          } else {
            nextBatch.push(item);
          }
        } else if (rawVal.includes(',') || rawVal.includes(';') || rawVal.includes('/')) {
          // Multi-value list (e.g., "VW58, VW57"): Expand for each listed value
          const splitVals = rawVal
            .split(/[,;/]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (splitVals.length > 0) {
            splitVals.forEach((v) => {
              nextBatch.push({ ...item, [field]: v });
            });
          } else {
            nextBatch.push(item);
          }
        } else {
          // Standard single value
          nextBatch.push(item);
        }
      });

      currentBatch = nextBatch;
    });

    expandedRecords.push(...currentBatch);
  });

  return expandedRecords;
}

export async function generateXmlPayload(
  masterType: MasterType,
  schema: MasterSchema,
  allMappings: FieldMapping[],
  savedRules: FixedRuleRecord[],
  uploadedRecords: Record<string, any>[]
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
  const expandedRecords = expandRawRecords(masterType, savedRules, uploadedRecords);

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
    // Find matching rule with wildcard '*' support in saved rules
    let matchedRule: FixedRuleRecord = {};
    for (const rule of savedRules) {
      let isMatch = true;
      for (const key of ruleKeys) {
        const rVal = normalizeVal(rule[key]);
        const mVal = normalizeVal(material[key]);
        // '*' or empty in rule matches ANY value in raw data
        if (rVal && rVal !== '*' && rVal !== mVal) {
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

      let resolvedValue = '';
      if (mappingType === 'Fixed Values') {
        resolvedValue = mapConfig.fixed_value || '';
      } else if (mappingType === 'Based on Fixed Rules') {
        resolvedValue =
          normalizeVal(matchedRule[fieldName]) ||
          normalizeVal(matchedRule[descName]);
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
