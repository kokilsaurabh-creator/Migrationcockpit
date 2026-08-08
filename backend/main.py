# backend/main.py
"""
FastAPI Server for Master Data Migration Hub.
Exposes endpoints for SAP Tenant Project Configuration, Test Connection, and Duplicate Check Engine.
"""

import logging
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware

from backend.models import (
    SAPProjectConfig,
    ProjectConfigCreate,
    ProjectConfigResponse,
    TestConnectionRequest,
    TestConnectionResponse,
    DuplicateCheckRequest,
    DuplicateCheckResponse
)
from backend.crypto import encrypt_password, decrypt_password, mask_password
from backend.sap_odata import test_sap_connection
from backend.duplicate_checker import check_duplicates

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend.main")

app = FastAPI(
    title="Master Data Migration Hub API",
    description="SAP S/4HANA Public Cloud Connection Management & Duplicate Check Engine",
    version="2.0.0"
)

# Configure CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIGS_FILE = os.path.join(os.path.dirname(__file__), "sap_project_configs.json")

def load_project_configs_from_disk() -> Dict[str, SAPProjectConfig]:
    db: Dict[str, SAPProjectConfig] = {
        "Material Master": SAPProjectConfig(
            project_id="Material Master",
            project_name="Material Master",
            base_url="https://my300000.s4hana.ondemand.com",
            bp_comm_user="BPU_DEV_0008",
            bp_encrypted_password=encrypt_password("DevBPPass2026!"),
            material_comm_user="MAT_DEV_0009",
            material_encrypted_password=encrypt_password("DevMatPass2026!"),
            custom_pan_endpoint="https://my300000.s4hana.ondemand.com/sap/opu/odata/sap/CUSTOM_PAN_SRV/ValidatePAN",
            pan_comm_user="PAN_DEV_USER",
            pan_encrypted_password=encrypt_password("DevPanPass2026!")
        )
    }
    if os.path.exists(CONFIGS_FILE):
        try:
            with open(CONFIGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for key, item in data.items():
                    db[key] = SAPProjectConfig(**item)
        except Exception as e:
            logger.error(f"Failed to load sap_project_configs.json: {e}")
    return db

def save_project_configs_to_disk(db: Dict[str, SAPProjectConfig]):
    try:
        data = {k: v.dict() for k, v in db.items()}
        with open(CONFIGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save sap_project_configs.json: {e}")

PROJECT_CONFIGS_DB: Dict[str, SAPProjectConfig] = load_project_configs_from_disk()


def _to_response_dto(config: SAPProjectConfig) -> ProjectConfigResponse:
    """Helper to convert stored SAPProjectConfig into masked response DTO."""
    return ProjectConfigResponse(
        project_id=config.project_id,
        project_name=config.project_name,
        base_url=config.base_url,
        bp_comm_user=config.bp_comm_user,
        bp_password_masked=mask_password(config.bp_encrypted_password),
        material_comm_user=config.material_comm_user,
        material_password_masked=mask_password(config.material_encrypted_password),
        custom_pan_endpoint=config.custom_pan_endpoint,
        pan_comm_user=config.pan_comm_user,
        pan_password_masked=mask_password(config.pan_encrypted_password or "") if config.pan_encrypted_password else None
    )


@app.get("/")
def read_root():
    return {"message": "Welcome to Master Data Migration Hub API", "version": "2.0.0"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "projects_configured": len(PROJECT_CONFIGS_DB)}


# --- MODULE 1: PROJECT CONFIG & MULTI-CREDENTIAL API ENDPOINTS ---

@app.get("/api/admin/projects", response_model=List[ProjectConfigResponse])
def list_sap_project_configs():
    """
    Returns all configured SAP S/4HANA Project Tenants with masked passwords.
    """
    # Return unique configs
    seen = set()
    unique_list = []
    for cfg in PROJECT_CONFIGS_DB.values():
        if cfg.project_name not in seen:
            seen.add(cfg.project_name)
            unique_list.append(_to_response_dto(cfg))
    return unique_list


@app.get("/api/admin/projects/{project_id}", response_model=ProjectConfigResponse)
def get_sap_project_config(project_id: str):
    """
    Retrieves a single project configuration by project_id or project_name.
    """
    target = None
    for k, v in PROJECT_CONFIGS_DB.items():
        if k.lower() == project_id.lower() or v.project_id.lower() == project_id.lower() or v.project_name.lower() == project_id.lower():
            target = v
            break

    if not target:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return _to_response_dto(target)


@app.post("/api/admin/projects", response_model=ProjectConfigResponse)
def save_sap_project_config(payload: ProjectConfigCreate):
    """
    Saves or updates an SAP Project configuration.
    Encrypts all incoming passwords at rest using Fernet (AES-256).
    """
    existing = PROJECT_CONFIGS_DB.get(payload.project_id) or PROJECT_CONFIGS_DB.get(payload.project_name)

    # Determine encryption behavior (retain existing encrypted password if incoming password is masked or unchanged)
    bp_enc = existing.bp_encrypted_password if (existing and payload.bp_password in ["••••••••", ""]) else encrypt_password(payload.bp_password)
    mat_enc = existing.material_encrypted_password if (existing and payload.material_password in ["••••••••", ""]) else encrypt_password(payload.material_password)
    
    pan_enc = None
    if payload.pan_password:
        if existing and payload.pan_password in ["••••••••", ""]:
            pan_enc = existing.pan_encrypted_password
        else:
            pan_enc = encrypt_password(payload.pan_password)

    config = SAPProjectConfig(
        project_id=payload.project_id,
        project_name=payload.project_name,
        base_url=payload.base_url,
        bp_comm_user=payload.bp_comm_user,
        bp_encrypted_password=bp_enc,
        material_comm_user=payload.material_comm_user,
        material_encrypted_password=mat_enc,
        custom_pan_endpoint=payload.custom_pan_endpoint,
        pan_comm_user=payload.pan_comm_user,
        pan_encrypted_password=pan_enc
    )

    PROJECT_CONFIGS_DB[payload.project_id] = config
    PROJECT_CONFIGS_DB[payload.project_name] = config
    save_project_configs_to_disk(PROJECT_CONFIGS_DB)
    logger.info(f"Saved SAP Project Configuration for project '{payload.project_id}' ({payload.project_name})")
    return _to_response_dto(config)


@app.post("/api/admin/test-connection", response_model=TestConnectionResponse)
def test_sap_connection_endpoint(request: TestConnectionRequest):
    """
    Tests SAP S/4HANA connectivity for a specified service type ('BP', 'MATERIAL', 'PAN').
    Pings SAP_COM_0008 (API_BUSINESS_PARTNER), SAP_COM_0009 (API_PRODUCT_SRV), or Custom PAN endpoint.
    """
    base_url = request.base_url or ""
    comm_user = request.comm_user or ""
    password = request.password or ""
    custom_pan_endpoint = request.custom_pan_endpoint

    # If project_id is provided, fill missing credentials from stored project config
    if request.project_id and request.project_id in PROJECT_CONFIGS_DB:
        cfg = PROJECT_CONFIGS_DB[request.project_id]
        if not base_url:
            base_url = cfg.base_url

        if request.service_type == "BP":
            comm_user = comm_user or cfg.bp_comm_user
            password = password if (password and password != "••••••••") else decrypt_password(cfg.bp_encrypted_password)
        elif request.service_type == "MATERIAL":
            comm_user = comm_user or cfg.material_comm_user
            password = password if (password and password != "••••••••") else decrypt_password(cfg.material_encrypted_password)
        elif request.service_type == "PAN":
            comm_user = comm_user or cfg.pan_comm_user or cfg.bp_comm_user
            password = password if (password and password != "••••••••") else decrypt_password(cfg.pan_encrypted_password or cfg.bp_encrypted_password)
            custom_pan_endpoint = custom_pan_endpoint or cfg.custom_pan_endpoint

    res = test_sap_connection(
        base_url=base_url,
        user=comm_user,
        password=password,
        service_type=request.service_type,
        custom_pan_endpoint=custom_pan_endpoint
    )

    return TestConnectionResponse(
        success=res["success"],
        service_type=res["service_type"],
        message=res["message"],
        status_code=res["status_code"]
    )


# --- MODULE 2: CREDENTIAL ROUTING & DUPLICATE CHECK API ENDPOINT ---

@app.post("/api/master-data/check-duplicates", response_model=DuplicateCheckResponse)
def check_master_data_duplicates_endpoint(request: DuplicateCheckRequest):
    """
    Executes Duplicate Check Engine against SAP S/4HANA OData services.
    Dynamically routes credentials based on request entity_type ('VENDOR', 'CUSTOMER', 'MATERIAL').
    """
    project_id = request.project_id
    config = PROJECT_CONFIGS_DB.get(project_id)

    if not config:
        # Fallback default project config if project_id not found
        config = SAPProjectConfig(
            project_id=project_id,
            project_name=f"Project {project_id}",
            base_url="https://my300000.s4hana.ondemand.com",
            bp_comm_user="BPU_DEFAULT",
            bp_encrypted_password=encrypt_password("DefaultPass"),
            material_comm_user="MAT_DEFAULT",
            material_encrypted_password=encrypt_password("DefaultPass")
        )

    res = check_duplicates(request, config)
    return res
