(function () {
  'use strict';

  var SHEET_ID = '12kia0zDLz7-66booKJXtYSQqNq5xObI5T66-w-PnZHw';
  var SHEET_BASE = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=';
  var WA_NUMBER = '491754130040';
  var MAIL = 'anton@edelwild-krueger.de';
  var FETCH_TIMEOUT = 3000;
  var CACHE_TTL = 10 * 60 * 1000;
  var KEY_STATE = 'ew_zettel_v1';
  var KEY_CACHE = 'ew_sheet_v1';
  var ORDER = ['Rehwild', 'Schwarzwild', 'Damwild', 'Rotwild', 'Gewürze'];

  var FALLBACK = [
    ['Rehwild', 'Rückenfilet', 49.9, 'kg'],
    ['Rehwild', 'Lendenfilet', 57.9, 'kg'],
    ['Rehwild', 'Keulensteak', 29.9, 'kg'],
    ['Rehwild', 'Keule / Braten', 22.9, 'kg'],
    ['Rehwild', 'Schulterbraten', 18.9, 'kg'],
    ['Rehwild', 'Nackensteak', 20.9, 'kg'],
    ['Rehwild', 'Rollbraten', 25.9, 'kg'],
    ['Schwarzwild', 'Rückenfilet', 42.9, 'kg'],
    ['Schwarzwild', 'Lendenfilet', 48.9, 'kg'],
    ['Schwarzwild', 'Keulensteak', 25.9, 'kg'],
    ['Schwarzwild', 'Keule / Braten', 20.9, 'kg'],
    ['Schwarzwild', 'Schulterbraten', 16.9, 'kg'],
    ['Schwarzwild', 'Nackensteak', 18.9, 'kg'],
    ['Schwarzwild', 'Rollbraten', 22.9, 'kg'],
    ['Schwarzwild', 'Rippchen', 13.9, 'kg'],
    ['Damwild', 'Rückenfilet', 49.9, 'kg'],
    ['Damwild', 'Lendenfilet', 57.9, 'kg'],
    ['Damwild', 'Keulensteak', 29.9, 'kg'],
    ['Damwild', 'Keule / Braten', 22.9, 'kg'],
    ['Damwild', 'Schulterbraten', 18.9, 'kg'],
    ['Damwild', 'Nackensteak', 20.9, 'kg'],
    ['Damwild', 'Rollbraten', 25.9, 'kg'],
    ['Rotwild', 'Rückenfilet', 49.9, 'kg'],
    ['Rotwild', 'Lendenfilet', 57.9, 'kg'],
    ['Rotwild', 'Keulensteak', 29.9, 'kg'],
    ['Rotwild', 'Keule / Braten', 22.9, 'kg'],
    ['Rotwild', 'Schulterbraten', 18.9, 'kg'],
    ['Rotwild', 'Nackensteak', 20.9, 'kg'],
    ['Rotwild', 'Rollbraten', 25.9, 'kg'],
    ['Gewürze', 'Waidmanns Würze (Wildsteak Gewürz)', 6.9, '100 g'],
    ['Gewürze', 'Spessart BBQ (Barbecue Gewürz)', 6.9, '100 g'],
    ['Gewürze', 'Waldgeister Gewürz (Naturgewürz mit Pilzen)', 7.9, '100 g'],
    ['Gewürze', 'Gewürzt & eingelegt', null, '', 'auf Anfrage']
  ];

  var items = [];
  var itemsById = {};
  var info = { naechste_lieferung: '', hinweis: '', bestellungen_offen: 'ja', stand: '' };
  var state = loadState();
  var ui = {};
  var lastOpener = null;
  var pickerQty = {};
  var source = 'static';

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var c;
    while (i < text.length) {
      c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function parsePrice(raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw).replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function normUnit(u) {
    var s = String(u || '').toLowerCase().replace(/\s+/g, '');
    if (s === 'kg') return 'kg';
    if (s === '100g') return '100 g';
    return '';
  }

  function slug(s) {
    return String(s).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function makeItem(wildart, name, price, unit, note, available) {
    wildart = String(wildart || '').trim();
    name = String(name || '').trim();
    var sub = '';
    var m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
    if (m) { name = m[1].trim(); sub = m[2].trim(); }
    var id = slug(wildart) + '__' + slug(name);
    return {
      id: id, wildart: wildart, name: name, sub: sub,
      price: price, unit: unit, note: String(note || '').trim(),
      available: available !== false && price !== null && !!unit
    };
  }

  function rowsToItems(rows) {
    var head = rows[0] || [];
    var idx = {};
    head.forEach(function (h, i) { idx[String(h).trim().toLowerCase()] = i; });
    var iW = idx['wildart'], iS = idx['stück'], iP = idx['preis'], iE = idx['einheit'], iV = idx['verfügbar'], iH = idx['hinweis'];
    if (iW === undefined || iS === undefined || iP === undefined) return null;
    var out = [];
    rows.slice(1).forEach(function (r) {
      var w = (r[iW] || '').trim();
      var s = (r[iS] || '').trim();
      if (!w || !s) return;
      var v = String(r[iV] || '').trim().toLowerCase();
      var available = !(v === 'false' || v === 'nein' || v === '0' || v === 'no');
      out.push(makeItem(w, s, parsePrice(r[iP]), normUnit(r[iE]), r[iH], available));
    });
    return out.length ? out : null;
  }

  function rowsToInfo(rows) {
    var out = {};
    rows.slice(1).forEach(function (r) {
      var k = String(r[0] || '').trim().toLowerCase();
      if (k) out[k] = String(r[1] || '').trim();
    });
    return out;
  }

  function fallbackItems() {
    return FALLBACK.map(function (f) {
      return makeItem(f[0], f[1], f[2], f[3], f[4], true);
    });
  }

  function fetchWithTimeout(url) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, FETCH_TIMEOUT);
    var opts = { cache: 'no-store' };
    if (controller) opts.signal = controller.signal;
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }, function (err) { clearTimeout(timer); throw err; });
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(KEY_CACHE);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || !c.ts || Date.now() - c.ts > CACHE_TTL) return null;
      return c;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try { sessionStorage.setItem(KEY_CACHE, JSON.stringify({ ts: Date.now(), items: data.items, info: data.info })); } catch (e) {}
  }

  function loadData() {
    var cached = readCache();
    if (cached && cached.items) {
      return Promise.resolve({ items: cached.items, info: cached.info || {}, source: 'cache' });
    }
    var pA = fetchWithTimeout(SHEET_BASE + 'Aktuell').then(function (t) { return rowsToItems(parseCSV(t)); }).catch(function () { return null; });
    var pI = fetchWithTimeout(SHEET_BASE + 'Info').then(function (t) { return rowsToInfo(parseCSV(t)); }).catch(function () { return null; });
    return Promise.all([pA, pI]).then(function (res) {
      var sheetItems = res[0];
      var sheetInfo = res[1] || {};
      if (sheetItems) {
        writeCache({ items: sheetItems, info: sheetInfo });
        return { items: sheetItems, info: sheetInfo, source: 'sheet' };
      }
      return { items: fallbackItems(), info: sheetInfo, source: 'fallback' };
    });
  }

  function fmtEur(n) {
    if (n === null || n === undefined || !isFinite(n)) return '';
    var fixed = (Math.round(n * 100) / 100).toFixed(2);
    var parts = fixed.split('.');
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return int + ',' + parts[1] + ' €';
  }

  function fmtQty(item, qty) {
    if (item.unit === 'kg') {
      return 'ca. ' + String(qty).replace('.', ',') + ' kg';
    }
    return qty + ' × 100 g';
  }

  function fmtKg(kg) {
    return String(kg).replace('.', ',') + ' kg';
  }

  function fmtPriceLabel(item) {
    if (!item.available) return 'aktuell nicht';
    if (item.price === null) return 'Preis n. V.';
    if (item.unit === 'kg') return fmtEur(item.price) + '/kg';
    return fmtEur(item.price);
  }

  function lineTotal(item, qty) {
    return Math.round(item.price * qty * 100) / 100;
  }

  function defaultQty(item) { return item.unit === 'kg' ? 1 : 1; }
  function stepQty(item) { return item.unit === 'kg' ? 0.5 : 1; }
  function minQty(item) { return item.unit === 'kg' ? 0.5 : 1; }
  function roundQty(item, q) {
    var step = stepQty(item);
    var r = Math.round(q / step) * step;
    r = Math.max(minQty(item), r);
    return Math.round(r * 100) / 100;
  }

  function loadState() {
    try {
      var raw = sessionStorage.getItem(KEY_STATE);
      var s = raw ? JSON.parse(raw) : null;
      if (!s || typeof s !== 'object') s = {};
      if (!Array.isArray(s.lines)) s.lines = [];
      if (!s.form || typeof s.form !== 'object') s.form = {};
      if (!Array.isArray(s.recipes)) s.recipes = [];
      s.recipes = s.recipes.filter(function (r) { return r && typeof r.name === 'string' && Array.isArray(r.ids); });
      return s;
    } catch (e) { return { lines: [], form: {}, recipes: [] }; }
  }

  function saveState() {
    try { sessionStorage.setItem(KEY_STATE, JSON.stringify(state)); } catch (e) {}
  }

  function findLine(id) {
    for (var i = 0; i < state.lines.length; i++) if (state.lines[i].id === id) return state.lines[i];
    return null;
  }

  function addLine(id, qty) {
    var item = itemsById[id];
    if (!item || !item.available) return;
    var line = findLine(id);
    if (line) line.qty = roundQty(item, line.qty + qty);
    else state.lines.push({ id: id, qty: roundQty(item, qty) });
    saveState();
    renderAll();
  }

  function setLineQty(id, qty) {
    var item = itemsById[id];
    var line = findLine(id);
    if (!item || !line) return;
    line.qty = roundQty(item, qty);
    saveState();
    renderAll();
  }

  function putLine(id, qty) {
    var item = itemsById[id];
    if (!item || !item.available) return;
    var q = roundQty(item, qty);
    var line = findLine(id);
    if (line) line.qty = q;
    else state.lines.push({ id: id, qty: q });
  }

  function rememberRecipe(name, persons, ids) {
    state.recipes = state.recipes.filter(function (r) { return r.name !== name; });
    state.recipes.push({ name: name, persons: persons, ids: ids });
  }

  function recipeLines() {
    var present = {};
    validLines().forEach(function (l) { present[l.id] = true; });
    return state.recipes.filter(function (r) {
      return r.ids.some(function (id) { return present[id]; });
    });
  }

  function removeLine(id) {
    state.lines = state.lines.filter(function (l) { return l.id !== id; });
    saveState();
    renderAll();
  }

  function validLines() {
    return state.lines.filter(function (l) {
      var it = itemsById[l.id];
      return it && it.available;
    });
  }

  function total() {
    return validLines().reduce(function (sum, l) {
      return sum + lineTotal(itemsById[l.id], l.qty);
    }, 0);
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function ordersOpen() {
    var v = String(info.bestellungen_offen || 'ja').trim().toLowerCase();
    return !(v === 'nein' || v === 'no' || v === 'false' || v === '0');
  }

  function fmtDateDE(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return m[3] + '.' + m[2] + '.' + m[1];
  }

  function buildMessage() {
    var f = state.form;
    var name = (f.name || '').trim();
    var lines = validLines();
    var out = [];
    out.push('Hallo Anton, hier ist ' + name + '. Ich bestelle verbindlich:');
    lines.forEach(function (l) {
      var it = itemsById[l.id];
      var label = it.wildart === 'Gewürze' ? it.name : it.wildart + ' ' + it.name;
      var priceStr = it.unit === 'kg' ? '(ca. ' + fmtEur(lineTotal(it, l.qty)) + ')' : '(' + fmtEur(lineTotal(it, l.qty)) + ')';
      out.push('– ' + label + ', ' + fmtQty(it, l.qty) + ' ' + priceStr);
    });
    out.push('Ca.-Summe: ' + fmtEur(total()) + ' (Endpreis nach Gewicht)');
    recipeLines().forEach(function (r) {
      out.push('Geplant: ' + r.name + ' für ' + r.persons + (r.persons === 1 ? ' Person' : ' Personen'));
    });
    var mode = f.mode === 'lieferung' ? 'Lieferung' : 'Abholung';
    var where = (f.ort || '').trim();
    var day = fmtDateDE(f.tag);
    var modeLine = mode === 'Lieferung' ? 'Lieferung' + (where ? ' nach ' + where : '') : 'Abholung in Hösbach';
    if (day) modeLine += ', Wunschtag: ' + day;
    out.push(modeLine);
    var wish = (f.wunsch || '').trim();
    if (wish) out.push('Hinweis: ' + wish);
    out.push('Vielen Dank!');
    return out.join('\n');
  }

  function waUrl(text) {
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text);
  }

  function mailUrl(text) {
    return 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Bestellanfrage Wildfleisch') + '&body=' + encodeURIComponent(text);
  }

  function qtyControl(item, getQty, setQty) {
    var minus = el('button', { type: 'button', class: 'bz-minus', 'aria-label': 'Weniger' }, '−');
    var plus = el('button', { type: 'button', class: 'bz-plus-btn', 'aria-label': 'Mehr' }, '+');
    var out = el('output', { 'aria-live': 'polite' });
    function update() {
      var q = getQty();
      out.textContent = item.unit === 'kg' ? String(q).replace('.', ',') + ' kg' : q + ' × 100 g';
      minus.disabled = q <= minQty(item);
    }
    minus.addEventListener('click', function () { setQty(roundQty(item, getQty() - stepQty(item))); update(); });
    plus.addEventListener('click', function () { setQty(roundQty(item, getQty() + stepQty(item))); update(); });
    update();
    var wrap = el('div', { class: 'bz-qty', role: 'group', 'aria-label': 'Menge ' + item.name }, [minus, out, plus]);
    wrap.update = update;
    return wrap;
  }

  function buildShell() {
    var sr = el('div', { class: 'bz-sr', 'aria-live': 'polite', id: 'bz-live' });
    var fab = el('button', { type: 'button', class: 'bz-fab', 'aria-haspopup': 'dialog', 'aria-controls': 'bz-drawer' }, [
      el('span', { class: 'bz-fab-label' }, [el('span', { class: 'bz-fab-my' }, 'Meine '), 'Einkaufsliste']),
      el('span', { class: 'bz-fab-count', 'aria-hidden': 'true' }),
      el('span', { class: 'bz-fab-sum' })
    ]);
    fab.addEventListener('click', function () { openDrawer(fab); });

    var backdrop = el('div', { class: 'bz-backdrop' });
    backdrop.addEventListener('click', closeAll);

    var drawer = el('section', { class: 'bz-dialog bz-drawer', id: 'bz-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bz-drawer-title', tabindex: '-1' });
    var picker = el('section', { class: 'bz-dialog bz-picker', id: 'bz-picker', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bz-picker-title', tabindex: '-1' });

    document.body.appendChild(sr);
    document.body.appendChild(fab);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
    document.body.appendChild(picker);

    ui.live = sr; ui.fab = fab; ui.backdrop = backdrop; ui.drawer = drawer; ui.picker = picker;

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && (ui.open === 'drawer' || ui.open === 'picker')) { e.preventDefault(); closeAll(); return; }
      if (e.key === 'Tab' && ui.open) trapFocus(e, ui.open === 'drawer' ? drawer : picker);
    });
  }

  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null || n === document.activeElement; }
    );
  }

  function trapFocus(e, root) {
    var f = focusables(root);
    if (!f.length) { e.preventDefault(); root.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  function announce(msg) {
    ui.live.textContent = '';
    setTimeout(function () { ui.live.textContent = msg; }, 30);
  }

  function openDialog(which, opener) {
    lastOpener = opener || document.activeElement;
    var node = which === 'drawer' ? ui.drawer : ui.picker;
    var other = which === 'drawer' ? ui.picker : ui.drawer;
    other.classList.remove('bz-open');
    other.setAttribute('aria-hidden', 'true');
    ui.open = which;
    ui.backdrop.classList.add('bz-open');
    node.removeAttribute('aria-hidden');
    node.classList.add('bz-open');
    document.body.classList.add('bz-lock');
    setTimeout(function () {
      var f = node.querySelector('.bz-autofocus') || node.querySelector('.bz-close');
      if (f) f.focus(); else node.focus();
    }, 60);
  }

  function closeAll() {
    if (!ui.open) return;
    ui.open = null;
    ui.backdrop.classList.remove('bz-open');
    [ui.drawer, ui.picker].forEach(function (n) { n.classList.remove('bz-open'); n.setAttribute('aria-hidden', 'true'); });
    document.body.classList.remove('bz-lock');
    if (lastOpener && typeof lastOpener.focus === 'function' && document.body.contains(lastOpener)) lastOpener.focus();
    lastOpener = null;
  }

  function head(labelText, titleParts, titleId) {
    var h2 = el('h2', { id: titleId });
    titleParts.forEach(function (p) {
      if (typeof p === 'string') h2.appendChild(document.createTextNode(p));
      else h2.appendChild(el('em', null, p.em));
    });
    var close = el('button', { type: 'button', class: 'bz-close', 'aria-label': 'Schließen' }, '×');
    close.addEventListener('click', closeAll);
    return el('div', { class: 'bz-head' }, [
      el('div', null, [el('p', { class: 'bz-label', text: labelText }), h2]),
      close
    ]);
  }

  function infoBanners() {
    var out = [];
    if (info.hinweis) out.push(el('p', { class: 'bz-banner' }, [el('strong', null, 'Hinweis'), info.hinweis]));
    if (info.naechste_lieferung) out.push(el('p', { class: 'bz-banner' }, [el('strong', null, 'Nächste Lieferung'), info.naechste_lieferung]));
    return out;
  }

  function openPicker(list, titleText, opener, focusId) {
    var picker = ui.picker;
    clear(picker);
    pickerQty = {};
    picker.appendChild(head('Auf die Einkaufsliste', [titleText, ' ', { em: 'wählen' }], 'bz-picker-title'));
    var body = el('div', { class: 'bz-body' });
    infoBanners().forEach(function (b) { body.appendChild(b); });

    var hasKg = list.some(function (it) { return it.unit === 'kg' && it.available; });
    var personsHint = null;
    var persons = null;
    if (hasKg) {
      persons = el('input', { type: 'number', id: 'bz-persons', min: '1', max: '60', step: '1', inputmode: 'numeric' });
      personsHint = el('span', { class: 'bz-hint', 'aria-live': 'polite' });
      persons.addEventListener('input', function () {
        var p = parseInt(persons.value, 10);
        if (!p || p < 1) { personsHint.textContent = ''; return; }
        var kg = roundQty({ unit: 'kg' }, p * 0.25);
        personsHint.textContent = 'Für ' + p + ' Personen rechnet man mit ca. ' + String(kg).replace('.', ',') + ' kg (250 g pro Person).';
      });
      body.appendChild(el('div', { class: 'bz-persons' }, [
        el('label', { for: 'bz-persons' }, 'Für wie viele Personen?'),
        persons,
        personsHint
      ]));
    }

    var ul = el('ul', { class: 'bz-list' });
    var focusTarget = null;
    list.forEach(function (it) {
      var li = el('li', { class: 'bz-item' + (it.available ? '' : ' bz-off'), 'data-id': it.id });
      var nameNode = el('div', { class: 'bz-item-name' }, [it.name]);
      if (it.sub) nameNode.appendChild(el('span', { class: 'bz-item-note' }, it.sub));
      if (it.note) nameNode.appendChild(el('span', { class: 'bz-item-note' }, it.note));
      li.appendChild(nameNode);
      if (!it.available) {
        li.appendChild(el('span', { class: 'bz-item-off' }, it.price === null && it.unit ? 'Preis n. V.' : 'aktuell nicht'));
        ul.appendChild(li);
        return;
      }
      li.appendChild(el('span', { class: 'bz-item-price' }, fmtPriceLabel(it)));
      pickerQty[it.id] = defaultQty(it);
      var lineOut = el('span', { class: 'bz-line' });
      function updLine() { lineOut.textContent = (it.unit === 'kg' ? 'ca. ' : '') + fmtEur(lineTotal(it, pickerQty[it.id])); }
      var qc = qtyControl(it, function () { return pickerQty[it.id]; }, function (q) { pickerQty[it.id] = q; updLine(); });
      updLine();
      var addBtn = el('button', { type: 'button', class: 'btn btn-whatsapp btn-sm' }, 'Auf die Einkaufsliste');
      addBtn.addEventListener('click', function () {
        addLine(it.id, pickerQty[it.id]);
        announce(it.name + ' auf die Einkaufsliste gesetzt');
        addBtn.textContent = 'Steht drauf';
        setTimeout(function () { addBtn.textContent = 'Nochmal drauf'; }, 1400);
        ui.fab.classList.remove('bz-bump');
        void ui.fab.offsetWidth;
        ui.fab.classList.add('bz-bump');
      });
      if ((focusId && it.id === focusId) || (!focusId && !focusTarget)) focusTarget = addBtn;
      li.appendChild(el('div', { class: 'bz-item-ctrl' }, [qc, addBtn, lineOut]));
      ul.appendChild(li);
    });
    if (!list.length) body.appendChild(el('p', { class: 'bz-empty' }, 'Gerade nichts im Angebot.'));
    body.appendChild(ul);
    picker.appendChild(body);

    var foot = el('div', { class: 'bz-foot' });
    var toDrawer = el('button', { type: 'button', class: 'btn btn-ghost btn-sm btn-block' }, 'Zur Einkaufsliste');
    toDrawer.addEventListener('click', function () { openDrawer(lastOpener); });
    foot.appendChild(toDrawer);
    picker.appendChild(foot);

    if (focusTarget) focusTarget.classList.add('bz-autofocus');
    openDialog('picker', opener);
  }

  function openDrawer(opener) {
    renderDrawer();
    openDialog('drawer', opener);
  }

  function field(labelText, input, required, errorId) {
    var lab = el('label', { for: input.id }, [labelText, required ? el('span', { class: 'bz-req', 'aria-hidden': 'true' }, ' *') : null]);
    var kids = [lab, input];
    if (errorId) kids.push(el('p', { class: 'bz-error', id: errorId, role: 'alert' }, 'Bitte deinen Namen eintragen.'));
    return el('div', { class: 'bz-field' }, kids);
  }

  function renderDrawer() {
    var drawer = ui.drawer;
    clear(drawer);
    drawer.appendChild(head('Deine Bestellung', ['Deine ', { em: 'Einkaufsliste' }], 'bz-drawer-title'));
    var body = el('div', { class: 'bz-body' });
    infoBanners().forEach(function (b) { body.appendChild(b); });

    var lines = validLines();
    if (!lines.length) {
      body.appendChild(el('p', { class: 'bz-empty' }, 'Noch nichts auf der Einkaufsliste. Wähl ein Stück aus dem Angebot und setz es drauf.'));
      drawer.appendChild(body);
      return;
    }

    var ul = el('ul', { class: 'bz-list' });
    lines.forEach(function (l) {
      var it = itemsById[l.id];
      var li = el('li', { class: 'bz-pos' });
      var nameNode = el('div', { class: 'bz-pos-name' }, [el('small', null, it.wildart), it.name]);
      if (it.sub) nameNode.appendChild(el('span', { class: 'bz-item-note' }, it.sub));
      li.appendChild(nameNode);
      var priceNode = el('span', { class: 'bz-pos-price' });
      function updPrice() { priceNode.textContent = (it.unit === 'kg' ? 'ca. ' : '') + fmtEur(lineTotal(it, l.qty)); }
      var qc = qtyControl(it, function () { return l.qty; }, function (q) { l.qty = q; saveState(); updPrice(); renderFab(); renderSum(); });
      updPrice();
      li.appendChild(qc);
      li.appendChild(priceNode);
      var rm = el('button', { type: 'button', class: 'bz-remove', 'aria-label': it.name + ' entfernen', title: 'Entfernen' }, '×');
      rm.addEventListener('click', function () { removeLine(it.id); announce(it.name + ' entfernt'); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
    body.appendChild(ul);

    ui.sum = el('strong');
    body.appendChild(el('div', { class: 'bz-sum' }, [el('span', null, 'Ca.-Summe'), ui.sum]));
    body.appendChild(el('p', { class: 'bz-sum-note' }, 'Endpreis nach Gewicht. Anton wiegt ab und bestätigt per WhatsApp.'));
    renderSum();

    var f = state.form;
    var form = el('form', { class: 'bz-form', novalidate: true });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    var nameIn = el('input', { type: 'text', id: 'bz-name', name: 'name', autocomplete: 'name', required: true, 'aria-required': 'true', 'aria-describedby': 'bz-name-err', value: f.name || '' });
    nameIn.addEventListener('input', function () { f.name = nameIn.value; nameIn.removeAttribute('aria-invalid'); document.getElementById('bz-name-err').classList.remove('bz-show'); saveState(); });
    form.appendChild(field('Dein Name', nameIn, true, 'bz-name-err'));

    var ortIn = el('input', { type: 'text', id: 'bz-ort', name: 'ort', autocomplete: 'postal-code', placeholder: 'z. B. 63768 Hösbach', value: f.ort || '' });
    ortIn.addEventListener('input', function () { f.ort = ortIn.value; saveState(); });
    var ortField = field('Ort / PLZ', ortIn, false);
    ortField.id = 'bz-ort-field';

    var mode = f.mode === 'lieferung' ? 'lieferung' : 'abholung';
    var radios = el('fieldset', { class: 'bz-radios' });
    radios.appendChild(el('legend', { class: 'bz-sr' }, 'Abholung oder Lieferung'));
    [['abholung', 'Abholung'], ['lieferung', 'Lieferung']].forEach(function (opt) {
      var r = el('input', { type: 'radio', name: 'bz-mode', value: opt[0], id: 'bz-mode-' + opt[0] });
      r.checked = mode === opt[0];
      var lab = el('label', { for: 'bz-mode-' + opt[0], class: r.checked ? 'bz-checked' : '' }, [r, opt[1]]);
      r.addEventListener('change', function () {
        f.mode = r.value; saveState();
        radios.querySelectorAll('label').forEach(function (l) { l.classList.toggle('bz-checked', l.querySelector('input').checked); });
        ortField.hidden = r.value !== 'lieferung';
      });
      radios.appendChild(lab);
    });
    form.appendChild(el('div', { class: 'bz-field' }, [el('p', { class: 'bz-field-label', 'aria-hidden': 'true' }, 'Abholung oder Lieferung'), radios]));
    ortField.hidden = mode !== 'lieferung';
    form.appendChild(ortField);

    var tagIn = el('input', { type: 'date', id: 'bz-tag', name: 'tag', value: f.tag || '' });
    tagIn.addEventListener('input', function () { f.tag = tagIn.value; saveState(); });
    form.appendChild(field('Wunschtag (optional)', tagIn, false));

    var wunschIn = el('textarea', { id: 'bz-wunsch', name: 'wunsch', rows: '3', placeholder: 'z. B. bitte als 2 Stücke' });
    wunschIn.value = f.wunsch || '';
    wunschIn.addEventListener('input', function () { f.wunsch = wunschIn.value; saveState(); });
    form.appendChild(field('Sonderwünsche (optional)', wunschIn, false));

    var bindIn = el('input', { type: 'checkbox', id: 'bz-bind', name: 'bind', required: true, 'aria-required': 'true', 'aria-describedby': 'bz-bind-err' });
    bindIn.checked = !!f.bind;
    bindIn.addEventListener('change', function () { f.bind = bindIn.checked; bindIn.removeAttribute('aria-invalid'); document.getElementById('bz-bind-err').classList.remove('bz-show'); saveState(); });
    var bindLab = el('label', { for: 'bz-bind', class: 'bz-bind' }, [bindIn, el('span', null, 'Ich bestelle verbindlich. Anton legt die Stücke für mich zurück. Absagen kann ich bis zum Bestellschluss per WhatsApp.')]);
    var bindErr = el('p', { class: 'bz-error', id: 'bz-bind-err', role: 'alert' }, 'Bitte bestätige die verbindliche Bestellung.');
    form.appendChild(el('div', { class: 'bz-field bz-field-bind' }, [bindLab, bindErr]));

    body.appendChild(form);
    drawer.appendChild(body);

    var foot = el('div', { class: 'bz-foot' });
    if (!ordersOpen()) {
      foot.appendChild(el('p', { class: 'bz-closed' }, 'Gerade nehmen wir keine Bestellungen an. Schau bald wieder vorbei.'));
      drawer.appendChild(foot);
      return;
    }
    var status = el('p', { class: 'bz-status', 'aria-live': 'polite' });
    function validate() {
      if (!(f.name || '').trim()) {
        nameIn.setAttribute('aria-invalid', 'true');
        document.getElementById('bz-name-err').classList.add('bz-show');
        nameIn.focus();
        return false;
      }
      if (!f.bind) {
        bindIn.setAttribute('aria-invalid', 'true');
        document.getElementById('bz-bind-err').classList.add('bz-show');
        bindIn.focus();
        return false;
      }
      return true;
    }
    var send = el('a', { class: 'btn btn-whatsapp btn-block', href: waUrl(buildMessage()), target: '_blank', rel: 'noopener noreferrer' }, 'Verbindlich per WhatsApp bestellen');
    send.addEventListener('click', function (e) {
      if (!validate()) { e.preventDefault(); return; }
      send.setAttribute('href', waUrl(buildMessage()));
    });
    ['input', 'change'].forEach(function (evt) {
      form.addEventListener(evt, function () { send.setAttribute('href', waUrl(buildMessage())); mailBtn.setAttribute('href', mailUrl(buildMessage())); });
    });
    var copyBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Nachricht kopieren');
    copyBtn.addEventListener('click', function () {
      if (!validate()) return;
      var text = buildMessage();
      var done = function () { status.textContent = 'Nachricht kopiert. Schick sie Anton an 0175 413 0040.'; };
      var fail = function () { status.textContent = 'Kopieren hat nicht geklappt. Nutz den E-Mail-Link.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    });
    var mailBtn = el('a', { class: 'btn btn-ghost', href: mailUrl(buildMessage()) }, 'Per E-Mail senden');
    mailBtn.addEventListener('click', function (e) {
      if (!validate()) { e.preventDefault(); return; }
      mailBtn.setAttribute('href', mailUrl(buildMessage()));
    });
    ui.sendBtn = send; ui.mailBtn = mailBtn;
    foot.appendChild(el('div', { class: 'bz-actions' }, [
      send,
      el('div', { class: 'bz-row' }, [copyBtn, mailBtn]),
      status
    ]));
    drawer.appendChild(foot);
  }

  function renderSum() {
    if (ui.sum) ui.sum.textContent = 'ca. ' + fmtEur(total());
    if (ui.sendBtn && ui.open === 'drawer') { ui.sendBtn.setAttribute('href', waUrl(buildMessage())); ui.mailBtn.setAttribute('href', mailUrl(buildMessage())); }
  }

  function renderFab() {
    var lines = validLines();
    var n = lines.length;
    ui.fab.classList.add('bz-visible');
    ui.fab.classList.toggle('bz-fab-idle', n === 0);
    ui.fab.querySelector('.bz-fab-count').textContent = n > 0 ? String(n) : '';
    ui.fab.querySelector('.bz-fab-sum').textContent = n > 0 ? 'ca. ' + fmtEur(total()) : 'Wild auswählen';
    ui.fab.setAttribute('aria-label', n > 0
      ? 'Meine Einkaufsliste öffnen, ' + n + (n === 1 ? ' Position' : ' Positionen') + ', ca. ' + fmtEur(total())
      : 'Meine Einkaufsliste öffnen, noch leer, Wild auswählen');
  }

  function renderAll() {
    renderFab();
    if (ui.open === 'drawer') renderDrawer();
  }

  function byWildart(w) {
    return items.filter(function (it) { return it.wildart.toLowerCase() === String(w).toLowerCase(); });
  }

  function renderPriceTables() {
    var tables = document.querySelectorAll('.menu-table[data-bz-wildart]');
    if (!tables.length) return;
    tables.forEach(function (table) {
      var w = table.getAttribute('data-bz-wildart');
      var list = byWildart(w);
      if (!list.length) return;
      var tbody = table.querySelector('tbody') || table;
      clear(tbody);
      list.forEach(function (it) {
        var tr = el('tr', { class: it.available ? '' : 'bz-off' });
        var tdName = el('td', null, [it.name]);
        if (it.sub) tdName.appendChild(el('span', { class: 'note' }, it.sub));
        if (it.note) tdName.appendChild(el('span', { class: 'note' }, it.note));
        tr.appendChild(tdName);
        tr.appendChild(el('td', { class: 'price' }, fmtPriceLabel(it)));
        var tdAct = el('td', { class: 'action' });
        if (it.available) {
          tdAct.appendChild(el('button', { type: 'button', class: 'bz-add', 'data-bz-item': it.id, 'aria-label': it.name + ' auf die Einkaufsliste' }, [
            el('span', { class: 'bz-plus', 'aria-hidden': 'true' }, '+'),
            el('span', { class: 'bz-add-text' }, 'Liste')
          ]));
        }
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
    });
    var host = document.querySelector('.menu-body .container');
    var banners = infoBanners();
    if (host && banners.length) {
      var box = el('div', { class: 'bz-info' });
      banners.forEach(function (b) { b.className = ''; box.appendChild(b); });
      host.insertBefore(box, host.firstChild);
    }
  }

  function renderAnnounce() {
    var link = document.querySelector('.bz-announce a');
    if (!link) return;
    var text = '';
    if (info.hinweis) text = info.hinweis;
    else if (info.weihnachten_text) text = info.weihnachten_text;
    else if (info.weihnachten_bestellschluss) text = 'Weihnachtsbraten vom Jäger · Bestellschluss ' + info.weihnachten_bestellschluss + ' · Preise ansehen';
    if (text) link.textContent = text;
  }

  function renderInfoSlots() {
    document.querySelectorAll('[data-bz-info]').forEach(function (node) {
      var v = String(info[node.getAttribute('data-bz-info')] || '').trim();
      if (!v) return;
      var tpl = node.getAttribute('data-bz-template') || '{v}';
      node.textContent = tpl.split('{v}').join(v);
      node.hidden = false;
    });
  }

  function renderPriceFor() {
    document.querySelectorAll('[data-bz-price-for]').forEach(function (node) {
      var it = itemsById[node.getAttribute('data-bz-price-for')];
      if (!it) return;
      var card = node.closest('.product-card') || node.parentNode;
      var btn = card.querySelector('[data-bz-item]');
      if (!it.available) {
        node.textContent = 'aktuell nicht verfügbar';
        node.classList.add('bz-off');
        if (btn) btn.disabled = true;
      } else {
        var kg = parseFloat(node.getAttribute('data-bz-kg'));
        var text = fmtPriceLabel(it);
        if (it.unit === 'kg' && kg > 0) text += ' · ca. ' + fmtEur(lineTotal(it, kg)) + ' für ' + fmtKg(kg);
        node.textContent = text;
        node.classList.remove('bz-off');
        if (btn) btn.disabled = false;
      }
      node.setAttribute('data-bz-filled', source);
    });
  }

  function renderPriceLists() {
    document.querySelectorAll('[data-bz-pricelist]').forEach(function (node) {
      var list = byWildart(node.getAttribute('data-bz-pricelist'));
      if (!list.length) return;
      var cuts = (node.getAttribute('data-bz-cuts') || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      var rows = cuts.map(function (c) {
        for (var i = 0; i < list.length; i++) if (list[i].name.toLowerCase() === c.toLowerCase()) return list[i];
        return null;
      }).filter(Boolean);
      if (!rows.length) return;
      clear(node);
      rows.forEach(function (it) {
        node.appendChild(el('li', { class: it.available ? null : 'bz-off' }, [
          el('span', null, it.name),
          el('span', { class: 'price' }, fmtPriceLabel(it))
        ]));
      });
      node.setAttribute('data-bz-filled', source);
    });
  }

  var recipeSeq = 0;

  function parseRecipeItems(spec) {
    return String(spec || '').split(',').map(function (part) {
      var p = part.trim().split(':');
      if (!p[0]) return null;
      var g = (p[1] || '').trim();
      if (g === 'spice') return { id: p[0], spice: true };
      var n = parseFloat(g);
      return n > 0 ? { id: p[0], perPerson: n } : null;
    }).filter(Boolean);
  }

  function itemLabel(it, fallback) {
    if (!it) return fallback;
    return it.wildart === 'Gewürze' ? it.name : it.wildart + ' ' + it.name;
  }

  function toast(msg) {
    var old = document.querySelector('.bz-toast');
    if (old) old.parentNode.removeChild(old);
    var t = el('div', { class: 'bz-toast', role: 'status' }, msg);
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3600);
  }

  function buildRecipe(root) {
    var name = root.getAttribute('data-bz-recipe') || '';
    var spec = parseRecipeItems(root.getAttribute('data-bz-items'));
    if (!name || !spec.length) return;
    var uid = 'bz-rp-' + (recipeSeq++);
    var persons = 4;
    var MAXP = 20;
    clear(root);
    root.classList.add('bz-rp');

    var input = el('input', { type: 'number', id: uid + '-p', min: '1', max: String(MAXP), step: '1', inputmode: 'numeric', value: '4' });
    var minus = el('button', { type: 'button', 'aria-label': 'Eine Person weniger' }, '−');
    var plus = el('button', { type: 'button', 'aria-label': 'Eine Person mehr' }, '+');
    var personsBox = el('div', { class: 'bz-rp-persons' }, [
      el('label', { for: uid + '-p' }, 'Für wie viele Personen?'),
      el('div', { class: 'bz-qty' }, [minus, input, plus])
    ]);

    var rows = spec.map(function (s) {
      var nameNode = el('span', { class: 'bz-rp-name' });
      var subNode = el('span', { class: 'bz-rp-sub' });
      var priceNode = el('span', { class: 'bz-rp-price' });
      var box = null;
      var main;
      if (s.spice) {
        box = el('input', { type: 'checkbox', id: uid + '-' + s.id, checked: true });
        box.addEventListener('change', render);
        main = el('label', { class: 'bz-rp-check', for: box.id }, [box, el('span', null, [nameNode, subNode])]);
      } else {
        main = el('span', { class: 'bz-rp-main' }, [nameNode, subNode]);
      }
      var li = el('li', { class: 'bz-rp-row' }, [main, priceNode]);
      return { s: s, li: li, name: nameNode, sub: subNode, price: priceNode, box: box, it: null, qty: 0 };
    });
    var ul = el('ul', { class: 'bz-rp-rows' }, rows.map(function (r) { return r.li; }));

    var sumNode = el('strong');
    var sumBox = el('div', { class: 'bz-rp-sum' }, [el('span', null, 'Ca.-Summe'), sumNode]);
    var note = el('p', { class: 'bz-rp-note' }, 'Beilagen und übrige Zutaten kaufen Sie wie gewohnt ein, Anton liefert das Wild.');
    var askNode = el('p', { class: 'bz-rp-ask' });
    var addBtn = el('button', { type: 'button', class: 'btn btn-whatsapp btn-sm' }, 'Auf die Einkaufsliste setzen');
    var directBtn = el('button', { type: 'button', class: 'btn btn-mail btn-sm' }, 'Direkt bei Anton bestellen');
    var actions = el('div', { class: 'bz-rp-actions' }, [addBtn, directBtn]);

    root.appendChild(el('h4', { class: 'bz-rp-title' }, 'Einkaufsliste für dieses Rezept'));
    root.appendChild(personsBox);
    root.appendChild(ul);
    root.appendChild(sumBox);
    root.appendChild(note);
    root.appendChild(askNode);
    root.appendChild(actions);

    function render() {
      var sum = 0;
      var missing = [];
      var usable = 0;
      rows.forEach(function (r) {
        var it = itemsById[r.s.id] || null;
        r.it = it;
        r.name.textContent = itemLabel(it, r.s.id);
        if (!it || !it.available) {
          r.qty = 0;
          r.li.classList.add('bz-off');
          r.sub.textContent = 'aktuell nicht verfügbar';
          r.price.textContent = '';
          if (r.box) r.box.disabled = true;
          if (!r.s.spice) missing.push(itemLabel(it, r.s.id));
          return;
        }
        r.li.classList.remove('bz-off');
        if (r.s.spice) {
          r.box.disabled = false;
          r.qty = r.box.checked ? 1 : 0;
          r.sub.textContent = '1 × 100 g';
        } else {
          r.qty = roundQty(it, persons * r.s.perPerson / 1000);
          r.sub.textContent = fmtQty(it, r.qty) + ' (' + persons + ' × ' + r.s.perPerson + ' g)';
        }
        if (r.qty > 0) {
          var lt = lineTotal(it, r.qty);
          sum += lt;
          usable++;
          r.price.textContent = (it.unit === 'kg' ? 'ca. ' : '') + fmtEur(lt);
        } else {
          r.price.textContent = '';
        }
      });
      sumNode.textContent = 'ca. ' + fmtEur(sum);
      var blocked = missing.length > 0 || usable === 0;
      addBtn.disabled = blocked;
      directBtn.disabled = blocked;
      clear(askNode);
      askNode.hidden = missing.length === 0;
      if (missing.length) {
        var text = 'Hallo Anton, ich plane ' + name + ' für ' + persons + ' Personen, gibt es ' + missing[0] + ' bald wieder?';
        askNode.appendChild(document.createTextNode(missing[0] + ' ist aktuell nicht verfügbar. '));
        askNode.appendChild(el('a', { href: waUrl(text), target: '_blank', rel: 'noopener noreferrer' }, 'Anton fragen'));
      }
      minus.disabled = persons <= 1;
      plus.disabled = persons >= MAXP;
    }

    function setPersons(n) {
      persons = Math.min(MAXP, Math.max(1, n));
      input.value = String(persons);
      render();
    }

    input.addEventListener('input', function () {
      var n = parseInt(input.value, 10);
      if (n >= 1 && n <= MAXP) { persons = n; render(); }
    });
    input.addEventListener('change', function () {
      var n = parseInt(input.value, 10);
      setPersons(isFinite(n) ? n : persons);
    });
    minus.addEventListener('click', function () { setPersons(persons - 1); });
    plus.addEventListener('click', function () { setPersons(persons + 1); });

    function commit() {
      var ids = [];
      rows.forEach(function (r) {
        if (r.qty > 0 && r.it && r.it.available) { putLine(r.s.id, r.qty); ids.push(r.s.id); }
      });
      if (!ids.length) return false;
      rememberRecipe(name, persons, ids);
      saveState();
      renderAll();
      ui.fab.classList.remove('bz-bump');
      void ui.fab.offsetWidth;
      ui.fab.classList.add('bz-bump');
      return true;
    }

    addBtn.addEventListener('click', function () {
      if (!commit()) return;
      toast('Zutaten für ' + name + ' stehen auf der Einkaufsliste');
      announce('Zutaten für ' + name + ' auf die Einkaufsliste gesetzt');
      openDrawer(addBtn);
    });
    directBtn.addEventListener('click', function () {
      if (!commit()) return;
      openDrawer(directBtn);
      setTimeout(function () {
        var n = document.getElementById('bz-name');
        if (n) n.focus();
      }, 140);
    });

    render();
  }

  function renderRecipes() {
    document.querySelectorAll('[data-bz-recipe]').forEach(buildRecipe);
  }

  function bindTriggers() {
    document.addEventListener('click', function (e) {
      var o = e.target.closest ? e.target.closest('[data-bz-open]') : null;
      if (o) { e.preventDefault(); openDrawer(o); return; }
      var t = e.target.closest ? e.target.closest('[data-bz-wildart], [data-bz-item]') : null;
      if (!t) return;
      e.preventDefault();
      var itemId = t.getAttribute('data-bz-item');
      if (itemId) {
        var it = itemsById[itemId];
        if (!it) return;
        openPicker([it], it.name, t, it.id);
        return;
      }
      var w = t.getAttribute('data-bz-wildart');
      openPicker(byWildart(w), w, t);
    });
  }

  function init() {
    buildShell();
    bindTriggers();
    loadData().then(function (data) {
      items = data.items.map(function (raw) {
        return raw.id ? raw : makeItem(raw.wildart, raw.name, raw.price, raw.unit, raw.note, raw.available);
      });
      items.sort(function (a, b) {
        var ia = ORDER.indexOf(a.wildart), ib = ORDER.indexOf(b.wildart);
        if (ia === -1) ia = 99; if (ib === -1) ib = 99;
        return ia - ib;
      });
      itemsById = {};
      items.forEach(function (it) { itemsById[it.id] = it; });
      Object.keys(data.info || {}).forEach(function (k) { info[k] = data.info[k]; });
      source = data.source;
      renderPriceTables();
      renderAnnounce();
      renderInfoSlots();
      renderPriceFor();
      renderPriceLists();
      renderRecipes();
      renderFab();
      document.documentElement.setAttribute('data-bz-source', data.source);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
