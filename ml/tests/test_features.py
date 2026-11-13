import pytest

from features import FEATURE_NAMES, extract_features, normalize


def test_jumlah_fitur_33_dan_urutan_tetap():
    assert len(FEATURE_NAMES) == 33
    assert list(extract_features("https://contoh.com/a").keys()) == FEATURE_NAMES


@pytest.mark.parametrize("raw,expected", [
    ("contoh.com", "http://contoh.com"),
    ("  https://contoh.com  ", "https://contoh.com"),
    ("ftp://contoh.com", "ftp://contoh.com"),
])
def test_normalize(raw, expected):
    assert normalize(raw) == expected


def test_fitur_tidak_bergantung_pada_www_dan_garis_miring_akhir():
    assert extract_features("http://google.com") == extract_features("http://www.google.com/")


def test_https_hanya_dari_skema():
    assert extract_features("https://contoh.com")["is_https"] == 1
    assert extract_features("http://contoh.com")["is_https"] == 0
    assert extract_features("contoh.com")["is_https"] == 0


@pytest.mark.parametrize("url,feature,value", [
    ("http://192.168.1.1/login", "is_ip", 1),
    ("http://[2001:db8::1]/", "is_ip", 1),
    ("http://contoh.com:8081/", "has_port", 1),
    ("http://contoh.com:443/", "has_port", 0),
    ("http://contoh.com/redirect//lain", "double_slash_path", 1),
    ("http://xn--pypal-4ve.com", "punycode", 1),
    ("http://bit.ly/abc", "is_shortener", 1),
    ("http://s.id/abc", "is_shortener", 1),
    ("https://bca-hadiah.xyz", "suspicious_tld", 1),
    ("https://bca-hadiah.cfd", "suspicious_tld", 1),
    ("https://contoh.co.id", "suspicious_tld", 0),
    ("https://itauu.vercel.app/abrir.html", "free_hosting", 1),
    ("https://vercel.app/", "free_hosting", 1),
    ("https://notvercel.app/", "free_hosting", 0),
    ("https://docs.google.com/forms/x", "free_hosting", 1),
    ("https://google.com/forms/x", "free_hosting", 0),
    ("https://a.b.contoh.com", "n_subdomain", 2),
    ("https://contoh.com/login/verify", "n_sensitive", 2),
    ("https://google.com@jahat.com", "n_at", 1),
])
def test_fitur_biner_dan_hitungan(url, feature, value):
    assert extract_features(url)[feature] == value


def test_brand_bukan_di_domain_resminya():
    assert extract_features("https://paypal.com.secure-login.xyz/verify")["brand_not_domain"] == 1
    assert extract_features("https://www.paypal.com/")["brand_not_domain"] == 0
    assert extract_features("https://bca.co.id/login")["brand_not_domain"] == 0


def test_rasio_huruf_besar_di_path():
    assert extract_features("https://a.com/kZq8XpT2")["upper_ratio_path"] > 0.3
    assert extract_features("https://a.com/artikel")["upper_ratio_path"] == 0


def test_entropy_link_acak_lebih_tinggi():
    acak = extract_features("https://x9qk2zt7w.com/kZq8XpT2")["entropy_url"]
    biasa = extract_features("https://aaaa.com/aaaa")["entropy_url"]
    assert acak > biasa


@pytest.mark.parametrize("url", ["http://a.com:99999/", "http://", "", "::::", "http://[zz/"])
def test_input_rusak_tidak_crash(url):
    f = extract_features(url)
    assert set(f) == set(FEATURE_NAMES)
    assert all(isinstance(v, (int, float)) for v in f.values())
