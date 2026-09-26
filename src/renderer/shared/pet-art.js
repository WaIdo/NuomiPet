// 宠物形象：用 SVG 画出来的「团子」身体 + 各物种的耳朵/尾巴/五官 + 配饰。
// 坐标系固定为 viewBox 0 0 200 200，地面在 y=186。
import catalog from '../../shared/catalog.json' with { type: 'json' };

export const CATALOG = catalog;

const byId = (list, id) => list.find((x) => x.id === id) || list[0];

export function getPalette(id) {
  return { ink: '#4A3237', eye: '#3A2A2E', pupil: null, ...byId(catalog.palettes, id) };
}

// ---------- 颜色工具 ----------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const f = (n) => Number(n.toFixed(2));

// ---------- 几何 ----------
const BLOBS = {
  default: 'M100,56 C146,56 176,92 176,136 C176,168 158,186 124,186 L76,186 C42,186 24,168 24,136 C24,92 54,56 100,56 Z',
  hamster: 'M100,60 C146,60 181,94 182,140 C183,170 160,186 126,186 L74,186 C40,186 17,170 18,140 C19,94 54,60 100,60 Z',
  chick: 'M100,48 C139,48 168,94 169,140 C170,170 150,186 122,186 L78,186 C50,186 31,170 31,140 C32,94 61,48 100,48 Z',
};

const EYE_L = [76, 122];
const EYE_R = [124, 122];

// 每个物种的爪子静止位置（front paws）
export const PAW_REST = {
  default: { l: [80, 180], r: [120, 180] },
  chick: { l: [34, 146], r: [166, 146] },
};

function heartPath(cx, cy, s) {
  const p = (x, y) => `${f(cx + x * s)},${f(cy + y * s)}`;
  return `M${p(0, 0.42)} C${p(-0.08, 0.36)} ${p(-0.52, 0.08)} ${p(-0.52, -0.18)} C${p(-0.52, -0.42)} ${p(-0.24, -0.52)} ${p(0, -0.3)} C${p(0.24, -0.52)} ${p(0.52, -0.42)} ${p(0.52, -0.18)} C${p(0.52, 0.08)} ${p(0.08, 0.36)} ${p(0, 0.42)} Z`;
}

function spiralPath(cx, cy, turns = 2.3, rMax = 8.5) {
  const pts = [];
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = 0.6 + t * (rMax - 0.6);
    pts.push(`${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r)}`);
  }
  return 'M' + pts.join(' L');
}

