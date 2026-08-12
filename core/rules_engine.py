# core/rules_engine.py
import pandas as pd
import streamlit as st
from core.db import supabase

def apply_fixed_rules(target_df: pd.DataFrame, project_name: str, master_type: str = "Material Master") -> pd.DataFrame:
    """
    Applies 'Fixed' field rules from the database to the target data payload for a specific master type.
    """
    if not supabase or target_df.empty:
        return target_df

    try:
        # Fetch fixed mappings for this project
        response = supabase.table("field_mappings").select("*").eq(
            "project_name", project_name
        ).execute()
        
        fixed_mappings = [m for m in (response.data or []) if m.get('mapping_type') in ("Fixed", "Fixed Values")]
    except Exception as e:
        if hasattr(st, "error"):
            st.error(f"Error fetching fixed rules: {e}")
        return target_df

    # Inject the hardcoded values across all rows in the DataFrame
    for mapping in fixed_mappings:
        target_col = mapping['field_name']
        fixed_val = mapping['fixed_value']
        target_df[target_col] = fixed_val
        
    return target_df