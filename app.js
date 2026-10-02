const formatRupees = (value) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
const formatPercent = (value) => `${value.toFixed(1)}%`;

// These grouped policy summaries are also stored in health-summary.json. Keeping a small
// display fallback here prevents a temporary Pages cache mismatch from blanking the section.
const policyFallback = {
  insurance: {
    linkedStatusN: 1243,
    rows: [
      { label: "Government-sponsored scheme", n: 216, share: 23.2, medianTotalCost: 7875, borrowing: 10.5 },
      { label: "Employment-linked cover", n: 90, share: 4.0, medianTotalCost: 70836, borrowing: 2.4 },
      { label: "Private household-arranged insurance", n: 41, share: 2.4, medianTotalCost: 60384, borrowing: 3.0 },
      { label: "No recorded cover", n: 883, share: 70.1, medianTotalCost: 27000, borrowing: 14.7 },
      { label: "Other scheme", n: 13, share: 0.4, medianTotalCost: 66000, borrowing: 0.0 },
    ],
  },
  pmjay: {
    asOf: "28 February 2025",
    totalAdmissions: 6360663,
    totalAmountCrore: 14503.89,
    states: [
      { state: "Andhra Pradesh", admissions: 919698 }, { state: "Tamil Nadu", admissions: 876420 },
      { state: "Gujarat", admissions: 874590 }, { state: "Madhya Pradesh", admissions: 500117 },
      { state: "Rajasthan", admissions: 449320 }, { state: "Kerala", admissions: 417672 },
    ],
  },
};

let data;
let residence = "All India";
let measure = "medianTotalCost";
let selectedStates = new Set(["Uttar Pradesh", "West Bengal", "Kerala"]);

const labels = {
  medianTotalCost: { button: "Median total cost", heading: "Weighted median of total hospitalisation spending, including non-medical expenses.", unit: "₹" },
  shareAtLeast50000: { button: "₹50k+ admissions", heading: "Weighted share of admissions costing at least ₹50,000.", unit: "%" },
  anyReimbursement: { button: "Any reimbursement", heading: "Weighted share of admissions with a positive recorded reimbursement.", unit: "%" },
};

