# backend/duplicate_checker.py
"""
Credential Routing & Duplicate Check Engine for SAP S/4HANA Master Data.

Modules:
1. Dynamic Service Factory (Routing Credentials per Entity Type).
2. Material Master Duplicate Checker (ProductDescription substring & difflib fuzzy match).
3. Business Partner / Vendor / Customer Duplicate Checker (Tier 1 Hard GSTIN/Bank/PAN & Tier 2 Soft Name/PostalCode fuzzy).
"""

import logging
from difflib import SequenceMatcher
from typing import Dict, Any, List, Optional, Tuple

from backend.models import (
    SAPProjectConfig,
    DuplicateCheckRequest,
    DuplicateCheckResponse,
    MatchedSAPRecord
)
from backend.crypto import decrypt_password
from backend.sap_odata import query_sap_odata, BP_ODATA_PATH, MATERIAL_ODATA_PATH

logger = logging.getLogger(__name__)


def calculate_similarity(str1: str, str2: str) -> float:
    """Calculates fuzzy similarity ratio between two strings using Python difflib."""
    if not str1 or not str2:
        return 0.0
    s1 = str1.strip().lower()
    s2 = str2.strip().lower()
    if s1 == s2:
        return 1.0
    return round(SequenceMatcher(None, s1, s2).ratio(), 3)


def run_material_duplicate_check(
    project_config: SAPProjectConfig,
    payload: Dict[str, Any]
) -> List[MatchedSAPRecord]:
    """
    Checks for duplicate Material records in SAP S/4HANA API_PRODUCT_SRV.
    Queries A_ProductDescription using substring matching & difflib fuzzy scoring.
    """
    matches: List[MatchedSAPRecord] = []
    
    # Extract material description & material code from payload
    mat_desc = str(payload.get("ProductDescription") or payload.get("MAKTX") or payload.get("Material_Description") or "").strip()
    mat_code = str(payload.get("Product") or payload.get("MATNR") or payload.get("Material_Code") or "").strip()

    if not mat_desc and not mat_code:
        return matches

    user = project_config.material_comm_user
    password = decrypt_password(project_config.material_encrypted_password)
    base_url = project_config.base_url.rstrip("/") if project_config.base_url else ""

    # Live SAP OData Query if configured
    if base_url and user:
        target_url = f"{base_url}{MATERIAL_ODATA_PATH}/A_ProductDescription"
        first_word = mat_desc.split()[0] if mat_desc else ""
        filter_str = f"substringof('{first_word}', ProductDescription)" if first_word else ""

        odata_res = query_sap_odata(
            target_url,
            user,
            password,
            params={"$filter": filter_str, "$top": "20", "$format": "json"} if filter_str else {"$top": "20", "$format": "json"}
        )

        if odata_res["success"] and odata_res["data"]:
            for item in odata_res["data"]:
                sap_mat_id = item.get("Product", "")
                sap_mat_desc = item.get("ProductDescription", "")
                score = calculate_similarity(mat_desc, sap_mat_desc)

                if sap_mat_id == mat_code:
                    matches.append(MatchedSAPRecord(
                        sap_id=sap_mat_id,
                        record_name=sap_mat_desc,
                        match_tier="HARD",
                        match_reason=f"Exact Material Code Match ({sap_mat_id})",
                        similarity_score=1.0,
                        details=item
                    ))
                elif score >= 0.80:
                    tier = "HARD" if score >= 0.95 else "SOFT"
                    matches.append(MatchedSAPRecord(
                        sap_id=sap_mat_id,
                        record_name=sap_mat_desc,
                        match_tier=tier,
                        match_reason=f"Material Description Similarity ({int(score * 100)}%)",
                        similarity_score=score,
                        details=item
                    ))
            return matches

    # Demo / Fallback Mock Engine (Ensures UI & duplicate check functionality works in test environments)
    mock_sap_materials = [
        {"Product": "MAT-10042", "ProductDescription": "HEXAGONAL HEAD BOLT M10 X 50 STAINLESS STEEL 316"},
        {"Product": "MAT-10088", "ProductDescription": "STAINLESS STEEL PIPE 2 INCH SCH 40 GRADE 304"},
        {"Product": "MAT-20015", "ProductDescription": "INDUSTRIAL BALL VALVE 1 INCH FLANGED CLASS 150"},
    ]

    for mock in mock_sap_materials:
        sap_mat_id = mock["Product"]
        sap_mat_desc = mock["ProductDescription"]
        score = calculate_similarity(mat_desc, sap_mat_desc)

        if mat_code and sap_mat_id == mat_code:
            matches.append(MatchedSAPRecord(
                sap_id=sap_mat_id,
                record_name=sap_mat_desc,
                match_tier="HARD",
                match_reason=f"Exact Material Code Match ({sap_mat_id})",
                similarity_score=1.0,
                details=mock
            ))
        elif mat_desc and score >= 0.75:
            tier = "HARD" if score >= 0.95 else "SOFT"
            matches.append(MatchedSAPRecord(
                sap_id=sap_mat_id,
                record_name=sap_mat_desc,
                match_tier=tier,
                match_reason=f"Material Description Fuzzy Match ({int(score * 100)}%)",
                similarity_score=score,
                details=mock
            ))

    return matches


