// frontend/src/utils/schemaLoader.ts
import { MasterSchema, MasterType } from '../types';
import materialSchema from '../data/material_fields.json';
import vendorSchema from '../data/vendor_fields.json';
import customerSchema from '../data/customer_fields.json';

export function loadMasterSchema(masterType: MasterType): MasterSchema {
  switch (masterType) {
    case 'Material Master':
      return materialSchema as MasterSchema;
    case 'Vendor Master':
      return vendorSchema as MasterSchema;
    case 'Customer Master':
      return customerSchema as MasterSchema;
    default:
      return {};
  }
}

export function getLegacyViewInfo(rawView: string): [string, string] {
  if (rawView.includes('. ')) {
    const parts = rawView.split('. ');
    return [parts[1], rawView];
  }
  return [rawView, rawView];
}

/**
 * Resolves the human-readable description for an SAP field key across all views of a master schema.
 * e.g. "BKLAS" -> "Valuation Class", "BWKEY" -> "Valuation Area", "LGORT" -> "Storage Location", "PRODUCT" -> "Product Number"
 */
export function getFieldDescription(fieldKeyOrDesc: string, masterType: MasterType): string {
  if (!fieldKeyOrDesc) return '';
  const schema = loadMasterSchema(masterType);
  const cleanKey = fieldKeyOrDesc.trim().toLowerCase();

  for (const viewName of Object.keys(schema)) {
    const fields = schema[viewName] || [];
    for (const f of fields) {
      if (f.field_name && f.field_name.trim().toLowerCase() === cleanKey) {
        return f.description || f.field_name;
      }
      if (f.description && f.description.trim().toLowerCase() === cleanKey) {
        return f.description;
      }
    }
  }
  return fieldKeyOrDesc;
}

/**
 * Resolves the technical SAP field_name for a human description or field key across all views of a master schema.
 * e.g. "Valuation Class" -> "BKLAS", "Storage Location" -> "LGORT", "Product Number" -> "PRODUCT"
 */
export function getTechnicalFieldName(descOrFieldKey: string, masterType: MasterType): string {
  if (!descOrFieldKey) return '';
  const schema = loadMasterSchema(masterType);
  const cleanDesc = descOrFieldKey.trim().toLowerCase();

  // 1. Exact match first
  for (const viewName of Object.keys(schema)) {
    const fields = schema[viewName] || [];
    for (const f of fields) {
      if (f.description && f.description.trim().toLowerCase() === cleanDesc) {
        return f.field_name || f.description;
      }
      if (f.field_name && f.field_name.trim().toLowerCase() === cleanDesc) {
        return f.field_name;
      }
    }
  }

  // 2. Normalized fallback match (strips non-alphanumeric and 'indicator:')
  const normalize = (s: string) => s.toLowerCase().replace(/indicator:\s*/g, '').replace(/[^a-z0-9]/g, '');
  const normalizedDesc = normalize(descOrFieldKey);

  if (normalizedDesc) {
    for (const viewName of Object.keys(schema)) {
      const fields = schema[viewName] || [];
      for (const f of fields) {
        if (f.description && normalize(f.description) === normalizedDesc) {
          return f.field_name || f.description;
        }
        if (f.field_name && normalize(f.field_name) === normalizedDesc) {
          return f.field_name;
        }
      }
    }
  }

  return descOrFieldKey;
}

const NORMALIZE_STR = (s: string) => s.toLowerCase().replace(/indicator:\s*/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Checks if a key (technical field name, description, or common label) belongs to a master type.
 */
export function isKeyInMaster(key: string, masterType: MasterType): boolean {
  if (!key) return false;
  const clean = NORMALIZE_STR(key);
  
  // Custom fixed rules key overrides per master type
  if (masterType === 'Material Master') {
    const matCustom = ['producttype', 'productgroup', 'plant', 'salesorganization', 'distributionchannel', 'valuationclass', 'valuationcategory', 'division', 'accountassignmentgroup', 'profitcenter', 'indicatorbatchmanagementreq', 'indicatorbatchmanagementrequired', 'bklas', 'bwtty', 'spart', 'ktgrm', 'prctr', 'xchpf'];
    if (matCustom.includes(clean)) return true;
  } else if (masterType === 'Customer Master') {
    const custCustom = ['bpgrouping', 'customeraccountgroup', 'bptype', 'bp_type', 'bp type', 'companycode', 'salesorganization', 'distributionchannel', 'division', 'reconciliationaccount', 'akont', 'spart'];
    if (custCustom.includes(clean)) return true;
  } else if (masterType === 'Vendor Master') {
    const venCustom = ['bpgrouping', 'vendoraccountgroup', 'companycode', 'purchasingorganization', 'reconciliationaccount', 'akont'];
    if (venCustom.includes(clean)) return true;
  }

  const schema = loadMasterSchema(masterType);
  for (const viewName of Object.keys(schema)) {
    for (const f of schema[viewName] || []) {
      if (f.field_name && NORMALIZE_STR(f.field_name) === clean) return true;
      if (f.description && NORMALIZE_STR(f.description) === clean) return true;
    }
  }
  return false;
}

/**
 * Checks if a view and field pair belongs to the given master type schema.
 */
export function isFieldInMasterSchema(viewName: string, fieldName: string, masterType: MasterType): boolean {
  if (!fieldName) return false;
  const schema = loadMasterSchema(masterType);
  const cleanView = (viewName || '').trim().toLowerCase().replace(/^[0-9]+\.\s*/, '');
  const cleanField = NORMALIZE_STR(fieldName);

  if (cleanView) {
    const matchingViewKey = Object.keys(schema).find(
      (v) => v.trim().toLowerCase().replace(/^[0-9]+\.\s*/, '') === cleanView
    );

    if (matchingViewKey) {
      const viewFields = schema[matchingViewKey] || [];
      return viewFields.some(
        (f) =>
          (f.field_name && NORMALIZE_STR(f.field_name) === cleanField) ||
          (f.description && NORMALIZE_STR(f.description) === cleanField)
      );
    }
    return false;
  }

  return isKeyInMaster(fieldName, masterType);
}