function current() { return residence === "All India" ? data.allIndia : data.byResidence[residence]; }
function distribution(kind) { return residence === "All India" ? data[kind] : data[`${kind}ByResidence`][residence]; }
function snapshot() {
  const stats = [
    ["01", current().n.toLocaleString("en-IN"), "CANCER-CATEGORY ADMISSIONS IN THE SURVEY"],
    ["02", `₹${formatRupees(current().medianTotalCost)}`, "WEIGHTED MEDIAN REPORTED COST"],
    ["03", formatPercent(distribution("finance").find((item) => item.label === "Borrowing").share), "RELIED PRIMARILY ON BORROWING"],
  ];
  document.querySelector("#snapshot").innerHTML = stats.map(([number, value, label]) => `<div><span>${number}</span><strong>${value}</strong><small>${label}</small></div>`).join("");
}
function renderFindings() {
  const stats = current();
  document.querySelector("#cost-metric").innerHTML = `<div><p class="label">REPORTED TOTAL SPENDING</p><p class="label">${residence.toUpperCase()} / 2017–18</p><strong>₹${formatRupees(stats.medianTotalCost)}</strong><p>Weighted median per cancer-category hospitalisation in the selected area.</p></div><div class="threshold"><strong>${formatPercent(stats.shareAtLeast50000)}</strong><p>of admissions cost at least ₹50,000</p><small>n = ${stats.n.toLocaleString("en-IN")} unweighted admissions · NSS 75th Round</small></div>`;
  const max = Math.max(...distribution("finance").map((item) => item.share));
  document.querySelector("#finance-bars").innerHTML = distribution("finance").map((item) => `<div class="bar-row"><div><span>${item.label}</span><strong>${formatPercent(item.share)}</strong></div><div class="bar"><i style="width:${item.share / max * 100}%"></i></div></div>`).join("");
  document.querySelector("#institution-grid").innerHTML = distribution("institutions").map((item) => `<div><span>${item.label}</span><strong>${formatPercent(item.share)}</strong></div>`).join("");
  document.querySelector("#institution-area").textContent = residence;
}
function renderCoverage() {
  const stats = current();
  const blank = stats.n - stats.reimbursementRecordedN;
  document.querySelector("#coverage-card").innerHTML = `<div><p class="label">REIMBURSEMENT RECORDED</p><strong>${stats.reimbursementRecordedN}<small> / ${stats.n}</small></strong><p>Among ${stats.reimbursementRecordedN} admissions with an amount recorded, <b>${formatPercent(stats.positiveReimbursementAmongRecorded)}</b> show a positive reimbursement.</p></div><p class="missing">${blank} admissions have a blank reimbursement amount in this selection.</p>`;
}
function renderInsurance() {
  const insurance = data.insurance || policyFallback.insurance;
  const visibleRows = insurance.rows.filter((item) => item.label !== "Other scheme");
  document.querySelector("#insurance-summary").innerHTML = `<div><p class="label">COVERAGE STATUS LINKED</p><strong>${insurance.linkedStatusN.toLocaleString("en-IN")}</strong><p>of ${data.allIndia.n.toLocaleString("en-IN")} cancer-category admissions can be linked to the survey’s health-expenditure-support field.</p></div><div><p class="label">GOVERNMENT-SPONSORED</p><strong>${formatPercent(visibleRows[0].share)}</strong><p>of linked admissions report a government-sponsored scheme. This is the largest named route to formal cover in the survey.</p></div>`;
  document.querySelector("#insurance-grid").innerHTML = visibleRows.map((item) => `<article><p class="label">${item.label.toUpperCase()}</p><strong>${formatPercent(item.share)}</strong><p>${item.n.toLocaleString("en-IN")} unweighted admissions</p><small>MEDIAN COST ₹${formatRupees(item.medianTotalCost)}<br />BORROWING ${formatPercent(item.borrowing)}</small></article>`).join("");
}
function renderPmjay() {
  const pmjay = data.pmjay || policyFallback.pmjay;
  document.querySelector("#pmjay-summary").innerHTML = `<div><p class="label">CANCER-RELATED ADMISSIONS</p><strong>${pmjay.totalAdmissions.toLocaleString("en-IN")}</strong><p>Sum of the State/UT rows listed in the Parliamentary annexure.</p></div><div><p class="label">TREATMENT AMOUNT REPORTED</p><strong>₹${formatRupees(pmjay.totalAmountCrore)} cr</strong><p>AB-PMJAY administrative data, as of ${pmjay.asOf}.</p></div>`;
  const rows = [...pmjay.states].sort((a, b) => b.admissions - a.admissions).slice(0, 6);
  const high = rows[0].admissions;
  document.querySelector("#pmjay-list").innerHTML = `<p class="label">HIGHEST REPORTED CANCER-RELATED ADMISSION COUNTS</p><h3>Where are recorded admissions concentrated?</h3>${rows.map((item) => `<div class="pmjay-row"><span>${item.state}</span><i style="width:${item.admissions / high * 100}%"></i><strong>${item.admissions.toLocaleString("en-IN")}</strong></div>`).join("")}`;
}
function renderFilters() {
  document.querySelector("#residence-filter").innerHTML = ["All India", "Rural", "Urban"].map((item) => `<button class="${item === residence ? "active" : ""}" data-residence="${item}">${item}</button>`).join("");
  document.querySelector("#measure-filter").innerHTML = Object.entries(labels).map(([key, label]) => `<button class="${key === measure ? "active" : ""}" data-measure="${key}">${label.button}</button>`).join("");
  document.querySelector("#state-picker").innerHTML = data.states.map((item) => `<button class="${selectedStates.has(item.state) ? "active" : ""}" data-state="${item.state}">${item.state}</button>`).join("");
  document.querySelectorAll("[data-residence]").forEach((button) => button.addEventListener("click", () => { residence = button.dataset.residence; render(); }));
  document.querySelectorAll("[data-measure]").forEach((button) => button.addEventListener("click", () => { measure = button.dataset.measure; renderStates(); renderFilters(); }));
  document.querySelectorAll("[data-state]").forEach((button) => button.addEventListener("click", () => { const state = button.dataset.state; selectedStates.has(state) ? selectedStates.delete(state) : selectedStates.add(state); renderStates(); renderFilters(); }));
}
function valueLabel(value) { return labels[measure].unit === "₹" ? `₹${formatRupees(value)}` : formatPercent(value); }
function renderStates() {
  const rows = data.states.filter((item) => selectedStates.has(item.state)).sort((a, b) => b[measure] - a[measure]);
  document.querySelector("#chart-header").innerHTML = `<p class="label">${labels[measure].button.toUpperCase()} · ALL AREAS</p><h3>${labels[measure].heading}</h3><p class="label">NSS 2017–18</p>`;
  const high = Math.max(...rows.map((item) => item[measure]), 1);
  document.querySelector("#state-chart").innerHTML = rows.length ? rows.map((item) => `<div class="state-row"><div class="state-name"><span>${item.state}</span><small>n = ${item.n}</small></div><div class="state-bar"><i style="width:${item[measure] / high * 100}%"></i></div><strong>${valueLabel(item[measure])}</strong></div>`).join("") : "<p>Select at least one state to compare.</p>";
  document.querySelector("#data-table").innerHTML = `<table><thead><tr><th>State</th><th>n</th><th>${labels[measure].button}</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${item.state}</td><td>${item.n}</td><td>${valueLabel(item[measure])}</td></tr>`).join("")}</tbody></table><p class="small-note">Weighted estimates · minimum 30 unweighted observations per displayed group. No confidence intervals are shown: variance estimation has not yet been validated against the full sampling design. Treat small differences cautiously.</p>`;
}
function render() { snapshot(); renderFindings(); renderCoverage(); renderInsurance(); renderPmjay(); renderFilters(); renderStates(); }

fetch("public/data/health-summary.json?v=2025-03-11-insurance-pmjay", { cache: "no-store" })
  .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load the data summary.")))
  .then((summary) => { data = summary; render(); })
  .catch((error) => { document.querySelector("main").innerHTML = `<p class="error">${error.message}</p>`; });

document.querySelector("#table-toggle").addEventListener("click", () => { const table = document.querySelector("#data-table"); const open = table.hidden; table.hidden = !open; document.querySelector("#table-toggle").setAttribute("aria-expanded", String(open)); document.querySelector("#table-toggle").textContent = open ? "Hide data table" : "Show data table"; });
