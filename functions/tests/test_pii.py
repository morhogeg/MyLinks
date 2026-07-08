"""Tests for pii.mask_phone / mask_email — the PII redaction used everywhere we
log a phone-keyed uid or a digest recipient (SOURCE_OF_TRUTH §11 A2)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pii import mask_phone, mask_email


class TestMaskPhone(unittest.TestCase):
    def test_keeps_only_last_four(self):
        self.assertEqual(mask_phone("+12025550142"), "***0142")
        self.assertEqual(mask_phone("15551234567"), "***4567")

    def test_short_or_empty_is_fully_masked(self):
        self.assertEqual(mask_phone(""), "***")
        self.assertEqual(mask_phone(None), "***")
        self.assertEqual(mask_phone("12"), "***")

    def test_never_returns_the_full_number(self):
        raw = "+972501234567"
        self.assertNotIn(raw, mask_phone(raw))
        self.assertTrue(mask_phone(raw).startswith("***"))


class TestMaskEmail(unittest.TestCase):
    def test_keeps_first_char_and_domain(self):
        self.assertEqual(mask_email("jane.doe@example.com"), "j***@example.com")

    def test_non_email_is_fully_masked(self):
        self.assertEqual(mask_email("not-an-email"), "***")
        self.assertEqual(mask_email(None), "***")

    def test_does_not_leak_local_part(self):
        masked = mask_email("secretlocalpart@corp.io")
        self.assertNotIn("secretlocalpart", masked)
        self.assertIn("@corp.io", masked)


if __name__ == "__main__":
    unittest.main()
