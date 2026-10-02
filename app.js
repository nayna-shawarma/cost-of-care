const formatRupees = (value) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
const formatPercent = (value) => `${value.toFixed(1)}%`;

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
function render() { snapshot(); renderFindings(); renderCoverage(); renderFilters(); renderStates(); }

fetch("public/data/health-summary.json")
  .then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load the data summary.")))
  .then((summary) => { data = summary; render(); })
  .catch((error) => { document.querySelector("main").innerHTML = `<p class="error">${error.message}</p>`; });

document.querySelector("#table-toggle").addEventListener("click", () => { const table = document.querySelector("#data-table"); const open = table.hidden; table.hidden = !open; document.querySelector("#table-toggle").setAttribute("aria-expanded", String(open)); document.querySelector("#table-toggle").textContent = open ? "Hide data table" : "Show data table"; });
