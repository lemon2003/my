# 生成 assets/audio/放置说明.md：音频状态、时长、核验结论与同源关系
import json, os, re, hashlib, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = os.path.join(ROOT, "assets", "audio")

DUR = {r["slug"]: r for r in json.load(open("/tmp/audio_info.json", encoding="utf-8"))}
rows = json.load(open("/tmp/iget100.json", encoding="utf-8"))

src_of = {}
url_sets = collections.defaultdict(dict)
for r in rows:
    if not r.get("mp3"):
        continue
    src_of[(r["year"], r["month"], r["set"])] = r["mp3"]
    k = (r["year"], r["month"])
    url_sets[k][r["mp3"]] = min(url_sets[k].get(r["mp3"], 99), r["set"])

# 逐考次的核验结论（用转写前 85–260 秒的对话主题 vs 真题第一题选项比对得出）
STATUS = {
    "2017-06": ("撤下", "来源站给的是 2017-12 的录音，本期已撤下"),
    "2021-12": ("已修正", "原第 1/2 套音频互换，已对调"),
    "2023-12": ("已修正", "原第 1/2 套音频互换，已对调"),
    "2019-06": ("已核对", "关键词比对（Hepburn / wedding）"),
    "2019-12": ("已核对", "关键词比对（jazz / editor）"),
    "2020-09": ("已核对", "关键词比对（Oxford）"),
    "2025-12": ("部分", "第 1 套已核对；第 2 套 PDF 未印听力题，无法比对"),
}
DEFAULT = ("已核对", "转写主题与真题第一题选项一致")

src = open(os.path.join(ROOT, "assets", "js", "data.js"), encoding="utf-8").read()
papers = re.findall(r'"slug": "(\d{4}-\d{2}-cet6-[\d]+)",\s*\n\s*"title": "([^"]+)"', src)

fp = collections.defaultdict(list)
for f in sorted(os.listdir(AUD)):
    if os.path.splitext(f)[1].lower() in (".mp3", ".m4a", ".wav", ".ogg"):
        fp[hashlib.md5(open(os.path.join(AUD, f), "rb").read()).hexdigest()].append(os.path.splitext(f)[0])
dups = {k: v for k, v in fp.items() if len({s[:7] for s in v}) > 1}

rows_out, miss = [], []
for slug, title in papers:
    y, m, n = int(slug[:4]), int(slug[5:7]), int(slug.split("-")[-1])
    key = "%04d-%02d" % (y, m)
    st, why = STATUS.get(key, DEFAULT)
    d = DUR.get(slug)
    if not d:
        note = "来源站未收录" if key not in STATUS else "%s：%s" % (st, why)
        miss.append("| %s | %s | — | %s |" % (slug, title, note))
        continue
    note = []
    u = src_of.get((y, m, n))
    if u and url_sets[(y, m)].get(u) != n:
        note.append("同第 %d 套录音" % url_sets[(y, m)][u])
    if slug in {s for v in dups.values() for s in v}:
        others = [x for k, v in dups.items() if slug in v for x in v if x[:7] != slug[:7]]
        note.append("与 %s 字节相同" % "、".join(sorted(set(others))[:2]))
    rows_out.append(
        "| %s | %s | `%s.%s` | %.1f 分钟 | %s | %s |"
        % (slug, title, slug, d["ext"], d["minutes"], st, "；".join(note))
    )

uniq = len(fp)
fixed = sum(1 for r in rows_out if "已修正" in r)
head = """# 本地听力音频清单

**已放好 %d 套试卷的音频，对应 %d 段不同录音；点击阅读器「听力」直接播放，全程不联网。**

## 一、内容是否与试卷对得上（本次已做转写核对）

用语音转写取每段录音开头 85–260 秒的对话主题，再与该套真题听力第一题的选项逐条比对。
结论：**绝大多数对得上，发现 3 处错配，已处理 2 处、撤下 1 处。**

| 考次 | 问题 | 处理 |
| --- | --- | --- |
| 2017-06 | 来源站给的三个文件其实是 2017-12 的录音（字节完全相同） | 已撤下，点击提示暂缺 |
| 2021-12 | 第 1 套拿到的是第 2 套的录音（摔伤 vs 环保书） | 两个文件已对调 |
| 2023-12 | 第 1 套拿到的是第 2 套的录音（体检 vs 房车旅行） | 两个文件已对调 |

其余考次核验通过，明细见下表「核验」列。2015–2016 年共 12 套来源站没有音频，2017-06 已撤下，合计 15 套暂缺。

## 二、为什么 76 套只有 %d 段录音

六级每个考次全国只考 **2 套听力**，第三套与第一套或第二套相同，只是选项顺序不同。真题 PDF 里写明：

- 2026-06 第三套：`由于多题多卷，官方第三套真题的听力试题与第一套真题的一致，只是选项顺序不同，因此本套试卷不再提供听力部分。`
- 2017-12 第三套：`由于 2017 年12月六级考试全国共考了 2 套听力，本套听力试题同第1套或第2套试题一致。`

所以出现 `xxx-cet6-3.mp3` 不矛盾，它是第三套播放时引用的同一段录音。

## 三、使用规则

1. 文件名 = 试卷 slug，扩展名按真实容器决定（`.mp3` / `.m4a`）。
2. 换音频后重跑 `_source/build_audio_manifest.py` 更新 `assets/js/audio-manifest.js`。
3. 清单写 `null` 的试卷，点击后立即提示「该套听力音频暂缺」，不会联网空等。

## 四、已有音频（%d 套 / %d 段，其中 %d 处已修正）

| slug | 试卷 | 本地文件 | 时长 | 核验 | 备注 |
| --- | --- | --- | --- | --- | --- |
""" % (len(rows_out), uniq, uniq, len(rows_out), uniq, fixed)

tail = """

## 五、暂缺音频（%d 套）

| slug | 试卷 | 本地文件 | 说明 |
| --- | --- | --- | --- |
%s

## 六、来源与说明

- 音频取自「午后书真题」（iget100.wuhoushu.com）试卷页内嵌直链：`image.iget100.com/100/exams/{slug}/listening*.mp3`。
- 该站 `.mp3` 文件里约一半实际是 MP4/M4A 容器，已按文件头改名，避免 MIME 不匹配。
- 音频仅用于个人备考，请勿二次分发。
""" % (len(miss), "\n".join(miss))

open(os.path.join(AUD, "放置说明.md"), "w", encoding="utf-8", newline="\n").write(head + "\n".join(rows_out) + tail)
print("有音频 %d，缺 %d，唯一录音 %d，修正 %d" % (len(rows_out), len(miss), uniq, fixed))
