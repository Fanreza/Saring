# Saring

Saring is a phishing link detector. You give it a URL, and it tells you whether the link looks like phishing and why, **before you open the page**. It works from the text of the URL alone. It does not visit the page, query WHOIS, or resolve DNS.

The product is made of four parts:

| Part | What it is |
| --- | --- |
| **Web app** | Check a link, scan a whole message for links, keep a history, report mistakes, read a short phishing guide, and see how the model was built. |
| **Browser extension** | Chrome/Edge (Manifest V3) extension that checks every page you navigate to and shows a warning page when the link looks like phishing. |
| **Gateway** | Go HTTP API in front of the model: validation, allowlist, cache, rate limiting, user reports, admin panel, usage statistics. |
| **ML service** | Python (FastAPI) service that turns a URL into 33 features, scores it with an XGBoost model, and explains the score with SHAP. |

The user interface is in Indonesian, and the examples and scam patterns target Indonesia (BCA, BRI, Mandiri, DANA, OVO, Shopee, Tokopedia, and similar). The code comments are also mostly in Indonesian. This project started as a university thesis project (Kuliah).

## Features

- **Link check.** Paste a URL and get a verdict (phishing or safe), a risk score from 0 to 100, and up to five plain-language reasons, such as "uses a free hosting service often abused by scammers" or "mentions a brand but is not its official site".
- **Message scan.** Paste a whole SMS, WhatsApp, or email text. Saring extracts up to 20 links and checks them in parallel.
- **Local history.** The last 200 checks are stored in your browser (`localStorage`). Nothing is stored on a server per user.
- **Report a mistake.** Users can report a phishing link that was missed or a safe site that was blocked. Reports go into a review queue.
- **Admin panel.** At `/#/admin` (not shown in the menu), password protected. Review reports, mark them valid or invalid, and see check counts for the last 14 days.
- **Education page.** Signs of a phishing link, common scam modes in Indonesia, and what to do after opening one.
- **Model report page ("Tentang Model").** Datasets, methodology, metrics, feature importance, and the history of experiments, all inside the app.
- **Browser extension.**
  - Checks each top-level navigation before the page loads and redirects to a warning page on phishing. The user can go back or choose to continue.
  - Badge on the toolbar icon: `OK`, `!`, or `?` (server unreachable).
  - Popup with the verdict for the current tab and an on/off switch.
  - Right-click menu on any link: "Cek link dengan Saring" opens the web checker without opening the link.
  - Fails open: if the server is down, browsing is never blocked.
- **Explainable results.** Every verdict comes with the top features that pushed the score up (SHAP values), shown only when the feature is actually present in the URL.

## Architecture

```
Browser extension ─┐
                   ├──► Caddy (HTTPS, serves web, /api/*) ──► Gateway (Go, :8787) ──► ML service (FastAPI, :8000)
Web app (React) ───┘                                               │
                                                                   └──► SQLite (reports, daily stats)
```

Request flow for `POST /api/check`:

1. Rate limit (60 requests per minute per IP).
2. Validate and normalize the URL (http/https only, max 2048 characters).
3. If the host is in the allowlist (Google, YouTube, major Indonesian banks, and so on), return "safe" without calling the model. Subdomains such as `docs.google.com` are not allowlisted, because they are often used to host phishing pages.
4. Look up a one-hour in-memory cache.
5. Call the ML service, cache the result, count it in the daily statistics, and return it.

### Repository layout

```
extension/   Chrome/Edge extension (Manifest V3, no build step)
gateway/     Go API: main.go (check, cache, rate limit), store.go (SQLite, reports, admin)
ml/          Python: data download, dataset build, training, evaluation, FastAPI service
web/         React 19 + Vite single-page app, served by Caddy in production
docker-compose.yml   ml + gateway + web (Caddy with automatic HTTPS)
start-dev.sh         Start all three services locally
test-all.sh          Run every test suite
```

## How to use it

### Prerequisites

- Python 3.14 (the version in `ml/Dockerfile`; the pinned versions in `ml/requirements.txt` are what the model file was pickled with)
- Go (version in `gateway/go.mod`)
- Node.js and npm
- Bash. On Windows use Git Bash for `start-dev.sh` and `test-all.sh`.

### 1. Train the model (one time)

The trained model and the datasets are not in git (see `.gitignore`), so build them first.