const mirrorX = (d) =>
  // 只用于由绝对坐标 M/L/C/Q/Z 组成的 path：把 x 坐标镜像到 200-x
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${f(200 - parseFloat(x))},${y}`);

// ---------- 各部位 ----------
function earsBack(species, P, stroke) {
  const inner = P.inner;
  switch (species) {
    case 'cat': {
      const outer = 'M33,110 Q31,72 43,46 Q48,36 57,41 Q77,53 92,70 Z';
      const inn = 'M45,92 Q45,70 51,55 Q54,50 58,53 Q70,61 79,71 Z';
      return `
        <g class="ear ear-l" style="transform-origin:62px 86px">
          <path class="hit" d="${outer}" fill="${P.body}" ${stroke}/>
          <path d="${inn}" fill="${inner}"/>
        </g>
        <g class="ear ear-r" style="transform-origin:138px 86px">
          <path class="hit" d="${mirrorX(outer)}" fill="${P.body}" ${stroke}/>
          <path d="${mirrorX(inn)}" fill="${inner}"/>
        </g>`;
    }
    case 'bunny':
      return `
        <g class="ear ear-l" style="transform-origin:76px 74px">
          <ellipse class="hit" cx="72" cy="36" rx="14.5" ry="38" transform="rotate(-9 72 36)" fill="${P.body}" ${stroke}/>
          <ellipse cx="72.5" cy="39" rx="7.4" ry="28" transform="rotate(-9 72 36)" fill="${inner}"/>
        </g>
        <g class="ear ear-r" style="transform-origin:124px 74px">
          <ellipse class="hit" cx="128" cy="36" rx="14.5" ry="38" transform="rotate(9 128 36)" fill="${P.body}" ${stroke}/>
          <ellipse cx="127.5" cy="39" rx="7.4" ry="28" transform="rotate(9 128 36)" fill="${inner}"/>
        </g>`;
    case 'bear':
      return `
        <g class="ear ear-l" style="transform-origin:56px 80px">
          <circle class="hit" cx="50" cy="72" r="18" fill="${P.body}" ${stroke}/>
          <circle cx="51" cy="73" r="9.5" fill="${inner}"/>
        </g>
        <g class="ear ear-r" style="transform-origin:144px 80px">
          <circle class="hit" cx="150" cy="72" r="18" fill="${P.body}" ${stroke}/>
          <circle cx="149" cy="73" r="9.5" fill="${inner}"/>
        </g>`;
    case 'hamster':
      return `
        <g class="ear ear-l" style="transform-origin:58px 80px">
          <ellipse class="hit" cx="52" cy="72" rx="13" ry="12" fill="${P.body}" ${stroke}/>
          <ellipse cx="53" cy="73" rx="7" ry="6.5" fill="${inner}"/>
        </g>
        <g class="ear ear-r" style="transform-origin:142px 80px">
          <ellipse class="hit" cx="148" cy="72" rx="13" ry="12" fill="${P.body}" ${stroke}/>
          <ellipse cx="147" cy="73" rx="7" ry="6.5" fill="${inner}"/>
        </g>`;
    default:
      return '';
  }
}

function earsFront(species, P, stroke) {
  if (species === 'puppy') {
    const ear = 'M60,64 C41,60 25,84 27,112 C28,127 43,131 50,118 C57,104 61,86 70,71 Z';
    const fill = mix(P.body2, P.line, 0.3);
    return `
      <g class="ear ear-l" style="transform-origin:62px 68px">
        <path class="hit" d="${ear}" fill="${fill}" ${stroke}/>
      </g>
      <g class="ear ear-r" style="transform-origin:138px 68px">
        <path class="hit" d="${mirrorX(ear)}" fill="${fill}" ${stroke}/>
      </g>`;
  }
  if (species === 'chick') {
    // 头顶的小呆毛
    return `
      <g class="ear tuft" style="transform-origin:100px 52px">
        <path class="hit" d="M100,51 C95,40 97,31 104,28 C101,36 103,44 100,51 Z" fill="${P.body}" ${stroke}/>
        <path class="hit" d="M100,51 C104,42 110,38 116,39 C110,42 105,47 100,51 Z" fill="${P.body}" ${stroke}/>
      </g>`;
  }
  return '';
}

function tail(species, P, stroke, lineW) {
  switch (species) {
    case 'cat': {
      const d = 'M154,180 C182,182 197,166 194,146 C192,134 186,126 188,116 C190,107 199,105 202,112';
      return `<g class="p-tail" style="transform-origin:156px 180px">
        <path class="hit" d="${d}" fill="none" stroke="${P.line}" stroke-width="${10 + lineW * 2}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="${P.body2}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`;
    }
    case 'puppy': {
      const d = 'M160,178 C184,178 197,164 193,149 C191,140 182,138 180,145 C179,151 186,154 190,149';
      return `<g class="p-tail wag" style="transform-origin:160px 178px">
        <path class="hit" d="${d}" fill="none" stroke="${P.line}" stroke-width="${10 + lineW * 2}" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="${P.body2}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`;
    }
    case 'bunny':
      return `<g class="p-tail puff" style="transform-origin:170px 170px">
        <circle class="hit" cx="174" cy="166" r="13" fill="${P.belly}" ${stroke}/>
      </g>`;
    case 'bear':
      return `<g class="p-tail" style="transform-origin:170px 172px">
        <circle class="hit" cx="173" cy="170" r="9" fill="${P.body2}" ${stroke}/>
      </g>`;
    case 'chick':
      return `<g class="p-tail" style="transform-origin:164px 170px">
        <path class="hit" d="M160,166 L183,158 L176,168 L186,172 L162,178 Z" fill="${P.body2}" ${stroke} stroke-linejoin="round"/>
      </g>`;
    default:
      return '';
  }
}

