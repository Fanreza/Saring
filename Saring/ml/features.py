"""Ekstraksi fitur lexical URL. Dipakai saat training DAN inference (satu sumber kebenaran)."""
import ipaddress
import math
import re
from collections import Counter
from urllib.parse import urlsplit

import tldextract

# ponytail: offline snapshot bawaan tldextract, tidak fetch PSL dari internet
_extract = tldextract.TLDExtract(suffix_list_urls=())

SENSITIVE_WORDS = ("login", "signin", "verify", "secure", "account", "update", "bank",
                   "confirm", "password", "wallet", "billing", "support", "webscr", "suspend")
BRANDS = ("paypal", "apple", "google", "microsoft", "facebook", "instagram", "amazon",
          "netflix", "whatsapp", "bca", "bri", "mandiri", "bni", "dana", "ovo", "shopee",
          "tokopedia", "metamask", "binance")
SHORTENERS = {"bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
              "cutt.ly", "s.id", "rb.gy", "shorturl.at", "tiny.cc", "rebrand.ly"}
SUSPICIOUS_TLDS = {"xyz", "top", "tk", "ml", "ga", "cf", "gq", "zip", "mov", "click", "link",
                   "work", "support", "rest", "icu", "cyou", "buzz", "monster", "live", "shop",
                   "cfd", "sbs", "lat", "bond", "autos", "lol", "quest", "pw", "cc", "su", "online",
                   "site", "website", "space", "fun", "store", "vip", "win", "loan", "cam", "today"}
# Layanan hosting gratis / DNS dinamis: domain utamanya sah, tapi siapa pun bisa bikin subdomain/halaman.
FREE_HOSTING = ("vercel.app", "netlify.app", "web.app", "firebaseapp.com", "pages.dev", "workers.dev",
                "github.io", "gitlab.io", "glitch.me", "repl.co", "onrender.com", "herokuapp.com",
                "weebly.com", "wixsite.com", "wix.com", "blogspot.com", "wordpress.com", "webflow.io",
                "000webhostapp.com", "godaddysites.com", "square.site", "mybluehost.me", "elementor.cloud",
                "duckdns.org", "ddnss.de", "no-ip.org", "hopto.org", "eu.cc", "us.cc", "r2.dev",
                "windows.net", "googleapis.com", "sites.google.com", "docs.google.com", "forms.gle",
                "ipfs.io", "dweb.link", "framer.app", "carrd.co", "notion.site", "translate.goog")


def normalize(url: str) -> str:
    url = url.strip()
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url):
        url = "http://" + url
    return url


def _entropy(s: str) -> float:
    if not s:
        return 0.0
    n = len(s)
    return -sum(c / n * math.log2(c / n) for c in Counter(s).values())


def _is_ip(host: str) -> int:
    try:
        ipaddress.ip_address(host.strip("[]"))
        return 1
    except ValueError:
        return 0


def extract_features(url: str) -> dict:
    url = normalize(url)
    try:
        p = urlsplit(url)
        host, port = (p.hostname or ""), p.port
    except ValueError:  # port invalid, dll
        p = urlsplit("http://invalid/")
        host, port = "", None
    host = host.removeprefix("www.")
    ext = _extract(host)
    path, query = p.path.rstrip("/"), p.query
    # Fitur panjang/hitung dihitung tanpa scheme, "www." dan "/" akhir supaya tidak bergantung
    # pada cara dataset menulis URL; scheme hanya masuk lewat fitur is_https.
    url = re.sub(r"^[^:]+://(www\.)?", "", url).rstrip("/") or host
    low = url.lower()
    registered = ext.domain.lower()
    top = ext.top_domain_under_public_suffix.lower()
    rest = low.replace(top, "", 1) if top else low
    digits = sum(ch.isdigit() for ch in url)
    letters = sum(ch.isalpha() for ch in url)

    return {
        "url_len": len(url),
        "host_len": len(host),
        "path_len": len(path),
        "query_len": len(query),
        "tld_len": len(ext.suffix),
        "n_dot": url.count("."),
        "n_hyphen": url.count("-"),
        "n_hyphen_host": host.count("-"),
        "n_underscore": url.count("_"),
        "n_slash": url.count("/"),
        "n_qmark": url.count("?"),
        "n_equal": url.count("="),
        "n_at": url.count("@"),
        "n_amp": url.count("&"),
        "n_percent": url.count("%"),
        "n_digit": digits,
        "n_subdomain": len([s for s in ext.subdomain.split(".") if s]),
        "digit_ratio": digits / max(len(url), 1),
        "letter_ratio": letters / max(len(url), 1),
        "host_digit_ratio": sum(ch.isdigit() for ch in host) / max(len(host), 1),
        "entropy_url": _entropy(url),
        "entropy_host": _entropy(host),
        "is_ip": _is_ip(host),
        "is_https": int(p.scheme == "https"),
        "free_hosting": int(any(host == d or host.endswith("." + d) for d in FREE_HOSTING)),
        "upper_ratio_path": sum(ch.isupper() for ch in path + query) / max(len(path + query), 1),
        "has_port": int(port is not None and port not in (80, 443)),
        "double_slash_path": int("//" in path),
        "punycode": int("xn--" in host),
        "is_shortener": int(top in SHORTENERS),
        "suspicious_tld": int(ext.suffix.split(".")[-1].lower() in SUSPICIOUS_TLDS),
        "n_sensitive": sum(w in low for w in SENSITIVE_WORDS),
        "brand_not_domain": int(any(b in rest for b in BRANDS) and registered not in BRANDS),
    }


FEATURE_NAMES = list(extract_features("http://example.com").keys())


if __name__ == "__main__":
    f = extract_features("http://192.168.1.1/login")
    assert f["is_ip"] == 1 and f["n_sensitive"] == 1
    f = extract_features("https://paypal.com.secure-login.xyz/verify@x")
    assert f["brand_not_domain"] == 1 and f["suspicious_tld"] == 1 and f["n_at"] == 1
    f = extract_features("https://www.paypal.com/")
    assert f["brand_not_domain"] == 0
    assert f["is_https"] == 1
    assert extract_features("http://google.com") == extract_features("http://www.google.com/")
    f = extract_features("xn--pypal-4ve.com")
    assert f["punycode"] == 1
    assert extract_features("https://itauu.vercel.app/abrir.html")["free_hosting"] == 1
    assert extract_features("https://vercel.app/")["free_hosting"] == 1
    assert extract_features("https://notvercel.app/")["free_hosting"] == 0
    f = extract_features("http://bit.ly/abc")
    assert f["is_shortener"] == 1
    extract_features("http://a.com:99999/")  # port invalid tidak crash
    print(f"ok, {len(FEATURE_NAMES)} fitur")
