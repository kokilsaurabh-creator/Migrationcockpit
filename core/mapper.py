# core/mapper.py
import pandas as pd
import streamlit as st
from core.db import supabase
from core.text_wrapper import split_name, split_street, NAME_LIMITS, STREET_LIMITS

def apply_direct_mapping(raw_df: pd.DataFrame, project_name: str) -> pd.DataFrame:
    """
    Applies 'Direct' field mappings from the database to the raw uploaded data,
    and automatically enforces smart text-wrapping on Name and Street fields.
    """
    if not supabase:
        st.error("Database connection missing.")
        return pd.DataFrame()

    try:
        # Fetch only the "Direct" mappings for this specific project
        response = supabase.table("field_mappings").select("*").eq(
            "project_name", project_name
        ).eq("mapping_type", "Direct").execute()
        
        direct_mappings = response.data
    except Exception as e:
        st.error(f"Error fetching direct mappings: {e}")
        return pd.DataFrame()

    if not direct_mappings:
        st.warning("No direct mappings found. Please configure the dashboard first.")
        return pd.DataFrame()

    # Initialize a fresh target DataFrame
    target_df = pd.DataFrame()

    # Loop through the mappings and extract the data
    for mapping in direct_mappings:
        target_col = mapping['field_name']
        source_col = mapping['source_field']

        if source_col in raw_df.columns:
            target_df[target_col] = raw_df[source_col]
        else:
            st.warning(f"Source column '{source_col}' missing from uploaded file. Field '{target_col}' will be left blank.")
            target_df[target_col] = "" 
            
    # Apply Smart Text Wrapping for Name fields
    name_primary_cols = ['NAME', 'NAME1', 'NAME_FIRST', 'NAME_ORG1', 'Name', 'Name 1', 'Name1']
    for n_col in name_primary_cols:
        if n_col in target_df.columns:
            name2_col = 'NAME2' if 'NAME2' in target_df.columns else ('Name2' if 'Name2' in target_df.columns else None)
            
            def wrap_name_row(row):
                val = str(row[n_col]) if pd.notna(row[n_col]) else ""
                res = split_name(val)
                row[n_col] = res['Name1']
                if name2_col and not str(row.get(name2_col, '')).strip():
                    row[name2_col] = res['Name2']
                return row
            
            target_df = target_df.apply(wrap_name_row, axis=1)

    # Apply Smart Text Wrapping for Street/Address fields
    street_primary_cols = ['STREET', 'STREET1', 'STR_SUPPL1', 'Street', 'Street 1', 'Street1', 'Address', 'Full Address']
    for s_col in street_primary_cols:
        if s_col in target_df.columns:
            def wrap_street_row(row):
                val = str(row[s_col]) if pd.notna(row[s_col]) else ""
                res = split_street(val)
                row[s_col] = res['Street1']
                for idx in range(2, 6):
                    target_s_col = f"STREET{idx}" if f"STREET{idx}" in row else (f"Street {idx}" if f"Street {idx}" in row else None)
                    if target_s_col and not str(row.get(target_s_col, '')).strip():
                        row[target_s_col] = res[f"Street{idx}"]
                return row
            
            target_df = target_df.apply(wrap_street_row, axis=1)

    return target_df