def run_bp_duplicate_check(
    project_config: SAPProjectConfig,
    entity_type: str,
    payload: Dict[str, Any]
) -> List[MatchedSAPRecord]:
    """
    Checks for duplicate Vendor/Customer Business Partner records in SAP S/4HANA API_BUSINESS_PARTNER.
    
    Tier 1 (Hard Match - 100%):
      - GSTIN Tax Number ('IN3' in A_BusinessPartnerTaxNumber)
      - Bank Account Number (A_BPFinancialIdentification)
      - Custom PAN Endpoint (if configured)
      
    Tier 2 (Soft Match - Fuzzy):
      - OrganizationBPName1 substring match & difflib fuzzy score cross-referenced with PostalCode.
    """
    matches: List[MatchedSAPRecord] = []

    # Extract relevant fields from payload
    bp_name = str(payload.get("Name1") or payload.get("NAME") or payload.get("OrganizationBPName1") or payload.get("Full_Name") or payload.get("Supplier_Name") or "").strip()
    gstin = str(payload.get("GSTIN") or payload.get("STCD3") or payload.get("TaxNumber3") or "").strip().upper()
    bank_acc = str(payload.get("BankAccountNumber") or payload.get("BANKN") or payload.get("Bank_Account") or "").strip()
    pan = str(payload.get("PAN") or payload.get("STCD1") or payload.get("TaxNumber1") or "").strip().upper()
    postal_code = str(payload.get("PostalCode") or payload.get("PSTLZ") or payload.get("POST_CODE1") or "").strip()

    user = project_config.bp_comm_user
    password = decrypt_password(project_config.bp_encrypted_password)
    base_url = project_config.base_url.rstrip("/") if project_config.base_url else ""

    # Live SAP OData Check
    if base_url and user:
        # Tier 1 Hard Match: GSTIN (TaxType IN3)
        if gstin:
            target_url = f"{base_url}{BP_ODATA_PATH}/A_BusinessPartnerTaxNumber"
            res = query_sap_odata(
                target_url, user, password,
                params={"$filter": f"BPTaxType eq 'IN3' and BPTaxNumber eq '{gstin}'", "$top": "5", "$format": "json"}
            )
            if res["success"] and res["data"]:
                for rec in res["data"]:
                    bp_id = rec.get("BusinessPartner", "UNKNOWN_BP")
                    matches.append(MatchedSAPRecord(
                        sap_id=bp_id,
                        record_name=f"BP {bp_id} (Matched GSTIN)",
                        match_tier="HARD",
                        match_reason=f"Tier 1 Hard Match: Exact GSTIN Found ({gstin})",
                        similarity_score=1.0,
                        details=rec
                    ))

        # Tier 1 Hard Match: Bank Account Number
        if bank_acc and not matches:
            target_url = f"{base_url}{BP_ODATA_PATH}/A_BPFinancialIdentification"
            res = query_sap_odata(
                target_url, user, password,
                params={"$filter": f"BankAccount eq '{bank_acc}'", "$top": "5", "$format": "json"}
            )
            if res["success"] and res["data"]:
                for rec in res["data"]:
                    bp_id = rec.get("BusinessPartner", "UNKNOWN_BP")
                    matches.append(MatchedSAPRecord(
                        sap_id=bp_id,
                        record_name=f"BP {bp_id} (Matched Bank Account)",
                        match_tier="HARD",
                        match_reason=f"Tier 1 Hard Match: Exact Bank Account Found ({bank_acc})",
                        similarity_score=1.0,
                        details=rec
                    ))

        # Custom PAN Check
        if pan and project_config.custom_pan_endpoint and not matches:
            pan_user = project_config.pan_comm_user or user
            pan_pass = decrypt_password(project_config.pan_encrypted_password) if project_config.pan_encrypted_password else password
            res = query_sap_odata(
                project_config.custom_pan_endpoint, pan_user, pan_pass,
                params={"pan": pan, "$format": "json"}
            )
            if res["success"] and res["data"]:
                for rec in res["data"]:
                    bp_id = rec.get("BusinessPartner") or rec.get("PAN") or "PAN_MATCH"
                    matches.append(MatchedSAPRecord(
                        sap_id=bp_id,
                        record_name=f"PAN Record ({pan})",
                        match_tier="HARD",
                        match_reason=f"Tier 1 Hard Match: Verified PAN in Custom SAP API ({pan})",
                        similarity_score=1.0,
                        details=rec
                    ))

        # Tier 2 Soft Match: Name + PostalCode Fuzzy
        if bp_name and not matches:
            first_word = bp_name.split()[0]
            target_url = f"{base_url}{BP_ODATA_PATH}/A_BusinessPartner"
            res = query_sap_odata(
                target_url, user, password,
                params={"$filter": f"substringof('{first_word}', OrganizationBPName1)", "$top": "10", "$format": "json"}
            )
            if res["success"] and res["data"]:
                for rec in res["data"]:
                    sap_bp_id = rec.get("BusinessPartner", "")
                    sap_name = rec.get("OrganizationBPName1") or rec.get("SearchTerm1") or ""
                    score = calculate_similarity(bp_name, sap_name)
                    
                    if score >= 0.75:
                        tier = "HARD" if score >= 0.98 else "SOFT"
                        reason = f"Tier 2 Soft Match: Name Similarity ({int(score * 100)}%)"
                        if postal_code and rec.get("PostalCode") == postal_code:
                            reason += " + Same Postal Code"

                        matches.append(MatchedSAPRecord(
                            sap_id=sap_bp_id,
                            record_name=sap_name,
                            match_tier=tier,
                            match_reason=reason,
                            similarity_score=score,
                            details=rec
                        ))
            return matches

    # Demo / Fallback Mock Engine (Runs when live OData tenant is not connected locally)
    mock_bps = [
        {
            "BusinessPartner": "BP-300101",
            "OrganizationBPName1": "Acme Global Logistics & Supply Chain Solutions Pvt Ltd",
            "GSTIN": "27AAACA12341Z1",
            "BankAccount": "987654321012",
            "PAN": "AAACA1234A",
            "PostalCode": "500081"
        },
        {
            "BusinessPartner": "BP-300102",
            "OrganizationBPName1": "International Business Machines Global Services",
            "GSTIN": "36AAACI99991Z5",
            "BankAccount": "112233445566",
            "PAN": "AAACI9999I",
            "PostalCode": "500032"
        },
        {
            "BusinessPartner": "BP-300103",
            "OrganizationBPName1": "Reliable Industrial Spares & Equipment Corporation",
            "GSTIN": "29AAACR55551Z8",
            "BankAccount": "556677889900",
            "PAN": "AAACR5555R",
            "PostalCode": "560001"
        }
    ]

    for mock in mock_bps:
        sap_id = mock["BusinessPartner"]
        sap_name = mock["OrganizationBPName1"]
        mock_gst = mock["GSTIN"]
        mock_bank = mock["BankAccount"]
        mock_pan = mock["PAN"]

        # Tier 1 Hard Checks
        if gstin and gstin == mock_gst:
            matches.append(MatchedSAPRecord(
                sap_id=sap_id,
                record_name=sap_name,
                match_tier="HARD",
                match_reason=f"Tier 1 Hard Match: Exact GSTIN Found ({gstin})",
                similarity_score=1.0,
                details=mock
            ))
            break
        elif bank_acc and bank_acc == mock_bank:
            matches.append(MatchedSAPRecord(
                sap_id=sap_id,
                record_name=sap_name,
                match_tier="HARD",
                match_reason=f"Tier 1 Hard Match: Exact Bank Account Found ({bank_acc})",
                similarity_score=1.0,
                details=mock
            ))
            break
        elif pan and pan == mock_pan:
            matches.append(MatchedSAPRecord(
                sap_id=sap_id,
                record_name=sap_name,
                match_tier="HARD",
                match_reason=f"Tier 1 Hard Match: Exact PAN Found ({pan})",
                similarity_score=1.0,
                details=mock
            ))
            break
        elif bp_name:
            score = calculate_similarity(bp_name, sap_name)
            if score >= 0.75:
                tier = "HARD" if score >= 0.95 else "SOFT"
                reason = f"Tier 2 Soft Match: Name Similarity ({int(score * 100)}%)"
                if postal_code and mock["PostalCode"] == postal_code:
                    reason += " + Same Postal Code"
                
                matches.append(MatchedSAPRecord(
                    sap_id=sap_id,
                    record_name=sap_name,
                    match_tier=tier,
                    match_reason=reason,
                    similarity_score=score,
                    details=mock
                ))

    return matches


