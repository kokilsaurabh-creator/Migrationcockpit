# backend/crypto.py
"""
AES-256 (Fernet) Encryption and Decryption Utility for SAP Credentials.
"""

import os
import base64
import logging
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

# Fetch FERNET_KEY from environment or derive a deterministic default key for local dev
_RAW_KEY = os.getenv("FERNET_KEY", "ExpoundSAPMasterDataSecretKey2026=")
if len(_RAW_KEY) < 32:
    _RAW_KEY = _RAW_KEY.ljust(32, "=")
_FERNET_KEY_BYTES = base64.urlsafe_b64encode(_RAW_KEY[:32].encode("utf-8"))
_cipher = Fernet(_FERNET_KEY_BYTES)


def encrypt_password(plain_text: str) -> str:
    """
    Encrypts a plain text password using Fernet (AES-256).
    """
    if not plain_text:
        return ""
    if plain_text.startswith("enc:"):
        # Already encrypted
        return plain_text
    
    try:
        token = _cipher.encrypt(plain_text.encode("utf-8")).decode("utf-8")
        return f"enc:{token}"
    except Exception as e:
        logger.error(f"Failed to encrypt password: {e}")
        return plain_text


def decrypt_password(cipher_text: str) -> str:
    """
    Decrypts a Fernet encrypted password.
    """
    if not cipher_text:
        return ""
    if not cipher_text.startswith("enc:"):
        # Assume plain text if not prefixed with enc:
        return cipher_text

    try:
        raw_token = cipher_text[4:]
        return _cipher.decrypt(raw_token.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to decrypt password: {e}")
        return ""


def mask_password(text: str) -> str:
    """
    Returns a masked string "••••••••" if text is non-empty, otherwise "".
    """
    if not text:
        return ""
    return "••••••••"
