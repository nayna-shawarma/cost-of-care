"""Build publishable NSS 75th Round cancer-category hospitalisation aggregates.

Raw microdata are read directly from the supplied archive and are never modified.
Only grouped estimates are written to public/data/health-summary.json.
"""

from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd


IDENTIFIERS = [
    "FSU", "Round", "Schedule", "Sample", "Sector", "NSS_Region",
    "District", "Stratum", "Sub_stratum", "Sub_Round", "Sub_sample", "FOD_Sub_Region",
    "Hamlet_Sub_block", "Second_stage_stratum", "Sample_hhld",
]
# Age is deliberately not a join key: one record encodes it as `48`, its paired
# expenditure record as `048`. Household, admission and member identifiers are sufficient.
CASE_KEYS = IDENTIFIERS + ["Srl_no_of_hospitalisation_case", "Srl_no_of_member_hospitalised"]

STATE_NAMES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "27": "Maharashtra", "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
    "36": "Telangana", "37": "Ladakh",
}

FINANCE = {"1": "Savings & income", "2": "Borrowing", "3": "Asset sales", "4": "Friends & family", "9": "Other sources"}
INSTITUTION = {"1": "Public", "2": "Charitable / trust", "3": "Private"}
INSURANCE = {
    "1": "Government-sponsored scheme",
    "2": "Government/PSU employer cover",
    "3": "Other employer-supported cover",
    "4": "Private household-arranged insurance",
    "5": "No recorded cover",
    "9": "Other scheme",
}
INSURANCE_GROUPS = {
    "Government-sponsored scheme": ["1"],
    "Employment-linked cover": ["2", "3"],
    "Private household-arranged insurance": ["4"],
    "No recorded cover": ["5"],
    "Other scheme": ["9"],
}
SELECTED_STATES = ["Uttar Pradesh", "West Bengal", "Kerala", "Maharashtra", "Rajasthan", "Odisha"]

# Official Parliamentary answer, Rajya Sabha Unstarred Question 1399, answered 11 March 2025.
# Annexure I reports state/UT cancer-related AB-PMJAY hospital admissions and treatment amount,
# with data as on 28 February 2025. These are administrative counts, not NSS survey estimates.
PMJAY_CANCER_ROWS = [
    ("Andaman and Nicobar Islands", 478, 2.14), ("Andhra Pradesh", 919698, 2082.32),
    ("Arunachal Pradesh", 676, 1.83), ("Assam", 154762, 401.05), ("Bihar", 142621, 337.89),
    ("Chandigarh", 2014, 4.84), ("Chhattisgarh", 236091, 580.57), ("DNH & DD", 4358, 11.42),
    ("Gujarat", 874590, 2091.05), ("Haryana", 98055, 283.60), ("Himachal Pradesh", 23813, 49.96),
    ("Jammu and Kashmir", 150375, 346.77), ("Jharkhand", 98957, 232.35), ("Karnataka", 255150, 1326.71),
    ("Kerala", 417672, 906.08), ("Ladakh", 986, 2.33), ("Lakshadweep", 127, 0.42),
    ("Madhya Pradesh", 500117, 1330.03), ("Maharashtra", 27037, 37.09), ("Manipur", 16995, 38.39),
    ("Meghalaya", 16806, 41.19), ("Mizoram", 14315, 27.32), ("Nagaland", 17256, 46.04),
    ("Puducherry", 2620, 8.00), ("Punjab", 182049, 393.88), ("Rajasthan", 449320, 900.96),
    ("Sikkim", 725, 1.66), ("Tamil Nadu", 876420, 941.76), ("Telangana", 397771, 588.29),
    ("Tripura", 17989, 39.60), ("Uttar Pradesh", 378812, 1185.10), ("Uttarakhand", 82008, 263.25),
]


def read_csv_from_zip(archive: zipfile.ZipFile, member: str) -> pd.DataFrame:
    with archive.open(member) as handle:
        return pd.read_csv(handle, dtype=str, low_memory=False)


def as_number(frame: pd.DataFrame, column: str) -> pd.Series:
    return pd.to_numeric(frame[column].replace({"": np.nan, " ": np.nan, "-": np.nan}), errors="coerce")


