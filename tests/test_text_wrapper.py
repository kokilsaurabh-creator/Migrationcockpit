# tests/test_text_wrapper.py
"""
Unit tests for the smart text-wrapping utility module (core/text_wrapper.py).
"""

import unittest
import logging
import pandas as pd
from core.text_wrapper import (
    split_text_by_word_boundary,
    split_name,
    split_street,
    apply_text_wrapping_to_dataframe,
    NAME_LIMITS,
    STREET_LIMITS
)


class TestTextWrapper(unittest.TestCase):

    def test_word_boundary_enforcement_name(self):
        """
        Verify that words are not split in half across Name1 and Name2.
        """
        # "International Business Machines Global Technology Services Division"
        # Name1 (40 limit): "International Business Machines Global" (38 chars)
        # "Technology" (10 chars) won't fit in remaining 1 char of Name1, so it moves to Name2.
        raw_name = "International Business Machines Global Technology Services Division"
        result = split_name(raw_name)

        self.assertEqual(result["Name1"], "International Business Machines Global")
        self.assertEqual(result["Name2"], "Technology Services Division")
        self.assertLessEqual(len(result["Name1"]), 40)
        self.assertLessEqual(len(result["Name2"]), 40)

    def test_word_boundary_enforcement_street(self):
        """
        Verify street wrapping across Street1 (60) and Street2-5 (40).
        """
        raw_address = (
            "Plot No 42 Phase 3 Industrial Development Area Sector 18 "
            "Near Metro Station Opp Central Park North Wing Tower B Floor 12"
        )
        result = split_street(raw_address)

        self.assertLessEqual(len(result["Street1"]), 60)
        self.assertLessEqual(len(result["Street2"]), 40)
        self.assertLessEqual(len(result["Street3"]), 40)
        self.assertLessEqual(len(result["Street4"]), 40)
        self.assertLessEqual(len(result["Street5"]), 40)

        # Check word boundaries (no trailing or leading partial words)
        self.assertFalse(result["Street1"].endswith(" Near"))
        self.assertEqual(
            result["Street1"],
            "Plot No 42 Phase 3 Industrial Development Area Sector 18"
        )
        self.assertEqual(
            result["Street2"],
            "Near Metro Station Opp Central Park"
        )
        self.assertEqual(
            result["Street3"],
            "North Wing Tower B Floor 12"
        )
        self.assertEqual(result["Street4"], "")
        self.assertEqual(result["Street5"], "")

    def test_space_trimming(self):
        """
        Verify that all generated field strings have leading/trailing whitespace removed.
        """
        input_text = "   Building 104    Suite 200   Industrial Park   "
        result = split_name(input_text)

        self.assertEqual(result["Name1"], "Building 104 Suite 200 Industrial Park")
        self.assertEqual(result["Name1"], result["Name1"].strip())
        self.assertEqual(result["Name2"], "")

    def test_empty_and_none_input(self):
        """
        Verify behavior when input is None, empty string, or pure whitespace.
        """
        for empty_val in [None, "", "     ", "\t\n"]:
            res_name = split_name(empty_val)
            self.assertEqual(res_name, {"Name1": "", "Name2": ""})

            res_street = split_street(empty_val)
            self.assertEqual(
                res_street,
                {"Street1": "", "Street2": "", "Street3": "", "Street4": "", "Street5": ""}
            )

    def test_overflow_handling(self):
        """
        Verify warning log and truncation when text exceeds total capacity.
        """
        # Exceeds total capacity of Name1 + Name2 (80 characters total)
        massive_text = "Word " * 30  # 150 chars total
        with self.assertLogs('core.text_wrapper', level='WARNING') as cm:
            result = split_name(massive_text)

        self.assertEqual(len(result["Name1"]), 39)  # 7 "Word"s + 6 spaces = 39 chars
        self.assertEqual(len(result["Name2"]), 39)
        self.assertTrue(any("exceeds total combined capacity" in log for log in cm.output))

    def test_oversized_single_word(self):
        """
        Verify handling when a single word exceeds field maximum limit.
        """
        oversized_word = "A" * 50  # 50 chars, exceeds Name1 max limit of 40
        with self.assertLogs('core.text_wrapper', level='WARNING') as cm:
            result = split_name(oversized_word)

        self.assertEqual(result["Name1"], "A" * 40)
        self.assertEqual(result["Name2"], "A" * 10)

    def test_list_limits_input(self):
        """
        Verify function when limits is passed as a list of integers.
        """
        result = split_text_by_word_boundary("Alpha Beta Gamma Delta", [10, 10, 10])
        self.assertIsInstance(result, list)
        self.assertEqual(result, ["Alpha Beta", "Gamma", "Delta"])

    def test_dataframe_integration(self):
        """
        Verify apply_text_wrapping_to_dataframe helper function.
        """
        df = pd.DataFrame({
            "Customer_ID": [101, 102],
            "Raw_Name": [
                "Acme Global Logistics & Supply Chain Management Solutions",
                "Short Corp"
            ]
        })

        res_df = apply_text_wrapping_to_dataframe(df, "Raw_Name", NAME_LIMITS)

        self.assertIn("Name1", res_df.columns)
        self.assertIn("Name2", res_df.columns)
        self.assertEqual(
            res_df.loc[0, "Name1"],
            "Acme Global Logistics & Supply Chain"
        )
        self.assertEqual(
            res_df.loc[0, "Name2"],
            "Management Solutions"
        )
        self.assertEqual(res_df.loc[1, "Name1"], "Short Corp")
        self.assertEqual(res_df.loc[1, "Name2"], "")


if __name__ == "__main__":
    unittest.main()
