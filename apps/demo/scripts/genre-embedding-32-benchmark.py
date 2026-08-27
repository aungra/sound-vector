import json
import hashlib
import os
from fnmatch import fnmatchcase
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.metrics import balanced_accuracy_score
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

try:
    from xgboost import XGBClassifier
except ImportError:
    XGBClassifier = None


ROOT = Path(__file__).resolve().parents[3]
TRAINING_DIR = ROOT / "genre-training"
SPLITS_PATH = TRAINING_DIR / "dataset-splits.json"
REPORT_PATH = Path(os.environ.get(
    "MMFR_EMBEDDING_REPORT_PATH",
    str(TRAINING_DIR / "embedding-32-benchmark.json"),
))
REPLAY_BEST = os.environ.get("MMFR_EMBEDDING_REPLAY_BEST", "0") == "1"
APPLY_FINE_COORDINATE_CALIBRATION = os.environ.get("MMFR_APPLY_FINE_COORDINATE_CALIBRATION", "0") == "1"
APPLY_MACRO_COORDINATE_CALIBRATION = os.environ.get("MMFR_APPLY_MACRO_COORDINATE_CALIBRATION", "0") == "1"
XGBOOST_SEARCH = os.environ.get("MMFR_EMBEDDING_XGBOOST_SEARCH", "0") == "1"
HYBRID_SEARCH = os.environ.get("MMFR_EMBEDDING_HYBRID_SEARCH", "0") == "1"
ENABLE_SPECIALIST_TAG_PRIORS = os.environ.get("MMFR_ENABLE_SPECIALIST_TAG_PRIORS", "0") == "1"
DISCOGS_CACHE = Path(os.environ.get(
    "MMFR_ESSENTIA_DISCOGS_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-discogs-feature-cache.json",
))
MTG_CACHE = Path(os.environ.get(
    "MMFR_ESSENTIA_MTG_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-mtg-jamendo-feature-cache.json",
))
LIBROSA_CACHE = Path(os.environ.get(
    "MMFR_LIBROSA_FEATURE_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/librosa-feature-cache.json",
))
MUSICNN_CACHE = Path(os.environ.get(
    "MMFR_MUSICNN_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/musicnn-feature-cache.json",
))
SPECIALIST_CACHE = Path(os.environ.get(
    "MMFR_ESSENTIA_SPECIALIST_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/essentia-genre-specialist-moment-v2-cache.json",
))
MAEST_CACHE = Path(os.environ.get(
    "MMFR_MAEST_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/maest-prediction-cache.json",
))
MAEST_30S_CACHE = Path(os.environ.get(
    "MMFR_MAEST_30S_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/maest-prediction-moments-30s-cache.json",
))
MAEST_REPRESENTATION_CACHE = Path(os.environ.get(
    "MMFR_MAEST_REPRESENTATION_CACHE_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/genre-training/maest-representation-cache.json",
))
FEATURE_SET_FILTER = {
    value.strip()
    for value in os.environ.get("MMFR_EMBEDDING_FEATURE_SETS", "").split(",")
    if value.strip()
}
MACRO_MODEL_FILTER = {
    value.strip()
    for value in os.environ.get("MMFR_EMBEDDING_MACRO_MODELS", "").split(",")
    if value.strip()
}
FINE_MODEL_FILTER = {
    value.strip()
    for value in os.environ.get("MMFR_EMBEDDING_FINE_MODELS", "").split(",")
    if value.strip()
}
FAMILY_WEIGHTS = tuple(
    float(value.strip())
    for value in os.environ.get("MMFR_EMBEDDING_FAMILY_WEIGHTS", "0,0.5,1").split(",")
    if value.strip()
)
SPECIALIST_VECTOR_SIZE = 2856
MAEST_VECTOR_SIZE = 1200
MAEST_EMBEDDING_SIZE = 768
MAEST_JOINT_SIZE = 1168
MAEST_PREDICTION_MOMENTS_SIZE = 1200
MAEST_EMBEDDING_MOMENTS_SIZE = 2304
MAEST_CLS_DIST_SIZE = 1536
MAEST_CLS_DIST_MOMENTS_SIZE = 4608
MAEST_RICH_JOINT_SIZE = 3504
DISCOGS_META_PATH = Path(os.environ.get(
    "MMFR_ESSENTIA_DISCOGS_META_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models/essentia-discogs-effnet/genre_discogs400-discogs-effnet-1.json",
))
MTG_META_PATH = Path(os.environ.get(
    "MMFR_ESSENTIA_MTG_JAMENDO_META_PATH",
    "/Volumes/20251005_12TBskyhawk/MUSICTee-cache/models/essentia-mtg-jamendo/mtg_jamendo_genre-discogs-effnet-1.json",
))