function markings(kind, species, P, clipId) {
  const clip = `clip-path="url(#${clipId})"`;
  let out = '';
  if (species === 'bear') {
    out += `<ellipse cx="100" cy="137" rx="17" ry="12" fill="${P.belly}" opacity=".95"/>`;
  }
  if (species === 'hamster') {
    out += `<path d="M18,150 C30,126 62,120 100,128 C138,120 170,126 182,150 L182,190 L18,190 Z" fill="${P.belly}" ${clip}/>`;
  }
  switch (kind) {
    case 'belly':
      out += `<ellipse cx="100" cy="166" rx="40" ry="24" fill="${P.belly}" ${clip}/>`;
      break;
    case 'stripes': {
      const c = mix(P.body2, P.line, 0.55);
      out += `<g fill="${c}" opacity=".7" ${clip}>
        <path d="M96,54 Q100,80 104,54 Z"/>
        <path d="M81,59 Q88,78 90,58 Z"/>
        <path d="M119,59 Q112,78 110,58 Z"/>
        <path d="M22,128 Q36,131 41,126 Q34,124 22,122 Z"/>
        <path d="M22,142 Q36,144 40,139 Q33,138 22,136 Z"/>
        <path d="M178,128 Q164,131 159,126 Q166,124 178,122 Z"/>
        <path d="M178,142 Q164,144 160,139 Q167,138 178,136 Z"/>
      </g>`;
      break;
    }
    case 'patch': {
      const c = mix(P.body2, P.line, 0.45);
      out += `<path d="M104,98 C112,82 140,80 152,94 C162,106 156,128 140,134 C124,138 106,130 103,116 C102,110 102,104 104,98 Z" fill="${c}" opacity=".85" ${clip}/>`;
      break;
    }
    default:
      break;
  }
  return out;
}

function eyes(P, uid) {
  const ink = P.ink;
  const stroke = `fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"`;
  const normalEye = ([cx, cy], side) => {
    const pupil = P.pupil
      ? `<ellipse cx="${cx}" cy="${cy + 0.5}" rx="3.6" ry="7.6" fill="${P.pupil}"/>`
      : '';
    return `<g class="eye eye-${side}">
      <ellipse cx="${cx}" cy="${cy}" rx="8.8" ry="11" fill="url(#pe-${uid})"/>
      ${pupil}
      <circle cx="${cx - 2.9}" cy="${cy - 4.3}" r="3.7" fill="#fff"/>
      <circle cx="${cx + 3.2}" cy="${cy + 4.6}" r="1.7" fill="#fff" opacity=".9"/>
    </g>`;
  };
  const arcUp = ([cx, cy]) => `<path d="M${cx - 8.5},${cy + 3} Q${cx},${cy - 9} ${cx + 8.5},${cy + 3}" ${stroke}/>`;
  const arcDown = ([cx, cy]) => `<path d="M${cx - 8.5},${cy - 1} Q${cx},${cy + 8} ${cx + 8.5},${cy - 1}" ${stroke}/>`;
  const surprised = ([cx, cy]) => `
      <circle cx="${cx}" cy="${cy}" r="10" fill="#fff" stroke="${ink}" stroke-width="2.6"/>
      <circle cx="${cx}" cy="${cy + 0.5}" r="3.6" fill="${ink}"/>`;
  const heart = ([cx, cy]) => `
      <path d="${heartPath(cx, cy + 1, 24)}" fill="#FF5C8D" stroke="#E43F74" stroke-width="1.2"/>
      <ellipse cx="${cx - 5}" cy="${cy - 3}" rx="2.6" ry="2" fill="#fff" opacity=".85"/>`;
  const [lx, ly] = EYE_L;
  const [rx, ry] = EYE_R;
  return `
    <g class="eye-set eyes-normal">${normalEye(EYE_L, 'l')}${normalEye(EYE_R, 'r')}</g>
    <g class="eye-set eyes-happy">${arcUp(EYE_L)}${arcUp(EYE_R)}</g>
    <g class="eye-set eyes-closed">${arcDown(EYE_L)}${arcDown(EYE_R)}</g>
    <g class="eye-set eyes-surprised">${surprised(EYE_L)}${surprised(EYE_R)}</g>
    <g class="eye-set eyes-squeeze">
      <path d="M${lx - 7},${ly - 7} L${lx + 6},${ly} L${lx - 7},${ly + 7}" ${stroke}/>
      <path d="M${rx + 7},${ry - 7} L${rx - 6},${ry} L${rx + 7},${ry + 7}" ${stroke}/>
    </g>
    <g class="eye-set eyes-heart">${heart(EYE_L)}${heart(EYE_R)}</g>
    <g class="eye-set eyes-dizzy">
      <path d="${spiralPath(lx, ly)}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="${spiralPath(rx, ry)}" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>
    </g>
    <g class="eye-set eyes-wink">${normalEye(EYE_L, 'l')}${arcUp(EYE_R)}</g>
    <g class="eye-set eyes-sad">
      ${normalEye([lx, ly + 1], 'l')}${normalEye([rx, ry + 1], 'r')}
      <path d="M${lx - 10},${ly - 13} Q${lx - 1},${ly - 19} ${lx + 8},${ly - 19}" ${stroke} stroke-width="2.6"/>
      <path d="M${rx + 10},${ry - 13} Q${rx + 1},${ry - 19} ${rx - 8},${ry - 19}" ${stroke} stroke-width="2.6"/>
      <path class="tear" d="M${rx + 9},${ry + 9} q-4.5,6.5 0,9.5 q4.5,-3 0,-9.5 z" fill="#9CD6FF" stroke="#6FB8EC" stroke-width="1"/>
    </g>
    <g class="eye-set eyes-sleepy">
      <path d="M${lx - 9},${ly + 1} L${lx + 9},${ly + 1}" ${stroke}/>
      <path d="M${rx - 9},${ry + 1} L${rx + 9},${ry + 1}" ${stroke}/>
      <path d="M${lx - 8},${ly + 1} Q${lx},${ly + 7} ${lx + 8},${ly + 1}" fill="url(#pe-${uid})" opacity=".9"/>
      <path d="M${rx - 8},${ry + 1} Q${rx},${ry + 7} ${rx + 8},${ry + 1}" fill="url(#pe-${uid})" opacity=".9"/>
    </g>`;
}

