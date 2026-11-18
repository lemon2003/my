# -*- coding: utf-8 -*-
"""从 76 套试卷 PDF 提取词汇，与 ECDICT 比对，生成 assets/dict/cet6.js

依赖：pypdf
数据源：ECDICT（MIT）https://github.com/skywind3000/ECDICT

用法：
    python build_dict.py            # 需要当前目录下有 assets/pdf/*.pdf 与 _ref/ecdict.csv
"""

import csv
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF_DIR = os.path.join(ROOT, "assets", "pdf")
CACHE_DIR = os.path.join(ROOT, "_ref")
ECDICT_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv"
ECDICT_PATH = os.path.join(CACHE_DIR, "ecdict.csv")
OUT_PATH = os.path.join(ROOT, "assets", "dict", "cet6.js")


def extract_words():
    from pypdf import PdfReader

    words = {}
    for name in sorted(os.listdir(PDF_DIR)):
        if not name.lower().endswith(".pdf"):
            continue
        try:
            reader = PdfReader(os.path.join(PDF_DIR, name))
            text = "".join((p.extract_text() or "") for p in reader.pages)
        except Exception as exc:  # 个别文件损坏时跳过
            print("skip", name, exc)
            continue
        for w in re.findall(r"[A-Za-z][A-Za-z'\-]*", text):
            w = w.strip("'-").lower()
            if len(w) >= 2:
                words[w] = words.get(w, 0) + 1
    return words


def ensure_ecdict():
    os.makedirs(CACHE_DIR, exist_ok=True)
    if not os.path.exists(ECDICT_PATH) or os.path.getsize(ECDICT_PATH) < 10_000_000:
        print("下载 ECDICT（约 66 MB）…")
        urllib.request.urlretrieve(ECDICT_URL, ECDICT_PATH)


def build():
    words = extract_words()
    print("试卷唯一词:", len(words))
    ensure_ecdict()

    csv.field_size_limit(10**7)
    found, exch = {}, {}
    with open(ECDICT_PATH, encoding="utf-8", errors="ignore", newline="") as fh:
        for row in csv.DictReader(fh):
            w = (row.get("word") or "").strip().lower()
            if not w:
                continue
            if w in words and w not in found:
                tr = (row.get("translation") or "").replace("\\n", "\n").strip()
                ph = (row.get("phonetic") or "").strip()
                if tr:
                    found[w] = [ph, tr]
            if w in found:
                for part in (row.get("exchange") or "").split("/"):
                    if ":" in part:
                        _, val = part.split(":", 1)
                        if val:
                            exch.setdefault(val.lower(), w)

    out = {}
    for w, (ph, tr) in found.items():
        lines = [l.strip() for l in tr.split("\n") if l.strip()]
        out[w] = [ph, "\n".join(l[:120] for l in lines[:3])]
    exch = {k: v for k, v in exch.items() if k not in out and v in out}

    body = "window.CET6_DICT=%s;\nwindow.CET6_EXCH=%s;\n" % (
        json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        json.dumps(exch, ensure_ascii=False, separators=(",", ":")),
    )
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        fh.write(body)

    print("命中 %d (%.1f%%)，变形 %d，输出 %.2f MB" % (
        len(out), 100.0 * len(out) / max(1, len(words)), len(exch),
        len(body.encode("utf-8")) / 1024 / 1024))


if __name__ == "__main__":
    build()