TARGET_GENRES = [
    "アンビエント", "ドローン", "ノイズミュージック", "電子音楽",
    "テクノ", "ハウス", "ディープ・ハウス", "トランス",
    "ドラムンベース", "ダブステップ", "チップチューン",
    "ヒップホップ", "トラップ", "レゲエ", "ダブ", "ブルース",
    "ファンク", "ソウルミュージック", "ディスコ",
    "ロック", "パンク", "ハードコア", "メタル",
    "ジャズ", "シティ・ポップ", "J-POP", "アニメソング",
    "クラシック音楽", "オペラ", "フォーク", "ラテン", "ワールドミュージック",
]
PARENT_LABELS = {
    "電子音楽": "electronic",
    "ワールドミュージック": "world",
}
GENRE_ALIASES = {
    "クラシック": "クラシック音楽",
    "バロック": "クラシック音楽",
    "ロマン派": "クラシック音楽",
    "近現代クラシック": "クラシック音楽",
    "マーチ": "クラシック音楽",
    "サンバ": "ラテン",
    "タンゴ": "ラテン",
    "ボサノヴァ": "ラテン",
    "フラメンコ": "ラテン",
    "ビッグバンド": "ジャズ",
    "フュージョン": "ジャズ",
    "ポップ": "J-POP",
    "バラード": "J-POP",
}
GENRE_MACRO = {
    "アンビエント": "ambient", "ドローン": "ambient", "ノイズミュージック": "ambient",
    "テクノ": "electronic", "ハウス": "electronic", "ディープ・ハウス": "electronic",
    "トランス": "electronic", "ドラムンベース": "electronic", "ダブステップ": "electronic",
    "チップチューン": "electronic", "ヒップホップ": "black_music", "トラップ": "black_music",
    "レゲエ": "black_music", "ダブ": "black_music", "ブルース": "black_music",
    "ファンク": "black_music", "ソウルミュージック": "black_music", "ディスコ": "black_music",
    "ロック": "rock", "パンク": "rock", "ハードコア": "rock", "メタル": "rock",
    "ジャズ": "jazz", "シティ・ポップ": "pop", "J-POP": "pop", "アニメソング": "pop",
    "クラシック音楽": "classical", "オペラ": "classical", "フォーク": "world", "ラテン": "world",
}
FINE_LABELS = [label for label in TARGET_GENRES if label not in PARENT_LABELS]
FINE_FAMILIES = {
    "ambient_texture": ["アンビエント", "ドローン", "ノイズミュージック"],
    "electronic_dance": ["テクノ", "ハウス", "ディープ・ハウス", "トランス"],
    "electronic_bass": ["ドラムンベース", "ダブステップ", "チップチューン"],
    "black_groove": ["ヒップホップ", "トラップ", "レゲエ", "ダブ", "ブルース", "ファンク", "ソウルミュージック", "ディスコ"],
    "guitar_heavy": ["ロック", "パンク", "ハードコア", "メタル"],
    "pop_japan": ["シティ・ポップ", "J-POP", "アニメソング"],
    "classical_voice": ["クラシック音楽", "オペラ"],
    "world_roots": ["フォーク", "ラテン"],
}
MACRO_TAG_PATTERNS = {
    "ambient": ["Electronic---Ambient", "Electronic---Dark Ambient", "Electronic---Drone"],
    "black_music": ["Blues---*", "Funk / Soul---*", "Hip Hop---*", "Reggae---*"],
    "classical": ["Classical---*"],
    "electronic": ["Electronic---*"],
    "jazz": ["Jazz---*"],
    "pop": ["Pop---*"],
    "rock": ["Rock---*"],
    "world": ["Folk, World, & Country---*", "Latin---*"],
}
FINE_TAG_PATTERNS = {
    "アンビエント": ["Electronic---Ambient", "Electronic---Dark Ambient"],
    "ドローン": ["Electronic---Drone"],
    "ノイズミュージック": ["Electronic---Noise", "Electronic---Rhythmic Noise", "Rock---Noise", "Rock---Noisecore"],
    "テクノ": ["Electronic---Techno", "Electronic---Minimal Techno", "Electronic---Deep Techno", "Electronic---Hard Techno"],
    "ハウス": ["Electronic---House", "Electronic---Acid House", "Electronic---Electro House", "Electronic---Garage House", "Electronic---Progressive House", "Electronic---Tech House"],
    "ディープ・ハウス": ["Electronic---Deep House"],
    "トランス": ["Electronic---Trance", "Electronic---Goa Trance", "Electronic---Progressive Trance", "Electronic---Psy-Trance", "Electronic---Tech Trance"],
    "ドラムンベース": ["Electronic---Drum n Bass", "Electronic---Jungle", "Electronic---Breakbeat", "Electronic---Breakcore", "Electronic---Breaks"],
    "ダブステップ": ["Electronic---Dubstep"],
    "チップチューン": ["Electronic---Chiptune"],
    "ヒップホップ": ["Hip Hop---Boom Bap", "Hip Hop---Conscious", "Hip Hop---Gangsta", "Hip Hop---Instrumental", "Hip Hop---Pop Rap", "Hip Hop---Turntablism", "Electronic---Hip Hop"],
    "トラップ": ["Hip Hop---Trap"],
    "レゲエ": ["Reggae---Reggae", "Reggae---Roots Reggae", "Reggae---Reggae-Pop", "Reggae---Rocksteady", "Reggae---Dancehall", "Reggae---Ska"],
    "ダブ": ["Reggae---Dub", "Electronic---Dub", "Electronic---Dub Techno"],
    "ブルース": ["Blues---*"],
    "ファンク": ["Funk / Soul---Funk", "Funk / Soul---Free Funk", "Funk / Soul---P.Funk", "Jazz---Jazz-Funk"],
    "ソウルミュージック": ["Funk / Soul---Soul", "Funk / Soul---Neo Soul", "Funk / Soul---UK Street Soul"],
    "ディスコ": ["Funk / Soul---Disco", "Electronic---Disco", "Electronic---Nu-Disco", "Electronic---Italo-Disco"],
    "ロック": ["Rock---Rock & Roll", "Rock---Alternative Rock", "Rock---Classic Rock", "Rock---Indie Rock", "Rock---Hard Rock", "Rock---Pop Rock", "Rock---AOR"],
    "パンク": ["Rock---Punk", "Rock---Post-Punk", "Rock---Pop Punk", "Rock---Oi"],
    "ハードコア": ["Rock---Hardcore", "Rock---Post-Hardcore", "Rock---Melodic Hardcore", "Electronic---Hardcore", "Electronic---Happy Hardcore"],
    "メタル": ["Rock---*Metal*", "Rock---Thrash", "Rock---Grindcore", "Rock---Deathcore"],
    "ジャズ": ["Jazz---*"],
    "シティ・ポップ": ["Pop---City Pop"],
    "J-POP": ["Pop---J-pop", "Pop---Kayōkyoku"],
    "アニメソング": [],
    "クラシック音楽": ["Classical---Classical", "Classical---Baroque", "Classical---Contemporary", "Classical---Romantic", "Classical---Modern", "Classical---Renaissance"],
    "オペラ": ["Classical---Opera"],
    "フォーク": ["Folk, World, & Country---Folk", "Electronic---Neofolk", "Rock---Folk Rock"],
    "ラテン": ["Latin---*", "Jazz---Latin Jazz", "Jazz---Bossa Nova"],
}
MTG_MACRO_TAG_PATTERNS = {
    "ambient": ["ambient", "atmospheric", "darkambient", "chillout"],
    "black_music": ["hiphop", "rap", "soul", "funk", "rnb", "reggae", "dub", "disco", "groove"],
    "classical": ["classical", "orchestral", "choir", "contemporary", "symphonic"],
    "electronic": ["electronic", "electronica", "edm", "techno", "house", "deephouse", "trance", "drumnbass", "dubstep", "breakbeat", "club", "dance"],
    "jazz": ["jazz", "jazzfusion", "improvisation", "fusion", "acidjazz", "swing"],
    "pop": ["pop", "electropop", "instrumentalpop", "easylistening", "synthpop"],
    "rock": ["rock", "alternativerock", "hardrock", "punkrock", "metal", "grunge", "poprock", "classicrock"],
    "world": ["ethno", "world", "folk", "latin", "bossanova", "celtic", "chanson", "country", "worldfusion"],
}
MTG_FINE_TAG_PATTERNS = {
    "アンビエント": ["ambient", "atmospheric", "chillout", "newage"],
    "ドローン": ["darkambient", "ambient", "atmospheric"],
    "ノイズミュージック": ["industrial", "experimental", "darkwave"],
    "テクノ": ["techno", "minimal", "club"],
    "ハウス": ["house", "club", "dance"],
    "ディープ・ハウス": ["deephouse"],
    "トランス": ["trance"],
    "ドラムンベース": ["drumnbass", "breakbeat"],
    "ダブステップ": ["dubstep"],
    "ヒップホップ": ["hiphop", "rap"],
    "レゲエ": ["reggae"],
    "ダブ": ["dub"],
    "ブルース": ["blues", "bluesrock"],
    "ファンク": ["funk", "groove", "acidjazz"],
    "ソウルミュージック": ["soul", "rnb"],
    "ディスコ": ["disco"],
    "ロック": ["rock", "alternativerock", "classicrock", "instrumentalrock", "poprock"],
    "パンク": ["punkrock"],
    "ハードコア": ["hard", "punkrock"],
    "メタル": ["metal", "hardrock"],
    "ジャズ": ["jazz", "jazzfusion", "improvisation", "swing"],
    "シティ・ポップ": ["synthpop", "80s"],
    "J-POP": ["pop", "electropop"],
    "アニメソング": ["soundtrack"],
    "クラシック音楽": ["classical", "orchestral", "contemporary", "symphonic"],
    "オペラ": ["choir", "classical"],
    "フォーク": ["folk", "popfolk", "singersongwriter"],
    "ラテン": ["latin", "bossanova"],
}
SPECIALIST_HEAD_LAYOUT = {
    "dortmund": {
        "offset": 0,
        "classes": ["alternative", "blues", "electronic", "folkcountr", "funksoulrnb", "jazz", "pop", "raphiphop", "rock"],
    },
    "rosamerica": {
        "offset": 327,
        "classes": ["cla", "dan", "hip", "jaz", "pop", "rhy", "roc", "spe"],
    },
    "electronic": {
        "offset": 651,
        "classes": ["ambient", "dnb", "house", "techno", "trance"],
    },
    "tzanetakis": {
        "offset": 966,
        "classes": ["blu", "cla", "cou", "dis", "hip", "jaz", "met", "pop", "reg", "roc"],
    },
    "fma_small": {
        "offset": 1296,
        "classes": ["Electronic", "Experimental", "Folk", "Hip-Hop", "Instrumental", "International", "Pop", "Rock"],
    },
}
SPECIALIST_MACRO_MAP = {
    ("dortmund", "alternative"): {"rock": 1.0},
    ("dortmund", "blues"): {"black_music": 1.0},
    ("dortmund", "electronic"): {"electronic": 1.0},
    ("dortmund", "folkcountr"): {"world": 1.0},
    ("dortmund", "funksoulrnb"): {"black_music": 1.0},
    ("dortmund", "jazz"): {"jazz": 1.0},
    ("dortmund", "pop"): {"pop": 1.0},
    ("dortmund", "raphiphop"): {"black_music": 1.0},
    ("dortmund", "rock"): {"rock": 1.0},
    ("rosamerica", "cla"): {"classical": 1.0},
    ("rosamerica", "dan"): {"electronic": 1.0},
    ("rosamerica", "hip"): {"black_music": 1.0},
    ("rosamerica", "jaz"): {"jazz": 1.0},
    ("rosamerica", "pop"): {"pop": 1.0},
    ("rosamerica", "rhy"): {"black_music": 1.0},
    ("rosamerica", "roc"): {"rock": 1.0},
    ("tzanetakis", "blu"): {"black_music": 1.0},
    ("tzanetakis", "cla"): {"classical": 1.0},
    ("tzanetakis", "cou"): {"world": 1.0},
    ("tzanetakis", "dis"): {"black_music": 1.0},
    ("tzanetakis", "hip"): {"black_music": 1.0},
    ("tzanetakis", "jaz"): {"jazz": 1.0},
    ("tzanetakis", "met"): {"rock": 1.0},
    ("tzanetakis", "pop"): {"pop": 1.0},
    ("tzanetakis", "reg"): {"black_music": 1.0},
    ("tzanetakis", "roc"): {"rock": 1.0},
    ("fma_small", "Electronic"): {"electronic": 1.0},
    ("fma_small", "Experimental"): {"ambient": 1.0},
    ("fma_small", "Folk"): {"world": 1.0},
    ("fma_small", "Hip-Hop"): {"black_music": 1.0},
    ("fma_small", "International"): {"world": 1.0},
    ("fma_small", "Pop"): {"pop": 1.0},
    ("fma_small", "Rock"): {"rock": 1.0},
}
SPECIALIST_FINE_MAP = {
    ("dortmund", "alternative"): {"ロック": 1.0},
    ("dortmund", "blues"): {"ブルース": 1.0},
    ("dortmund", "funksoulrnb"): {"ファンク": .5, "ソウルミュージック": .5},
    ("dortmund", "jazz"): {"ジャズ": 1.0},
    ("dortmund", "pop"): {"J-POP": .5, "シティ・ポップ": .3, "アニメソング": .2},
    ("dortmund", "raphiphop"): {"ヒップホップ": .75, "トラップ": .25},
    ("dortmund", "rock"): {"ロック": .7, "パンク": .15, "メタル": .15},
    ("rosamerica", "cla"): {"クラシック音楽": .85, "オペラ": .15},
    ("rosamerica", "hip"): {"ヒップホップ": .75, "トラップ": .25},
    ("rosamerica", "jaz"): {"ジャズ": 1.0},
    ("rosamerica", "pop"): {"J-POP": .5, "シティ・ポップ": .3, "アニメソング": .2},
    ("rosamerica", "rhy"): {"ファンク": .4, "ソウルミュージック": .4, "ディスコ": .2},
    ("rosamerica", "roc"): {"ロック": .7, "パンク": .15, "メタル": .15},
    ("electronic", "ambient"): {"アンビエント": .75, "ドローン": .2, "ノイズミュージック": .05},
    ("electronic", "dnb"): {"ドラムンベース": 1.0},
    ("electronic", "house"): {"ハウス": .7, "ディープ・ハウス": .3},
    ("electronic", "techno"): {"テクノ": 1.0},
    ("electronic", "trance"): {"トランス": 1.0},
    ("tzanetakis", "blu"): {"ブルース": 1.0},
    ("tzanetakis", "cla"): {"クラシック音楽": .85, "オペラ": .15},
    ("tzanetakis", "cou"): {"フォーク": 1.0},
    ("tzanetakis", "dis"): {"ディスコ": 1.0},
    ("tzanetakis", "hip"): {"ヒップホップ": .75, "トラップ": .25},
    ("tzanetakis", "jaz"): {"ジャズ": 1.0},
    ("tzanetakis", "met"): {"メタル": .8, "ハードコア": .2},
    ("tzanetakis", "pop"): {"J-POP": .5, "シティ・ポップ": .3, "アニメソング": .2},
    ("tzanetakis", "reg"): {"レゲエ": .8, "ダブ": .2},
    ("tzanetakis", "roc"): {"ロック": .75, "パンク": .25},
    ("fma_small", "Electronic"): {"テクノ": .2, "ハウス": .2, "トランス": .15, "ドラムンベース": .15, "ダブステップ": .15, "アンビエント": .15},
    ("fma_small", "Experimental"): {"アンビエント": .45, "ドローン": .3, "ノイズミュージック": .25},
    ("fma_small", "Folk"): {"フォーク": 1.0},
    ("fma_small", "Hip-Hop"): {"ヒップホップ": .75, "トラップ": .25},
    ("fma_small", "International"): {"ワールドミュージック": .6, "ラテン": .4},
    ("fma_small", "Pop"): {"J-POP": .5, "シティ・ポップ": .3, "アニメソング": .2},
    ("fma_small", "Rock"): {"ロック": .6, "パンク": .15, "ハードコア": .1, "メタル": .15},
}


