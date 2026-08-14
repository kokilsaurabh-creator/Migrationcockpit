// frontend/src/services/dataSanityService.ts
import { DataSanityException, MasterSchema, MasterType, FieldMapping } from '../types';
import { getTechnicalFieldName, getFieldDescription } from '../utils/schemaLoader';

function normalizeVal(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Validates Indian PAN number format (5 letters + 4 digits + 1 letter, e.g. DSOPK1465C).
 */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;

/**
 * Validates Indian GSTIN format (15 characters: 2 digits + 10 PAN chars + 1 entity digit + 'Z' + 1 check char).
 */
const GSTIN_REGEX = /^\d{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

/**
 * Resolves a field value from a record matching various key name variants (technical name, description, exact match).
 */
function resolveFieldValue(record: Record<string, any>, possibleKeys: string[], masterType: MasterType): { key: string; value: string } {
  for (const k of possibleKeys) {
    if (record[k] !== undefined && normalizeVal(record[k])) {
      return { key: k, value: normalizeVal(record[k]) };
    }
    const tech = getTechnicalFieldName(k, masterType);
    if (tech && record[tech] !== undefined && normalizeVal(record[tech])) {
      return { key: tech, value: normalizeVal(record[tech]) };
    }
    const desc = getFieldDescription(k, masterType);
    if (desc && record[desc] !== undefined && normalizeVal(record[desc])) {
      return { key: desc, value: normalizeVal(record[desc]) };
    }
  }

  // Case-insensitive fallback lookup
  const cleanPossible = possibleKeys.map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const recordKey of Object.keys(record)) {
    const cleanRecordKey = recordKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanPossible.includes(cleanRecordKey) && normalizeVal(record[recordKey])) {
      return { key: recordKey, value: normalizeVal(record[recordKey]) };
    }
  }

  return { key: '', value: '' };
}

/**
 * Performs data sanity and quality checks on uploaded records.
 */
