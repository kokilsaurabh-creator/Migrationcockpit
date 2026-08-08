# tests/test_duplicate_checker.py
"""
Unit tests for SAP Duplicate Check Engine & Encryption Utility.
"""

import unittest
from backend.crypto import encrypt_password, decrypt_password, mask_password
from backend.models import SAPProjectConfig, DuplicateCheckRequest
from backend.duplicate_checker import check_duplicates, calculate_similarity


class TestDuplicateChecker(unittest.TestCase):

    def test_crypto_fernet_encryption(self):
        """Test AES-256 Fernet encryption and decryption."""
        plain = "SecretSAPPass2026!"
        encrypted = encrypt_password(plain)
        
        self.assertTrue(encrypted.startswith("enc:"))
        self.assertNotEqual(plain, encrypted)
        
        decrypted = decrypt_password(encrypted)
        self.assertEqual(plain, decrypted)
        self.assertEqual(mask_password(plain), "••••••••")

    def test_fuzzy_similarity_calculator(self):
        """Test difflib similarity ratio."""
        s1 = "Hexagonal Head Bolt M10"
        s2 = "Hexagonal Head Bolt M10"
        self.assertEqual(calculate_similarity(s1, s2), 1.0)

        s3 = "Hexagonal Head Bolt M12"
        score = calculate_similarity(s1, s3)
        self.assertGreater(score, 0.80)

    def test_material_duplicate_check(self):
        """Test Material Duplicate Check with Hard and Soft matches."""
        cfg = SAPProjectConfig(
            project_id="TEST_01",
            project_name="Test Project",
            base_url="https://example.s4hana.ondemand.com",
            bp_comm_user="USER",
            bp_encrypted_password=encrypt_password("Pass"),
            material_comm_user="MAT_USER",
            material_encrypted_password=encrypt_password("Pass")
        )

        req = DuplicateCheckRequest(
            project_id="TEST_01",
            entity_type="MATERIAL",
            payload={"ProductDescription": "HEXAGONAL HEAD BOLT M10 X 50 STAINLESS STEEL 316"}
        )

        res = check_duplicates(req, cfg)
        self.assertTrue(res.has_duplicates)
        self.assertIn(res.highest_risk_tier, ["HARD", "SOFT"])
        self.assertGreater(len(res.matches), 0)

    def test_vendor_hard_match_gstin(self):
        """Test Tier 1 Hard Match on GSTIN."""
        cfg = SAPProjectConfig(
            project_id="TEST_01",
            project_name="Test Project",
            base_url="",
            bp_comm_user="USER",
            bp_encrypted_password=encrypt_password("Pass"),
            material_comm_user="USER",
            material_encrypted_password=encrypt_password("Pass")
        )

        req = DuplicateCheckRequest(
            project_id="TEST_01",
            entity_type="VENDOR",
            payload={"GSTIN": "27AAACA12341Z1"}
        )

        res = check_duplicates(req, cfg)
        self.assertTrue(res.has_duplicates)
        self.assertEqual(res.highest_risk_tier, "HARD")
        self.assertEqual(res.matches[0].match_tier, "HARD")
        self.assertIn("GSTIN", res.matches[0].match_reason)


if __name__ == "__main__":
    unittest.main()
