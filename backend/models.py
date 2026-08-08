# backend/models.py
"""
Pydantic Schemas and Models for SAP Tenant Project Configuration & Duplicate Check Engine.
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class SAPProjectConfig(BaseModel):
    """Full database representation of a Project's SAP S/4HANA credentials & tenant configuration."""
    project_id: str = Field(..., description="Unique Project ID e.g. DEV_01, PROD_01")
    project_name: str = Field(..., description="Human readable project name")
    base_url: str = Field(..., description="Base S/4HANA Tenant URL e.g. https://my123456.s4hana.ondemand.com")
    
    # Business Partner Credentials (SAP_COM_0008)
    bp_comm_user: str = Field("", description="Communication User for BP / Vendor / Customer OData API")
    bp_encrypted_password: str = Field("", description="Fernet encrypted password for BP User")
    
    # Material Master Credentials (SAP_COM_0009)
    material_comm_user: str = Field("", description="Communication User for Material / Product OData API")
    material_encrypted_password: str = Field("", description="Fernet encrypted password for Material User")
    
    # Custom PAN API Configuration
    custom_pan_endpoint: Optional[str] = Field(None, description="Optional custom PAN validation API endpoint URL")
    pan_comm_user: Optional[str] = Field(None, description="Optional Communication User for PAN API")
    pan_encrypted_password: Optional[str] = Field(None, description="Fernet encrypted password for PAN API User")


class ProjectConfigCreate(BaseModel):
    """DTO for creating or updating a Project configuration."""
    project_id: str
    project_name: str
    base_url: str
    bp_comm_user: str = ""
    bp_password: str = ""
    material_comm_user: str = ""
    material_password: str = ""
    custom_pan_endpoint: Optional[str] = None
    pan_comm_user: Optional[str] = None
    pan_password: Optional[str] = None


class ProjectConfigResponse(BaseModel):
    """DTO for returning Project configurations with masked passwords."""
    project_id: str
    project_name: str
    base_url: str
    bp_comm_user: str
    bp_password_masked: str
    material_comm_user: str
    material_password_masked: str
    custom_pan_endpoint: Optional[str] = None
    pan_comm_user: Optional[str] = None
    pan_password_masked: Optional[str] = None


class TestConnectionRequest(BaseModel):
    """Payload to test SAP OData connectivity."""
    project_id: Optional[str] = None
    service_type: Literal['BP', 'MATERIAL', 'PAN']
    base_url: Optional[str] = None
    comm_user: Optional[str] = None
    password: Optional[str] = None
    custom_pan_endpoint: Optional[str] = None


class TestConnectionResponse(BaseModel):
    """Response payload for test connection."""
    success: bool
    service_type: str
    message: str
    status_code: int = 200
    details: Optional[Dict[str, Any]] = None


class MatchedSAPRecord(BaseModel):
    """Individual SAP record match returned by duplicate check."""
    sap_id: str
    record_name: str
    match_tier: Literal['HARD', 'SOFT']
    match_reason: str
    similarity_score: float = 1.0  # 1.0 = 100% hard match, 0.0 - 0.99 = soft match score
    details: Dict[str, Any] = Field(default_factory=dict)


class DuplicateCheckRequest(BaseModel):
    """Request payload for duplicate checking."""
    project_id: str
    entity_type: Literal['VENDOR', 'CUSTOMER', 'MATERIAL']
    payload: Dict[str, Any]


class DuplicateCheckResponse(BaseModel):
    """Result payload returned by duplicate check engine."""
    has_duplicates: bool
    highest_risk_tier: Literal['HARD', 'SOFT', 'NONE']
    matches: List[MatchedSAPRecord] = Field(default_factory=list)
    summary: str = ""