def weighted_median(values: pd.Series, weights: pd.Series) -> float | None:
    valid = values.notna() & weights.notna() & (weights > 0)
    if not valid.any():
        return None
    ordered = pd.DataFrame({"value": values[valid], "weight": weights[valid]}).sort_values("value")
    midpoint = ordered["weight"].sum() / 2
    return float(ordered.loc[ordered["weight"].cumsum() >= midpoint, "value"].iloc[0])


def weighted_share(mask: pd.Series, weights: pd.Series) -> float | None:
    valid = mask.notna() & weights.notna() & (weights > 0)
    if not valid.any():
        return None
    return float((weights[valid] * mask[valid].astype(float)).sum() / weights[valid].sum() * 100)


def tidy_number(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def group_estimates(frame: pd.DataFrame) -> dict:
    weights = frame["weight"]
    cost = frame["total_cost"]
    observed_reimbursement = frame["reimbursement"].notna()
    return {
        "n": int(len(frame)),
        "medianTotalCost": tidy_number(weighted_median(cost, weights)),
        "shareAtLeast50000": tidy_number(weighted_share(cost >= 50000, weights)),
        "anyReimbursement": tidy_number(weighted_share(frame["reimbursement"] > 0, weights)),
        "reimbursementRecordedN": int(observed_reimbursement.sum()),
        "positiveReimbursementAmongRecorded": tidy_number(
            weighted_share(frame.loc[observed_reimbursement, "reimbursement"] > 0, weights.loc[observed_reimbursement])
        ),
    }


def distribution(frame: pd.DataFrame, field: str, labels: list[str]) -> list[dict]:
    rows = []
    for label in labels:
        mask = frame[field] == label
        rows.append({
            "label": label,
            "share": tidy_number(weighted_share(mask, frame["weight"])),
            "n": int(mask.sum()),
        })
    return rows


def insurance_estimates(frame: pd.DataFrame) -> dict:
    """Summarise recorded coverage status; blank linkage is kept out of the denominator."""
    observed = frame.loc[frame["insurance_code"].notna()].copy()
    observed_weight = observed.loc[observed["weight"].notna() & (observed["weight"] > 0), "weight"].sum()
    rows = []
    for label, codes in INSURANCE_GROUPS.items():
        group = observed.loc[observed["insurance_code"].isin(codes)]
        reimbursement_observed = group["reimbursement"].notna()
        rows.append({
            "label": label,
            "n": int(len(group)),
            "share": tidy_number(group.loc[group["weight"].notna() & (group["weight"] > 0), "weight"].sum() / observed_weight * 100),
            "medianTotalCost": tidy_number(weighted_median(group["total_cost"], group["weight"])),
            "borrowing": tidy_number(weighted_share(group["finance"].eq("Borrowing"), group["weight"])),
            "positiveReimbursementAmongRecorded": tidy_number(
                weighted_share(
                    group.loc[reimbursement_observed, "reimbursement"] > 0,
                    group.loc[reimbursement_observed, "weight"],
                )
            ) if reimbursement_observed.any() else None,
            "reimbursementRecordedN": int(reimbursement_observed.sum()),
        })
    return {
        "linkedStatusN": int(len(observed)),
        "unlinkedStatusN": int(len(frame) - len(observed)),
        "rows": rows,
    }


def build(raw_zip: Path, output: Path) -> dict:
    with zipfile.ZipFile(raw_zip) as archive:
        block4 = read_csv_from_zip(archive, "CSV_HSCH_75/Block_4_Level_3_R75250L03.csv")
        block6 = read_csv_from_zip(archive, "CSV_HSCH_75/Block_6_Level_5_R75250L05.csv")
        block7a = read_csv_from_zip(archive, "CSV_HSCH_75/Block_7_Level_6_R75250L06.csv")
        block7b = read_csv_from_zip(archive, "CSV_HSCH_75/Block_7_Level_7_R75250L07.csv")

    # Code 13 is the survey's combined known/suspected cancer and growing painless-lump category.
    cases = block6.loc[block6["Nature_of_ailment"].str.strip().eq("13")].copy()
    member_keys = IDENTIFIERS + ["Person_serial_no"]
    member_coverage = block4[member_keys + ["covered_by_any_scheme_for_health"]].rename(
        columns={"Person_serial_no": "Srl_no_of_member_hospitalised"}
    )
    merged = cases.merge(
        member_coverage,
        on=IDENTIFIERS + ["Srl_no_of_member_hospitalised"],
        how="left",
        validate="many_to_one",
    )
    merged = merged.merge(block7a[CASE_KEYS + ["Expenditure_Total_items_Rs"]], on=CASE_KEYS, how="left", validate="one_to_one")
    merged = merged.merge(
        block7b[CASE_KEYS + ["Total_amount_reimbursed_by_medic", "Major_source_of_finance"]],
        on=CASE_KEYS,
        how="left",
        validate="one_to_one",
    )

    merged["total_cost"] = as_number(merged, "Expenditure_Total_items_Rs")
    merged["reimbursement"] = as_number(merged, "Total_amount_reimbursed_by_medic")
    merged["weight"] = as_number(merged, "Mult_Combined")
    merged["stateCode"] = merged["FOD_Sub_Region"].str.strip().str[:2]
    merged["state"] = merged["stateCode"].map(STATE_NAMES)
    merged["residence"] = merged["Sector"].str.strip().map({"1": "Rural", "2": "Urban"})
    merged["finance"] = merged["Major_source_of_finance"].str.strip().map(FINANCE)
    merged["institution"] = merged["Type_of_medical_institution"].str.strip().map(INSTITUTION)
    merged["insurance_code"] = merged["covered_by_any_scheme_for_health"].str.strip()

    all_india = group_estimates(merged)
    by_residence = {name: group_estimates(group) for name, group in merged.groupby("residence", dropna=False) if pd.notna(name)}

    finance = distribution(merged, "finance", list(FINANCE.values()))
    institutions = distribution(merged, "institution", list(INSTITUTION.values()))
    finance_by_residence = {
        name: distribution(group, "finance", list(FINANCE.values()))
        for name, group in merged.groupby("residence", dropna=False) if pd.notna(name)
    }
    institutions_by_residence = {
        name: distribution(group, "institution", list(INSTITUTION.values()))
        for name, group in merged.groupby("residence", dropna=False) if pd.notna(name)
    }
    insurance = insurance_estimates(merged)

    state_rows = []
    for state in SELECTED_STATES:
        subset = merged.loc[merged["state"] == state]
        result = group_estimates(subset)
        result["state"] = state
        state_rows.append(result)

    result = {
        "metadata": {
            "title": "The Cost of Care",
            "source": "NSS 75th Round, Social Consumption: Health, 2017–18",
            "unit": "Cancer-category hospitalisation admission",
            "definition": "Nature-of-ailment code 13: known or suspected cancers and growing painless lumps; not confirmed cancer diagnoses.",
            "method": "Weighted medians use Mult_Combined. Shares use the same survey multiplier. Sample counts are unweighted. Groups below 30 admissions should not be displayed.",
        },
        "allIndia": all_india,
        "byResidence": by_residence,
        "finance": finance,
        "financeByResidence": finance_by_residence,
        "institutions": institutions,
        "institutionsByResidence": institutions_by_residence,
        "insurance": insurance,
        "pmjay": {
            "source": "Ministry of Health and Family Welfare, Rajya Sabha Unstarred Question 1399, Annexure I (answered 11 March 2025)",
            "sourceUrl": "https://sansad.in/getFile/annex/267/AU1399_IpWgdF.pdf?source=pqars",
            "asOf": "28 February 2025",
            "note": "Administrative AB-PMJAY cancer-related hospital admissions and treatment amount. These are not NSS survey estimates and are not comparable as a before-and-after effect.",
            "totalAdmissions": sum(row[1] for row in PMJAY_CANCER_ROWS),
            "totalAmountCrore": round(sum(row[2] for row in PMJAY_CANCER_ROWS), 2),
            "states": [
                {"state": state, "admissions": admissions, "amountCrore": amount}
                for state, admissions, amount in PMJAY_CANCER_ROWS
            ],
        },
        "states": state_rows,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-zip", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    summary = build(arguments.raw_zip, arguments.output)
    print(json.dumps(summary["allIndia"], indent=2))
