"""Evaluasi di test split (domain tak pernah dilihat) + holdout feed terbaru. Output ke reports/ untuk BAB 4."""
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd
import shap

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import (ConfusionMatrixDisplay, RocCurveDisplay, accuracy_score, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)

from train import featurize

ROOT = Path(__file__).parent
REP = ROOT / "reports"


def metrics(y, prob, thr):
    pred = (prob >= thr).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    out = {"accuracy": accuracy_score(y, pred), "recall": recall_score(y, pred, zero_division=0),
           "fpr": fp / max(fp + tn, 1)}
    if len(set(y)) == 2:
        out |= {"precision": precision_score(y, pred), "f1": f1_score(y, pred), "roc_auc": roc_auc_score(y, prob)}
    return out


def main():
    REP.mkdir(exist_ok=True)
    art = joblib.load(ROOT / "models" / "model.joblib")
    model, thr = art["model"], art["threshold"]

    df = pd.read_csv(ROOT / "data" / "processed" / "dataset.csv")
    te = df[df.split == "test"]
    ho = pd.read_csv(ROOT / "data" / "processed" / "holdout.csv")
    Xte, Xho = featurize(te.url), featurize(ho.url)

    # 1. semua model di test split (threshold 0.5 untuk perbandingan adil) + model terpilih dgn threshold tuned
    rows = [{"model": n, "threshold": 0.5, **metrics(te.label, m.predict_proba(Xte)[:, 1], 0.5)}
            for n, m in art["all_models"].items()]
    prob_te = model.predict_proba(Xte)[:, 1]
    rows.append({"model": f"{art['name']} (tuned)", "threshold": thr, **metrics(te.label, prob_te, thr)})
    t = pd.DataFrame(rows)
    t.to_csv(REP / "test_metrics.csv", index=False)
    print("TEST SPLIT (domain unseen):\n", t.round(4).to_string(index=False))

    # 2. holdout temporal per sumber
    prob_ho = model.predict_proba(Xho)[:, 1]
    rows = [{"source": s, "n": int(m.sum()), **metrics(ho.label[m], prob_ho[m], thr)}
            for s in ho.source.unique() for m in [(ho.source == s).values]]
    rows.append({"source": "ALL", "n": len(ho), **metrics(ho.label, prob_ho, thr)})
    h = pd.DataFrame(rows)
    h.to_csv(REP / "holdout_metrics.csv", index=False)
    print("\nHOLDOUT (feed terbaru):\n", h.round(4).to_string(index=False))

    # 3. per sumber di test split -> deteksi bias dataset
    s = pd.DataFrame([{"source": src, "n": int(m.sum()), **metrics(te.label[m], prob_te[m], thr)}
                      for src in te.source.unique() for m in [(te.source == src).values]])
    s.to_csv(REP / "test_per_source.csv", index=False)
    print("\nTEST per sumber:\n", s.round(4).to_string(index=False))

    # 4. gambar
    ConfusionMatrixDisplay.from_predictions(te.label, (prob_te >= thr).astype(int),
                                            display_labels=["legit", "phishing"], cmap="Blues", values_format="d")
    plt.title(f"Confusion matrix - {art['name']} (test)")
    plt.savefig(REP / "confusion_matrix.png", dpi=150, bbox_inches="tight")
    plt.close()

    ax = plt.gca()
    for n, m in art["all_models"].items():
        RocCurveDisplay.from_predictions(te.label, m.predict_proba(Xte)[:, 1], name=n, ax=ax)
    plt.title("ROC curve (test)")
    plt.savefig(REP / "roc_curve.png", dpi=150, bbox_inches="tight")
    plt.close()

    sample = Xte.sample(1000, random_state=42)  # ponytail: SHAP RF lambat, 1000 cukup untuk summary plot
    sv = shap.TreeExplainer(model)(sample) if art["name"] != "logreg" else None
    if sv is not None:
        if sv.values.ndim == 3:  # RF: (n, fitur, kelas) -> ambil kelas phishing
            sv = sv[:, :, 1]
        shap.summary_plot(sv, sample, show=False, max_display=20)
        plt.savefig(REP / "shap_summary.png", dpi=150, bbox_inches="tight")
        plt.close()
        imp = pd.Series(np.abs(sv.values).mean(0), index=sample.columns).sort_values(ascending=False)
        imp.to_csv(REP / "feature_importance.csv", header=["mean_abs_shap"])
        print("\nTop 10 fitur (mean |SHAP|):\n", imp.head(10).round(4).to_string())
    print(f"\nreport tersimpan di {REP}")


if __name__ == "__main__":
    main()
