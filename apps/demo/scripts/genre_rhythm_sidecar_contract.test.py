#!/usr/bin/env python3
import unittest
import numpy as np

from genre_rhythm_sidecar_contract import (
    SAMPLE_RATE, VECTOR_LENGTH, extract_rhythm_sidecar_array,
)

def clicks(bpm, seconds=12):
    y = np.zeros(SAMPLE_RATE * seconds, dtype=np.float32)
    step = int(round(SAMPLE_RATE * 60 / bpm))
    for index in range(0, len(y), step):
        y[index:index + 96] = np.hanning(min(96, len(y) - index))
    return y

class RhythmSidecarContractTest(unittest.TestCase):
    def test_contract_is_fixed_finite_and_deterministic(self):
        left = np.asarray(extract_rhythm_sidecar_array(clicks(170)))
        right = np.asarray(extract_rhythm_sidecar_array(clicks(170)))
        self.assertEqual(len(left), VECTOR_LENGTH)
        self.assertTrue(np.all(np.isfinite(left)))
        np.testing.assert_allclose(left, right, atol=0, rtol=0)

    def test_target_pulse_bins_separate_fast_and_half_time_clicks(self):
        fast = np.asarray(extract_rhythm_sidecar_array(clicks(170)))
        half = np.asarray(extract_rhythm_sidecar_array(clicks(140)))
        self.assertGreater(fast[21], fast[18])
        self.assertGreater(half[18], half[21])

if __name__ == "__main__":
    unittest.main()