def load_json(path, fallback=None):
    if not path.exists():
        return {} if fallback is None else fallback
    return json.loads(path.read_text())


def source_key(row):
    source_type = row.get("sourceType") or ("itunes-preview" if row.get("previewUrl") else "youtube")
    value = row.get("sourceUrl") or row.get("filePath") or row.get("previewUrl") or row.get("youtubeUrl") or row.get("url") or ""
    return f"{source_type}:{value}" if value else ""


def safe_array(values):
    arr = np.asarray(values, dtype=np.float32)
    arr[~np.isfinite(arr)] = 0
    return arr


def target_for(row):
    if row.get("styleHint") == "city_pop":
        return "シティ・ポップ"
    return GENRE_ALIASES.get(row.get("genre"), row.get("genre"))


def load_rows():
    caches = {
        "discogs": load_json(DISCOGS_CACHE),
        "mtg": load_json(MTG_CACHE),
        "librosa": load_json(LIBROSA_CACHE),
        "musicnn": load_json(MUSICNN_CACHE),
        "specialist": load_json(SPECIALIST_CACHE),
        "maest": load_json(MAEST_CACHE),
        "maest30": load_json(MAEST_30S_CACHE),
    }
    maest_representations = load_json(MAEST_REPRESENTATION_CACHE)
    representation_names = (
        "maest_embedding", "maest_joint", "maest_prediction_moments",
        "maest_embedding_moments", "maest_cls_dist", "maest_cls_dist_moments",
        "maest_rich_joint",
    )
    rows = []
    missing = {name: 0 for name in caches} | {name: 0 for name in representation_names}
    for row in load_json(SPLITS_PATH, {"items": []}).get("items", []):
        key = source_key(row)
        vectors = {}
        for name, cache in caches.items():
            value = cache.get(key)
            if isinstance(value, list):
                vectors[name] = safe_array(value)
            else:
                missing[name] += 1
        representation = maest_representations.get(key)
        prediction = representation.get("prediction") if isinstance(representation, dict) else None
        embedding = representation.get("embedding") if isinstance(representation, dict) else None
        prediction_moments = representation.get("predictionMoments") if isinstance(representation, dict) else None
        embedding_moments = representation.get("embeddingMoments") if isinstance(representation, dict) else None
        cls_dist = representation.get("clsDist") if isinstance(representation, dict) else None
        cls_dist_moments = representation.get("clsDistMoments") if isinstance(representation, dict) else None
        if isinstance(embedding, list) and len(embedding) == MAEST_EMBEDDING_SIZE:
            vectors["maest_embedding"] = safe_array(embedding)
        else:
            missing["maest_embedding"] += 1
        if (
            isinstance(prediction, list) and len(prediction) == 400
            and isinstance(embedding, list) and len(embedding) == MAEST_EMBEDDING_SIZE
        ):
            vectors["maest_joint"] = np.concatenate([safe_array(prediction), safe_array(embedding)])
        else:
            missing["maest_joint"] += 1
        rich_values = {
            "maest_prediction_moments": (prediction_moments, MAEST_PREDICTION_MOMENTS_SIZE),
            "maest_embedding_moments": (embedding_moments, MAEST_EMBEDDING_MOMENTS_SIZE),
            "maest_cls_dist": (cls_dist, MAEST_CLS_DIST_SIZE),
            "maest_cls_dist_moments": (cls_dist_moments, MAEST_CLS_DIST_MOMENTS_SIZE),
        }
        for name, (value, size) in rich_values.items():
            if isinstance(value, list) and len(value) == size:
                vectors[name] = safe_array(value)
            else:
                missing[name] += 1
        if (
            isinstance(prediction_moments, list) and len(prediction_moments) == MAEST_PREDICTION_MOMENTS_SIZE
            and isinstance(embedding_moments, list) and len(embedding_moments) == MAEST_EMBEDDING_MOMENTS_SIZE
        ):
            vectors["maest_rich_joint"] = np.concatenate([
                safe_array(prediction_moments), safe_array(embedding_moments),
            ])
        else:
            missing["maest_rich_joint"] += 1
        if "specialist" in vectors:
            vectors["specialist"] = np.concatenate([vectors["specialist"], np.asarray([0.0], dtype=np.float32)])
        else:
            vectors["specialist"] = np.concatenate([
                np.zeros(SPECIALIST_VECTOR_SIZE, dtype=np.float32),
                np.asarray([1.0], dtype=np.float32),
            ])
        if "maest" in vectors and vectors["maest"].size == MAEST_VECTOR_SIZE:
            vectors["maest"] = np.concatenate([vectors["maest"], np.asarray([0.0], dtype=np.float32)])
        else:
            vectors["maest"] = np.concatenate([
                np.zeros(MAEST_VECTOR_SIZE, dtype=np.float32),
                np.asarray([1.0], dtype=np.float32),
            ])
        if "maest30" in vectors and vectors["maest30"].size == MAEST_VECTOR_SIZE:
            vectors["maest30"] = np.concatenate([vectors["maest30"], np.asarray([0.0], dtype=np.float32)])
        else:
            vectors["maest30"] = np.concatenate([
                np.zeros(MAEST_VECTOR_SIZE, dtype=np.float32), np.asarray([1.0], dtype=np.float32),
            ])
        for name, size in (("maest_embedding", MAEST_EMBEDDING_SIZE), ("maest_joint", MAEST_JOINT_SIZE)):
            if name in vectors and vectors[name].size == size:
                vectors[name] = np.concatenate([vectors[name], np.asarray([0.0], dtype=np.float32)])
            else:
                vectors[name] = np.concatenate([
                    np.zeros(size, dtype=np.float32),
                    np.asarray([1.0], dtype=np.float32),
                ])
        for name, size in (
            ("maest_prediction_moments", MAEST_PREDICTION_MOMENTS_SIZE),
            ("maest_embedding_moments", MAEST_EMBEDDING_MOMENTS_SIZE),
            ("maest_cls_dist", MAEST_CLS_DIST_SIZE),
            ("maest_cls_dist_moments", MAEST_CLS_DIST_MOMENTS_SIZE),
            ("maest_rich_joint", MAEST_RICH_JOINT_SIZE),
        ):
            if name in vectors and vectors[name].size == size:
                vectors[name] = np.concatenate([vectors[name], np.asarray([0.0], dtype=np.float32)])
            else:
                vectors[name] = np.concatenate([
                    np.zeros(size, dtype=np.float32), np.asarray([1.0], dtype=np.float32),
                ])
        target = target_for(row)
        if "discogs" not in vectors or target not in TARGET_GENRES:
            continue
        rows.append({**row, "targetGenre": target, "vectors": vectors})
    return rows, missing


