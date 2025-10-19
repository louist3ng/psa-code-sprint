// ==== CONFIG: map to your model ====
// Prefer using measures in your dataset (cleanest & fastest)
export const MEASURES = {
    // % of arrivals within target window (or AA_YN = 'Y')
    ARRIVAL_ACCURACY_PCT: "[Arrival Accuracy %]",
    // % within 4h target
    WITHIN_4H_PCT: "[Within 4h %]",
    // average berth time (hours)
    AVG_BERTH_H: "[Avg Berth Time (h)]",
    // total carbon abatement (tonnes)
    CARBON_TONNES: "[Carbon Abatement (t)]",
    // for drilldown: arrival variance (hours)
    ARRIVAL_VARIANCE_H: "[Arrival Variance (h)]"
};

// Column names (if you need to filter by date without a Date table)
export const FACT = {
    TABLE: "'Fact PortOps'",                 // <-- change to your fact table
    DATE_COL: "'Fact PortOps'[ATB (Local Time)]", // datetime column used for week/month windows
    VESSEL: "'Fact PortOps'[Vessel]",
    BU: "'Fact PortOps'[BU]"
};

// If you have a proper Date table, set it here (recommended)
export const DATE = {
    TABLE: "'Calendar'",
    DATE_COL: "'Calendar'[Date]"
};

// ---- Helpers to build windows ----
export function daxWindowWoW(measure) {
    // Uses latest ATB date in fact to define the current week [Mon..Sun], previous week is -7d.
    return `
VAR _latest = CALCULATE(MAX(${FACT.DATE_COL}), ALL(${FACT.TABLE}))
VAR _monday = _latest - WEEKDAY(_latest,2) + 1      -- Monday
VAR _sunday = _monday + 6
VAR _pmonday = _monday - 7
VAR _psunday = _sunday - 7

VAR _cur = CALCULATE(${measure}, FILTER(ALL(${FACT.TABLE}), ${FACT.DATE_COL} >= _monday && ${FACT.DATE_COL} <= _sunday))
VAR _prev = CALCULATE(${measure}, FILTER(ALL(${FACT.TABLE}), ${FACT.DATE_COL} >= _pmonday && ${FACT.DATE_COL} <= _psunday))
RETURN ROW("cur", _cur, "prev", _prev)
`.trim();
}

export function daxWindowMTD(measure) {
    // Month-to-date vs prior month MTD aligned length
    return `
VAR _latest = CALCULATE(MAX(${FACT.DATE_COL}), ALL(${FACT.TABLE}))
VAR _start = DATE(YEAR(_latest), MONTH(_latest), 1)
VAR _end = _latest

VAR _pm_start = EDATE(_start, -1)
VAR _pm_end = _pm_start + (_end - _start)

VAR _cur = CALCULATE(${measure}, FILTER(ALL(${FACT.TABLE}), ${FACT.DATE_COL} >= _start && ${FACT.DATE_COL} <= _end))
VAR _prev = CALCULATE(${measure}, FILTER(ALL(${FACT.TABLE}), ${FACT.DATE_COL} >= _pm_start && ${FACT.DATE_COL} <= _pm_end))
RETURN ROW("cur", _cur, "prev", _prev)
`.trim();
}

// ---- KPI bundles ----
export function daxBundleKpisWoW() {
    return `
EVALUATE ROW(
  "arrival_accuracy_cur", ${daxWindowWoW(MEASURES.ARRIVAL_ACCURACY_PCT)}[cur],
  "arrival_accuracy_prev", ${daxWindowWoW(MEASURES.ARRIVAL_ACCURACY_PCT)}[prev],
  "within4h_cur", ${daxWindowWoW(MEASURES.WITHIN_4H_PCT)}[cur],
  "within4h_prev", ${daxWindowWoW(MEASURES.WITHIN_4H_PCT)}[prev],
  "avg_berth_cur", ${daxWindowWoW(MEASURES.AVG_BERTH_H)}[cur],
  "avg_berth_prev", ${daxWindowWoW(MEASURES.AVG_BERTH_H)}[prev]
)`.trim();
}

export function daxBundleKpisMTD() {
    return `
EVALUATE ROW(
  "carbon_cur", ${daxWindowMTD(MEASURES.CARBON_TONNES)}[cur],
  "carbon_prev", ${daxWindowMTD(MEASURES.CARBON_TONNES)}[prev]
)`.trim();
}

// ---- Drilldown example: top 5 vessels by variance (this week) ----
export function daxTopVesselsByVarianceWoW(topN = 5) {
    return `
VAR _latest = CALCULATE(MAX(${FACT.DATE_COL}), ALL(${FACT.TABLE}))
VAR _monday = _latest - WEEKDAY(_latest,2) + 1
VAR _sunday = _monday + 6
RETURN
TOPN(${topN},
  ADDCOLUMNS(
    SUMMARIZE(${FACT.TABLE}, ${FACT.VESSEL}, ${FACT.BU}),
    "variance_h", CALCULATE(${MEASURES.ARRIVAL_VARIANCE_H}, FILTER(ALL(${FACT.TABLE}), ${FACT.DATE_COL} >= _monday && ${FACT.DATE_COL} <= _sunday))
  ),
  [variance_h], DESC
)`.trim();
}
