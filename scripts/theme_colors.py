# 分析样式表里的颜色：换算到 OKLCH，按色相分类（开发用）。
import re, math, sys, collections

def srgb_to_lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lin_to_srgb(c):
    c = max(0.0, min(1.0, c))
    v = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return round(max(0, min(1, v)) * 255)

def rgb_to_oklch(r, g, b):
    r, g, b = srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    C = math.hypot(a, bb)
    H = math.degrees(math.atan2(bb, a)) % 360
    return L, C, H

def oklch_to_rgb(L, C, H):
    a = C * math.cos(math.radians(H))
    b = C * math.sin(math.radians(H))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return r, g, bl

def in_gamut(rgb):
    return all(-1e-4 <= c <= 1 + 1e-4 for c in rgb)

def oklch_to_hex(L, C, H):
    # 超出 sRGB 就降低彩度
    lo, hi = 0.0, C
    rgb = oklch_to_rgb(L, C, H)
    if not in_gamut(rgb):
        for _ in range(30):
            mid = (lo + hi) / 2
            if in_gamut(oklch_to_rgb(L, mid, H)): lo = mid
            else: hi = mid
        rgb = oklch_to_rgb(L, lo, H)
    return tuple(lin_to_srgb(c) for c in rgb)

HEX = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
RGBA = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)')

def parse_hex(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

if __name__ == '__main__':
    counts = collections.Counter()
    for path in sys.argv[1:]:
        css = open(path).read()
        for m in HEX.finditer(css): counts[parse_hex(m.group(0))] += 1
        for m in RGBA.finditer(css): counts[(int(m.group(1)), int(m.group(2)), int(m.group(3)))] += 1
    rows = []
    for rgb, n in counts.items():
        L, C, H = rgb_to_oklch(*rgb)
        rows.append((H if C > 0.02 else -1, L, C, rgb, n))
    rows.sort()
    for H, L, C, rgb, n in rows:
        print(f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}  L={L:.2f} C={C:.3f} H={H:6.1f}  x{n}")
