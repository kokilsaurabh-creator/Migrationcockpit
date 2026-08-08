# backend/sap_odata.py
"""
SAP S/4HANA Public Cloud OData Integration Service.
Handles Basic Authentication HTTP requests to SAP standard and custom OData APIs.
"""

import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Standard SAP S/4HANA Public Cloud OData Service Endpoints
BP_ODATA_PATH = "/sap/opu/odata/sap/API_BUSINESS_PARTNER"
MATERIAL_ODATA_PATH = "/sap/opu/odata/sap/API_PRODUCT_SRV"


def query_sap_odata(
    url: str,
    user: str,
    password: str,
    params: Optional[Dict[str, Any]] = None,
    timeout: float = 12.0
) -> Dict[str, Any]:
    """
    Executes a Basic Auth HTTP GET request to an SAP S/4HANA OData endpoint.
    """
    if not url:
        return {"success": False, "error": "Empty URL provided", "status_code": 400, "data": []}

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

    try:
        with httpx.Client(timeout=timeout, verify=False) as client:
            response = client.get(
                url,
                auth=(user, password),
                headers=headers,
                params=params
            )

        if response.status_code in [200, 201]:
            data = response.json()
            # Extract OData results array if present
            results = data.get("d", {}).get("results", []) if isinstance(data, dict) else []
            return {
                "success": True,
                "status_code": response.status_code,
                "data": results,
                "raw_response": data
            }
        else:
            return {
                "success": False,
                "status_code": response.status_code,
                "error": f"HTTP {response.status_code}: {response.text[:200]}",
                "data": []
            }

    except httpx.ConnectError:
        return {"success": False, "status_code": 503, "error": f"Could not connect to host at {url}", "data": []}
    except httpx.TimeoutException:
        return {"success": False, "status_code": 504, "error": "Connection timed out connecting to SAP OData service", "data": []}
    except Exception as e:
        logger.error(f"Error querying SAP OData at {url}: {e}")
        return {"success": False, "status_code": 500, "error": str(e), "data": []}


def test_sap_connection(
    base_url: str,
    user: str,
    password: str,
    service_type: str,
    custom_pan_endpoint: Optional[str] = None
) -> Dict[str, Any]:
    """
    Tests SAP S/4HANA connectivity for a specified service type ('BP', 'MATERIAL', 'PAN').
    Pings SAP_COM_0008 (API_BUSINESS_PARTNER), SAP_COM_0009 (API_PRODUCT_SRV), or Custom PAN endpoint.
    """
    clean_base = base_url.rstrip("/") if base_url else ""
    
    if service_type == "BP":
        target_url = f"{clean_base}{BP_ODATA_PATH}/A_BusinessPartner"
        params = {"$top": "1", "$format": "json"}
        service_name = "Business Partner (SAP_COM_0008)"
    elif service_type == "MATERIAL":
        target_url = f"{clean_base}{MATERIAL_ODATA_PATH}/A_ProductDescription"
        params = {"$top": "1", "$format": "json"}
        service_name = "Material Master (SAP_COM_0009)"
    elif service_type == "PAN":
        target_url = custom_pan_endpoint if custom_pan_endpoint else f"{clean_base}/sap/opu/odata/sap/CUSTOM_PAN_SRV/ValidatePAN"
        params = {"$top": "1", "$format": "json"}
        service_name = "Custom PAN API"
    else:
        return {
            "success": False,
            "service_type": service_type,
            "message": f"Unknown service type '{service_type}'",
            "status_code": 400
        }

    if not clean_base and service_type != "PAN":
        return {
            "success": False,
            "service_type": service_type,
            "message": "Base URL is required to test SAP connection",
            "status_code": 400
        }

    if not user:
        return {
            "success": False,
            "service_type": service_type,
            "message": f"Communication User is required for {service_name}",
            "status_code": 400
        }

    logger.info(f"Pinging SAP {service_name} at {target_url} with user '{user}'...")
    res = query_sap_odata(target_url, user, password, params=params, timeout=8.0)

    if res["success"]:
        return {
            "success": True,
            "service_type": service_type,
            "message": f"Successfully connected to SAP {service_name}! (HTTP {res['status_code']})",
            "status_code": res["status_code"]
        }
    else:
        # Provide diagnostic feedback
        status = res["status_code"]
        err_msg = res.get("error", "Connection failed")
        
        if status == 401 or status == 403:
            return {
                "success": False,
                "service_type": service_type,
                "message": f"Authentication failed (HTTP {status}) for user '{user}'. Check Communication User & Password.",
                "status_code": status
            }
        elif status == 404:
            return {
                "success": False,
                "service_type": service_type,
                "message": f"OData endpoint not found at {target_url} (HTTP 404). Check Communication Scenario configuration.",
                "status_code": status
            }
        else:
            return {
                "success": False,
                "service_type": service_type,
                "message": f"Connection test failed for {service_name}: {err_msg}",
                "status_code": status
            }
