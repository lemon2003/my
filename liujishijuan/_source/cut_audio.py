# 用 PyAV 从任意格式音频切出前 N 秒，统一输出 16k 单声道 mp3，供语音转写核对
import os, sys, glob, hashlib, json

import av

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = os.path.join(ROOT, "assets", "audio")
OUT = os.path.join(ROOT, "_chk")
os.makedirs(OUT, exist_ok=True)


def cut(src, dst, seconds=85):
    inp = av.open(src)
    stream = inp.streams.audio[0]
    out = av.open(dst, "w", format="mp3")
    ost = out.add_stream("mp3", rate=16000)
    ost.layout = "mono"
    ost.bit_rate = 48000
    resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
    total = 0.0
    for frame in inp.decode(stream):
        if total > seconds:
            break
        total += float(frame.samples) / frame.sample_rate
        for rf in resampler.resample(frame):
            for pkt in ost.encode(rf):
                out.mux(pkt)
    for rf in resampler.resample(None):
        for pkt in ost.encode(rf):
            out.mux(pkt)
    for pkt in ost.encode(None):
        out.mux(pkt)
    out.close()
    inp.close()
    return total


if __name__ == "__main__":
    files = sorted(glob.glob(os.path.join(AUD, "*.mp3")) + glob.glob(os.path.join(AUD, "*.m4a")))
    seen = {}
    for p in files:
        h = hashlib.md5(open(p, "rb").read()).hexdigest()
        seen.setdefault(h, []).append(p)
    reps = []
    for h, ps in sorted(seen.items(), key=lambda kv: kv[1][0]):
        reps.append(ps[0])
    print("唯一录音 %d 段" % len(reps))
    meta = []
    for p in reps:
        name = os.path.splitext(os.path.basename(p))[0]
        dst = os.path.join(OUT, name + ".mp3")
        if not os.path.exists(dst):
            cut(p, dst, 85)
        meta.append({"slug": name, "clip": dst, "size": os.path.getsize(dst)})
    json.dump(meta, open(os.path.join(OUT, "clips.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已切 %d 段，平均 %.0f KB" % (len(meta), sum(m["size"] for m in meta) / 1024 / len(meta)))
