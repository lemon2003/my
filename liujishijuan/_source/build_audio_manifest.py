# 生成 assets/js/audio-manifest.js：记录每套试卷的本地音频路径，缺的显式写 null
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = os.path.join(ROOT, "assets", "audio")

src = open(os.path.join(ROOT, "assets", "js", "data.js"), encoding="utf-8").read()
slugs = list(dict.fromkeys(re.findall(r'"slug": "(\d{4}-\d{2}-cet6-[\d]+)"', src)))

found = {}
for f in os.listdir(AUD):
    stem, ext = os.path.splitext(f)
    if ext.lower() in (".mp3", ".m4a", ".wav", ".ogg"):
        found[stem] = "assets/audio/" + f

lines = [
    "// 由 _source/build_audio_manifest.py 生成，请勿手改",
    "// 值 = 本地音频相对路径；null = 本地与原站都没有该套听力音频",
    "window.CET6_AUDIO = {",
]
for s in sorted(slugs):
    v = found.get(s)
    lines.append('  "%s": %s,' % (s, '"%s"' % v if v else "null"))
lines.append("};")
out = os.path.join(ROOT, "assets", "js", "audio-manifest.js")
open(out, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print("写入 %s：有音频 %d，缺 %d" % (out, sum(1 for s in slugs if found.get(s)), sum(1 for s in slugs if not found.get(s))))