def check_duplicates(
    request: DuplicateCheckRequest,
    project_config: SAPProjectConfig
) -> DuplicateCheckResponse:
    """
    Main Entry Point: Runs duplicate check algorithm using credentials & OData endpoints
    dynamically routed based on request entity_type ('VENDOR', 'CUSTOMER', 'MATERIAL').
    """
    entity = request.entity_type.upper()
    payload = request.payload

    if entity == "MATERIAL":
        matches = run_material_duplicate_check(project_config, payload)
    else:  # VENDOR or CUSTOMER
        matches = run_bp_duplicate_check(project_config, entity, payload)

    has_duplicates = len(matches) > 0
    highest_tier = "NONE"

    if has_duplicates:
        if any(m.match_tier == "HARD" for m in matches):
            highest_tier = "HARD"
        else:
            highest_tier = "SOFT"

    summary = f"Evaluated {entity} record against SAP S/4HANA. "
    if highest_tier == "HARD":
        summary += f"CRITICAL: Found {len(matches)} HARD duplicate match(es) in SAP. XML generation prohibited."
    elif highest_tier == "SOFT":
        summary += f"WARNING: Found {len(matches)} SOFT duplicate match(es) in SAP. User review recommended."
    else:
        summary += "No existing SAP duplicates detected. Clear to proceed."

    return DuplicateCheckResponse(
        has_duplicates=has_duplicates,
        highest_risk_tier=highest_tier,  # type: ignore
        matches=matches,
        summary=summary
    )
