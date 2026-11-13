"""Gabung dataset mentah -> data/processed/{dataset,holdout}.csv

dataset.csv : PhiUSIIL + PhishTank (sebelum CUTOFF) + Tranco(top N) + Kaggle benign ber-path,
              seimbang, split train/test per domain.
holdout.csv : PhishTank >= CUTOFF + OpenPhish (phishing) + Tranco rank lain & Kaggle benign domain baru (legit).

Label PHISHING Kaggle tidak dipakai: banyak URL sah berlabel phishing (lihat kaggle_noise()).
Label BENIGN Kaggle dipakai karena PhiUSIIL & Tranco legit semuanya homepage tanpa path -> tanpa ini model
belajar "ada path = phishing". Scheme Kaggle benign dinormalisasi ke https:// (92% ditulis tanpa scheme).
"""
from pathlib import Path

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from features import _extract, normalize

RAW = Path(__file__).parent / "data" / "raw"
OUT = Path(__file__).parent / "data" / "processed"
SEED = 42
TRANCO_TRAIN = 30_000            # ponytail: dibatasi, homepage-only bisa bikin bias "ada path = phishing"
TRANCO_HOLDOUT = slice(100_000, 110_000)
KAGGLE_BENIGN = 120_000
PHIUSIIL_PHISH_MAX = 55_000  # setara PhishTank, agar phishing gaya lama (banyak http) tidak mendominasi
CUTOFF = pd.Timestamp("2026-08-01", tz="UTC")  # PhishTank sebelum ini -> training, sesudahnya -> holdout


def key(url: str) -> str:
    """URL ternormalisasi untuk dedup (tanpa scheme, www, slash akhir)."""
    u = normalize(url).split("://", 1)[1].lower().rstrip("/")
    return u.removeprefix("www.")


def domain(url: str) -> str:
    host = normalize(url).split("://", 1)[1].split("/", 1)[0].split("@")[-1].split(":")[0]
    return _extract(host).top_domain_under_public_suffix or host


def latest_feed() -> Path:
    return sorted((RAW / "feeds").glob("*"))[-1]


def phishtank() -> pd.DataFrame:
    p = pd.read_csv(latest_feed() / "phishtank.csv", usecols=["url", "submission_time"])
    return p.assign(t=pd.to_datetime(p.submission_time, utc=True))


def kaggle_noise():
    kag = pd.read_csv(RAW / "kaggle" / "malicious_phish.csv")
    kag = kag[kag.type.isin(["benign", "phishing"])]
    has_scheme = kag.url.str.match(r"^https?://")
    print("Kaggle: proporsi URL tanpa scheme per label\n", (~has_scheme).groupby(kag.type).mean().round(3).to_string())
    print("Kaggle: 20 sampel acak berlabel phishing (cek manual):")
    print("  " + "\n  ".join(kag[kag.type == "phishing"].url.sample(20, random_state=SEED)))


def kaggle_benign() -> pd.Series:
    k = pd.read_csv(RAW / "kaggle" / "malicious_phish.csv")
    u = k.url[k.type == "benign"].str.strip().str.replace(r"^https?://", "", regex=True)
    u = u[u.str.contains(r"/.")]  # hanya yang punya path, homepage sudah dari PhiUSIIL/Tranco
    return ("https://" + u).sample(frac=1, random_state=SEED).reset_index(drop=True)


def load_train_sources() -> pd.DataFrame:
    phi = pd.read_csv(RAW / "phiusiil" / "PhiUSIIL_Phishing_URL_Dataset.csv",
                      usecols=["URL", "label"], encoding="utf-8-sig")
    phi = pd.DataFrame({"url": phi.URL, "label": 1 - phi.label, "source": "phiusiil"})  # asli: 1=legit
    phi = pd.concat([phi[phi.label == 0], phi[phi.label == 1].sample(PHIUSIIL_PHISH_MAX, random_state=SEED)])

    pt = phishtank()
    pt = pd.DataFrame({"url": pt.url[pt.t < CUTOFF], "label": 1, "source": "phishtank"})

    tr = pd.read_csv(RAW / "tranco" / "top-1m.csv", header=None, names=["rank", "domain"], nrows=TRANCO_TRAIN)
    tr = pd.DataFrame({"url": "https://" + tr.domain, "label": 0, "source": "tranco"})
    kb = pd.DataFrame({"url": kaggle_benign()[:KAGGLE_BENIGN], "label": 0, "source": "kaggle_benign"})
    return pd.concat([phi, pt, tr, kb], ignore_index=True)


def load_holdout() -> pd.DataFrame:
    latest = latest_feed()
    pt = phishtank()
    parts = [pd.DataFrame({"url": pt.url[pt.t >= CUTOFF], "source": "phishtank_new"})]
    if (latest / "openphish.txt").exists():
        urls = (latest / "openphish.txt").read_text(encoding="utf-8").split()
        parts.append(pd.DataFrame({"url": urls, "source": "openphish"}))
    ph = pd.concat(parts, ignore_index=True).assign(label=1)

    tr = pd.read_csv(RAW / "tranco" / "top-1m.csv", header=None, names=["rank", "domain"]).iloc[TRANCO_HOLDOUT]
    tr = pd.DataFrame({"url": "https://" + tr.domain, "label": 0, "source": "tranco_holdout"})
    kb = pd.DataFrame({"url": kaggle_benign()[KAGGLE_BENIGN:], "label": 0, "source": "kaggle_benign_new"})
    print(f"holdout dari feed {latest.name}, PhishTank >= {CUTOFF.date()}")
    return pd.concat([ph, tr, kb], ignore_index=True)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.dropna(subset=["url"])
    df["url"] = df.url.astype(str).str.strip()
    df = df[df.url.str.len().between(4, 2048)]
    df["key"] = df.url.map(key)
    conflict = df.groupby("key").label.nunique()
    df = df[~df.key.isin(conflict[conflict > 1].index)]  # URL sama tapi label beda -> buang
    return df.drop_duplicates("key")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    kaggle_noise()
    df = clean(load_train_sources())
    print("setelah dedup:\n", df.groupby(["source", "label"]).size().to_string())

    n = df.label.value_counts().min()  # undersample kelas mayoritas -> 50:50
    df = df.groupby("label", group_keys=False).sample(n=n, random_state=SEED)

    df["domain"] = df.url.map(domain)
    tr_idx, te_idx = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=SEED)
                          .split(df, groups=df.domain))
    df["split"] = "train"
    df.iloc[te_idx, df.columns.get_loc("split")] = "test"
    df.drop(columns="key").to_csv(OUT / "dataset.csv", index=False)
    print("\ndataset.csv:\n", df.groupby(["split", "label"]).size().to_string())
    has_path = df.key.str.contains("/")
    print("\nproporsi URL ber-path (cek shortcut 'ada path = phishing'):\n",
          has_path.groupby([df.source, df.label]).mean().round(3).to_string())

    ho = clean(load_holdout())
    ho = ho[~ho.key.isin(df.key)]  # buang yang sudah ada di data training
    kb = ho.source == "kaggle_benign_new"
    ho = pd.concat([ho[~kb], ho[kb & ~ho.url.map(domain).isin(df.domain)].sample(10_000, random_state=SEED)])
    ho.drop(columns="key").to_csv(OUT / "holdout.csv", index=False)
    print("\nholdout.csv:\n", ho.groupby(["source", "label"]).size().to_string())


if __name__ == "__main__":
    main()