```bash
cd ml
python -m venv .venv
source .venv/Scripts/activate        # Windows Git Bash. On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python download_data.py              # downloads PhiUSIIL, Kaggle, Tranco, PhishTank, OpenPhish
python build_dataset.py              # builds data/processed/dataset.csv and holdout.csv
python train.py                      # compares 3 models, writes models/model.joblib
python evaluate.py                   # optional: metrics, plots, and SHAP summary in reports/
```

`download_data.py` pulls Kaggle mirrors without credentials. The PhishTank feed may be rate limited. If it fails, the script prints a message and continues, but `build_dataset.py` needs `phishtank.csv`, so rerun the download later.

### 2. Run locally

```bash
cd web && npm install && cd ..
./start-dev.sh
```

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| Admin panel | http://localhost:5173/#/admin (default password `saring-admin`, override with `ADMIN_PASSWORD=... ./start-dev.sh`) |
| Gateway | http://localhost:8787 |
| ML service | http://localhost:8000 |

Press Ctrl+C to stop. The script skips any port that is already in use.

### 3. Install the extension

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Keep `./start-dev.sh` running. The extension talks to `http://localhost:8787` by default.

To point the extension at a deployed server, edit `extension/config.js` (`SARING_API`, `SARING_WEB`) and set the same domain in `host_permissions` in `extension/manifest.json`.

### 4. Use the API directly

```bash
curl -X POST http://localhost:8787/api/check \
  -H "Content-Type: application/json" \
  -d '{"url": "https://bca-mobile-verifikasi.cfd/akun"}'
```

Response (shape):

```json
{
  "url": "https://bca-mobile-verifikasi.cfd/akun",
  "is_phishing": true,
  "score": 0.97,
  "threshold": 0.6887,
  "model": "xgboost",
  "reasons": [
    { "feature": "suspicious_tld", "label": "Akhiran domain murah yang sering dipakai penipu (.xyz, .cfd, dll)", "value": 1, "impact": 1.2 }
  ]
}
```

The values above are illustrative. Allowlisted hosts return `"model": "allowlist"` and an empty `reasons` list.

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/check` | none | Check a URL. Body: `{"url": "..."}` |
| `POST /api/report` | none | Report a mistake. Body: `{"url", "kind": "phishing_lolos" \| "salah_blokir", "note"}` (note up to 500 characters) |
| `POST /api/admin/login` | password | Returns a bearer token valid for 8 hours |
| `GET /api/admin/reports` | admin | List reports |
| `PATCH /api/admin/reports/{id}` | admin | Set status to `baru`, `valid`, or `tidak_valid` |
| `GET /api/admin/stats` | admin | Totals and the last 14 days |
| `GET /healthz` | none | Health check |

### 5. Deploy with Docker

```bash
cp .env.example .env        # set DOMAIN and a long random ADMIN_PASSWORD
docker compose up -d --build
```

`ml/models/model.joblib` must exist before the build, because the ML image copies it in. Caddy gets an HTTPS certificate for `DOMAIN` automatically. The ML service is only reachable inside the compose network. The gateway stores its SQLite database in a Docker volume. Set `TRUST_PROXY=1` (already set in `docker-compose.yml`) only when the gateway is behind a trusted reverse proxy, since the client IP is then read from `X-Forwarded-For`.

### 6. Run the tests

```bash
./test-all.sh
```

This runs `go vet` and `go test` for the gateway, `pytest` for the ML code and an end-to-end test, `vitest` for the web app, and `node --test` for the extension.

## Methodology

The full write-up with charts is in the app under **Tentang Model**. This is the summary.

### Pipeline

1. Data collection
2. Cleaning
3. Train/test split by domain
4. Feature extraction
5. Model training and tuning
6. Evaluation
7. Deployment

### Data

| Source | Role |
| --- | --- |
| PhiUSIIL Phishing URL Dataset (UCI) | Legitimate links (all) and phishing links (random 55,000 of 100,945). Original label is inverted, because 1 means legitimate there. |
| PhishTank | Phishing links reported **before 2026-08-01** are used for training. Links reported after that are held out. |
| Malicious URLs Dataset (Kaggle) | Only the `benign` label, and only links that have a path (random 120,000). The `phishing` label is discarded. |
| Tranco Top 1M | Ranks 1 to 30,000 as legitimate training links. Ranks 100,001 to 110,000 are held out. |
| OpenPhish | Fully held out, used only for testing. |

Cleaning steps:

- URLs are compared after removing the scheme, `www.`, and the trailing slash. Duplicates are dropped, and a URL with conflicting labels across sources is dropped entirely (396,923 links down to 389,053).
- The majority class is undersampled to 50:50, giving 216,470 links (108,235 legitimate and 108,235 phishing).
- **The split is grouped by registered domain**: 80% train (164,277 links, 87,251 domains) and 20% test (52,193 links, 21,813 domains), with no domain in both. The test score therefore measures performance on sites the model has never seen.
- A separate **temporal holdout** (new PhishTank reports, OpenPhish, unseen Tranco ranks, and benign Kaggle pages from new domains) is never used to build the model.

### Features

33 lexical features computed from the URL text only, by `ml/features.py`. The same code is used for training and for serving, so there is no training/serving skew.

- **Length:** URL, host, path, query, and TLD length.
- **Character counts:** dots, hyphens (all and in host), underscores, slashes, `?`, `=`, `@`, `&`, `%`, digits, subdomain depth.
- **Ratios and randomness:** digit ratio, letter ratio, digit ratio in host, uppercase ratio in path and query, Shannon entropy of URL and host.
- **Binary flags:** HTTPS, IP address as host, unusual port, `//` in path, punycode (`xn--`), URL shortener, suspicious TLD (`.xyz`, `.cfd`, `.top`, and so on), free hosting or dynamic DNS (`vercel.app`, `weebly.com`, and so on).
- **Words:** count of lure words (`login`, `verify`, `wallet`, and so on), and whether a well-known brand name appears in a domain that does not belong to that brand.

