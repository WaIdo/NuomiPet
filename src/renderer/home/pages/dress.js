// 装扮：名字、物种、配色、配饰、花纹、大小。每个改动都立刻写回，桌面上的宠物会跟着变。
import { h, cx, petEl, pageHead, cardHead, segmented, toast, icon } from '../ui.js';

const nameOf = (list, id) => (list.find((x) => x.id === id) || list[0] || {}).name || '';

function commitName(app, input) {
  const cur = app.state.pet.name;
  const v = input.value.trim().slice(0, 8);
  if (!v) {
    input.value = cur;
    toast('名字不能是空的哦');
    return;
  }
  input.value = v;
  if (v !== cur) app.set('pet.name', v);
}

function option(app, path, id, on, label, look) {
  return h(
    'button',
    {
      type: 'button',
      key: id,
      class: cx('opt', { on }),
      'aria-pressed': on ? 'true' : 'false',
      title: label,
      onclick: () => {
        if (!on) app.set(path, id);
      },
    },
    h('span', { class: 'opt-pet' }, petEl(look, { size: 56, still: true, key: 'p' })),
    h('span', { class: 'opt-name' }, label),
    on && h('span', { class: 'opt-check' }, icon('check')),
  );
}

function swatch(app, pal, on) {
  return h(
    'button',
    {
      type: 'button',
      key: pal.id,
      class: cx('swatch', { on }),
      title: pal.name,
      'aria-pressed': on ? 'true' : 'false',
      style: { '--sw': pal.body, '--sw2': pal.body2, '--ring': pal.line, '--blush': pal.blush },
      onclick: () => {
        if (!on) app.set('pet.color', pal.id);
      },
    },
    h('span', { class: 'sw-dot' }, h('i', { class: 'sw-blush' }), on && h('span', { class: 'sw-check' }, icon('check'))),
    h('span', { class: 'sw-name' }, pal.name),
  );
}

function section(emoji, title, body, sub) {
  return h('section', { class: 'card dress-sec', key: title }, cardHead(emoji, title, null, sub), body);
}

export default {
  id: 'dress',
  icon: '🎀',
  label: '装扮',
  render(app) {
    const p = app.state.pet;
    const cat = app.catalog;
    const look = app.look();
    const tags = [nameOf(cat.species, p.species), nameOf(cat.palettes, p.color), p.accessory !== 'none' && nameOf(cat.accessories, p.accessory), p.markings !== 'none' && nameOf(cat.markings, p.markings), nameOf(cat.sizes, p.size)].filter(Boolean);
    return h(
      'div',
      { class: 'page page-dress' },
      pageHead('🎀', '装扮', `给${p.name}换个新造型吧，桌面上的它会马上变身～`),
      h(
        'div',
        { class: 'dress' },
        h(
          'aside',
          { class: 'card dress-preview', key: 'preview' },
          h('div', { class: 'dp-stage' }, h('span', { class: 'dp-glow' }), h('span', { class: 'dp-floor' }), petEl(look, { size: 212, blink: true, track: true, key: 'dress-pet' })),
          h('div', { class: 'dp-name' }, p.name),
          h('div', { class: 'dp-tags' }, tags.map((t, i) => h('span', { class: 'tag', key: 't' + i }, t))),
          h('p', { class: 'dp-hint' }, '点一下右边的选项，马上就能看到效果'),
        ),
        h(
          'div',
          { class: 'dress-ctrls' },
          section(
            '📝',
            '名字',
            h(
              'div',
              { class: 'name-row' },
              h('input', {
                class: 'input',
                key: 'pet-name',
                value: p.name,
                maxlength: 8,
                placeholder: '给它起个名字',
                'aria-label': '宠物名字',
                onchange: (e) => commitName(app, e.target),
                onkeydown: (e) => {
                  if (e.key === 'Enter' && !e.isComposing) e.target.blur();
                },
              }),
              h('span', { class: 'hint' }, '最多 8 个字'),
            ),
          ),
          section('🐾', '物种', h('div', { class: 'opt-grid species' }, cat.species.map((sp) => option(app, 'pet.species', sp.id, p.species === sp.id, sp.name, { ...look, species: sp.id })))),
          section('🎨', '配色', h('div', { class: 'swatches' }, cat.palettes.map((pal) => swatch(app, pal, p.color === pal.id)))),
          section('👒', '配饰', h('div', { class: 'opt-grid acc' }, cat.accessories.map((a) => option(app, 'pet.accessory', a.id, p.accessory === a.id, a.name, { ...look, accessory: a.id })))),
          section('✨', '花纹', h('div', { class: 'opt-grid marks' }, cat.markings.map((m) => option(app, 'pet.markings', m.id, p.markings === m.id, m.name, { ...look, markings: m.id })))),
          section(
            '📏',
            '大小',
            segmented(
              cat.sizes.map((x) => ({ value: x.id, label: x.name })),
              p.size,
              (v) => app.set('pet.size', v),
              { cls: 'wide' },
            ),
            '桌面上的宠物有多大只',
          ),
        ),
      ),
    );
  },
};
