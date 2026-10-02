# The Cost of Care

An independent public-data exploration of financial protection during cancer-category hospitalisation in India.

## What this site does

The site uses the NSS 75th Round, Social Consumption: Health (2017–18), to describe reported spending, reimbursement, financing and treatment settings for hospital admissions recorded under ailment code 13. It does not estimate cancer incidence, current prices, or the causal effect of any policy.

Code 13 is a broad survey category that includes known or physician-suspected cancers and growing painless lumps. It is not a cancer registry category.

## Data protection

The raw NSS archive is never committed or published. `analysis/build_health_summary.py` reads it and produces the small, anonymised aggregate at `public/data/health-summary.json`. The website uses only that aggregate.

## Reproduce the analysis

From this folder, run:

```bash
python3 analysis/build_health_summary.py \
  --raw-zip ../upload/CSV_HSCH_75.zip \
  --output public/data/health-summary.json
```

The script deliberately uses the hospitalisation records in Blocks 6 and 7, rather than the 15-day outpatient/ailment files in Blocks 8 and 9.

## Run locally

The project has no build step or paid service. From this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish free with GitHub Pages

1. Create a new GitHub repository called `cost-of-care` and keep it public.
2. Upload the contents of this folder, not the folder itself. Do not upload the `upload/` directory or the raw archives.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then click **Save**.
6. GitHub will show the live URL after it finishes deploying.

Because the site is plain HTML, CSS and JavaScript, GitHub Pages hosts it directly with no installation or payment required.