function mouths(species, P) {
  const ink = P.ink;
  const line = `fill="none" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"`;
  const inside = '#B8475A';
  const tongue = '#FF8FA8';
  if (species === 'chick') {
    const beak = '#FFB443';
    const beakLine = '#E58E2C';
    return `
      <g class="mouth m-cat m-smile m-flat m-wavy m-tongue">
        <path d="M92,131 Q100,126 108,131 Q101,140 100,140 Q99,140 92,131 Z" fill="${beak}" stroke="${beakLine}" stroke-width="1.8" stroke-linejoin="round"/>
      </g>
      <g class="mouth m-open m-o m-yawn">
        <path d="M91,130 Q100,124 109,130 Q100,133 91,130 Z" fill="${beak}" stroke="${beakLine}" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M93,134 Q100,132 107,134 Q101,143 100,143 Q99,143 93,134 Z" fill="${beak}" stroke="${beakLine}" stroke-width="1.8" stroke-linejoin="round"/>
      </g>
      <g class="mouth m-chew">
        <g class="chew-a"><path d="M92,131 Q100,126 108,131 Q101,140 100,140 Q99,140 92,131 Z" fill="${beak}" stroke="${beakLine}" stroke-width="1.8"/></g>
        <g class="chew-b"><path d="M91,130 Q100,124 109,130 Q100,133 91,130 Z" fill="${beak}" stroke="${beakLine}" stroke-width="1.8"/><path d="M93,134 Q100,132 107,134 Q101,142 100,142 Q99,142 93,134 Z" fill="${beak}" stroke="${beakLine}" stroke-width="1.8"/></g>
      </g>`;
  }
  const y = species === 'bear' ? 2 : 0;
  const cat = `M91,${134.5 + y} Q95.5,${140 + y} 100,${135.5 + y} Q104.5,${140 + y} 109,${134.5 + y}`;
  return `
    <path class="mouth m-cat" d="${cat}" ${line}/>
    <path class="mouth m-smile" d="M94,${135 + y} Q100,${141 + y} 106,${135 + y}" ${line}/>
    <g class="mouth m-open">
      <path d="M91.5,${133.5 + y} Q100,${135 + y} 108.5,${133.5 + y} Q107,${147 + y} 100,${147 + y} Q93,${147 + y} 91.5,${133.5 + y} Z" fill="${inside}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M94.5,${142.5 + y} Q100,${139 + y} 105.5,${142.5 + y} Q104,${146.5 + y} 100,${146.5 + y} Q96,${146.5 + y} 94.5,${142.5 + y} Z" fill="${tongue}"/>
    </g>
    <ellipse class="mouth m-o" cx="100" cy="${139.5 + y}" rx="3.8" ry="4.4" fill="${inside}" stroke="${ink}" stroke-width="1.6"/>
    <path class="mouth m-flat" d="M95,${137.5 + y} L105,${137.5 + y}" ${line}/>
    <path class="mouth m-wavy" d="M90,${139 + y} Q95,${135 + y} 100,${139 + y} Q105,${143 + y} 110,${139 + y}" ${line}/>
    <g class="mouth m-tongue">
      <ellipse cx="104" cy="${140.5 + y}" rx="3.4" ry="4.4" fill="${tongue}" stroke="${ink}" stroke-width="1.4"/>
      <path d="${cat}" ${line}/>
    </g>
    <g class="mouth m-yawn">
      <ellipse cx="100" cy="${141 + y}" rx="6.5" ry="8.5" fill="${inside}" stroke="${ink}" stroke-width="2"/>
      <ellipse cx="100" cy="${145.5 + y}" rx="3.8" ry="3" fill="${tongue}"/>
    </g>
    <g class="mouth m-chew">
      <path class="chew-a" d="${cat}" ${line}/>
      <ellipse class="chew-b" cx="100" cy="${139 + y}" rx="3.2" ry="3.6" fill="${inside}" stroke="${ink}" stroke-width="1.5"/>
    </g>`;
}