export function validateDataSanity(
  masterType: MasterType,
  uploadedRecords: Record<string, any>[],
  schema: MasterSchema = {},
  allMappings: FieldMapping[] = []
): DataSanityException[] {
  const exceptions: DataSanityException[] = [];

  if (!uploadedRecords || uploadedRecords.length === 0) return exceptions;

  uploadedRecords.forEach((record, index) => {
    const rowIndex = record._originalIndex ?? index;

    // Resolve Country
    const { value: countryVal } = resolveFieldValue(
      record,
      ['COUNTRY_REGION', 'LAND1', 'Country', 'Country/Region', 'COUNTRY'],
      masterType
    );
    const countryUpper = countryVal.toUpperCase();

    // ----------------------------------------------------
    // CHECK 1: PAN Number Format Validation
    // ----------------------------------------------------
    let panVal = '';
    let panFieldName = 'PAN Number';

    // 1a. Look in General tab / record root
    const generalPan = resolveFieldValue(
      record,
      ['PAN', 'PAN Number', 'Permanent Account Number', 'PAN_NO', 'PAN_NUM', 'TAX_NUMBER'],
      masterType
    );
    if (generalPan.value) {
      panVal = generalPan.value;
      panFieldName = generalPan.key || 'PAN Number';
    }

    // 1b. Look in Identification Numbers tab / fields
    const idTypeVal = normalizeVal(record['IDENTIFICATION_TYPE'] || record['Identification Type'] || '');
    const idNumVal = normalizeVal(record['IDENTIFICATION_NUMBER'] || record['Identification Number'] || '');

    if (idTypeVal.toUpperCase() === 'PAN' || idTypeVal.toUpperCase().includes('PERMANENT ACCOUNT')) {
      if (idNumVal) {
        panVal = idNumVal;
        panFieldName = record['IDENTIFICATION_NUMBER'] ? 'IDENTIFICATION_NUMBER' : 'Identification Number';
      }
    }

    if (panVal) {
      const cleanPan = panVal.toUpperCase();
      if (!PAN_REGEX.test(cleanPan)) {
        exceptions.push({
          id: `pan_${rowIndex}_${panFieldName}`,
          rowIndex,
          checkType: 'PAN Format',
          fieldName: panFieldName,
          viewName: 'General Data / Identification',
          currentValue: panVal,
          message: `Invalid Indian PAN format "${panVal}". Must be 5 letters, 4 digits, 1 letter (e.g. DSOPK1465C).`,
          allowed: false
        });
      }
    }

    // ----------------------------------------------------
    // CHECK 2: PIN Code / Postal Code Validation per Country
    // ----------------------------------------------------
    const { key: pinKey, value: pinVal } = resolveFieldValue(
      record,
      ['POST_CODE1', 'PSTLZ', 'Postal Code', 'Pin Code', 'PIN Code', 'ZIP'],
      masterType
    );

    if (pinVal && countryUpper) {
      const cleanPin = pinVal.trim();
      let pinValid = true;
      let expectedFormatDesc = '';

      if (['IN', 'INDIA'].includes(countryUpper)) {
        pinValid = /^\d{6}$/.test(cleanPin);
        expectedFormatDesc = '6 digits (e.g. 400001)';
      } else if (['US', 'USA', 'UNITED STATES'].includes(countryUpper)) {
        pinValid = /^\d{5}(-\d{4})?$/.test(cleanPin);
        expectedFormatDesc = '5 digits or ZIP+4 (e.g. 90210)';
      } else if (['GB', 'UK', 'UNITED KINGDOM', 'GREAT BRITAIN'].includes(countryUpper)) {
        pinValid = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(cleanPin);
        expectedFormatDesc = 'UK postcode format (e.g. SW1A 1AA)';
      } else if (['CA', 'CANADA'].includes(countryUpper)) {
        pinValid = /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(cleanPin);
        expectedFormatDesc = 'Canada postal code (e.g. K1A 0B1)';
      } else if (['AU', 'AUSTRALIA'].includes(countryUpper)) {
        pinValid = /^\d{4}$/.test(cleanPin);
        expectedFormatDesc = '4 digits (e.g. 2000)';
      } else if (['DE', 'GERMANY', 'FR', 'FRANCE', 'IT', 'ITALY', 'ES', 'SPAIN', 'SA', 'SAUDI ARABIA'].includes(countryUpper)) {
        pinValid = /^\d{5}$/.test(cleanPin);
        expectedFormatDesc = '5 digits (e.g. 80331)';
      } else if (['SG', 'SINGAPORE'].includes(countryUpper)) {
        pinValid = /^\d{6}$/.test(cleanPin);
        expectedFormatDesc = '6 digits (e.g. 018956)';
      }

      if (!pinValid) {
        exceptions.push({
          id: `pin_${rowIndex}_${pinKey}`,
          rowIndex,
          checkType: 'PIN Code Country',
          fieldName: pinKey || 'Postal Code',
          viewName: 'General Data',
          currentValue: pinVal,
          message: `Invalid Postal Code "${pinVal}" for country "${countryVal}". Expected ${expectedFormatDesc}.`,
          allowed: false
        });
      }
    }

    // ----------------------------------------------------
    // CHECK 3: GST and PAN Validation
    // ----------------------------------------------------
    const { key: gstKey, value: gstVal } = resolveFieldValue(
      record,
      ['GST', 'GSTIN', 'GST Number', 'Tax Number', 'TAX_NUMBER', 'STCD1'],
      masterType
    );

    if (gstVal && (countryUpper === 'IN' || countryUpper === 'INDIA' || gstVal.length === 15)) {
      const cleanGst = gstVal.toUpperCase();

      // 3a. Format check for 15-char GSTIN
      if (!GSTIN_REGEX.test(cleanGst)) {
        exceptions.push({
          id: `gst_fmt_${rowIndex}_${gstKey}`,
          rowIndex,
          checkType: 'GST-PAN Match',
          fieldName: gstKey || 'GSTIN',
          viewName: 'Tax Data / General',
          currentValue: gstVal,
          message: `Invalid Indian GSTIN format "${gstVal}". Must be 15 alphanumeric characters (e.g. 27AIGPC7378F1ZV).`,
          allowed: false
        });
      } else {
        // 3b. Embedded PAN extraction (chars 3 to 12)
        const embeddedPan = cleanGst.substring(2, 12);

        if (panVal) {
          const cleanCustomerPan = panVal.toUpperCase();
          if (embeddedPan !== cleanCustomerPan) {
            exceptions.push({
              id: `gst_match_${rowIndex}_${gstKey}`,
              rowIndex,
              checkType: 'GST-PAN Match',
              fieldName: gstKey || 'GSTIN',
              viewName: 'Tax Data / General',
              currentValue: gstVal,
              message: `GSTIN & PAN Mismatch: Embedded PAN "${embeddedPan}" in GSTIN "${gstVal}" does not match customer PAN "${cleanCustomerPan}".`,
              allowed: false
            });
          }
        }
      }
    }

    // ----------------------------------------------------
    // CHECK 4: Mobile Number Validation (MOBILE_LONG, MOBILE_LONG_2, MOBILE_LONG_3)
    // ----------------------------------------------------
    const mobileFields = [
      { keys: ['MOBILE_LONG', 'Mobile Number', 'Mobile', 'Mobile 1', 'TEL_NUMBER'], name: 'MOBILE_LONG' },
      { keys: ['MOBILE_LONG_2', 'Mobile Number 2', 'Mobile 2'], name: 'MOBILE_LONG_2' },
      { keys: ['MOBILE_LONG_3', 'Mobile Number 3', 'Mobile 3'], name: 'MOBILE_LONG_3' }
    ];

    mobileFields.forEach(({ keys, name }) => {
      const { key, value } = resolveFieldValue(record, keys, masterType);
      if (value) {
        // Strip leading +91 or 91 country code prefix if 12 digits starting with 91, or spaces/dashes
        let digitsOnly = value.replace(/[\s\-\(\)\+]/g, '');
        if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
          digitsOnly = digitsOnly.substring(2);
        } else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
          digitsOnly = digitsOnly.substring(1);
        }

        const is10Digits = /^\d{10}$/.test(digitsOnly);
        if (!is10Digits) {
          const fieldNameUsed = key || name;
          exceptions.push({
            id: `mobile_${rowIndex}_${fieldNameUsed}`,
            rowIndex,
            checkType: 'Mobile Number',
            fieldName: fieldNameUsed,
            viewName: 'General Data',
            currentValue: value,
            message: `Invalid Mobile Number "${value}" in ${fieldNameUsed}. Expected a 10-digit number.`,
            allowed: false
          });
        }
      }
    });

    // ----------------------------------------------------
    // CHECK 5: Email Address Validation (SMTP_ADDR, SMTP_ADDR_2, SMTP_ADDR_3)
    // ----------------------------------------------------
    const emailFields = [
      { keys: ['SMTP_ADDR', 'Email Address', 'Email', 'Email ID', 'SMTP_ADDR_1'], name: 'SMTP_ADDR' },
      { keys: ['SMTP_ADDR_2', 'Email Address 2', 'Email 2', 'Email ID 2'], name: 'SMTP_ADDR_2' },
      { keys: ['SMTP_ADDR_3', 'Email Address 3', 'Email 3', 'Email ID 3'], name: 'SMTP_ADDR_3' }
    ];

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

    emailFields.forEach(({ keys, name }) => {
      const { key, value } = resolveFieldValue(record, keys, masterType);
      if (value) {
        if (!EMAIL_REGEX.test(value)) {
          const fieldNameUsed = key || name;
          exceptions.push({
            id: `email_${rowIndex}_${fieldNameUsed}`,
            rowIndex,
            checkType: 'Email Format',
            fieldName: fieldNameUsed,
            viewName: 'General Data',
            currentValue: value,
            message: `Invalid Email Address "${value}" in ${fieldNameUsed}. Expected standard format (e.g. abc@xyz.com).`,
            allowed: false
          });
        }
      }
    });
  });

  return exceptions;
}