def select(rows, split, fine=False, exact_targets=False):
    selected = [row for row in rows if row.get("split") == split]
    if fine:
        selected = [
            row for row in selected
            if row["targetGenre"] in FINE_LABELS and row.get("trainingRole") != "macro-only"
        ]
    elif exact_targets:
        selected = [
            row for row in selected
            if row["targetGenre"] in PARENT_LABELS or row.get("trainingRole") != "macro-only"
        ]
    return selected


def matrix(rows, feature_set):
    return np.asarray([
        np.concatenate([row["vectors"][name] for name in feature_set])
        for row in rows
    ], dtype=np.float32)


def label_values(rows, target):
    return np.asarray([row[target] for row in rows], dtype=object)


def aligned_scores(model, x, labels):
    raw = model.predict_proba(x)
    source_labels = list(model[-1].classes_) if hasattr(model, "steps") else list(model.classes_)
    source_index = {label: index for index, label in enumerate(source_labels)}
    return np.asarray([
        [row[source_index[label]] if label in source_index else 0.0 for label in labels]
        for row in raw
    ], dtype=np.float64)


def normalize(scores):
    return scores / np.maximum(1e-12, scores.sum(axis=1, keepdims=True))


def pattern_matches(value, pattern):
    return fnmatchcase(value, pattern)


def pretrained_tag_scores(rows, labels, patterns_by_label, classes, vector_name):
    indexes = {
        label: [
            index for index, class_name in enumerate(classes)
            if any(pattern_matches(class_name, pattern) for pattern in patterns_by_label.get(label, []))
        ]
        for label in labels
    }
    section = len(classes)
    scores = np.zeros((len(rows), len(labels)), dtype=np.float64)
    for row_index, row in enumerate(rows):
        vector = row["vectors"][vector_name]
        if vector.size < section * 3:
            continue
        mean = vector[:section]
        spread = vector[section:section * 2]
        peak = vector[section * 2:section * 3]
        combined = mean * 0.4 + spread * 0.05 + peak * 0.55
        for label_index, label in enumerate(labels):
            selected = indexes[label]
            if selected:
                values = combined[selected]
                scores[row_index, label_index] = float(np.max(values) + np.mean(values) * 0.15)
    return normalize(scores + 1e-9)


def discogs_tag_scores(rows, labels, patterns_by_label, classes):
    return pretrained_tag_scores(rows, labels, patterns_by_label, classes, "discogs")


def mtg_tag_scores(rows, labels, patterns_by_label, classes):
    return pretrained_tag_scores(rows, labels, patterns_by_label, classes, "mtg")


def specialist_tag_scores(rows, labels, target_map):
    label_index = {label: index for index, label in enumerate(labels)}
    scores = np.zeros((len(rows), len(labels)), dtype=np.float64)
    for row_index, row in enumerate(rows):
        vector = row["vectors"].get("specialist")
        if vector is None:
            continue
        for head_name, layout in SPECIALIST_HEAD_LAYOUT.items():
            classes = layout["classes"]
            offset = layout["offset"]
            section = len(classes)
            mean = vector[offset:offset + section]
            spread = vector[offset + section:offset + section * 2]
            peak = vector[offset + section * 2:offset + section * 3]
            combined = mean * .6 + spread * .05 + peak * .35
            for class_index, class_name in enumerate(classes):
                value = float(combined[class_index])
                for label, weight in target_map.get((head_name, class_name), {}).items():
                    if label in label_index:
                        scores[row_index, label_index[label]] += value * weight
    return normalize(scores + 1e-9)


def blend_scores(model_scores, tag_scores, weight):
    return normalize(model_scores * (1.0 - weight) + tag_scores * weight)


def redistribute_with_family_scores(global_scores, family_scores, weight):
    if weight == 0 or not family_scores:
        return normalize(global_scores)
    out = np.asarray(global_scores, dtype=np.float64).copy()
    label_index = {label: index for index, label in enumerate(FINE_LABELS)}
    for family_name, scores in family_scores.items():
        family_labels = FINE_FAMILIES[family_name]
        indexes = [label_index[label] for label in family_labels]
        family_mass = np.sum(global_scores[:, indexes], axis=1, keepdims=True)
        redistributed = normalize(scores) * family_mass
        out[:, indexes] = global_scores[:, indexes] * (1.0 - weight) + redistributed * weight
    return normalize(out)


def calibrated_scores(scores, scales):
    return normalize(scores * np.asarray(scales, dtype=np.float64).reshape(1, -1))


def coordinate_calibration(scores, actual, labels, minimum_examples=3):
    actual = np.asarray(actual, dtype=object)
    label_index = {label: index for index, label in enumerate(labels)}
    eligible = {
        label for label in labels
        if int(np.sum(actual == label)) >= minimum_examples
    }
    scales = np.ones(len(labels), dtype=np.float64)
    options = (0.25, 0.4, 0.65, 1.0, 1.5, 2.25, 3.5, 5.0)

    def metric(candidate):
        pred = np.asarray(labels, dtype=object)[np.argmax(calibrated_scores(scores, candidate), axis=1)]
        balanced = float(balanced_accuracy_score(actual, pred))
        micro = float(np.mean(actual == pred))
        return balanced, micro

    best_metric = metric(scales)
    for _ in range(4):
        changed = False
        for label in labels:
            if label not in eligible:
                continue
            index = label_index[label]
            local_best = (best_metric, scales[index])
            for option in options:
                candidate = scales.copy()
                candidate[index] = option
                candidate_metric = metric(candidate)
                ranking = (candidate_metric[0], candidate_metric[1], -abs(np.log(option)))
                best_ranking = (local_best[0][0], local_best[0][1], -abs(np.log(local_best[1])))
                if ranking > best_ranking:
                    local_best = (candidate_metric, option)
            if local_best[1] != scales[index]:
                scales[index] = local_best[1]
                best_metric = local_best[0]
                changed = True
        if not changed:
            break
    return {
        "scales": scales,
        "byLabel": {label: float(scales[index]) for index, label in enumerate(labels)},
        "validationBalancedAccuracy": round(best_metric[0] * 100, 1),
        "validationAccuracy": round(best_metric[1] * 100, 1),
        "minimumExamples": minimum_examples,
    }


