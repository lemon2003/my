# 给定「片段 slug + 特征词」，在全部试卷 PDF 里定位它真正属于哪一套
import pypdf, re, glob, os, sys, json

CACHE = "/tmp/pdftext.json"


def load():
    if os.path.exists(CACHE):
        return json.load(open(CACHE, encoding="utf-8"))
    d = {}
    for p in sorted(glob.glob("assets/pdf/*.pdf")):
        slug = os.path.basename(p)[:-4]
        try:
            r = pypdf.PdfReader(p)
            t = re.sub(r"\s+", " ", " ".join((x.extract_text() or "") for x in r.pages)).lower()
        except Exception:
            t = ""
        d[slug] = t
    json.dump(d, open(CACHE, "w", encoding="utf-8"))
    return d


def locate(texts, keywords):
    hits = [s for s, t in texts.items() if all(k in t for k in keywords)]
    return hits


if __name__ == "__main__":
    texts = load()
    spec = json.loads(sys.argv[1])
    for clip, kws in spec.items():
        hits = locate(texts, kws)
        print("%-18s %-28s -> %s" % (clip, ",".join(kws), hits or "（无命中）"))
