# 生成「小窝的颜色」主题：
#   1. 把 home.css / pet.css 里粉色系的颜色换成 CSS 变量（--th-<原色>）
#   2. 生成 src/renderer/shared/theme.css：默认（樱花粉）是原色，其它主题在 OKLCH 里旋转色相得到
#   3. 生成 src/shared/themes.json：主题列表和标题栏颜色（主进程和设置页用；主题的名字在 locales/<语言>/data.json 里）
# 可以重复运行：已经换成变量的颜色会从 theme.css 里读回原色。
# 用法：python3 scripts/make-theme.py
import json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from theme_colors import rgb_to_oklch, oklch_to_hex, parse_hex

ROOT = os.path.join(os.path.dirname(__file__), '..')
CSS_FILES = ['src/renderer/home/home.css', 'src/renderer/pet/pet.css']
THEME_CSS = 'src/renderer/shared/theme.css'
THEMES_JSON = 'src/shared/themes.json'

# 目标色相（OKLCH，度）和彩度系数。樱花粉的主色 #ff7ea8 色相约 1°。
BASE_HUE = 1.1
THEMES = [
    ('sakura', '樱花粉', None, 1.0),
    ('peach', '蜜桃橘', 38, 0.95),
    ('butter', '奶油黄', 86, 0.85),
    ('mint', '薄荷绿', 166, 0.8),
    ('sky', '天空蓝', 246, 0.9),
    ('taro', '香芋紫', 300, 0.95),
]

# 这些规则里的颜色保持原样：爱心、信封火漆一直是粉红色
KEEP_SELECTORS = ('sb-heart', 'le-heart', 'env-seal', 'seal-heart', 'seal-glow', '.beat')

HEX6 = re.compile(r'#([0-9a-fA-F]{6})\b')
RGBA = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+\s*)?\)')
VAR_HEX = re.compile(r'var\(--th-([0-9a-f]{6})\)')
VAR_RGB = re.compile(r'rgba\(var\(--th-([0-9a-f]{6})-rgb\)')


def themed(rgb):
    L, C, H = rgb_to_oklch(*rgb)
    if C < 0.004:
        return False
    return H >= 330 or H <= 8


def rotate(rgb, theme):
    _, _, target, cf = theme
    if target is None:
        return rgb
    L, C, H = rgb_to_oklch(*rgb)
    return oklch_to_hex(L, C * cf, (H + target - BASE_HUE) % 360)


def hexs(rgb):
    return '#%02x%02x%02x' % rgb


def convert(css, used):
    out = []
    selector = ''
    in_decl = False

    def rep_hex(m):
        rgb = parse_hex(m.group(0))
        if not themed(rgb):
            return m.group(0)
        key = hexs(rgb)[1:]
        used.setdefault(key, set()).add('hex')
        return f'var(--th-{key})'

    def rep_rgba(m):
        rgb = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if not themed(rgb):
            return m.group(0)
        key = hexs(rgb)[1:]
        if m.group(4):
            used.setdefault(key, set()).add('rgb')
            return f'rgba(var(--th-{key}-rgb){m.group(4)})'
        used.setdefault(key, set()).add('hex')
        return f'var(--th-{key})'

    def sub(text):
        return RGBA.sub(rep_rgba, HEX6.sub(rep_hex, text))

    for line in css.split('\n'):
        stripped = line.strip()
        for m in VAR_HEX.finditer(line):
            used.setdefault(m.group(1), set()).add('hex')
        for m in VAR_RGB.finditer(line):
            used.setdefault(m.group(1), set()).add('rgb')
        keep = any(k in selector for k in KEEP_SELECTORS)
        if stripped.endswith('{'):
            if not line.startswith(' '):
                selector = stripped
            in_decl = False
        elif in_decl:
            # 跨行的值（比如多层阴影）
            if not keep:
                line = sub(line)
            in_decl = not stripped.endswith(';')
        elif ':' in stripped and not stripped.startswith('/*'):
            if not keep:
                name, _, value = line.partition(':')
                line = name + ':' + sub(value)
            in_decl = not stripped.endswith((';', '}'))
        out.append(line)
    return '\n'.join(out)


def main():
    used = {}
    for rel in CSS_FILES:
        path = os.path.join(ROOT, rel)
        css = open(path).read()
        new = convert(css, used)
        if new != css:
            open(path, 'w').write(new)
            print('updated', rel)
    keys = sorted(used)
    blocks = []
    for theme in THEMES:
        tid, name, _, _ = theme
        sel = ':root' if tid == 'sakura' else f":root[data-theme='{tid}']"
        lines = []
        for k in keys:
            rgb = rotate(parse_hex('#' + k), theme)
            if 'hex' in used[k]:
                lines.append(f'  --th-{k}: {hexs(rgb)};')
            if 'rgb' in used[k]:
                lines.append(f'  --th-{k}-rgb: {rgb[0]}, {rgb[1]}, {rgb[2]};')
        blocks.append(f'/* {name} */\n{sel} {{\n' + '\n'.join(lines) + '\n}')
    header = (
        '/* 由 scripts/make-theme.py 生成，不要手改。\n'
        '   变量名里的十六进制是樱花粉主题下的原色；其它主题在 OKLCH 里旋转色相得到。 */\n\n'
    )
    open(os.path.join(ROOT, THEME_CSS), 'w').write(header + '\n\n'.join(blocks) + '\n')
    meta = []
    for theme in THEMES:
        tid, name, _, _ = theme
        meta.append({
            'id': tid,
            'swatch': hexs(rotate((0xFF, 0x7E, 0xA8), theme)),
            'light': hexs(rotate((0xFF, 0xE6, 0xEF), theme)),
            'header': hexs(rotate((0xFF, 0xF6, 0xF8), theme)),
            'symbol': hexs(rotate((0x8A, 0x6A, 0x7A), theme)),
        })
    open(os.path.join(ROOT, THEMES_JSON), 'w').write(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    print(len(keys), 'theme colors,', len(THEMES), 'themes')


if __name__ == '__main__':
    main()