function nose(species, P) {
  switch (species) {
    case 'bear':
      return `<ellipse cx="100" cy="130.5" rx="5.6" ry="4" fill="${P.ink}"/><ellipse cx="98.2" cy="129.3" rx="1.8" ry="1.1" fill="#fff" opacity=".7"/>`;
    case 'puppy':
      return `<ellipse cx="100" cy="129.5" rx="5.6" ry="4.1" fill="${P.ink}"/><ellipse cx="98.2" cy="128.2" rx="1.9" ry="1.1" fill="#fff" opacity=".7"/>`;
    case 'chick':
      return '';
    default:
      return `<path d="M96.6,128.2 Q100,126.3 103.4,128.2 Q101.8,131.9 100,132.1 Q98.2,131.9 96.6,128.2 Z" fill="${P.nose}"/>`;
  }
}

function whiskers(species, P) {
  if (species !== 'cat' && species !== 'hamster') return '';
  const c = P.pupil ? mix(P.line, '#ffffff', 0.45) : P.line;
  const a = 'M36,127 L53,130.5 M36,136.5 L53,136.5';
  return `<g class="p-whiskers" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" opacity=".75">
    <path d="${a}"/><path d="${mirrorX(a)}"/>
  </g>`;
}

function paws(species, P, stroke) {
  if (species === 'chick') {
    // 小翅膀 + 橙色小脚
    const wing = (cx, cy, rot) =>
      `<ellipse class="hit" cx="${cx}" cy="${cy}" rx="10" ry="17" transform="rotate(${rot} ${cx} ${cy})" fill="${P.body2}" ${stroke}/>`;
    return `
      <g class="feet" fill="#FFB443" stroke="#E58E2C" stroke-width="1.8">
        <ellipse cx="82" cy="186" rx="9" ry="4.6"/>
        <ellipse cx="118" cy="186" rx="9" ry="4.6"/>
      </g>
      <g class="paw paw-l"><g class="paw-in">${wing(34, 146, 18)}</g></g>
      <g class="paw paw-r"><g class="paw-in">${wing(166, 146, -18)}</g></g>`;
  }
  const { l, r } = PAW_REST.default;
  const paw = ([cx, cy]) => `
    <ellipse class="hit" cx="${cx}" cy="${cy}" rx="11.5" ry="8.4" fill="${P.body}" ${stroke}/>
    <path d="M${cx - 3.2},${cy + 3.2} v2.6 M${cx + 3.2},${cy + 3.2} v2.6" stroke="${P.line}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
  return `
    <g class="paw paw-l"><g class="paw-in">${paw(l)}</g></g>
    <g class="paw paw-r"><g class="paw-in">${paw(r)}</g></g>`;
}

function accessory(kind, species) {
  const top = species === 'chick' ? 50 : species === 'hamster' ? 62 : 56;
  switch (kind) {
    case 'bow': {
      const [x, y] = species === 'bunny' ? [132, 70] : [138, top + 12];
      return `<g class="acc acc-bow" transform="translate(${x} ${y}) rotate(16)">
        <path d="M0,0 C-7,-12 -22,-13 -22,-2 C-22,9 -7,9 0,0 Z" fill="#FF8FB5" stroke="#E0648F" stroke-width="2" stroke-linejoin="round"/>
        <path d="M0,0 C7,-12 22,-13 22,-2 C22,9 7,9 0,0 Z" fill="#FF8FB5" stroke="#E0648F" stroke-width="2" stroke-linejoin="round"/>
        <path d="M-15,-3 Q-10,-1 -6,0 M15,-3 Q10,-1 6,0" stroke="#E0648F" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>
        <circle cx="0" cy="0" r="5" fill="#FF6F9E" stroke="#E0648F" stroke-width="1.8"/>
        <circle cx="-1.4" cy="-1.6" r="1.4" fill="#fff" opacity=".8"/>
      </g>`;
    }
    case 'flower': {
      const [x, y] = species === 'bunny' ? [131, 70] : [137, top + 10];
      const petals = [0, 72, 144, 216, 288]
        .map((a) => {
          const rad = ((a - 90) * Math.PI) / 180;
          return `<circle cx="${f(Math.cos(rad) * 7.5)}" cy="${f(Math.sin(rad) * 7.5)}" r="6.6" fill="#FFC3D7" stroke="#F095B6" stroke-width="1.5"/>`;
        })
        .join('');
      return `<g class="acc acc-flower" transform="translate(${x} ${y}) rotate(12)">
        ${petals}
        <circle r="4.8" fill="#FFD66B" stroke="#EDB23F" stroke-width="1.4"/>
        <circle cx="-1.3" cy="-1.3" r="1.3" fill="#fff" opacity=".8"/>
      </g>`;
    }
    case 'sprout':
      return `<g class="acc acc-sprout" style="transform-origin:100px ${top + 2}px">
        <path d="M100,${top + 2} C100,${top - 6} 100,${top - 10} 101,${top - 14}" stroke="#5DAE66" stroke-width="3.2" fill="none" stroke-linecap="round"/>
        <path d="M101,${top - 13} C92,${top - 23} 81,${top - 19} 83,${top - 12} C86,${top - 7} 95,${top - 8} 101,${top - 13} Z" fill="#8ED993" stroke="#5DAE66" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M101,${top - 13} C108,${top - 25} 121,${top - 23} 119,${top - 15} C116,${top - 9} 107,${top - 9} 101,${top - 13} Z" fill="#8ED993" stroke="#5DAE66" stroke-width="1.8" stroke-linejoin="round"/>
      </g>`;
    case 'crown': {
      const y = top - 4;
      return `<g class="acc acc-crown" transform="rotate(-6 100 ${y})">
        <path d="M83,${y + 4} L85,${y - 13} L93,${y - 5} L100,${y - 18} L107,${y - 5} L115,${y - 13} L117,${y + 4} Q100,${y + 8} 83,${y + 4} Z" fill="#FFD76B" stroke="#E5A435" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="85" cy="${y - 13}" r="2.4" fill="#FF8FB5"/>
        <circle cx="100" cy="${y - 18}" r="2.8" fill="#8FD3FF"/>
        <circle cx="115" cy="${y - 13}" r="2.4" fill="#FF8FB5"/>
        <circle cx="100" cy="${y - 1}" r="3" fill="#FF6F9E" stroke="#E5A435" stroke-width="1"/>
      </g>`;
    }
    case 'partyhat': {
      const y = top + 2;
      return `<g class="acc acc-partyhat" transform="translate(118 ${y}) rotate(18)">
        <path d="M-15,2 L0,-34 L15,2 Q0,7 -15,2 Z" fill="#9FD8FF" stroke="#5FAEE0" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="-4" cy="-8" r="2.6" fill="#fff"/>
        <circle cx="5" cy="-16" r="2.2" fill="#FFD66B"/>
        <circle cx="-1" cy="-24" r="2" fill="#FF8FB5"/>
        <circle cx="7" cy="-3" r="2.4" fill="#FF8FB5"/>
        <circle cx="0" cy="-36" r="5.4" fill="#FF8FB5" stroke="#E0648F" stroke-width="1.6"/>
      </g>`;
    }
    case 'heartclip': {
      const [x, y] = species === 'bunny' ? [133, 72] : [139, top + 14];
      return `<g class="acc acc-heart" transform="rotate(14 ${x} ${y})">
        <path d="${heartPath(x, y, 22)}" fill="#FF6F9E" stroke="#E04E83" stroke-width="1.8"/>
        <ellipse cx="${x - 4.5}" cy="${y - 3.5}" rx="2.4" ry="1.8" fill="#fff" opacity=".8"/>
      </g>`;
    }
    case 'strawberry': {
      const y = top;
      const seeds = [
        [80, y + 14], [92, y + 8], [106, y + 8], [118, y + 14], [99, y + 17], [86, y + 20], [113, y + 20], [70, y + 19], [128, y + 19],
      ]
        .map(([sx, sy]) => `<ellipse cx="${sx}" cy="${sy}" rx="1.5" ry="2.2" fill="#FFE9A8"/>`)
        .join('');
      return `<g class="acc acc-strawberry">
        <path d="M58,${y + 26} C58,${y + 2} 78,${y - 10} 100,${y - 10} C122,${y - 10} 142,${y + 2} 142,${y + 26} C122,${y + 19} 78,${y + 19} 58,${y + 26} Z" fill="#FF6B81" stroke="#DE4B63" stroke-width="2.4" stroke-linejoin="round"/>
        ${seeds}
        <path d="M100,${y - 9} L92,${y - 16} L99,${y - 14} L100,${y - 21} L102,${y - 14} L109,${y - 16} Z" fill="#7FCB7A" stroke="#57A45A" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M100,${y - 18} q1,-6 4,-8" stroke="#57A45A" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      </g>`;
    }
    case 'santa': {
      const y = top;
      const brim = `M58,${y + 24} Q100,${y + 4} 142,${y + 24}`;
      return `<g class="acc acc-santa">
        <path d="M62,${y + 22} C64,${y - 4} 84,${y - 22} 110,${y - 22} C132,${y - 22} 150,${y - 10} 158,${y + 10} C160,${y + 16} 154,${y + 19} 150,${y + 15} C144,${y + 6} 136,${y + 1} 128,${y + 1} C130,${y + 9} 134,${y + 16} 138,${y + 22} Z" fill="#FF5C70" stroke="#D93D55" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M84,${y - 8} C94,${y - 16} 110,${y - 17} 122,${y - 12}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>
        <path d="${brim}" fill="none" stroke="#E8DADF" stroke-width="14" stroke-linecap="round"/>
        <path d="${brim}" fill="none" stroke="#FFFFFF" stroke-width="10.5" stroke-linecap="round"/>
        <circle cx="155" cy="${y + 14}" r="7.5" fill="#fff" stroke="#E8DADF" stroke-width="2"/>
      </g>`;
    }
    case 'glasses': {
      const [lx, ly] = EYE_L;
      const [rx, ry] = EYE_R;
      return `<g class="acc acc-glasses" fill="rgba(255,255,255,.16)" stroke="#6B4A3A" stroke-width="2.6">
        <circle cx="${lx}" cy="${ly}" r="13.5"/>
        <circle cx="${rx}" cy="${ry}" r="13.5"/>
        <path d="M${lx + 13.5},${ly - 1} Q100,${ly - 7} ${rx - 13.5},${ry - 1}" fill="none"/>
        <path d="M${lx - 13.5},${ly - 2} L${lx - 24},${ly - 5} M${rx + 13.5},${ry - 2} L${rx + 24},${ry - 5}" fill="none" stroke-linecap="round"/>
      </g>`;
    }
    default:
      return '';
  }
}

