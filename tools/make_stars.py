# 把耶鲁亮星星表（BSC5，约 9100 颗肉眼可见恒星）压成二进制：每颗 8 字节
# int16 x,y,z（赤道坐标单位向量 ×32767）+ uint8 星等（(V+2)*20）+ uint8 色温（K/100，封顶 255）
import json, math, struct, sys, re
src, out = sys.argv[1], sys.argv[2]
def ang(s, h=False):
    nums = [float(x) for x in re.findall(r'[-+]?\d+(?:\.\d+)?', s)]
    sign = -1 if s.strip().startswith('-') else 1
    v = abs(nums[0]) + nums[1] / 60 + nums[2] / 3600
    return v * 15 if h else sign * v
rows = json.load(open(src))
buf = bytearray(); n = 0
for r in rows:
    if 'V' not in r or 'RA' not in r: continue
    ra, dec, v = math.radians(ang(r['RA'], True)), math.radians(ang(r['Dec'])), float(r['V'])
    k = float(r.get('K') or 6000)
    x, y, z = math.cos(dec) * math.cos(ra), math.sin(dec), -math.cos(dec) * math.sin(ra)
    buf += struct.pack('<hhhBB', round(x * 32767), round(y * 32767), round(z * 32767), max(0, min(255, round((v + 2) * 20))), max(1, min(255, round(k / 100))))
    n += 1
open(out, 'wb').write(bytes(buf))
print(n, 'stars', len(buf), 'bytes')
