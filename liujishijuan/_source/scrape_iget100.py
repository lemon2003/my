# 抓取 iget100（午后书真题）六级列表 -> 试卷标题/年份/套号 -> 音频地址
import json, re, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
BASE = "https://iget100.wuhoushu.com"


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


CARD = re.compile(
    r'href="(/exam/cet6/[0-9a-f-]{36})"><div[^>]*>(\d{4})<!-- -->\s*年<!-- -->\s*(\d+)\s*月</div><div[^>]*>(.*?)</div>',
    re.S,
)

rows = []
seen = set()
for p in range(1, 9):
    h = get("%s/exam/cet6?page=%d" % (BASE, p))
    found = CARD.findall(h)
    new = 0
    for path, y, m, title in found:
        key = (path, y, m, title)
        if key in seen:
            continue
        seen.add(key)
        new += 1
        rows.append(
            {
                "path": path,
                "year": int(y),
                "month": int(m),
                "title": re.sub(r"<[^>]+>", "", title).strip(),
            }
        )
    print("page %d 新增 %d 累计 %d" % (p, new, len(rows)))
    if new == 0:
        break

# 逐页取音频地址（缓存，避免重复抓）
cache = {}
for r in rows:
    url = BASE + r["path"]
    h = get(url)
    mp3 = re.findall(r"https?://[^\\\"' )]+\.mp3", h)
    r["mp3"] = sorted(set(mp3))[0] if mp3 else ""
    m = re.search(r"第([一二三四])套", r["title"])
    r["set"] = {"一": 1, "二": 2, "三": 3, "四": 4}.get(m.group(1), 1) if m else 1

json.dump(rows, open("/tmp/iget100.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("共 %d 条，有音频 %d" % (len(rows), sum(1 for r in rows if r["mp3"])))
for r in rows:
    print("%d-%02d 第%d套 %s" % (r["year"], r["month"], r["set"], r["mp3"] or "（无）"))
