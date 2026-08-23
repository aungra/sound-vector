import importlib.util
import unittest
from pathlib import Path

import numpy as np


ENGINE_PATH = Path(__file__).with_name("genre-embedding-macro-specialists.py")


def load_engine():
    spec = importlib.util.spec_from_file_location("genre_macro_specialists_test_target", ENGINE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MacroSpecialistWeightTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = load_engine()

    def test_applies_override_to_each_rows_predicted_macro(self):
        global_scores = np.asarray([[1.0, 0.0], [1.0, 0.0]])
        specialist_scores = np.asarray([[0.0, 1.0], [0.0, 1.0]])
        tag_scores = np.asarray([[0.5, 0.5], [0.5, 0.5]])
        macro_scores = np.asarray([[0.9, 0.1], [0.1, 0.9]])

        actual = self.engine.blended_fine_scores_with_macro_weights(
            global_scores,
            specialist_scores,
            tag_scores,
            macro_scores,
            ["ambient", "classical"],
            0.25,
            {"classical": 0.75},
            0.20,
        )

        np.testing.assert_allclose(actual, [[0.7, 0.3], [0.3, 0.7]])
        np.testing.assert_allclose(actual.sum(axis=1), [1.0, 1.0])


if __name__ == "__main__":
    unittest.main()
