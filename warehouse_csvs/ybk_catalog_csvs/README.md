# YBK Parivaar Plus Dealership Catalog - CSV Conversion

This folder contains structured CSV extracts created from:
- Source PDF: `/home/ashish/Documents/code/syrex-new/warehouse_csvs/YBK Parivaar Plus Delarship Catalog.pdf`

## Folder Contents

- `short_tubular_batteries.csv`
- `tall_tubular_batteries.csv`
- `pure_sinewave_lithium_inverters.csv`
- `solar_hybrid_mppt_pcu.csv`
- `lithium_inverter_batteries.csv`
- `lithium_ev_batteries_lfp.csv`
- `lithium_ev_batteries_nmc.csv`
- `lithium_ev_batteries_shakti.csv`
- `PDF_DETAILS_AND_POINTS_SCHEME.md`

## Data Interpretation Rules Used

1. Warranty format like `18+18`, `24+24`, `36+24` is split into:
- `warranty_primary_months`
- `warranty_exchange_window_months`

2. Meaning of `A+B` warranty for tubular batteries:
- `A` = actual warranty period
- `B` = additional battery exchange window, typically involving old battery/scrap value adjustment

3. Scrap value is variable and not fixed in the source.
- Therefore, no scrap cost field has been calculated.
- A `warranty_note` column is included where relevant.

4. GST handling:
- If source provided explicit GST percent and amount, both are captured.
- For most inverter/lithium sections, source provided `GST 18%` / `GST 5%` and `Including GST`; this is stored directly.

5. Text normalization:
- Kept model names close to source labels.
- Where duplicate model token appeared with different AH (`LA150ST24`), model IDs were disambiguated:
  - `LA150ST24_135AH`
  - `LA150ST24_150AH`

## Known Data Caveats from Source Text

1. `Pure Sinewave Lithium Inverters` entry for `NER 10000` has:
- `including_gst_inr = 65499`
- `mrp_inr = 11899`
This appears inconsistent (MRP is much lower than including GST), but values were preserved as provided.

2. EV charger rows are mixed into battery tables in source.
- Added `product_type` (`battery`/`charger`) in EV CSV files.
- For charger entries where voltage is not provided, `voltage_v` is left blank.

3. Spelling/label issues in source text (e.g., "Delarship", "Lihtium") are not rewritten inside numeric data rows.

## Suggested Next Steps

- Validate suspicious price rows against original PDF scan.
- Add a consolidated master CSV if downstream systems require one file.
- Add checksum or ingestion tests before importing into ERP/CRM.
