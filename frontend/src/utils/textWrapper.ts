// frontend/src/utils/textWrapper.ts
/**
 * Smart Text-Wrapping Utility for SAP Master Data Migration (TypeScript / React).
 * Enforces word boundaries and character length constraints for Name and Street fields.
 */

export const NAME_LIMITS: Record<string, number> = {
  Name1: 40,
  Name2: 40,
};

export const STREET_LIMITS: Record<string, number> = {
  Street1: 60,
  Street2: 40,
  Street3: 40,
  Street4: 40,
  Street5: 40,
};

export function splitTextByWordBoundary(
  text: string | null | undefined,
  limits: number[] | Record<string, number>
): string[] | Record<string, string> {
  const isDictMode = typeof limits === 'object' && !Array.isArray(limits);
  let fieldKeys: string[] = [];
  let fieldLimits: number[] = [];

  if (isDictMode) {
    fieldKeys = Object.keys(limits as Record<string, number>);
    fieldLimits = fieldKeys.map((k) => (limits as Record<string, number>)[k]);
  } else {
    fieldLimits = [...(limits as number[])];
  }

  if (fieldLimits.length === 0) {
    return isDictMode ? {} : [];
  }

  const rawText = (text || '').trim();
  if (!rawText) {
    const emptyArray = fieldLimits.map(() => '');
    if (isDictMode) {
      const res: Record<string, string> = {};
      fieldKeys.forEach((k) => (res[k] = ''));
      return res;
    }
    return emptyArray;
  }

  const words = rawText.split(/\s+/);
  const results: string[] = [];

  let currentFieldIdx = 0;
  let currentWords: string[] = [];
  let currentLen = 0;
  const totalCapacity = fieldLimits.reduce((a, b) => a + b, 0);

  for (const word of words) {
    if (currentFieldIdx >= fieldLimits.length) {
      console.warn(
        `Input text exceeds total combined capacity (${totalCapacity} chars). Overflow text beginning with '${word}' was truncated.`
      );
      break;
    }

    let currentFieldLimit = fieldLimits[currentFieldIdx];
    const addedLen = currentLen === 0 ? word.length : word.length + 1;

    if (currentLen + addedLen <= currentFieldLimit) {
      currentWords.push(word);
      currentLen += addedLen;
    } else {
      if (currentWords.length > 0) {
        results.push(currentWords.join(' '));
        currentWords = [];
        currentLen = 0;
        currentFieldIdx++;

        if (currentFieldIdx >= fieldLimits.length) {
          console.warn(
            `Input text exceeds total combined capacity (${totalCapacity} chars). Overflow text beginning with '${word}' was truncated.`
          );
          break;
        }
      }

      currentFieldLimit = fieldLimits[currentFieldIdx];
      if (word.length <= currentFieldLimit) {
        currentWords.push(word);
        currentLen = word.length;
      } else {
        // Single word exceeds field limit
        console.warn(
          `Single word '${word.substring(0, 15)}...' (${word.length} chars) exceeds field limit (${currentFieldLimit} chars). Force splitting word.`
        );
        let remWord = word;
        while (remWord && currentFieldIdx < fieldLimits.length) {
          const cLimit = fieldLimits[currentFieldIdx];
          const part = remWord.substring(0, cLimit);
          remWord = remWord.substring(cLimit);
          if (remWord) {
            results.push(part);
            currentFieldIdx++;
            currentWords = [];
            currentLen = 0;
          } else {
            currentWords = [part];
            currentLen = part.length;
          }
        }
        if (remWord) {
          console.warn(
            `Input text exceeds total combined capacity (${totalCapacity} chars). Overflow text was truncated.`
          );
          break;
        }
      }
    }
  }

  if (currentWords.length > 0 && currentFieldIdx < fieldLimits.length) {
    results.push(currentWords.join(' '));
  }

  while (results.length < fieldLimits.length) {
    results.push('');
  }

  const finalResults = results.map((res, i) => res.trim().substring(0, fieldLimits[i]));

  if (isDictMode) {
    const resDict: Record<string, string> = {};
    fieldKeys.forEach((key, i) => {
      resDict[key] = finalResults[i];
    });
    return resDict;
  }

  return finalResults;
}

export function splitName(nameText: string | null | undefined): Record<string, string> {
  return splitTextByWordBoundary(nameText, { Name1: 40, Name2: 40 }) as Record<string, string>;
}

export function splitStreet(streetText: string | null | undefined): Record<string, string> {
  return splitTextByWordBoundary(streetText, {
    Street1: 60,
    Street2: 40,
    Street3: 40,
    Street4: 40,
    Street5: 40,
  }) as Record<string, string>;
}

/**
 * Automatically applies smart text wrapping on record objects (for Name and Street fields).
 */
export function applySmartTextWrappingToRecord(record: Record<string, string>): Record<string, string> {
  const updated = { ...record };

  // 1. Identify Name field candidates
  const nameKeys = ['NAME', 'NAME1', 'NAME_FIRST', 'NAME_ORG1', 'Name', 'Name 1', 'Name1', 'Customer Name', 'Supplier Name', 'Vendor Name'];
  const name2Keys = ['NAME2', 'NAME_LAST', 'NAME_ORG2', 'Name 2', 'Name2'];

  const foundNameKey = nameKeys.find((k) => updated[k] && updated[k].trim().length > 0);
  if (foundNameKey) {
    const rawName = updated[foundNameKey];
    const nameDict = splitName(rawName);
    updated[foundNameKey] = nameDict.Name1;

    const foundName2Key = name2Keys.find((k) => k in updated) || 'NAME2';
    if (nameDict.Name2) {
      updated[foundName2Key] = nameDict.Name2;
    }
  }

  // 2. Identify Street / Address field candidates
  const street1Keys = ['STREET', 'STREET1', 'STR_SUPPL1', 'Street', 'Street 1', 'Street1', 'Address', 'Address 1', 'Address1', 'Full Address'];
  const street2Keys = ['STREET2', 'STR_SUPPL2', 'Street 2', 'Street2', 'Address 2', 'Address2'];
  const street3Keys = ['STREET3', 'STR_SUPPL3', 'Street 3', 'Street3', 'Address 3', 'Address3'];
  const street4Keys = ['STREET4', 'Street 4', 'Street4', 'Address 4', 'Address4'];
  const street5Keys = ['STREET5', 'Street 5', 'Street5', 'Address 5', 'Address5'];

  const foundStreetKey = street1Keys.find((k) => updated[k] && updated[k].trim().length > 0);
  if (foundStreetKey) {
    const rawStreet = updated[foundStreetKey];
    const streetDict = splitStreet(rawStreet);
    updated[foundStreetKey] = streetDict.Street1;

    const key2 = street2Keys.find((k) => k in updated) || 'STREET2';
    const key3 = street3Keys.find((k) => k in updated) || 'STREET3';
    const key4 = street4Keys.find((k) => k in updated) || 'STREET4';
    const key5 = street5Keys.find((k) => k in updated) || 'STREET5';

    if (streetDict.Street2 && updated[key2] !== undefined) updated[key2] = streetDict.Street2;
    if (streetDict.Street3 && updated[key3] !== undefined) updated[key3] = streetDict.Street3;
    if (streetDict.Street4 && updated[key4] !== undefined) updated[key4] = streetDict.Street4;
    if (streetDict.Street5 && updated[key5] !== undefined) updated[key5] = streetDict.Street5;
  }

  return updated;
}