Length and count features are computed after the scheme, `www.`, and trailing slash are removed, so the way a dataset happens to write URLs does not leak into the model. The scheme only enters through `is_https`.

### Models and tuning

Three classifiers were compared: Logistic Regression (baseline), Random Forest, and XGBoost. Each got a randomized search over 8 parameter combinations, scored by F1 with 3-fold `StratifiedGroupKFold` on domain groups. The tuned models were then compared with 5-fold grouped cross-validation, and the best F1 won (XGBoost).

### Decision threshold

Saring does not use 0.5. The threshold is picked from out-of-fold predictions so that at most **2%** of legitimate links are flagged. The result is **0.689**. The reasoning is that a browser extension that blocks legitimate sites annoys users until they turn it off.

### Explainability

For each request, SHAP `TreeExplainer` values are computed. The top five positive contributors are returned, filtered so that a reason is only shown if the feature is actually present in the URL.

### Results

All numbers come from data downloaded on 2026-10-14.

**5-fold grouped cross-validation (training set)**

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
| --- | --- | --- | --- | --- | --- |
| Logistic Regression | 85.97% | 91.27% | 78.35% | 83.57% | 0.937 |
| Random Forest | 93.31% | 96.13% | 89.68% | 92.76% | 0.980 |
| **XGBoost** | **93.90%** | 95.82% | 91.31% | **93.48%** | 0.980 |

**Test split (52,193 links from unseen domains)**

| Model | Threshold | Accuracy | Precision | Recall | F1 | FPR |
| --- | --- | --- | --- | --- | --- | --- |
| Logistic Regression | 0.5 | 91.94% | 93.71% | 91.86% | 92.78% | 7.97% |
| Random Forest | 0.5 | 92.97% | 95.92% | 91.42% | 93.61% | 5.03% |
| XGBoost | 0.5 | 93.35% | 95.92% | 92.11% | 93.98% | 5.06% |
| **XGBoost (tuned)** | **0.689** | 93.19% | 96.90% | 90.83% | 93.76% | **3.75%** |

Confusion matrix for the final model: 21,919 true negatives, 855 false positives, 2,699 false negatives, 26,720 true positives.

**Temporal holdout (never used to build the model)**

| Group | Links | Result |
| --- | --- | --- |
| OpenPhish phishing, 2026-10-14 | 297 | 93.6% detected |
| PhishTank phishing, Aug to Oct 2026 | 7,240 | 79.4% detected |
| Tranco legitimate, ranks 100,001 to 110,000 | 9,642 | 98.6% not blocked |
| Kaggle legitimate pages from new domains | 10,000 | 95.5% not blocked |

Most influential features by mean absolute SHAP value: `free_hosting`, `is_https`, `n_subdomain`, `entropy_url`, `path_len`, `n_slash`.

### Experiment history

The final model came out of four iterations. Two of them are the reason the dataset looks the way it does.

