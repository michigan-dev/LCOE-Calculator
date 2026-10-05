/*
 * All technology defaults and metadata as data.
 *
 * IMPORTANT: these are APPROXIMATE, rounded, illustrative values chosen to sit
 * within the ranges published in the public NREL Annual Technology Baseline (ATB)
 * and Lazard's Levelized Cost of Energy+ report. They are not copied from a
 * specific table or vintage. Use them to explore relationships, not as quotes.
 *
 * All technologies share an 8% default WACC so the comparison isolates technology
 * economics; change it per scenario with the slider.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LCOE_DEFAULTS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var META = {
    reviewed: '2026-10-05',
    reviewedLabel: 'October 5, 2026',
    sourceNote:
      'Defaults are approximate and based on public NREL Annual Technology Baseline (ATB) and Lazard LCOE+ ranges.',
    sources: [
      { name: 'NREL Annual Technology Baseline', url: 'https://atb.nrel.gov/' },
      {
        name: 'Lazard Levelized Cost of Energy+',
        url: 'https://www.lazard.com/research-insights/levelized-cost-of-energyplus/'
      }
    ]
  };

  // Slider ranges (also the clamp ranges). Step is the slider/number granularity.
  var RANGES = {
    capexPerKw: { min: 200, max: 15000, step: 50, unit: '$/kW', label: 'Capital cost' },
    fixedOmPerKwYr: { min: 0, max: 400, step: 1, unit: '$/kW-yr', label: 'Fixed O&M' },
    variableOmPerMwh: { min: 0, max: 50, step: 0.5, unit: '$/MWh', label: 'Variable O&M' },
    fuelPerMwh: { min: 0, max: 150, step: 1, unit: '$/MWh', label: 'Fuel cost' },
    capacityFactorPct: { min: 0, max: 100, step: 1, unit: '%', label: 'Capacity factor' },
    lifetimeYears: { min: 5, max: 60, step: 1, unit: 'years', label: 'Project lifetime' },
    waccPct: { min: 0, max: 20, step: 0.1, unit: '%', label: 'Discount rate (WACC)' }
  };

  var TECHNOLOGIES = [
    {
      id: 'nextgen-geo',
      name: 'Next-gen Geothermal',
      short: 'Next-gen geothermal',
      blurb: 'Closed-loop / enhanced systems; firm, 24/7 clean power',
      note: 'Early-commercial cost today; DOE Enhanced Geothermal Shot targets far lower by 2035.',
      defaults: {
        capexPerKw: 6500,
        fixedOmPerKwYr: 130,
        variableOmPerMwh: 0,
        fuelPerMwh: 0,
        capacityFactorPct: 90,
        lifetimeYears: 30,
        waccPct: 8
      }
    },
    {
      id: 'conv-geo',
      name: 'Conventional Geothermal',
      short: 'conventional geothermal',
      blurb: 'Hydrothermal flash / binary at proven resources',
      note: 'Site-specific; resource and drilling risk drive the range.',
      defaults: {
        capexPerKw: 5500,
        fixedOmPerKwYr: 130,
        variableOmPerMwh: 0,
        fuelPerMwh: 0,
        capacityFactorPct: 90,
        lifetimeYears: 30,
        waccPct: 8
      }
    },
    {
      id: 'solar-pv',
      name: 'Utility Solar PV',
      short: 'utility solar PV',
      blurb: 'Single-axis tracking, grid-scale',
      note: 'Cheapest energy, but variable output (no firm capacity).',
      defaults: {
        capexPerKw: 1200,
        fixedOmPerKwYr: 20,
        variableOmPerMwh: 0,
        fuelPerMwh: 0,
        capacityFactorPct: 25,
        lifetimeYears: 30,
        waccPct: 8
      }
    },
    {
      id: 'wind',
      name: 'Onshore Wind',
      short: 'onshore wind',
      blurb: 'Utility-scale, good-resource sites',
      note: 'Variable output; capacity factor depends heavily on site.',
      defaults: {
        capexPerKw: 1500,
        fixedOmPerKwYr: 40,
        variableOmPerMwh: 0,
        fuelPerMwh: 0,
        capacityFactorPct: 35,
        lifetimeYears: 25,
        waccPct: 8
      }
    },
    {
      id: 'ngcc',
      name: 'Natural Gas Combined Cycle',
      short: 'natural gas combined cycle',
      blurb: 'Dispatchable; exposed to fuel price',
      note: 'Fuel is shown in $/MWh of electricity (about heat rate x gas price, e.g. 6.5 MMBtu/MWh x $4.6/MMBtu).',
      defaults: {
        capexPerKw: 1100,
        fixedOmPerKwYr: 15,
        variableOmPerMwh: 3,
        fuelPerMwh: 30,
        capacityFactorPct: 60,
        lifetimeYears: 30,
        waccPct: 8
      }
    },
    {
      id: 'solar-storage',
      name: 'Solar + 4hr Battery',
      short: 'solar + storage',
      blurb: 'Hybrid PV with 4-hour lithium-ion storage',
      note: 'Shifts solar into the evening; the battery is the main added cost.',
      defaults: {
        capexPerKw: 2400,
        fixedOmPerKwYr: 45,
        variableOmPerMwh: 0,
        fuelPerMwh: 0,
        capacityFactorPct: 27,
        lifetimeYears: 25,
        waccPct: 8
      }
    }
  ];

  return { META: META, RANGES: RANGES, TECHNOLOGIES: TECHNOLOGIES, DEFAULT_TECH_ID: 'nextgen-geo' };
});