class EncodedXGBClassifier(ClassifierMixin, BaseEstimator):
    def __init__(self, seed):
        self.seed = seed
        self.classes_ = None
        self.model_ = None

    def fit(self, x, y):
        if XGBClassifier is None:
            raise RuntimeError("xgboost is not available")
        self.classes_ = np.asarray(sorted(set(y)), dtype=object)
        label_index = {label: index for index, label in enumerate(self.classes_)}
        encoded = np.asarray([label_index[label] for label in y], dtype=np.int32)
        counts = np.bincount(encoded, minlength=len(self.classes_)).astype(np.float64)
        sample_weight = np.asarray([len(encoded) / max(1.0, len(self.classes_) * counts[value]) for value in encoded])
        self.model_ = XGBClassifier(
            n_estimators=180,
            max_depth=4,
            learning_rate=0.055,
            min_child_weight=2.0,
            subsample=0.88,
            colsample_bytree=0.72,
            reg_alpha=0.08,
            reg_lambda=3.0,
            objective="multi:softprob",
            eval_metric="mlogloss",
            tree_method="hist",
            n_jobs=8,
            random_state=self.seed,
        )
        self.model_.fit(x, encoded, sample_weight=sample_weight)
        return self

    def predict_proba(self, x):
        return self.model_.predict_proba(x)


class ProbabilityBlend:
    def __init__(self, left, right, right_weight):
        self.left = left
        self.right = right
        self.right_weight = right_weight
        self.classes_ = left[-1].classes_ if hasattr(left, "steps") else left.classes_

    def predict_proba(self, x):
        return normalize(
            self.left.predict_proba(x) * (1.0 - self.right_weight)
            + self.right.predict_proba(x) * self.right_weight
        )


def add_hybrid_score_sets(store):
    if not HYBRID_SEARCH or "xgboost-pca192" not in store:
        return
    for base in ("extra-trees-pca192", "random-forest-pca192"):
        if base not in store:
            continue
        for weight in (0.25, 0.5, 0.75):
            store[f"blend:{base}:xgboost-pca192:{weight}"] = {
                part: normalize(store[base][part] * (1.0 - weight) + store["xgboost-pca192"][part] * weight)
                for part in ("validation", "test")
            }


def fit_candidate(kind, x, y, seed):
    pca_components = max(1, min(192, x.shape[0] - 1, x.shape[1]))
    if kind.startswith("blend:"):
        _, left_kind, right_kind, weight = kind.split(":")
        return ProbabilityBlend(
            fit_candidate(left_kind, x, y, seed),
            fit_candidate(right_kind, x, y, seed),
            float(weight),
        )
    if kind == "extra-trees-raw":
        model = ExtraTreesClassifier(
            n_estimators=520, max_features="sqrt", min_samples_leaf=1,
            class_weight="balanced", n_jobs=-1, random_state=seed,
        )
    elif kind == "random-forest-raw":
        model = RandomForestClassifier(
            n_estimators=420, max_features="sqrt", min_samples_leaf=1,
            class_weight="balanced_subsample", n_jobs=-1, random_state=seed,
        )
    elif kind == "logistic-l2":
        model = make_pipeline(
            StandardScaler(),
            LogisticRegression(
                C=0.1, max_iter=2000, class_weight="balanced",
                solver="lbfgs", random_state=seed,
            ),
        )
    elif kind == "logistic-pca192":
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=pca_components, random_state=seed, svd_solver="randomized"),
            LogisticRegression(
                C=0.1, max_iter=2000, class_weight="balanced",
                solver="lbfgs", random_state=seed,
            ),
        )
    elif kind == "lda-pca192":
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=pca_components, random_state=seed, svd_solver="randomized"),
            LinearDiscriminantAnalysis(solver="lsqr", shrinkage="auto"),
        )
    elif kind == "svc-linear-pca192":
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=pca_components, random_state=seed, svd_solver="randomized"),
            SVC(
                C=0.25, kernel="linear", class_weight="balanced",
                probability=True, cache_size=1024, random_state=seed,
            ),
        )
    elif kind == "svc-rbf-pca192":
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=pca_components, random_state=seed, svd_solver="randomized"),
            SVC(
                C=4.0, kernel="rbf", gamma="scale", class_weight="balanced",
                probability=True, cache_size=1024, random_state=seed,
            ),
        )
    elif kind == "extra-trees-pca192":
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=pca_components, random_state=seed, svd_solver="randomized"),
            ExtraTreesClassifier(
                n_estimators=520, max_features="sqrt", min_samples_leaf=1,
                class_weight="balanced", n_jobs=-1, random_state=seed,
            ),
        )
    elif kind == "random-forest-pca192":
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=pca_components, random_state=seed, svd_solver="randomized"),
            RandomForestClassifier(
                n_estimators=420, max_features="sqrt", min_samples_leaf=1,
                class_weight="balanced_subsample", n_jobs=-1, random_state=seed,
            ),
        )
    elif kind == "xgboost-pca192":
        model = make_pipeline(
            StandardScaler(),
            PCA(n_components=pca_components, random_state=seed, svd_solver="randomized"),
            EncodedXGBClassifier(seed),
        )
    else:
        raise ValueError(f"Unknown model kind: {kind}")
    model.fit(x, y)
    return model


def apply_macro_prior(fine_scores, macro_scores, macro_labels, alpha):
    if alpha == 0:
        return normalize(fine_scores)
    macro_index = {label: index for index, label in enumerate(macro_labels)}
    prior = np.asarray([
        [0.08 + row[macro_index[GENRE_MACRO[label]]] for label in FINE_LABELS]
        for row in macro_scores
    ], dtype=np.float64)
    return normalize(fine_scores * np.power(prior, alpha))


def score_rows(rows, macro_scores, fine_scores, macro_labels, include_breakdowns=False):
    macro_order = np.argsort(-macro_scores, axis=1)
    fine_order = np.argsort(-fine_scores, axis=1)
    total_correct = 0
    top3_correct = 0
    by_genre = {label: {"total": 0, "top1": 0, "top3": 0, "artists": set(), "predictions": {}} for label in TARGET_GENRES}
    by_dataset = {}
    by_dataset_genre = {}
    fine_cursor = 0
    for index, row in enumerate(rows):
        target = row["targetGenre"]
        macro_ranked = [macro_labels[item] for item in macro_order[index]]
        if target in PARENT_LABELS:
            predicted = macro_ranked[0]
            top1 = predicted == PARENT_LABELS[target]
            top3 = PARENT_LABELS[target] in macro_ranked[:3]
        else:
            ranked = [FINE_LABELS[item] for item in fine_order[fine_cursor]]
            predicted = ranked[0]
            top1 = predicted == target
            top3 = target in ranked[:3]
            fine_cursor += 1
        total_correct += top1
        top3_correct += top3
        bucket = by_genre[target]
        bucket["total"] += 1
        bucket["top1"] += top1
        bucket["top3"] += top3
        artist = row.get("canonicalArtist") or row.get("artist") or row.get("artistName") or "(unknown)"
        bucket["artists"].add(str(artist).strip().lower())
        bucket["predictions"][predicted] = bucket["predictions"].get(predicted, 0) + 1
        if include_breakdowns:
            dataset = row.get("datasetName") or row.get("sourceType") or "(unknown)"
            source_bucket = by_dataset.setdefault(dataset, {"total": 0, "top1": 0, "top3": 0})
            source_bucket["total"] += 1
            source_bucket["top1"] += top1
            source_bucket["top3"] += top3
            source_genre_bucket = by_dataset_genre.setdefault(dataset, {}).setdefault(target, {"total": 0, "top1": 0, "top3": 0})
            source_genre_bucket["total"] += 1
            source_genre_bucket["top1"] += top1
            source_genre_bucket["top3"] += top3

    ready = [value for value in by_genre.values() if value["total"] > 0]
    report_by_genre = {}
    for label, value in by_genre.items():
        report_by_genre[label] = {
            "total": value["total"],
            "artistCount": len(value["artists"]),
            "top1Accuracy": round(value["top1"] / value["total"] * 100, 1) if value["total"] else None,
            "top3Accuracy": round(value["top3"] / value["total"] * 100, 1) if value["total"] else None,
            "predictions": [
                {"label": predicted, "count": count}
                for predicted, count in sorted(value["predictions"].items(), key=lambda item: (-item[1], item[0]))[:5]
            ],
        }
    report = {
        "total": len(rows),
        "coveredGenres": len(ready),
        "readyGenres10Plus": sum(value["total"] >= 10 for value in ready),
        "readyGenresRobust": sum(value["total"] >= 10 and len(value["artists"]) >= 5 for value in ready),
        "top1Accuracy": round(total_correct / max(1, len(rows)) * 100, 1),
        "top3Accuracy": round(top3_correct / max(1, len(rows)) * 100, 1),
        "genreBalancedTop1": round(np.mean([value["top1"] / value["total"] for value in ready]) * 100, 1),
        "byGenre": report_by_genre,
    }
    if include_breakdowns:
        summarize_bucket = lambda value: {
            "total": value["total"],
            "top1Accuracy": round(value["top1"] / max(1, value["total"]) * 100, 1),
            "top3Accuracy": round(value["top3"] / max(1, value["total"]) * 100, 1),
        }
        report["byDataset"] = {
            name: summarize_bucket(value)
            for name, value in sorted(by_dataset.items())
        }
        report["byDatasetGenre"] = {
            name: {
                label: summarize_bucket(value)
                for label, value in sorted(genres.items())
            }
            for name, genres in sorted(by_dataset_genre.items())
        }
    return report


