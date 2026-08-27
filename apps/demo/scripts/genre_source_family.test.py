import unittest

from genre_source_family import source_family


class SourceFamilyTest(unittest.TestCase):
    def test_strict_internet_archive_is_an_independent_evaluation_source(self):
        self.assertEqual(
            source_family({"datasetName": "Internet Archive strict exact-subject CC audio"}),
            "Internet Archive Strict",
        )

    def test_legacy_internet_archive_family_is_unchanged(self):
        self.assertEqual(
            source_family({"datasetName": "Internet Archive Creative Commons Audio"}),
            "Internet Archive",
        )


if __name__ == "__main__":
    unittest.main()
