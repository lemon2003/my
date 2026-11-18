# 把 iget100 的听力音频落到本地：assets/audio/{我们的slug}.mp3
# - 先按 (年, 月, 套号) 精确匹配；同考次没有该套时复用同考次其他套的录音（原站也是这么给的）
# - 相同 URL 只下载一次，其余用硬链接，避免重复占空间
import json, os, re, sys, urllib.request, concurrent.futures

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")
CACHE = os.path.join(ROOT, "_source", "_audio_cache")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}

rows = json.load(open("/tmp/iget100.json", encoding="utf-8"))
by_key = {}
by_month = {}
for r in rows:
    if not r["mp3"]:
        continue
    by_key[(r["year"], r["month"], r["set"])] = r
    by_month.setdefault((r["year"], r["month"]), []).append(r)

# 我们的清单
src = open(os.path.join(ROOT, "assets", "js", "data.js"), encoding="utf-8").read()
items = re.findall(r'"slug": "(\d{4}-\d{2}-cet6-[\d]+)"', src)
items = list(dict.fromkeys(items))

plan = []
for slug in items:
    y, m, n = slug.split("-")[0], slug.split("-")[1], int(slug.split("-")[-1])
    y, m = int(y), int(m)
    r = by_key.get((y, m, n))
    borrow = ""
    if not r:
        cands = by_month.get((y, m), [])
        if cands:
            r = sorted(cands, key=lambda x: x["set"])[0]
            borrow = "第%d套" % r["set"]
    plan.append({"slug": slug, "mp3": r["mp3"] if r else "", "borrow": borrow})

hit = [p for p in plan if p["mp3"]]
miss = [p for p in plan if not p["mp3"]]
print("可获取 %d / %d，缺 %d" % (len(hit), len(plan), len(miss)))
print("借用同考次录音：", ", ".join("%s←%s" % (p["slug"], p["borrow"]) for p in hit if p["borrow"]))
print("缺失：", ", ".join(p["slug"] for p in miss))

if "--dry" in sys.argv:
    sys.exit(0)

os.makedirs(OUT, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)

urls = sorted({p["mp3"] for p in hit})
local = {}


def fetch(url):
    name = url.rsplit("/exams/", 1)[1].replace("/", "_")
    dst = os.path.join(CACHE, name)
    if os.path.exists(dst) and os.path.getsize(dst) > 100000:
        return url, dst, os.path.getsize(dst), "cached"
    tmp = dst + ".part"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                total = int(r.headers.get("Content-Length") or 0)
                got = 0
                while True:
                    chunk = r.read(262144)
                    if not chunk:
                        break
                    f.write(chunk)
                    got += len(chunk)
            if total and got != total:
                raise IOError("长度不符 %d/%d" % (got, total))
            os.replace(tmp, dst)
            return url, dst, got, "ok"
        except Exception as e:
            if attempt == 2:
                return url, "", 0, "fail:%s" % e
    return url, "", 0, "fail"


with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
    for url, dst, size, st in ex.map(fetch, urls):
        local[url] = dst
        print("%-8s %7.2fMB  %s" % (st, size / 1048576, url.rsplit("/exams/", 1)[1]))
        sys.stdout.flush()

made = 0
for p in hit:
    d = local.get(p["mp3"])
    if not d:
        continue
    tgt = os.path.join(OUT, p["slug"] + ".mp3")
    if os.path.exists(tgt):
        os.remove(tgt)
    try:
        os.link(d, tgt)
    except OSError:
        import shutil

        shutil.copyfile(d, tgt)
    made += 1
print("已放置 %d 个文件，目录体积 %.1fMB" % (made, sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1048576))
