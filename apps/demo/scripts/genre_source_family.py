def raw_source_name(row):
    return str(row.get("datasetName") or row.get("sourceType") or "unknown").strip()


def source_family(row):
    raw = raw_source_name(row)
    normalized = raw.casefold()
    if normalized.startswith("fma") or "free music archive" in normalized:
        return "FMA"
    if "jamendo" in normalized:
        return "Jamendo"
    if normalized.startswith("rwc") or "rwc music database" in normalized:
        return "RWC Music Database"
    if "internet archive strict exact-subject" in normalized:
        return "Internet Archive Strict"
    if "internet archive" in normalized:
        return "Internet Archive"
    if "wikimedia" in normalized:
        return "Wikimedia Commons"
    if "freesound" in normalized:
        return "Freesound"
    if "ccmixter" in normalized or "cc mixter" in normalized:
        return "ccMixter"
    if "idolsongsjp" in normalized or "idol songs jp" in normalized:
        return "IdolSongsJp"
    if "jacappella" in normalized:
        return "jaCappella"
    return raw or "unknown"
