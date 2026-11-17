import pandas as pd

from build_dataset import clean, domain, key


def test_key_menyamakan_penulisan_url():
    assert key("https://www.Contoh.com/") == "contoh.com"
    assert key("contoh.com") == "contoh.com"
    assert key("http://contoh.com/a/") == "contoh.com/a"


def test_domain_mengambil_registered_domain():
    assert domain("https://login.akun.bca.co.id/x") == "bca.co.id"
    assert domain("http://user@phish.example.com:8080/a") == "example.com"
    assert domain("http://192.168.1.1/a") == "192.168.1.1"


def test_clean_buang_duplikat_label_bertentangan_dan_panjang_tidak_wajar():
    df = pd.DataFrame({
        "url": ["https://a.com/", "http://www.a.com", "https://b.com", "b.com", "x", "https://c.com/" + "z" * 3000, None],
        "label": [1, 1, 0, 1, 0, 1, 0],
        "source": ["s"] * 7,
    })
    out = clean(df)
    # a.com: duplikat label sama -> 1 baris; b.com: label bertentangan -> dibuang;
    # "x" terlalu pendek, c.com terlalu panjang, None kosong -> dibuang
    assert list(out.key) == ["a.com"]
    assert out.label.tolist() == [1]