def validation_selection_score(metric):
    return round(
        float(metric["genreBalancedTop1"]) * .5
        + float(metric["top1Accuracy"]) * .3
        + float(metric["top3Accuracy"]) * .2,
        4,
    )


def score_rows_summary(rows, macro_scores, fine_scores, macro_labels):
    macro_order = np.argsort(-macro_scores, axis=1)
    fine_order = np.argsort(-fine_scores, axis=1)
    total_correct = 0
    top3_correct = 0
    by_genre = {}
    fine_cursor = 0
    for index, row in enumerate(rows):
        target = row["targetGenre"]
        if target in PARENT_LABELS:
            ranked = [macro_labels[item] for item in macro_order[index, :3]]
            expected = PARENT_LABELS[target]
        else:
            ranked = [FINE_LABELS[item] for item in fine_order[fine_cursor, :3]]
            expected = target
            fine_cursor += 1
        top1 = ranked[0] == expected
        top3 = expected in ranked
        total_correct += top1
        top3_correct += top3
        bucket = by_genre.setdefault(target, {"total": 0, "top1": 0, "artists": set()})
        bucket["total"] += 1
        bucket["top1"] += top1
        artist = row.get("canonicalArtist") or row.get("artist") or row.get("artistName") or "(unknown)"
        bucket["artists"].add(str(artist).strip().lower())
    values = list(by_genre.values())
    return {
        "total": len(rows),
        "coveredGenres": len(values),
        "readyGenres10Plus": sum(value["total"] >= 10 for value in values),
        "readyGenresRobust": sum(value["total"] >= 10 and len(value["artists"]) >= 5 for value in values),
        "top1Accuracy": round(total_correct / max(1, len(rows)) * 100, 1),
        "top3Accuracy": round(top3_correct / max(1, len(rows)) * 100, 1),
        "genreBalancedTop1": round(np.mean([value["top1"] / value["total"] for value in values]) * 100, 1),
    }


