# core/xml_integration_example.py
"""
Integration Example: Demonstrating how to use smart text-wrapping in SAP 
Vendor and Customer Master Data Migration pipelines.
"""

import os
import sys
import xml.etree.ElementTree as ET
from xml.dom import minidom
import pandas as pd

# Ensure root directory is on sys.path when script is executed directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.text_wrapper import (
    split_name,
    split_street,
    apply_text_wrapping_to_dataframe,
    NAME_LIMITS,
    STREET_LIMITS
)


def process_customer_dataframe(raw_df: pd.DataFrame) -> pd.DataFrame:
    """
    Transforms raw uploaded Customer/Vendor DataFrame by applying smart 
    text-wrapping on long Name and Address columns before SAP export.
    """
    processed_df = raw_df.copy()

    # 1. Wrap Full Customer Name across Name1 (40) and Name2 (40)
    if "Full_Name" in processed_df.columns:
        processed_df = apply_text_wrapping_to_dataframe(processed_df, "Full_Name", NAME_LIMITS)

    # 2. Wrap Full Address across Street1 (60), Street2 (40), Street3 (40), Street4 (40), Street5 (40)
    if "Full_Address" in processed_df.columns:
        processed_df = apply_text_wrapping_to_dataframe(processed_df, "Full_Address", STREET_LIMITS)

    return processed_df


def generate_customer_xml_payload(customer_records: list[dict]) -> str:
    """
    Generates SAP S/4HANA compliant Customer XML data payload using the text wrapper.
    """
    root = ET.Element("CustomerMasterRecords")

    for record in customer_records:
        cust_elem = ET.SubElement(root, "CustomerRecord")
        
        # Customer ID
        ET.SubElement(cust_elem, "CustomerID").text = str(record.get("Customer_ID", ""))

        # Smart Text-Wrapping for Name
        name_fields = split_name(record.get("Full_Name", ""))
        ET.SubElement(cust_elem, "Name1").text = name_fields["Name1"]
        ET.SubElement(cust_elem, "Name2").text = name_fields["Name2"]

        # Smart Text-Wrapping for Street/Address
        street_fields = split_street(record.get("Full_Address", ""))
        ET.SubElement(cust_elem, "Street1").text = street_fields["Street1"]
        ET.SubElement(cust_elem, "Street2").text = street_fields["Street2"]
        ET.SubElement(cust_elem, "Street3").text = street_fields["Street3"]
        ET.SubElement(cust_elem, "Street4").text = street_fields["Street4"]
        ET.SubElement(cust_elem, "Street5").text = street_fields["Street5"]

        # Additional SAP Fields
        ET.SubElement(cust_elem, "PostalCode").text = str(record.get("PostalCode", ""))
        ET.SubElement(cust_elem, "City").text = str(record.get("City", ""))
        ET.SubElement(cust_elem, "Country").text = str(record.get("Country", ""))

    # Pretty-print XML string
    rough_string = ET.tostring(root, encoding='utf-8')
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ")


if __name__ == "__main__":
    # Sample migration input data with long strings
    sample_records = [
        {
            "Customer_ID": "CUST10001",
            "Full_Name": "International Business Machines Global Technology Services Division",
            "Full_Address": "Plot No 42 Phase 3 Industrial Development Area Sector 18 Near Metro Station Opp Central Park North Wing Tower B Floor 12",
            "PostalCode": "500081",
            "City": "Hyderabad",
            "Country": "IN"
        }
    ]

    xml_output = generate_customer_xml_payload(sample_records)
    print("--- SAMPLE GENERATED SAP XML PAYLOAD ---")
    print(xml_output)
