import tempfile
import unittest
from pathlib import Path

from genre_research_reproducibility import (
    build_reproducibility,
    verify_reproducibility,
)


class ReproducibilityTest(unittest.TestCase):
    def test_hashes_code_inputs_and_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "screen.py"
            cache = root / "features.npz"
            script.write_text("print('ok')\n")
            cache.write_bytes(b"features")
            record = build_reproducibility(
                script, inputs=(cache,), contract={"minimumSources": 2}, root=root,
            )
            self.assertEqual(len(record["script"]["sha256"]), 64)
            self.assertEqual(record["inputs"][0]["bytes"], 8)
            self.assertEqual(record["contract"]["minimumSources"], 2)
            self.assertEqual(record["script"]["path"], "screen.py")
            self.assertEqual(verify_reproducibility(record), [])

    def test_detects_input_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "screen.py"
            cache = root / "features.npz"
            script.write_text("pass\n")
            cache.write_bytes(b"before")
            record = build_reproducibility(script, inputs=(cache,))
            cache.write_bytes(b"after")
            mismatches = verify_reproducibility(record)
            self.assertEqual(mismatches[0]["reason"], "sha256-mismatch")


if __name__ == "__main__":
    unittest.main()