| # | Change | F1 | What was found |
| --- | --- | --- | --- |
| 1 | PhiUSIIL, Kaggle (both labels), Tranco | 0.74 | Accuracy on Kaggle data was only 63 to 74%. In a manual check of 20 Kaggle "phishing" URLs, about 8 were real official sites (for example `bom.gov.au`, `acm.org`). The Kaggle phishing label was dropped. |
| 2 | PhiUSIIL, PhishTank, Tranco | 0.98 | The score was too good. Every legitimate link was a bare homepage, so the model learned "has a path means phishing". 120,000 legitimate links with paths from Kaggle were added. |
| 3 | Added legitimate links with paths | 0.935 | Fair, but only 48% of PhishTank phishing was detected. Modern phishing uses HTTPS and free hosting. Added `free_hosting`, uppercase ratio, and the suspicious-TLD list. |
| 4 | Final | 0.935 | PhishTank detection rose from 48% to 89% on the test split, and from 69% to 79% on phishing reported after training. |

### Limitations

- The model only reads the URL. A phishing page on a clean-looking new domain with HTTPS is hard to catch, which is why PhishTank holdout recall is 79.4%. Roughly 1 in 11 phishing links in the test split still gets through.
- About 3.75% of legitimate links in the test split are flagged. On the Tranco holdout the rate is 1.4%, and on benign Kaggle pages from new domains it is 4.5%.
- The allowlist is hardcoded in `gateway/main.go`.
- The cache and rate limiter live in memory, so they assume a single gateway instance. The SQLite database has one writer for the same reason.
- The model was trained on a snapshot. Phishing changes quickly, so retrain periodically with fresh feeds: rerun `download_data.py`, `build_dataset.py`, and `train.py`, then update the numbers in `web/src/data.js`.
- Saring is an aid, not a guarantee. Do not enter credentials on a site you doubt, even if Saring says it is safe.

## Tech stack

- **ML:** Python, pandas, scikit-learn, XGBoost, SHAP, tldextract, FastAPI, uvicorn
- **Gateway:** Go, `net/http`, SQLite via `modernc.org/sqlite` (pure Go, no CGO)
- **Web:** React 19, Vite, Vitest, Testing Library, oxlint
- **Extension:** Manifest V3 service worker, plain JavaScript
- **Deployment:** Docker Compose, Caddy (automatic HTTPS)

## References

**Datasets and feeds**

1. Prasad, A. and Chandra, S. *PhiUSIIL Phishing URL Dataset*. UCI Machine Learning Repository, ID 967. https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset
2. Prasad, A. and Chandra, S. (2024). PhiUSIIL: A diverse security profile empowered phishing URL detection framework based on similarity index and incremental learning. *Computers & Security*, 136, 103545.
3. PhishTank, community-verified phishing URLs. https://phishtank.org/
4. OpenPhish, phishing intelligence feed. https://openphish.com/
5. Siddhartha, M. *Malicious URLs Dataset*. Kaggle. https://www.kaggle.com/datasets/sid321axn/malicious-urls-dataset
6. Le Pochat, V., Van Goethem, T., Tajalizadehkhoob, S., Korczynski, M., and Joosen, W. (2019). Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation. *Network and Distributed System Security Symposium (NDSS)*. https://tranco-list.eu/

**Methods**

7. Ma, J., Saul, L. K., Savage, S., and Voelker, G. M. (2009). Beyond Blacklists: Learning to Detect Malicious Web Sites from Suspicious URLs. *ACM SIGKDD*, 1245 to 1254.
8. Breiman, L. (2001). Random Forests. *Machine Learning*, 45(1), 5 to 32.
9. Chen, T. and Guestrin, C. (2016). XGBoost: A Scalable Tree Boosting System. *ACM SIGKDD*, 785 to 794.
10. Lundberg, S. M. and Lee, S.-I. (2017). A Unified Approach to Interpreting Model Predictions. *Advances in Neural Information Processing Systems (NeurIPS)*, 30.
11. Pedregosa, F. et al. (2011). Scikit-learn: Machine Learning in Python. *Journal of Machine Learning Research*, 12, 2825 to 2830.

**Tools**

12. FastAPI. https://fastapi.tiangolo.com/
13. Caddy web server. https://caddyserver.com/
14. React. https://react.dev/ and Vite. https://vite.dev/
15. Chrome Extensions, Manifest V3. https://developer.chrome.com/docs/extensions/mv3/intro/

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.
