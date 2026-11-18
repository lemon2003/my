# 从 MP3 切出前 N 秒（按帧边界切，不改码率、不重编码），用于抽样核对内容
import os, sys

BR = {
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],  # Layer III
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
SR = {0: 44100, 1: 48000, 2: 32000, 3: 0}


def frames(path):
    data = open(path, "rb").read()
    off = 0
    if data[:3] == b"ID3":
        sz = (data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]
        off = 10 + sz
    i = off
    out = []
    while i < len(data) - 4:
        if not (data[i] == 0xFF and (data[i + 1] & 0xE0) == 0xE0):
            i += 1
            continue
        h = int.from_bytes(data[i : i + 4], "big")
        ver = (h >> 19) & 3
        layer = (h >> 17) & 3
        br = (h >> 12) & 15
        sr = (h >> 10) & 3
        pad = (h >> 9) & 1
        if ver != 3 or layer != 1 or br == 0 or br == 15 or sr == 3:
            i += 1
            continue
        bitrate = BR[1][br] * 1000
        rate = SR[sr]
        size = int(144 * bitrate / rate) + pad
        if i + size > len(data):
            break
        out.append((i, size, 1152 / rate))
        i += size
    return data, out


def cut(src, dst, seconds):
    data, fs = frames(src)
    t = 0.0
    buf = []
    for off, size, dur in fs:
        if t >= seconds:
            break
        buf.append(data[off : off + size])
        t += dur
    open(dst, "wb").write(b"".join(buf))
    return len(buf), t


if __name__ == "__main__":
    src, dst, sec = sys.argv[1], sys.argv[2], float(sys.argv[3])
    n, t = cut(src, dst, sec)
    print("%s -> %s  %d 帧 / %.1f 秒 / %.2f MB" % (src, dst, n, t, os.path.getsize(dst) / 1048576))
