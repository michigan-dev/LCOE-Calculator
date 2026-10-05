/* Energy Cost Explorer: UI wiring. All math lives in lib/lcoe.js; data in data/defaults.js. */
(function () {
  'use strict';

  var L = window.LCOE;
  var D = window.LCOE_DEFAULTS;
  var KEYS = L.INPUT_KEYS;
  var TECHS = D.TECHNOLOGIES;
  var RANGES = D.RANGES;
  var SOLAR_STORAGE_ID = 'solar-storage';
  var REFERENCE_FALLBACK_ID = 'nextgen-geo';

  // Short query-string names for the share link.
  var PARAMS = {
    capexPerKw: 'capex',
    fixedOmPerKwYr: 'fom',
    variableOmPerMwh: 'vom',
    fuelPerMwh: 'fuel',
    capacityFactorPct: 'cf',
    lifetimeYears: 'life',
    waccPct: 'wacc'
  };

  function $(id) { return document.getElementById(id); }

  /* ---------- formatting ---------- */
  var fmtCache = {};
  function fmt(n, minD, maxD) {
    var k = minD + '-' + maxD;
    if (!fmtCache[k]) {
      fmtCache[k] = new Intl.NumberFormat('en-US', { minimumFractionDigits: minD, maximumFractionDigits: maxD });
    }
    return fmtCache[k].format(n);
  }
  function mwh(v, d) { return '$' + fmt(v, d == null ? 1 : d, d == null ? 1 : d) + '/MWh'; }
  function formatValue(key, v) {
    switch (key) {
      case 'capexPerKw': return '$' + fmt(v, 0, 0) + '/kW';
      case 'fixedOmPerKwYr': return '$' + fmt(v, 0, 2) + '/kW-yr';
      case 'variableOmPerMwh': return '$' + fmt(v, 1, 2) + '/MWh';
      case 'fuelPerMwh': return '$' + fmt(v, 1, 2) + '/MWh';
      case 'capacityFactorPct': return fmt(v, 0, 1) + '%';
      case 'lifetimeYears': return fmt(v, 0, 1) + ' years';
      case 'waccPct': return fmt(v, 1, 2) + '%';
      default: return String(v);
    }
  }
  function rangeText(key) {
    return formatValue(key, RANGES[key].min) + ' to ' + formatValue(key, RANGES[key].max);
  }

  /* ---------- state ---------- */
  function techById(id) {
    for (var i = 0; i < TECHS.length; i++) if (TECHS[i].id === id) return TECHS[i];
    return null;
  }
  function hasFuel(tech) { return tech.defaults.fuelPerMwh > 0; }

  var state = { techId: D.DEFAULT_TECH_ID, inputs: {} };

  function currentTech() { return techById(state.techId); }

  function loadDefaults(techId) {
    state.techId = techId;
    state.inputs = Object.assign({}, techById(techId).defaults);
  }

  function readUrl() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = new URLSearchParams(''); }
    var t = techById(params.get('t')) ? params.get('t') : D.DEFAULT_TECH_ID;
    loadDefaults(t);
    KEYS.forEach(function (k) {
      var raw = params.get(PARAMS[k]);
      if (raw === null || raw === '') return;
      var n = parseFloat(raw);
      if (isFinite(n)) state.inputs[k] = L.clamp(n, RANGES[k].min, RANGES[k].max, state.inputs[k]);
    });
    if (!hasFuel(currentTech())) state.inputs.fuelPerMwh = 0;
  }

  function buildQuery() {
    var p = new URLSearchParams();
    p.set('t', state.techId);
    KEYS.forEach(function (k) { p.set(PARAMS[k], String(+Number(state.inputs[k]).toFixed(4))); });
    return p.toString();
  }
  function shareUrl() {
    return window.location.href.split('#')[0].split('?')[0] + '?' + buildQuery();
  }
  function syncUrl() {
    try { window.history.replaceState(null, '', '?' + buildQuery()); } catch (e) { /* e.g. file:// */ }
  }

  /* ---------- static DOM: meta, tech cards, fields ---------- */
  var els = {};
  var fieldEls = {};

  function buildStatic() {
    $('assumptions-meta').innerHTML = 'Assumptions last reviewed: <time datetime="' + D.META.reviewed + '">' + D.META.reviewedLabel + '</time>';
    $('source-note').textContent = D.META.sourceNote + ' They are rounded, illustrative values, not quotes from a specific table, and all technologies default to an 8% WACC for like-for-like comparison.';
    var links = $('source-links');
    links.textContent = 'Sources: ';
    D.META.sources.forEach(function (s, i) {
      var a = document.createElement('a');
      a.href = s.url; a.textContent = s.name; a.rel = 'noopener'; a.target = '_blank';
      links.appendChild(a);
      if (i < D.META.sources.length - 1) links.appendChild(document.createTextNode(' · '));
    });

    var grid = $('tech-grid');
    TECHS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tech-card';
      b.dataset.id = t.id;
      b.setAttribute('aria-pressed', 'false');
      var name = document.createElement('span'); name.className = 'name'; name.textContent = t.name;
      var blurb = document.createElement('span'); blurb.className = 'blurb'; blurb.textContent = t.blurb;
      var def = document.createElement('span'); def.className = 'default';
      def.innerHTML = 'Default LCOE <strong>' + mwh(L.lcoe(t.defaults), 0) + '</strong>';
      b.appendChild(name); b.appendChild(blurb); b.appendChild(def);
      b.addEventListener('click', function () { selectTech(t.id); });
      grid.appendChild(b);
    });

    var fields = $('fields');
    KEYS.forEach(function (k) {
      var r = RANGES[k];
      var wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.innerHTML =
        '<div class="field-head"><label for="' + k + '-range">' + r.label + '</label><output class="field-value" id="' + k + '-out" for="' + k + '-range ' + k + '-num"></output></div>' +
        '<div class="field-row">' +
        '<input type="range" id="' + k + '-range" min="' + r.min + '" max="' + r.max + '" step="' + r.step + '">' +
        '<input type="number" id="' + k + '-num" inputmode="decimal" step="any" min="' + r.min + '" max="' + r.max + '" aria-label="' + r.label + ' (' + r.unit + '), number input">' +
        '</div>' +
        '<p class="field-note" id="' + k + '-note"></p>';
      fields.appendChild(wrap);
      var fe = {
        wrap: wrap,
        range: wrap.querySelector('input[type=range]'),
        num: wrap.querySelector('input[type=number]'),
        out: wrap.querySelector('output'),
        note: wrap.querySelector('.field-note')
      };
      fieldEls[k] = fe;

      fe.range.addEventListener('input', function () {
        setInput(k, parseFloat(fe.range.value), { noteOff: true, fast: true });
      });
      fe.num.addEventListener('input', function () {
        var raw = fe.num.value;
        var n = parseFloat(raw);
        if (raw === '' || !isFinite(n)) {
          fe.note.textContent = 'Enter a number from ' + rangeText(k) + '.';
          fe.note.className = 'field-note warn';
          return;
        }
        if (n < r.min || n > r.max) {
          fe.note.textContent = 'Allowed range is ' + rangeText(k) + '. Press Enter or leave the field to apply the limit.';
          fe.note.className = 'field-note warn';
          return;
        }
        setInput(k, n, { fast: true, keepField: true });
      });
      fe.num.addEventListener('change', function () {
        var n = parseFloat(fe.num.value);
        var clamped = L.clamp(n, r.min, r.max, state.inputs[k]);
        var changed = isFinite(n) && n !== clamped;
        setInput(k, clamped, { fast: true });
        if (changed) {
          fe.note.textContent = 'Limited to ' + formatValue(k, clamped) + ' (allowed: ' + rangeText(k) + ').';
          fe.note.className = 'field-note warn';
        } else if (!isFinite(n)) {
          fe.note.textContent = 'Reverted to ' + formatValue(k, clamped) + '. Enter a number from ' + rangeText(k) + '.';
          fe.note.className = 'field-note warn';
        }
      });
    });

    $('reset-btn').addEventListener('click', function () {
      loadDefaults(state.techId);
      clearNotes();
      render({ animate: true });
      announce('Reset to ' + currentTech().name + ' defaults.');
    });
    $('share-btn').addEventListener('click', copyShareLink);
    $('table-btn').addEventListener('click', function () {
      var open = $('table-btn').getAttribute('aria-expanded') === 'true';
      $('table-btn').setAttribute('aria-expanded', String(!open));
      $('table-btn').textContent = open ? 'Show chart data as tables' : 'Hide chart data tables';
      $('tables').hidden = open;
    });
  }

  function clearNotes() {
    KEYS.forEach(function (k) { fieldEls[k].note.textContent = ''; fieldEls[k].note.className = 'field-note'; });
  }

  function selectTech(id) {
    loadDefaults(id);
    clearNotes();
    render({ animate: true });
  }

  function setInput(key, value, opts) {
    opts = opts || {};
    var r = RANGES[key];
    state.inputs[key] = L.clamp(value, r.min, r.max, state.inputs[key]);
    if (!opts.keepField) fieldEls[key].num.value = state.inputs[key];
    if (opts.noteOff) { fieldEls[key].note.textContent = ''; fieldEls[key].note.className = 'field-note'; }
    else if (opts.keepField) { fieldEls[key].note.textContent = ''; fieldEls[key].note.className = 'field-note'; }
    render({ animate: false, skipField: opts.keepField ? key : null });
  }

  /* ---------- share link ---------- */
  var statusTimer;
  function announce(msg) {
    var s = $('status');
    s.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { s.textContent = ''; }, 3500);
  }
  function copyShareLink() {
    var url = shareUrl();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) announce('Share link copied to clipboard.');
      else window.prompt('Copy this link:', url);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { announce('Share link copied to clipboard.'); }, fallback);
    } else {
      fallback();
    }
  }

  /* ---------- charts ---------- */
  var charts = {};
  var pal = {};

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function readPalette() {
    ['bg', 'surface', 'text', 'muted', 'border', 'grid', 'accent', 'c-bar', 'c-capital', 'c-om', 'c-fuel', 'c-low', 'c-high', 'font-sans']
      .forEach(function (n) { pal[n] = cssVar('--' + n); });
  }

  // Draws a value label at the outer end of each bar (no extra library needed).
  var valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.format) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 12px ' + pal['font-sans'];
      ctx.fillStyle = pal.text;
      ctx.textBaseline = 'middle';
      chart.data.datasets.forEach(function (ds, di) {
        var meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach(function (bar, i) {
          var val = ds.data[i];
          if (typeof val !== 'number' || !isFinite(val)) return;
          if (opts.skipZero && Math.abs(val) < 1e-9) return;
          var p = bar.getProps(['x', 'base', 'y'], true);
          var dir = p.x >= p.base ? 1 : -1;
          ctx.textAlign = dir > 0 ? 'left' : 'right';
          ctx.fillText(opts.format(val), p.x + dir * 6, p.y);
        });
      });
      ctx.restore();
    }
  };

  function baseOptions() {
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      layout: { padding: { right: 8 } },
      plugins: { legend: { display: false } },
      font: { family: pal['font-sans'] }
    };
  }
  function axisCommon(title) {
    return {
      title: { display: !!title, text: title, color: pal.muted, font: { size: 12, weight: '500' } },
      ticks: { color: pal.muted, font: { size: 12 } },
      grid: { color: pal.grid },
      border: { color: pal.grid }
    };
  }

  function buildCharts() {
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); });
    charts = {};
    readPalette();
    Chart.defaults.color = pal.muted;
    Chart.defaults.font.family = pal['font-sans'];

    // 1) Compare
    var oc = baseOptions();
    oc.layout.padding.right = 56;
    oc.scales = {
      x: Object.assign(axisCommon('LCOE ($/MWh)'), { beginAtZero: true, ticks: { color: pal.muted, callback: function (v) { return '$' + fmt(v, 0, 0); } } }),
      y: Object.assign(axisCommon(), { grid: { display: false }, ticks: { color: pal.text, font: { size: 12 } } })
    };
    oc.plugins.tooltip = { callbacks: { label: function (c) { return ' ' + mwh(c.parsed.x); } } };
    oc.plugins.valueLabels = { format: function (v) { return '$' + fmt(v, 1, 1); } };
    charts.compare = new Chart($('chart-compare'), {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'LCOE ($/MWh)', data: [], backgroundColor: [], borderRadius: 4, barPercentage: 0.72 }] },
      options: oc, plugins: [valueLabels]
    });

    // 2) Breakdown
    var ob = baseOptions();
    ob.scales = {
      x: Object.assign(axisCommon('$/MWh'), { stacked: true, beginAtZero: true, ticks: { color: pal.muted, callback: function (v) { return '$' + fmt(v, 0, 0); } } }),
      y: Object.assign(axisCommon(), { stacked: true, grid: { display: false }, ticks: { display: false } })
    };
    ob.plugins.tooltip = { callbacks: { label: function (c) {
      var total = c.chart.data.datasets.reduce(function (s, d) { return s + (d.data[0] || 0); }, 0);
      var share = total > 0 ? Math.round((c.parsed.x / total) * 100) : 0;
      return ' ' + c.dataset.label + ': ' + mwh(c.parsed.x) + ' (' + share + '%)';
    } } };
    charts.breakdown = new Chart($('chart-breakdown'), {
      type: 'bar',
      data: { labels: [''], datasets: [
        { label: 'Capital', data: [0], backgroundColor: pal['c-capital'] },
        { label: 'O&M', data: [0], backgroundColor: pal['c-om'] },
        { label: 'Fuel', data: [0], backgroundColor: pal['c-fuel'] }
      ] },
      options: ob
    });

    // 3) Tornado
    var ot = baseOptions();
    ot.layout.padding = { left: 8, right: 52 };
    ot.scales = {
      x: Object.assign(axisCommon('Change in LCOE ($/MWh)'), { stacked: true,
        ticks: { color: pal.muted, callback: function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + '$' + fmt(Math.abs(v), 0, 0); } },
        grid: { color: function (c) { return c.tick && c.tick.value === 0 ? pal.muted : pal.grid; } } }),
      y: Object.assign(axisCommon(), { stacked: true, grid: { display: false }, ticks: { color: pal.text, font: { size: 12 } } })
    };
    ot.plugins.legend = { display: true, position: 'top', labels: { color: pal.text, boxWidth: 12, boxHeight: 12, font: { size: 12 } } };
    ot.plugins.tooltip = { callbacks: {
      label: function (c) {
        var row = charts.tornado._rows && charts.tornado._rows[c.dataIndex];
        if (!row) return '';
        var low = c.datasetIndex === 0;
        var inputVal = low ? row.lowInput : row.highInput;
        var lc = low ? row.lowLcoe : row.highLcoe;
        var d = low ? row.lowDelta : row.highDelta;
        return ' ' + row.label + ' ' + (low ? '−20%' : '+20%') + ' (' + formatValue(row.key, inputVal) + '): ' + mwh(lc) + ' (' + signed(d) + ')';
      }
    } };
    ot.plugins.valueLabels = { skipZero: true, format: function (v) { return signed(v); } };
    charts.tornado = new Chart($('chart-tornado'), {
      type: 'bar',
      data: { labels: [], datasets: [
        { label: 'Input −20%', data: [], backgroundColor: pal['c-low'], barPercentage: 0.7, categoryPercentage: 0.85 },
        { label: 'Input +20%', data: [], backgroundColor: pal['c-high'], barPercentage: 0.7, categoryPercentage: 0.85 }
      ] },
      options: ot, plugins: [valueLabels]
    });
  }

  // On narrow charts, split long category labels over two lines (Chart.js accepts arrays).
  function isNarrow(id) { return $(id).parentNode.clientWidth < 520; }
  function wrapLabel(text, narrow) {
    var words = text.split(' ');
    if (!narrow || words.length < 2) return text;
    var best = 1, bestDiff = Infinity;
    for (var i = 1; i < words.length; i++) {
      var d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }

  function signed(d) {
    if (Math.abs(d) < 0.05) return '$0.0';
    return (d > 0 ? '+' : '−') + '$' + fmt(Math.abs(d), 1, 1);
  }

  /* ---------- render ---------- */
  function referenceTech(selected) {
    return techById(selected.id === SOLAR_STORAGE_ID ? REFERENCE_FALLBACK_ID : SOLAR_STORAGE_ID);
  }

  function render(opts) {
    opts = opts || {};
    var tech = currentTech();
    var inputs = state.inputs;
    var gas = hasFuel(tech);
    if (!gas) inputs.fuelPerMwh = 0;

    // tech cards
    Array.prototype.forEach.call($('tech-grid').children, function (c) {
      c.setAttribute('aria-pressed', String(c.dataset.id === state.techId));
    });

    // fields
    KEYS.forEach(function (k) {
      var fe = fieldEls[k];
      var v = inputs[k];
      if (opts.skipField !== k) fe.num.value = v;
      fe.range.value = v;
      fe.range.setAttribute('aria-valuetext', formatValue(k, v));
      fe.out.textContent = formatValue(k, v);
      var disabled = k === 'fuelPerMwh' && !gas;
      fe.range.disabled = disabled;
      fe.num.disabled = disabled;
      fe.wrap.classList.toggle('is-disabled', disabled);
      if (disabled) { fe.note.textContent = 'Fuel cost applies to natural gas only.'; fe.note.className = 'field-note'; }
      else if (k === 'fuelPerMwh' && fe.note.textContent === 'Fuel cost applies to natural gas only.') fe.note.textContent = '';
    });

    var check = L.validate(inputs);
    var bd = L.breakdown(inputs);
    var total = bd ? bd.total : null;

    // validation message
    var vEl = $('validation');
    vEl.hidden = check.ok;
    vEl.textContent = check.ok ? '' : check.message;

    // KPI
    $('kpi-label').textContent = 'Levelized cost: ' + tech.name;
    $('kpi-number').textContent = total === null ? '—' : '$' + fmt(total, 1, 1);
    $('kpi-unit').textContent = total === null ? '' : '/MWh';
    $('kpi-sub').textContent = bd
      ? 'Capital $' + fmt(bd.capital, 1, 1) + ' · O&M $' + fmt(bd.om, 1, 1) + (gas ? ' · Fuel $' + fmt(bd.fuel, 1, 1) : '')
      : 'Fix the highlighted input to see a result.';

    $('tech-note').textContent = tech.name + ': ' + tech.note;

    updateCharts(tech, bd, total, opts.animate);
    updateInsight(tech, total, inputs);
    updateWorked(inputs, bd);
    syncUrl();
  }

  function updateCharts(tech, bd, total, animate) {
    var mode = animate ? undefined : 'none';

    // Compare
    var rows = TECHS.map(function (t) {
      return { id: t.id, name: t.name, v: t.id === tech.id ? total : L.lcoe(t.defaults) };
    }).filter(function (r) { return r.v !== null; }).sort(function (a, b) { return a.v - b.v; });
    var c = charts.compare;
    var nc = isNarrow('chart-compare');
    c.data.labels = rows.map(function (r) { return wrapLabel(r.name, nc); });
    c.data.datasets[0].data = rows.map(function (r) { return r.v; });
    c.data.datasets[0].backgroundColor = rows.map(function (r) { return r.id === tech.id ? pal.accent : pal['c-bar']; });
    c.update(mode);
    $('chart-compare').setAttribute('aria-label',
      'Horizontal bar chart of LCOE in dollars per megawatt-hour. ' + rows.map(function (r) { return r.name + ' ' + fmt(r.v, 1, 1); }).join(', ') +
      '. Selected: ' + tech.name + '. Full data is available in the chart data tables.');

    // Breakdown
    var b = charts.breakdown;
    b.data.datasets[0].data = [bd ? bd.capital : 0];
    b.data.datasets[1].data = [bd ? bd.om : 0];
    b.data.datasets[2].data = [bd ? bd.fuel : 0];
    b.update(mode);
    $('breakdown-sub').textContent = tech.name + ': where each $/MWh comes from';
    var legend = $('breakdown-legend');
    legend.textContent = '';
    if (bd) {
      [['Capital', bd.capital, pal['c-capital']], ['O&M', bd.om, pal['c-om']], ['Fuel', bd.fuel, pal['c-fuel']]].forEach(function (it) {
        if (it[0] === 'Fuel' && it[1] === 0) return;
        var li = document.createElement('li');
        var sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = it[2];
        li.appendChild(sw);
        li.appendChild(document.createTextNode(it[0] + ' ' + mwh(it[1]) + ' (' + Math.round(it[1] / bd.total * 100) + '%)'));
        legend.appendChild(li);
      });
    }
    $('chart-breakdown').setAttribute('aria-label', bd
      ? 'Stacked bar for ' + tech.name + ': capital ' + mwh(bd.capital) + ', O and M ' + mwh(bd.om) + ', fuel ' + mwh(bd.fuel) + '.'
      : 'Cost breakdown unavailable until inputs are valid.');

    // Tornado
    var sens = L.sensitivity(state.inputs, 0.2);
    var t = charts.tornado;
    t._rows = sens;
    var nt = isNarrow('chart-tornado');
    t.data.labels = sens.map(function (r) { return wrapLabel(r.label, nt); });
    t.data.datasets[0].data = sens.map(function (r) { return r.lowDelta; });
    t.data.datasets[1].data = sens.map(function (r) { return r.highDelta; });
    // Symmetric axis with headroom so end labels never run into the category labels.
    var maxAbs = sens.reduce(function (m, r) { return Math.max(m, Math.abs(r.lowDelta), Math.abs(r.highDelta)); }, 0);
    var lim = Math.max(1, maxAbs * (nt ? 2.1 : 1.45));
    t.options.scales.x.min = -lim;
    t.options.scales.x.max = lim;
    t.update(mode);
    $('chart-tornado').setAttribute('aria-label', sens.length
      ? 'Tornado chart for ' + tech.name + '. Largest sensitivity: ' + sens[0].label + ', a swing of ' + mwh(sens[0].swing) + '. Full data is in the chart data tables.'
      : 'Sensitivity unavailable until inputs are valid.');

    renderTables(tech, rows, bd, sens);
  }

  function updateInsight(tech, total, inputs) {
    var el = $('insight');
    if (total === null) {
      el.textContent = 'Enter valid inputs to see how ' + tech.short + ' compares.';
      return;
    }
    var ref = referenceTech(tech);
    var refL = L.lcoe(ref.defaults);
    var pct = L.percentDiff(total, refL);
    var lead = 'At ' + fmt(inputs.capacityFactorPct, 0, 1) + '% capacity factor, ' + tech.short + ' costs ' + mwh(total) + ', ';
    var tail = ' ' + ref.short + ' (' + mwh(refL) + ' at its default assumptions).';
    if (pct === null) { el.textContent = lead + 'compared with ' + ref.short + '.'; return; }
    var abs = Math.abs(pct);
    if (abs < 0.5) el.textContent = lead + 'in line with' + tail;
    else el.textContent = lead + fmt(abs, 0, 0) + '% ' + (pct < 0 ? 'below' : 'above') + tail;
  }

  function updateWorked(inputs, bd) {
    var dl = $('worked');
    dl.textContent = '';
    function row(k, v) {
      var dt = document.createElement('dt'); dt.textContent = k;
      var dd = document.createElement('dd'); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    }
    if (!bd) { row('Status', 'Waiting for valid inputs'); return; }
    var c = L.crf(inputs.waccPct / 100, inputs.lifetimeYears);
    var energy = L.HOURS_PER_YEAR_PER_1000 * inputs.capacityFactorPct / 100;
    row('CRF', fmt(c, 4, 4) + ' (r = ' + fmt(inputs.waccPct, 1, 2) + '%, n = ' + fmt(inputs.lifetimeYears, 0, 1) + ' yr)');
    row('Annual energy per kW', fmt(energy, 3, 3) + ' MWh (8.76 × ' + fmt(inputs.capacityFactorPct / 100, 2, 3) + ')');
    row('Annualized capital + fixed O&M', '$' + fmt(inputs.capexPerKw * c + inputs.fixedOmPerKwYr, 2, 2) + '/kW-yr');
    row('Capital + fixed O&M per MWh', '$' + fmt(bd.capital + inputs.fixedOmPerKwYr / energy, 2, 2) + '/MWh');
    row('+ Variable O&M + Fuel', '$' + fmt(inputs.variableOmPerMwh + inputs.fuelPerMwh, 2, 2) + '/MWh');
    row('LCOE', '$' + fmt(bd.total, 2, 2) + '/MWh');
  }

  /* ---------- accessible data tables ---------- */
  function makeTable(caption, head, rows) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var t = document.createElement('table');
    var cap = document.createElement('caption'); cap.textContent = caption; t.appendChild(cap);
    var thead = document.createElement('thead'), hr = document.createElement('tr');
    head.forEach(function (h) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = h; hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      r.forEach(function (cell, i) {
        var td = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) td.scope = 'row';
        td.textContent = cell;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }

  function renderTables(tech, rows, bd, sens) {
    var box = $('tables');
    box.textContent = '';
    box.appendChild(makeTable('LCOE by technology ($/MWh)', ['Technology', 'LCOE', 'Basis'],
      rows.map(function (r) { return [r.name, mwh(r.v), r.id === tech.id ? 'Your inputs (selected)' : 'Defaults']; })));
    box.appendChild(makeTable('Cost breakdown: ' + tech.name, ['Component', '$/MWh', 'Share'],
      bd ? [['Capital', bd.capital], ['O&M', bd.om], ['Fuel', bd.fuel]].map(function (r) {
        return [r[0], mwh(r[1]), fmt(r[1] / bd.total * 100, 0, 0) + '%'];
      }) : [['Unavailable', '—', '—']]));
    box.appendChild(makeTable('Sensitivity: LCOE when each input changes −20% / +20%', ['Input', 'At −20%', 'At +20%', 'Swing'],
      sens.length ? sens.map(function (r) {
        return [r.label, mwh(r.lowLcoe) + ' (' + signed(r.lowDelta) + ')', mwh(r.highLcoe) + ' (' + signed(r.highDelta) + ')', mwh(r.swing)];
      }) : [['Unavailable', '—', '—', '—']]));
  }

  /* ---------- boot ---------- */
  function boot() {
    if (!window.Chart) {
      $('insight').textContent = 'Charts could not load (Chart.js failed to download). The calculator below still works.';
    }
    readUrl();
    buildStatic();
    if (window.Chart) buildCharts();
    else charts = null;
    if (charts) render({ animate: true });
    else renderNoCharts();

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { render({ animate: false }); }, 150);
    });

    // Re-color charts when the OS theme flips.
    if (window.matchMedia && window.Chart) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onTheme = function () { buildCharts(); render({ animate: false }); };
      if (mq.addEventListener) mq.addEventListener('change', onTheme);
      else if (mq.addListener) mq.addListener(onTheme);
    }
  }

  // Degraded mode: if Chart.js is blocked, still compute and show numbers + tables.
  function renderNoCharts() {
    charts = { compare: stub(), breakdown: stub(), tornado: stub() };
    readPalette();
    render({ animate: false });
    $('insight').textContent = 'Charts could not load (Chart.js failed to download); numbers and tables still work. ' + $('insight').textContent;
    $('table-btn').click();
    function stub() { return { data: { labels: [], datasets: [{}, {}, {}] }, update: function () {} }; }
  }

  boot();
})();
