'use strict';
// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib/lcoe.js');
const D = require('../data/defaults.js');

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} expected ${expected} ± ${tol}, got ${actual}`);

const base = {
  capexPerKw: 1000,
  fixedOmPerKwYr: 20,
  variableOmPerMwh: 2,
  fuelPerMwh: 10,
  capacityFactorPct: 25,
  lifetimeYears: 30,
  waccPct: 7
};

test('CRF: r = 7%, n = 30 -> ~0.0806', () => {
  near(L.crf(0.07, 30), 0.0806, 0.0001);
});

test('CRF: r = 0 -> 1/n with no divide-by-zero', () => {
  const v = L.crf(0, 25);
  assert.ok(Number.isFinite(v));
  assert.equal(v, 1 / 25);
});

test('CRF: invalid inputs return NaN rather than throwing', () => {
  assert.ok(Number.isNaN(L.crf(0.07, 0)));
  assert.ok(Number.isNaN(L.crf(-0.01, 30)));
  assert.ok(Number.isNaN(L.crf(NaN, 30)));
});

test('LCOE: hand-calculated case matches within $0.10/MWh', () => {
  // Inputs: capex $1,000/kW, fixed O&M $20/kW-yr, variable O&M $2/MWh, fuel $10/MWh,
  //         CF 25%, n = 30 yr, r = 7%.
  // 1) 1.07^30 = 7.612255
  // 2) CRF = 0.07 * 7.612255 / (7.612255 - 1) = 0.532858 / 6.612255 = 0.080586
  // 3) Annualised capital = 1000 * 0.080586 = $80.586/kW-yr
  // 4) Plus fixed O&M: 80.586 + 20 = $100.586/kW-yr
  // 5) Energy per kW-yr = 8.76 * 0.25 = 2.19 MWh
  // 6) 100.586 / 2.19 = $45.930/MWh
  // 7) Add variable O&M and fuel: 45.930 + 2 + 10 = $57.930/MWh
  near(L.lcoe(base), 57.93, 0.1);
});

test('breakdown components sum to the LCOE and match hand values', () => {
  const b = L.breakdown(base);
  // capital = 80.586 / 2.19 = 36.797 ; om = 20 / 2.19 + 2 = 11.132 ; fuel = 10
  near(b.capital, 36.797, 0.01);
  near(b.om, 11.133, 0.01);
  near(b.fuel, 10, 1e-9);
  near(b.capital + b.om + b.fuel, L.lcoe(base), 1e-9);
  near(b.total, L.lcoe(base), 1e-9);
});

test('higher capacity factor always lowers LCOE', () => {
  D.TECHNOLOGIES.forEach((t) => {
    let prev = Infinity;
    for (let cf = 5; cf <= 100; cf += 5) {
      const v = L.lcoe({ ...t.defaults, capacityFactorPct: cf });
      assert.ok(v < prev, `${t.id}: LCOE should fall as CF rises (cf=${cf})`);
      prev = v;
    }
  });
});

test('higher discount rate always raises LCOE', () => {
  D.TECHNOLOGIES.forEach((t) => {
    let prev = -Infinity;
    for (let w = 0; w <= 20; w += 1) {
      const v = L.lcoe({ ...t.defaults, waccPct: w });
      assert.ok(v > prev, `${t.id}: LCOE should rise as WACC rises (wacc=${w})`);
      prev = v;
    }
  });
});

test('0% discount rate: capital is straight-line over lifetime', () => {
  // CRF = 1/30. capital = 1000/30 = 33.333 ; (33.333 + 20) / 2.19 = 24.353 ; + 12 = 36.353
  const v = L.lcoe({ ...base, waccPct: 0 });
  assert.ok(Number.isFinite(v));
  near(v, 36.353, 0.01);
});

test('0% capacity factor is handled gracefully (null + friendly message, no NaN/Infinity)', () => {
  const bad = { ...base, capacityFactorPct: 0 };
  assert.equal(L.lcoe(bad), null);
  assert.equal(L.breakdown(bad), null);
  assert.deepEqual(L.sensitivity(bad), []);
  const v = L.validate(bad);
  assert.equal(v.ok, false);
  assert.match(v.message, /Capacity factor must be above 0%/);
});

test('validate rejects NaN, negative and out-of-range values; lcoe never returns NaN/Infinity', () => {
  const cases = [
    { ...base, capexPerKw: NaN },
    { ...base, capexPerKw: -5 },
    { ...base, waccPct: -1 },
    { ...base, lifetimeYears: 0 },
    { ...base, capacityFactorPct: 150 },
    { ...base, fuelPerMwh: Infinity }
  ];
  cases.forEach((c) => {
    assert.equal(L.validate(c).ok, false);
    assert.equal(L.lcoe(c), null);
  });
});

test('clampInputs clamps to range and replaces garbage', () => {
  const c = L.clampInputs({
    capexPerKw: -50,
    fixedOmPerKwYr: 99999,
    variableOmPerMwh: 'abc',
    fuelPerMwh: NaN,
    capacityFactorPct: 140,
    lifetimeYears: 1,
    waccPct: 50
  });
  assert.equal(c.capexPerKw, 200);
  assert.equal(c.fixedOmPerKwYr, 400);
  assert.equal(c.variableOmPerMwh, 0);
  assert.equal(c.fuelPerMwh, 0);
  assert.equal(c.capacityFactorPct, 100);
  assert.equal(c.lifetimeYears, 5);
  assert.equal(c.waccPct, 20);
  assert.equal(L.validate(c).ok, true);
});

test('sensitivity: +/-20% moves LCOE in the expected direction and is sorted by swing', () => {
  const rows = L.sensitivity(base, 0.2);
  const baseL = L.lcoe(base);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  // More capital cost -> higher LCOE; more capacity factor -> lower LCOE.
  assert.ok(byKey.capexPerKw.highDelta > 0 && byKey.capexPerKw.lowDelta < 0);
  assert.ok(byKey.capacityFactorPct.highDelta < 0 && byKey.capacityFactorPct.lowDelta > 0);
  assert.ok(byKey.waccPct.highDelta > 0);
  assert.ok(byKey.lifetimeYears.highDelta < 0);
  // Fuel is linear: +20% of $10/MWh = +$2/MWh exactly.
  near(byKey.fuelPerMwh.highDelta, 2, 1e-9);
  near(byKey.fuelPerMwh.lowDelta, -2, 1e-9);
  // Deltas are relative to the base case.
  near(byKey.capexPerKw.lowLcoe - baseL, byKey.capexPerKw.lowDelta, 1e-9);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].swing >= rows[i].swing);
});

test('sensitivity: capacity factor is capped at 100% and zero-valued inputs are skipped', () => {
  const rows = L.sensitivity({ ...base, capacityFactorPct: 95, fuelPerMwh: 0 }, 0.2);
  const cf = rows.find((r) => r.key === 'capacityFactorPct');
  assert.equal(cf.highInput, 100);
  assert.equal(rows.find((r) => r.key === 'fuelPerMwh'), undefined);
  rows.forEach((r) => {
    assert.ok(Number.isFinite(r.lowLcoe) && Number.isFinite(r.highLcoe));
  });
});

test('sensitivity with 0% WACC returns a finite, zero-swing WACC row', () => {
  const rows = L.sensitivity({ ...base, waccPct: 0 }, 0.2);
  const w = rows.find((r) => r.key === 'waccPct');
  assert.ok(w);
  assert.equal(w.swing, 0);
});

test('percentDiff', () => {
  near(L.percentDiff(80, 100), -20, 1e-9);
  near(L.percentDiff(120, 100), 20, 1e-9);
  assert.equal(L.percentDiff(80, 0), null);
});

test('data: every technology has all inputs, inside the clamp ranges', () => {
  assert.equal(D.TECHNOLOGIES.length, 6);
  D.TECHNOLOGIES.forEach((t) => {
    L.INPUT_KEYS.forEach((k) => {
      const v = t.defaults[k];
      assert.ok(Number.isFinite(v), `${t.id}.${k} must be a number`);
      assert.ok(v >= D.RANGES[k].min && v <= D.RANGES[k].max, `${t.id}.${k}=${v} out of range`);
    });
    // Only gas carries a fuel cost.
    assert.equal(t.defaults.fuelPerMwh > 0, t.id === 'ngcc', `${t.id} fuel`);
  });
});

test('data: UI ranges match the library fallback ranges', () => {
  L.INPUT_KEYS.forEach((k) => {
    assert.equal(D.RANGES[k].min, L.DEFAULT_RANGES[k].min, `${k} min`);
    assert.equal(D.RANGES[k].max, L.DEFAULT_RANGES[k].max, `${k} max`);
  });
});

test('data: default LCOE of every technology is within a plausible $30-$200/MWh', () => {
  D.TECHNOLOGIES.forEach((t) => {
    const v = L.lcoe(t.defaults);
    assert.ok(v >= 30 && v <= 200, `${t.id} default LCOE $${v.toFixed(1)}/MWh outside $30-$200`);
  });
});