def main():
    previous_best = load_json(REPORT_PATH, {}).get("best", {}) if REPLAY_BEST else {}
    rows, missing = load_rows()
    discogs_classes = load_json(DISCOGS_META_PATH, {"classes": []}).get("classes", [])
    mtg_classes = load_json(MTG_META_PATH, {"classes": []}).get("classes", [])
    if not discogs_classes:
        raise RuntimeError(f"Missing Discogs class metadata: {DISCOGS_META_PATH}")
    if not mtg_classes:
        raise RuntimeError(f"Missing MTG-Jamendo class metadata: {MTG_META_PATH}")
    macro_labels = sorted({row["macroGenre"] for row in rows})
    macro_train = select(rows, "train")
    validation = select(rows, "validation", exact_targets=True)
    test = select(rows, "test", exact_targets=True)
    fine_train = select(rows, "train", fine=True)
    fine_validation = select(rows, "validation", fine=True)
    fine_test = select(rows, "test", fine=True)
    discogs_macro_tag_scores = {
        "validation": discogs_tag_scores(validation, macro_labels, MACRO_TAG_PATTERNS, discogs_classes),
        "test": discogs_tag_scores(test, macro_labels, MACRO_TAG_PATTERNS, discogs_classes),
    }
    mtg_macro_tag_scores = {
        "validation": mtg_tag_scores(validation, macro_labels, MTG_MACRO_TAG_PATTERNS, mtg_classes),
        "test": mtg_tag_scores(test, macro_labels, MTG_MACRO_TAG_PATTERNS, mtg_classes),
    }
    specialist_macro_tag_scores = {
        "validation": specialist_tag_scores(validation, macro_labels, SPECIALIST_MACRO_MAP),
        "test": specialist_tag_scores(test, macro_labels, SPECIALIST_MACRO_MAP),
    }
    macro_tag_sources = {
        "discogs": discogs_macro_tag_scores,
        "discogs_mtg_average": {
            part: normalize(discogs_macro_tag_scores[part] + mtg_macro_tag_scores[part])
            for part in ("validation", "test")
        },
    }
    if ENABLE_SPECIALIST_TAG_PRIORS:
        macro_tag_sources["specialist"] = specialist_macro_tag_scores
        macro_tag_sources["discogs_mtg_specialist_average"] = {
            part: normalize(discogs_macro_tag_scores[part] + mtg_macro_tag_scores[part] + specialist_macro_tag_scores[part])
            for part in ("validation", "test")
        }
    discogs_fine_tag_scores = {
        "validation": discogs_tag_scores(fine_validation, FINE_LABELS, FINE_TAG_PATTERNS, discogs_classes),
        "test": discogs_tag_scores(fine_test, FINE_LABELS, FINE_TAG_PATTERNS, discogs_classes),
    }
    mtg_fine_tag_scores = {
        "validation": mtg_tag_scores(fine_validation, FINE_LABELS, MTG_FINE_TAG_PATTERNS, mtg_classes),
        "test": mtg_tag_scores(fine_test, FINE_LABELS, MTG_FINE_TAG_PATTERNS, mtg_classes),
    }
    specialist_fine_tag_scores = {
        "validation": specialist_tag_scores(fine_validation, FINE_LABELS, SPECIALIST_FINE_MAP),
        "test": specialist_tag_scores(fine_test, FINE_LABELS, SPECIALIST_FINE_MAP),
    }
    fine_tag_sources = {
        "discogs": discogs_fine_tag_scores,
        "discogs_mtg_average": {
            part: normalize(discogs_fine_tag_scores[part] + mtg_fine_tag_scores[part])
            for part in ("validation", "test")
        },
    }
    if ENABLE_SPECIALIST_TAG_PRIORS:
        fine_tag_sources["specialist"] = specialist_fine_tag_scores
        fine_tag_sources["discogs_mtg_specialist_average"] = {
            part: normalize(discogs_fine_tag_scores[part] + mtg_fine_tag_scores[part] + specialist_fine_tag_scores[part])
            for part in ("validation", "test")
        }

    candidates = []
    feature_sets = [
        ("discogs", ["discogs"]),
        ("all", ["discogs", "mtg", "librosa"]),
        ("musicnn", ["musicnn"]),
        ("discogs_musicnn", ["discogs", "musicnn"]),
        ("all_musicnn", ["discogs", "mtg", "librosa", "musicnn"]),
        ("specialist", ["specialist"]),
        ("discogs_specialist", ["discogs", "specialist"]),
        ("all_specialist", ["discogs", "mtg", "librosa", "musicnn", "specialist"]),
        ("maest", ["maest"]),
        ("discogs_maest", ["discogs", "maest"]),
        ("discogs_specialist_maest", ["discogs", "specialist", "maest"]),
        ("maest30", ["maest30"]),
        ("discogs_maest30", ["discogs", "maest30"]),
        ("maest_embedding", ["maest_embedding"]),
        ("maest_joint", ["maest_joint"]),
        ("discogs_maest_embedding", ["discogs", "maest_embedding"]),
        ("discogs_maest_joint", ["discogs", "maest_joint"]),
        ("discogs_specialist_maest_embedding", ["discogs", "specialist", "maest_embedding"]),
        ("discogs_specialist_maest_joint", ["discogs", "specialist", "maest_joint"]),
        ("maest_prediction_moments", ["maest_prediction_moments"]),
        ("maest_embedding_moments", ["maest_embedding_moments"]),
        ("maest_cls_dist", ["maest_cls_dist"]),
        ("maest_cls_dist_moments", ["maest_cls_dist_moments"]),
        ("maest_rich_joint", ["maest_rich_joint"]),
        ("discogs_maest_rich_joint", ["discogs", "maest_rich_joint"]),
    ]
    feature_sets = [
        (name, values) for name, values in feature_sets
        if all(all(feature in row["vectors"] for feature in values) for row in macro_train + validation + test)
    ]
    if previous_best.get("featureSet"):
        feature_sets = [item for item in feature_sets if item[0] == previous_best["featureSet"]]
    if FEATURE_SET_FILTER:
        feature_sets = [item for item in feature_sets if item[0] in FEATURE_SET_FILTER]
        if not feature_sets:
            raise RuntimeError(f"No complete requested feature set: {sorted(FEATURE_SET_FILTER)}; missing={missing}")
    all_model_kinds = [
        "extra-trees-raw", "random-forest-raw",
        "extra-trees-pca192", "random-forest-pca192", "lda-pca192",
        "svc-linear-pca192", "svc-rbf-pca192",
    ]
    if XGBOOST_SEARCH:
        if XGBClassifier is None:
            raise RuntimeError("MMFR_EMBEDDING_XGBOOST_SEARCH=1 but xgboost is unavailable")
        feature_sets = [item for item in feature_sets if item[0] in {"discogs", "all", "musicnn", "discogs_musicnn", "specialist", "discogs_specialist", "all_specialist", "maest", "discogs_maest", "discogs_specialist_maest", "maest_embedding", "maest_joint", "discogs_maest_embedding", "discogs_maest_joint", "discogs_specialist_maest_embedding", "discogs_specialist_maest_joint"}]
        macro_model_kinds = ["xgboost-pca192"]
        fine_model_kinds = ["xgboost-pca192"]
    elif HYBRID_SEARCH:
        if XGBClassifier is None:
            raise RuntimeError("MMFR_EMBEDDING_HYBRID_SEARCH=1 but xgboost is unavailable")
        feature_sets = [item for item in feature_sets if item[0] in ({"discogs"} if not FEATURE_SET_FILTER else FEATURE_SET_FILTER)]
        macro_model_kinds = ["extra-trees-pca192", "random-forest-pca192", "xgboost-pca192"]
        fine_model_kinds = ["extra-trees-pca192", "random-forest-pca192", "xgboost-pca192"]
    else:
        macro_model_kinds = [previous_best["macroModel"]] if previous_best.get("macroModel") else all_model_kinds
        fine_model_kinds = [previous_best["fineModel"]] if previous_best.get("fineModel") else all_model_kinds
    if MACRO_MODEL_FILTER:
        macro_model_kinds = [kind for kind in macro_model_kinds if kind in MACRO_MODEL_FILTER]
    if FINE_MODEL_FILTER:
        fine_model_kinds = [kind for kind in fine_model_kinds if kind in FINE_MODEL_FILTER]
    if not macro_model_kinds or not fine_model_kinds:
        raise RuntimeError(
            f"No requested model kinds; macro={sorted(MACRO_MODEL_FILTER)} fine={sorted(FINE_MODEL_FILTER)}"
        )
    for feature_name, feature_set in feature_sets:
        macro_x = {part: matrix(data, feature_set) for part, data in (("train", macro_train), ("validation", validation), ("test", test))}
        fine_x = {part: matrix(data, feature_set) for part, data in (("train", fine_train), ("validation", fine_validation), ("test", fine_test))}
        trained_macro = {}
        trained_fine = {}
        trained_families = {}
        for macro_kind in macro_model_kinds:
            print(f"macro {feature_name} {macro_kind}", flush=True)
            macro_model = fit_candidate(macro_kind, macro_x["train"], label_values(macro_train, "macroGenre"), 17200)
            trained_macro[macro_kind] = {
                "validation": aligned_scores(macro_model, macro_x["validation"], macro_labels),
                "test": aligned_scores(macro_model, macro_x["test"], macro_labels),
            }
        for fine_kind in fine_model_kinds:
            print(f"fine {feature_name} {fine_kind}", flush=True)
            fine_model = fit_candidate(fine_kind, fine_x["train"], label_values(fine_train, "targetGenre"), 17300)
            trained_fine[fine_kind] = {
                "validation": aligned_scores(fine_model, fine_x["validation"], FINE_LABELS),
                "test": aligned_scores(fine_model, fine_x["test"], FINE_LABELS),
            }
        add_hybrid_score_sets(trained_macro)
        add_hybrid_score_sets(trained_fine)
        for family_index, (family_name, family_labels) in enumerate(FINE_FAMILIES.items()):
            family_train_indexes = [index for index, row in enumerate(fine_train) if row["targetGenre"] in family_labels]
            family_train_labels = label_values([fine_train[index] for index in family_train_indexes], "targetGenre")
            if len(set(family_train_labels)) < 2:
                continue
            specialist = fit_candidate(
                "extra-trees-raw",
                fine_x["train"][family_train_indexes],
                family_train_labels,
                17400 + family_index,
            )
            trained_families[family_name] = {
                "validation": aligned_scores(specialist, fine_x["validation"], family_labels),
                "test": aligned_scores(specialist, fine_x["test"], family_labels),
            }
        for macro_kind, macro_score_set in trained_macro.items():
            for fine_kind, fine_score_set in trained_fine.items():
                for macro_tag_source, macro_tag_score_set in macro_tag_sources.items():
                    for macro_tag_weight in (0.0, 0.2, 0.8):
                        macro_validation_scores = blend_scores(macro_score_set["validation"], macro_tag_score_set["validation"], macro_tag_weight)
                        macro_test_scores = blend_scores(macro_score_set["test"], macro_tag_score_set["test"], macro_tag_weight)
                        fine_macro_validation = macro_validation_scores[[i for i, row in enumerate(validation) if row["targetGenre"] not in PARENT_LABELS]]
                        fine_macro_test = macro_test_scores[[i for i, row in enumerate(test) if row["targetGenre"] not in PARENT_LABELS]]
                        for fine_tag_source, fine_tag_score_set in fine_tag_sources.items():
                            for fine_tag_weight in (0.0, 0.15, 0.3):
                                tagged_fine_validation = blend_scores(fine_score_set["validation"], fine_tag_score_set["validation"], fine_tag_weight)
                                tagged_fine_test = blend_scores(fine_score_set["test"], fine_tag_score_set["test"], fine_tag_weight)
                                for family_weight in FAMILY_WEIGHTS:
                                    fine_validation_raw = redistribute_with_family_scores(
                                        tagged_fine_validation,
                                        {name: values["validation"] for name, values in trained_families.items()},
                                        family_weight,
                                    )
                                    fine_test_raw = redistribute_with_family_scores(
                                        tagged_fine_test,
                                        {name: values["test"] for name, values in trained_families.items()},
                                        family_weight,
                                    )
                                    for alpha in (0.0, 0.35, 1.0):
                                        validation_metric = score_rows_summary(
                                            validation,
                                            macro_validation_scores,
                                            apply_macro_prior(fine_validation_raw, fine_macro_validation, macro_labels, alpha),
                                            macro_labels,
                                        )
                                        candidates.append({
                                            "featureSet": feature_name,
                                            "macroModel": macro_kind,
                                            "fineModel": fine_kind,
                                            "macroPriorAlpha": alpha,
                                            "macroTagSource": macro_tag_source,
                                            "macroTagWeight": macro_tag_weight,
                                            "fineTagSource": fine_tag_source,
                                            "fineTagWeight": fine_tag_weight,
                                            "familyWeight": family_weight,
                                            "validation": validation_metric,
                                            "test": score_rows_summary(
                                                test,
                                                macro_test_scores,
                                                apply_macro_prior(fine_test_raw, fine_macro_test, macro_labels, alpha),
                                                macro_labels,
                                            ),
                                        })

    for candidate in candidates:
        candidate["validationSelectionScore"] = validation_selection_score(candidate["validation"])
    candidates.sort(key=lambda item: (
        item["validationSelectionScore"],
        item["validation"]["genreBalancedTop1"],
        item["validation"]["top1Accuracy"],
        item["validation"]["top3Accuracy"],
    ), reverse=True)
    best = candidates[0]
    top_candidates_by_feature_set = []
    seen_feature_sets = set()
    top_candidates_by_model_pair = []
    seen_model_pairs = set()
    for candidate in candidates:
        feature_name = candidate["featureSet"]
        if feature_name not in seen_feature_sets:
            seen_feature_sets.add(feature_name)
            top_candidates_by_feature_set.append(candidate)
        model_pair = (feature_name, candidate["macroModel"], candidate["fineModel"])
        if model_pair not in seen_model_pairs:
            seen_model_pairs.add(model_pair)
            top_candidates_by_model_pair.append(candidate)

    selected_feature_set = dict(feature_sets)[best["featureSet"]]
    selected_macro_tag_scores = macro_tag_sources[best["macroTagSource"]]
    selected_fine_tag_scores = fine_tag_sources[best["fineTagSource"]]
    selected_macro_model = fit_candidate(
        best["macroModel"], matrix(macro_train, selected_feature_set), label_values(macro_train, "macroGenre"), 17200,
    )
    selected_fine_model = fit_candidate(
        best["fineModel"], matrix(fine_train, selected_feature_set), label_values(fine_train, "targetGenre"), 17300,
    )
    selected_macro_validation = blend_scores(
        aligned_scores(selected_macro_model, matrix(validation, selected_feature_set), macro_labels),
        selected_macro_tag_scores["validation"], best["macroTagWeight"],
    )
    selected_macro_test = blend_scores(
        aligned_scores(selected_macro_model, matrix(test, selected_feature_set), macro_labels),
        selected_macro_tag_scores["test"], best["macroTagWeight"],
    )
    macro_calibration = coordinate_calibration(
        selected_macro_validation, label_values(validation, "macroGenre"), macro_labels, minimum_examples=5,
    )
    if APPLY_MACRO_COORDINATE_CALIBRATION:
        selected_macro_validation = calibrated_scores(selected_macro_validation, macro_calibration["scales"])
        selected_macro_test = calibrated_scores(selected_macro_test, macro_calibration["scales"])

    selected_fine_validation = blend_scores(
        aligned_scores(selected_fine_model, matrix(fine_validation, selected_feature_set), FINE_LABELS),
        selected_fine_tag_scores["validation"], best["fineTagWeight"],
    )
    selected_fine_test = blend_scores(
        aligned_scores(selected_fine_model, matrix(fine_test, selected_feature_set), FINE_LABELS),
        selected_fine_tag_scores["test"], best["fineTagWeight"],
    )
    fine_macro_validation = selected_macro_validation[[i for i, row in enumerate(validation) if row["targetGenre"] not in PARENT_LABELS]]
    fine_macro_test = selected_macro_test[[i for i, row in enumerate(test) if row["targetGenre"] not in PARENT_LABELS]]
    selected_family_scores = {}
    selected_fine_x = {
        "train": matrix(fine_train, selected_feature_set),
        "validation": matrix(fine_validation, selected_feature_set),
        "test": matrix(fine_test, selected_feature_set),
    }
    for family_index, (family_name, family_labels) in enumerate(FINE_FAMILIES.items()):
        family_train_indexes = [index for index, row in enumerate(fine_train) if row["targetGenre"] in family_labels]
        family_train_labels = label_values([fine_train[index] for index in family_train_indexes], "targetGenre")
        if len(set(family_train_labels)) < 2:
            continue
        specialist = fit_candidate("extra-trees-raw", selected_fine_x["train"][family_train_indexes], family_train_labels, 17400 + family_index)
        selected_family_scores[family_name] = {
            "validation": aligned_scores(specialist, selected_fine_x["validation"], family_labels),
            "test": aligned_scores(specialist, selected_fine_x["test"], family_labels),
        }
    selected_fine_validation = redistribute_with_family_scores(
        selected_fine_validation,
        {name: values["validation"] for name, values in selected_family_scores.items()},
        best["familyWeight"],
    )
    selected_fine_test = redistribute_with_family_scores(
        selected_fine_test,
        {name: values["test"] for name, values in selected_family_scores.items()},
        best["familyWeight"],
    )
    selected_fine_validation = apply_macro_prior(selected_fine_validation, fine_macro_validation, macro_labels, best["macroPriorAlpha"])
    selected_fine_test = apply_macro_prior(selected_fine_test, fine_macro_test, macro_labels, best["macroPriorAlpha"])
    selected_detailed = {
        "validation": score_rows(validation, selected_macro_validation, selected_fine_validation, macro_labels, include_breakdowns=True),
        "test": score_rows(test, selected_macro_test, selected_fine_test, macro_labels, include_breakdowns=True),
    }
    fine_calibration = coordinate_calibration(
        selected_fine_validation, label_values(fine_validation, "targetGenre"), FINE_LABELS, minimum_examples=3,
    )
    if APPLY_FINE_COORDINATE_CALIBRATION:
        selected_fine_validation = calibrated_scores(selected_fine_validation, fine_calibration["scales"])
        selected_fine_test = calibrated_scores(selected_fine_test, fine_calibration["scales"])
    calibrated = {
        "macro": {
            **{key: value for key, value in macro_calibration.items() if key != "scales"},
            "applied": APPLY_MACRO_COORDINATE_CALIBRATION,
            "reason": "disabled by default because per-label validation calibration reduced genre-balanced independent test",
        },
        "fine": {
            **{key: value for key, value in fine_calibration.items() if key != "scales"},
            "applied": APPLY_FINE_COORDINATE_CALIBRATION,
            "reason": "disabled by default because per-label validation calibration regressed independent test",
        },
        "validation": score_rows(validation, selected_macro_validation, selected_fine_validation, macro_labels),
        "test": score_rows(test, selected_macro_test, selected_fine_test, macro_labels),
    }
    report = {
        "objective": "32-genre validation-selected audio-only benchmark",
        "targetTop1Accuracy": 75,
        "selectionRule": "validation-only composite: 50% genre-balanced Top1 + 30% micro Top1 + 20% Top3",
        "splitAssignmentSha256": hashlib.sha256("\n".join(sorted(
            f"{source_key(row)}\t{row.get('split', '')}" for row in rows
        )).encode()).hexdigest(),
        "featureDimensions": {
            name: int(sum(rows[0]["vectors"][feature].size for feature in values))
            for name, values in feature_sets
        },
        "externalFeaturePolicy": {
            "specialistModels": ["genre_dortmund", "genre_rosamerica", "genre_electronic", "genre_tzanetakis", "fma_small"],
            "specialistMissingRows": missing.get("specialist", 0),
            "specialistMissingValue": "2856 zeros plus one missingness flag",
            "maestModel": "essentia-discogs-maest-10s-pw-v2",
            "maestMissingRows": missing.get("maest", 0),
            "maestMissingValue": "1200 zeros plus one missingness flag",
            "maestFeature": "Discogs400 prediction mean, standard deviation, and maximum over 10-second patches",
            "productionEligible": False,
            "reason": "upstream specialist and MAEST model/training-data license terms are not declared in model metadata",
        },
        "replayBestMode": REPLAY_BEST,
        "xgboostSearchMode": XGBOOST_SEARCH,
        "hybridSearchMode": HYBRID_SEARCH,
        "specialistTagPriorsEnabled": ENABLE_SPECIALIST_TAG_PRIORS,
        "xgboostVersion": __import__("xgboost").__version__ if XGBClassifier is not None else None,
        "missingFeatureRows": missing,
        "rows": {
            "macroTrain": len(macro_train), "validationExact": len(validation), "testExact": len(test),
            "fineTrain": len(fine_train), "fineValidation": len(fine_validation), "fineTest": len(fine_test),
        },
        "best": best,
        "selectedDetailed": selected_detailed,
        "calibrated": calibrated,
        "topCandidates": candidates[:12],
        "topCandidatesByFeatureSet": top_candidates_by_feature_set,
        "topCandidatesByModelPair": top_candidates_by_model_pair,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({
        "reportPath": str(REPORT_PATH),
        "bestConfig": {key: best[key] for key in ("featureSet", "macroModel", "fineModel", "macroPriorAlpha", "macroTagWeight", "fineTagWeight", "familyWeight")},
        "validation": {key: best["validation"][key] for key in ("total", "top1Accuracy", "top3Accuracy", "genreBalancedTop1")},
        "test": {key: best["test"][key] for key in ("total", "top1Accuracy", "top3Accuracy", "genreBalancedTop1", "readyGenres10Plus", "readyGenresRobust")},
        "calibratedTest": {key: calibrated["test"][key] for key in ("total", "top1Accuracy", "top3Accuracy", "genreBalancedTop1", "readyGenres10Plus", "readyGenresRobust")},
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
