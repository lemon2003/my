# 检测 assets/audio 下每个文件真实容器，纠正扩展名，并输出时长/码率核对表
import os, glob, json, struct

AUD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "audio")


def kind(b):
    if b[4:8] == b"ftyp":
        return "m4a"
    if b[:3] == b"ID3":
        return "mp3"
    if b[0] == 0xFF and (b[1] & 0xE0) == 0xE0:
        return "mp3"
    if b[:4] == b"OggS":
        return "ogg"
    if b[:4] == b"RIFF":
        return "wav"
    return "?"


def mp3_dur(path):
    with open(path, "rb") as f:
        b = f.read(300000)
    off = 0
    if b[:3] == b"ID3":
        sz = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]
        off = 10 + sz
    i = off
    while i < len(b) - 4:
        if b[i] == 0xFF and (b[i + 1] & 0xE0) == 0xE0 and (b[i + 2] & 0xF0) != 0xF0:
            break
        i += 1
    if i >= len(b) - 4:
        return 0, "?"
    h = int.from_bytes(b[i : i + 4], "big")
    ver = (h >> 19) & 3
    layer = (h >> 17) & 3
    br = (h >> 12) & 15
    sr = (h >> 10) & 3
    table = {
        1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
        2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    }
    brv = (table[1] if layer == 1 else table[2])[br]
    srv = [44100, 48000, 32000][sr] if sr < 3 else 0
    size = os.path.getsize(path) - off
    dur = size * 8 / (brv * 1000) if brv else 0
    return dur, "mp3 %dkbps %dHz L%d" % (brv, srv, 4 - layer)


def m4a_dur(path):
    with open(path, "rb") as f:
        data = f.read()
    i = data.find(b"mvhd")
    if i < 0:
        return 0, "m4a ?"
    ver = data[i + 4]
    if ver == 0:
        ts = struct.unpack(">I", data[i + 16 : i + 20])[0]
        du = struct.unpack(">I", data[i + 20 : i + 24])[0]
    else:
        ts = struct.unpack(">I", data[i + 24 : i + 28])[0]
        du = struct.unpack(">Q", data[i + 28 : i + 36])[0]
    return (du / ts if ts else 0), "m4a"


rows = []
for p in sorted(glob.glob(os.path.join(AUD, "*.*"))):
    if p.lower().endswith(".md"):
        continue
    with open(p, "rb") as f:
        head = f.read(16)
    k = kind(head)
    dur, desc = (m4a_dur(p) if k == "m4a" else mp3_dur(p))
    base = os.path.splitext(p)[0]
    tgt = base + "." + k
    if os.path.abspath(p) != os.path.abspath(tgt):
        if os.path.exists(tgt):
            os.remove(tgt)
        os.rename(p, tgt)
    rows.append({"slug": os.path.basename(base), "ext": k, "minutes": round(dur / 60, 1), "desc": desc})

json.dump(rows, open("/tmp/audio_info.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("共 %d 个" % len(rows))
bad = [r for r in rows if r["minutes"] < 20]
for r in rows:
    flag = "  <-- 异常" if r["minutes"] < 20 else ""
    print("%-14s %-4s %5.1f 分钟  %s%s" % (r["slug"], r["ext"], r["minutes"], r["desc"], flag))
print("偏短条数：", len(bad))
