/*
 * Pure LCOE calculation functions. No DOM access, no globals read.
 * Works as a classic <script> (exposes window.LCOE) and in Node (module.exports).
 *
 * Input units (the same units the UI shows):
 *   capexPerKw        $/kW          overnight capital cost
 *   fixedOmPerKwYr    $/kW-year     fixed O&M
 *   variableOmPerMwh  $/MWh         variable O&M
 *   fuelPerMwh        $/MWh         fuel cost per MWh of electricity
 *   capacityFactorPct %  (0-100)
 *   lifetimeYears     years
 *   waccPct           %  (0-100)    discount rate
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LCOE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOURS_PER_YEAR_PER_1000 = 8.76; // 8760 h / 1000 -> MWh per kW-year at 100% CF

  // Slider / clamp ranges. Shared with the UI via data/defaults.js; duplicated here
  // only as a fallback so clampInputs works standalone.
  var DEFAULT_RANGES = {
    capexPerKw: { min: 200, max: 15000 },
    fixedOmPerKwYr: { min: 0, max: 400 },
    variableOmPerMwh: { min: 0, max: 50 },
    fuelPerMwh: { min: 0, max: 150 },
    capacityFactorPct: { min: 0, max: 100 },
    lifetimeYears: { min: 5, max: 60 },
    waccPct: { min: 0, max: 20 }
  };

  var INPUT_KEYS = Object.keys(DEFAULT_RANGES);

  function isNum(x) {
    return typeof x === 'number' && isFinite(x);
  }

  /** Capital recovery factor. rate is a decimal (0.07 = 7%). */
  function crf(rate, years) {
    if (!isNum(rate) || !isNum(years) || years <= 0) return NaN;
    if (rate < 0) return NaN;
    if (rate === 0) return 1 / years; // limit as r -> 0; avoids 0/0
    var g = Math.pow(1 + rate, years);
    return (rate * g) / (g - 1);
  }

  /** Clamp a single value into [min,max]; non-numbers fall back to `fallback`. */
  function clamp(value, min, max, fallback) {
    var v = typeof value === 'string' ? parseFloat(value) : value;
    if (!isNum(v)) v = isNum(fallback) ? fallback : min;
    return Math.min(max, Math.max(min, v));
  }

  /** Clamp every input into its range. Returns a new object with all keys present. */
  function clampInputs(inputs, ranges) {
    var r = ranges || DEFAULT_RANGES;
    var out = {};
    INPUT_KEYS.forEach(function (k) {
      out[k] = clamp(inputs && inputs[k], r[k].min, r[k].max, r[k].min);
    });
    return out;
  }

  /**
   * Check whether a set of (already numeric) inputs can produce a meaningful LCOE.
   * Returns { ok: boolean, message: string|null }.
   */
  function validate(inputs) {
    if (!inputs) return { ok: false, message: 'No inputs provided.' };
    for (var i = 0; i < INPUT_KEYS.length; i++) {
      if (!isNum(inputs[INPUT_KEYS[i]])) {
        return { ok: false, message: 'Every input needs to be a valid number.' };
      }
    }
    if (inputs.capacityFactorPct <= 0) {
      return {
        ok: false,
        message:
          'Capacity factor must be above 0%. A plant that never generates has no meaningful cost per MWh.'
      };
    }
    if (inputs.capacityFactorPct > 100) {
      return { ok: false, message: 'Capacity factor cannot exceed 100%.' };
    }
    if (inputs.lifetimeYears <= 0) {
      return { ok: false, message: 'Project lifetime must be at least 1 year.' };
    }
    if (inputs.waccPct < 0) {
      return { ok: false, message: 'Discount rate cannot be negative.' };
    }
    if (
      inputs.capexPerKw < 0 ||
      inputs.fixedOmPerKwYr < 0 ||
      inputs.variableOmPerMwh < 0 ||
      inputs.fuelPerMwh < 0
    ) {
      return { ok: false, message: 'Costs cannot be negative.' };
    }
    return { ok: true, message: null };
  }

  /**
   * Breakdown of LCOE into components, in $/MWh. Returns null if inputs are invalid.
   *   capital = Capex * CRF / (8.76 * CF)
   *   om      = FixedOM / (8.76 * CF) + VariableOM
   *   fuel    = Fuel
   *   total   = capital + om + fuel  (identical to lcoe())
   */
  function breakdown(inputs) {
    if (!validate(inputs).ok) return null;
    var cf = inputs.capacityFactorPct / 100;
    var mwhPerKwYr = HOURS_PER_YEAR_PER_1000 * cf;
    var c = crf(inputs.waccPct / 100, inputs.lifetimeYears);
    if (!isNum(c) || !(mwhPerKwYr > 0)) return null;
    var capital = (inputs.capexPerKw * c) / mwhPerKwYr;
    var om = inputs.fixedOmPerKwYr / mwhPerKwYr + inputs.variableOmPerMwh;
    var fuel = inputs.fuelPerMwh;
    var total = capital + om + fuel;
    if (![capital, om, fuel, total].every(isNum)) return null;
    return { capital: capital, om: om, fuel: fuel, total: total };
  }

  /**
   * LCOE in $/MWh:
   *   (Capex x CRF + FixedOM) / (8.76 x CF) + VariableOM + Fuel
   * Returns null (never NaN/Infinity) when inputs are invalid.
   */
  function lcoe(inputs) {
    var b = breakdown(inputs);
    return b ? b.total : null;
  }

  var SENSITIVITY_LABELS = {
    capexPerKw: 'Capital cost',
    fixedOmPerKwYr: 'Fixed O&M',
    variableOmPerMwh: 'Variable O&M',
    fuelPerMwh: 'Fuel cost',
    capacityFactorPct: 'Capacity factor',
    lifetimeYears: 'Project lifetime',
    waccPct: 'Discount rate'
  };

  /**
   * One-at-a-time sensitivity: flex each input by -pct and +pct (default 20%) and
   * report the resulting LCOE. Capacity factor is capped at 100%. Inputs equal to 0
   * (e.g. fuel on a non-gas technology) are skipped because +/-20% of 0 is 0.
   * Result is sorted by total swing, largest first. Returns [] for invalid inputs.
   */
  function sensitivity(inputs, pct) {
    var p = isNum(pct) ? pct : 0.2;
    var base = lcoe(inputs);
    if (base === null) return [];
    var rows = [];
    INPUT_KEYS.forEach(function (key) {
      var v = inputs[key];
      if (!(v > 0)) {
        // WACC = 0 is still a legitimate input but cannot be flexed proportionally.
        if (key === 'waccPct') {
          rows.push(makeRow(key, v, v, base, base, base));
        }
        return;
      }
      var lowIn = Object.assign({}, inputs);
      var highIn = Object.assign({}, inputs);
      lowIn[key] = v * (1 - p);
      highIn[key] = v * (1 + p);
      if (key === 'capacityFactorPct') {
        lowIn[key] = Math.min(100, lowIn[key]);
        highIn[key] = Math.min(100, highIn[key]);
      }
      var lowL = lcoe(lowIn);
      var highL = lcoe(highIn);
      if (lowL === null || highL === null) return;
      rows.push(makeRow(key, lowIn[key], highIn[key], base, lowL, highL));
    });
    rows.sort(function (a, b) {
      return b.swing - a.swing;
    });
    return rows;
  }

  function makeRow(key, lowInput, highInput, base, lowL, highL) {
    return {
      key: key,
      label: SENSITIVITY_LABELS[key],
      lowInput: lowInput, // input value at -pct
      highInput: highInput, // input value at +pct
      lowLcoe: lowL, // LCOE when input is at -pct
      highLcoe: highL, // LCOE when input is at +pct
      lowDelta: lowL - base,
      highDelta: highL - base,
      swing: Math.abs(highL - lowL)
    };
  }

  /** Percent difference of a vs b: positive when a is above b. null if b is not > 0. */
  function percentDiff(a, b) {
    if (!isNum(a) || !isNum(b) || !(b > 0)) return null;
    return ((a - b) / b) * 100;
  }

  return {
    HOURS_PER_YEAR_PER_1000: HOURS_PER_YEAR_PER_1000,
    DEFAULT_RANGES: DEFAULT_RANGES,
    INPUT_KEYS: INPUT_KEYS,
    SENSITIVITY_LABELS: SENSITIVITY_LABELS,
    crf: crf,
    clamp: clamp,
    clampInputs: clampInputs,
    validate: validate,
    breakdown: breakdown,
    lcoe: lcoe,
    sensitivity: sensitivity,
    percentDiff: percentDiff
  };
});
