# core/text_wrapper.py
"""
Smart Text-Wrapping Utility for SAP Master Data Migration.

Handles word-boundary enforcement and length constraints when mapping long 
strings (e.g., Vendor/Customer Names and Address Streets) into SAP master data fields.
"""

import logging
import pandas as pd
from typing import List, Dict, Union, Optional

logger = logging.getLogger(__name__)

# Exact SAP Standard Character Limit Configurations
NAME_LIMITS: Dict[str, int] = {
    "Name1": 40,
    "Name2": 40,
}

STREET_LIMITS: Dict[str, int] = {
    "Street1": 60,
    "Street2": 40,
    "Street3": 40,
    "Street4": 40,
    "Street5": 40,
}


def split_text_by_word_boundary(
    text: Optional[str],
    limits: Union[List[int], Dict[str, int]]
) -> Union[List[str], Dict[str, str]]:
    """
    Splits an input string across multiple fields based on maximum character limits,
    enforcing word boundaries so that words are not split in half (unless an individual 
    word exceeds a field's maximum character limit).

    Args:
        text (str | None): Raw input string to split.
        limits (List[int] | Dict[str, int]): Character limits for each field,
            e.g. [40, 40] or {"Name1": 40, "Name2": 40}.

    Returns:
        List[str] | Dict[str, str]: Slices of text mapped to field limits. 
            Returns dict if `limits` is a dict, or list if `limits` is a list.
    """
    is_dict_mode = isinstance(limits, dict)
    if is_dict_mode:
        field_keys = list(limits.keys())
        field_limits = [limits[k] for k in field_keys]
    else:
        field_keys = None
        field_limits = list(limits)

    if not field_limits:
        return {} if is_dict_mode else []

    if text is None:
        text = ""

    text = text.strip()
    if not text:
        empty_list = [""] * len(field_limits)
        if is_dict_mode:
            return {key: "" for key in field_keys}
        return empty_list

    words = text.split()
    results: List[str] = []
    
    current_field_idx = 0
    current_words: List[str] = []
    current_len = 0
    total_capacity = sum(field_limits)

    for word in words:
        if current_field_idx >= len(field_limits):
            logger.warning(
                f"Input text exceeds total combined capacity ({total_capacity} chars). "
                f"Overflow text beginning with '{word}' was truncated."
            )
            break

        current_field_limit = field_limits[current_field_idx]
        added_len = len(word) if current_len == 0 else len(word) + 1

        if current_len + added_len <= current_field_limit:
            current_words.append(word)
            current_len += added_len
        else:
            # Word does not fit in the current field.
            if current_words:
                results.append(" ".join(current_words))
                current_words = []
                current_len = 0
                current_field_idx += 1

                if current_field_idx >= len(field_limits):
                    logger.warning(
                        f"Input text exceeds total combined capacity ({total_capacity} chars). "
                        f"Overflow text beginning with '{word}' was truncated."
                    )
                    break

            # Try to place the word in the new/current field
            current_field_limit = field_limits[current_field_idx]
            if len(word) <= current_field_limit:
                current_words.append(word)
                current_len = len(word)
            else:
                # Edge case: Single word length exceeds the max limit of the current field.
                logger.warning(
                    f"Single word '{word[:15]}...' ({len(word)} chars) exceeds field limit "
                    f"({current_field_limit} chars). Force splitting word across field boundaries."
                )
                rem_word = word
                while rem_word and current_field_idx < len(field_limits):
                    c_limit = field_limits[current_field_idx]
                    part = rem_word[:c_limit]
                    rem_word = rem_word[c_limit:]
                    if rem_word:
                        results.append(part)
                        current_field_idx += 1
                        current_words = []
                        current_len = 0
                    else:
                        current_words = [part]
                        current_len = len(part)

                if rem_word:
                    logger.warning(
                        f"Input text exceeds total combined capacity ({total_capacity} chars). "
                        f"Overflow text was truncated."
                    )
                    break

    if current_words and current_field_idx < len(field_limits):
        results.append(" ".join(current_words))

    # Pad missing fields with empty strings
    while len(results) < len(field_limits):
        results.append("")

    # Strip and enforce maximum bounds as safeguard
    final_results = [res.strip()[:field_limits[i]] for i, res in enumerate(results)]

    if is_dict_mode:
        return {field_keys[i]: final_results[i] for i in range(len(field_keys))}
    return final_results


def split_name(name_text: Optional[str]) -> Dict[str, str]:
    """
    Convenience wrapper for Vendor/Customer Name fields.
    Name1: 40 chars
    Name2: 40 chars
    """
    return split_text_by_word_boundary(name_text, NAME_LIMITS)  # type: ignore


def split_street(street_text: Optional[str]) -> Dict[str, str]:
    """
    Convenience wrapper for Vendor/Customer Address/Street fields.
    Street1: 60 chars
    Street2: 40 chars
    Street3: 40 chars
    Street4: 40 chars
    Street5: 40 chars
    """
    return split_text_by_word_boundary(street_text, STREET_LIMITS)  # type: ignore


def apply_text_wrapping_to_dataframe(
    df: pd.DataFrame,
    source_col: str,
    target_limits: Dict[str, int]
) -> pd.DataFrame:
    """
    Integrates text wrapping into a Pandas DataFrame.
    Splits `source_col` across target columns specified in `target_limits`.

    Example:
        df = apply_text_wrapping_to_dataframe(df, 'Full_Address', STREET_LIMITS)
    """
    if source_col not in df.columns:
        logger.warning(f"Source column '{source_col}' not found in DataFrame.")
        for field in target_limits:
            df[field] = ""
        return df

    # Apply split function row-by-row
    split_dicts = df[source_col].apply(lambda text: split_text_by_word_boundary(text, target_limits))
    
    # Expand dictionary into separate columns
    split_df = pd.DataFrame(list(split_dicts), index=df.index)
    
    for col in target_limits.keys():
        df[col] = split_df[col]

    return df