let uidSeq = 0;

/**
 * 生成宠物 SVG 字符串。
 * look: { species, color, accessory, markings }
 */
export function petSVG(look = {}, { className = '' } = {}) {
  const species = byId(catalog.species, look.species).id;
  const P = getPalette(look.color);
  const acc = look.accessory || 'none';
  const mark = look.markings || 'none';
  const uid = `${species}${++uidSeq}${Math.random().toString(36).slice(2, 6)}`;
  const lineW = 3.2;
  const stroke = `stroke="${P.line}" stroke-width="${lineW}" stroke-linejoin="round"`;
  const blob = BLOBS[species] || BLOBS.default;
  const light = mix(P.body, '#ffffff', 0.55);
  const eyeBottom = P.pupil ? mix(P.eye, '#ffffff', 0.35) : mix(P.eye, '#C98B9A', 0.55);

  return `<svg class="pet sp-${species} pose-idle e-normal m-cat ${className}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" data-species="${species}">
  <defs>
    <radialGradient id="pb-${uid}" cx="36%" cy="28%" r="85%">
      <stop offset="0" stop-color="${light}"/>
      <stop offset=".5" stop-color="${P.body}"/>
      <stop offset="1" stop-color="${P.body2}"/>
    </radialGradient>
    <linearGradient id="pe-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.eye}"/>
      <stop offset=".55" stop-color="${P.eye}"/>
      <stop offset="1" stop-color="${eyeBottom}"/>
    </linearGradient>
    <clipPath id="pc-${uid}"><path d="${blob}"/></clipPath>
  </defs>
  <ellipse class="p-shadow" cx="100" cy="189" rx="56" ry="7.5"/>
  <g class="p-flip">
  <g class="p-root">
  <g class="p-body">
    ${tail(species, P, stroke, lineW)}
    <g class="p-ears">${earsBack(species, P, stroke)}</g>
    <path class="p-blob hit" d="${blob}" fill="url(#pb-${uid})" ${stroke}/>
    <g class="p-mark">${markings(mark, species, P, `pc-${uid}`)}</g>
    <g class="p-face">
      <g class="p-blush">
        <ellipse cx="56" cy="140" rx="12.5" ry="7.4" fill="${P.blush}"/>
        <ellipse cx="144" cy="140" rx="12.5" ry="7.4" fill="${P.blush}"/>
        <g class="blush-lines" stroke="${mix(P.blush, '#C0305A', 0.35)}" stroke-width="1.6" stroke-linecap="round">
          <path d="M49,142 l4,-5 M55,142 l4,-5 M61,142 l4,-5"/>
          <path d="M137,142 l4,-5 M143,142 l4,-5 M149,142 l4,-5"/>
        </g>
      </g>
      ${whiskers(species, P)}
      <g class="p-eyes">${eyes(P, uid)}</g>
      <g class="p-nose">${nose(species, P)}</g>
      <g class="p-mouth">${mouths(species, P)}</g>
      <g class="p-sweat"><path d="M150,98 q-5,8 0,11 q5,-3 0,-11 z" fill="#BFE6FF" stroke="#7CC3EE" stroke-width="1.2"/></g>
      <g class="p-snot">
        <circle cx="${species === 'chick' ? 112 : 110}" cy="${species === 'chick' ? 130 : 128}" r="7" fill="#D9F2FF" fill-opacity=".8" stroke="#9BD4F5" stroke-width="1.3"/>
        <ellipse cx="${species === 'chick' ? 109.5 : 107.5}" cy="${species === 'chick' ? 127.5 : 125.5}" rx="2" ry="1.5" fill="#fff"/>
      </g>
    </g>
    <g class="p-ears-front">${earsFront(species, P, stroke)}</g>
    <g class="p-acc">${accessory(acc, species)}</g>
    <g class="p-prop"></g>
    <g class="p-paws">${paws(species, P, stroke)}</g>
  </g>
  </g>
  </g>
</svg>`;
}
