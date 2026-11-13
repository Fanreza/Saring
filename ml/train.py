"""Bandingkan LR / RF / XGBoost dengan StratifiedGroupKFold, tuning, pilih threshold, simpan model terbaik."""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_curve
from sklearn.model_selection import RandomizedSearchCV, StratifiedGroupKFold, cross_val_predict, cross_validate
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from features import FEATURE_NAMES, extract_features

ROOT = Path(__file__).parent
SEED = 42
TARGET_FPR = 0.02  # maksimal 2% situs aman ikut terblokir (1% memangkas recall terlalu banyak)


def featurize(urls) -> pd.DataFrame:
    return pd.DataFrame([extract_features(u) for u in urls], columns=FEATURE_NAMES)


MODELS = {
    "logreg": (make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
               {"logisticregression__C": [0.01, 0.1, 1, 10]}),
    "random_forest": (RandomForestClassifier(n_jobs=-1, random_state=SEED),
                      {"n_estimators": [200, 400], "max_depth": [None, 20, 30],
                       "min_samples_leaf": [1, 2, 5], "max_features": ["sqrt", 0.5]}),
    "xgboost": (XGBClassifier(n_jobs=-1, random_state=SEED, tree_method="hist", eval_metric="logloss"),
                {"n_estimators": [300, 600], "max_depth": [6, 8, 10], "learning_rate": [0.05, 0.1, 0.2],
                 "subsample": [0.8, 1.0], "colsample_bytree": [0.7, 1.0]}),
}


def main():
    df = pd.read_csv(ROOT / "data" / "processed" / "dataset.csv")
    tr = df[df.split == "train"].reset_index(drop=True)
    print(f"featurize {len(tr)} URL train ...")
    X, y, groups = featurize(tr.url), tr.label.values, tr.domain.values
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    scoring = ["accuracy", "precision", "recall", "f1", "roc_auc"]

    rows, best = [], {}
    for name, (est, grid) in MODELS.items():
        print(f"\n== {name}: tuning ...")
        # ponytail: tuning 3-fold, 8 kombinasi; naikkan n_iter kalau waktu longgar
        search = RandomizedSearchCV(est, grid, n_iter=8, scoring="f1", random_state=SEED,
                                    cv=StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=SEED), n_jobs=1)
        search.fit(X, y, groups=groups)
        print("   param terbaik:", search.best_params_)
        res = cross_validate(search.best_estimator_, X, y, groups=groups, cv=cv, scoring=scoring)
        row = {"model": name, **{m: res[f"test_{m}"].mean() for m in scoring},
               **{f"{m}_std": res[f"test_{m}"].std() for m in scoring}, "params": search.best_params_}
        print("   CV 5-fold:", {m: round(row[m], 4) for m in scoring})
        rows.append(row)
        best[name] = search.best_estimator_

    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    table = pd.DataFrame(rows).sort_values("f1", ascending=False)
    table.to_csv(reports / "cv_comparison.csv", index=False)
    winner = table.iloc[0].model
    print(f"\nmodel terbaik: {winner}")

    # threshold dari prediksi out-of-fold (bukan test set) -> FPR <= target
    oof = cross_val_predict(best[winner], X, y, groups=groups, cv=cv, method="predict_proba")[:, 1]
    fpr, _, thr = roc_curve(y, oof)
    threshold = float(thr[np.searchsorted(fpr, TARGET_FPR, side="right") - 1])
    print(f"threshold (FPR<={TARGET_FPR:.0%} di OOF): {threshold:.4f}")

    model = best[winner].fit(X, y)
    (ROOT / "models").mkdir(exist_ok=True)
    joblib.dump({"model": model, "name": winner, "feature_names": FEATURE_NAMES, "threshold": threshold,
                 "all_models": best}, ROOT / "models" / "model.joblib")
    print("tersimpan: models/model.joblib")


if __name__ == "__main__":
    main()
