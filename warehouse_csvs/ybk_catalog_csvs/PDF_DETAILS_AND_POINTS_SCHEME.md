# PDF Details and Points Scheme

## Source Reference

- PDF: `/home/ashish/Documents/code/syrex-new/warehouse_csvs/YBK Parivaar Plus Delarship Catalog.pdf`
- Extracted sections converted into CSV format for operational use.

## Catalog Sections Captured

1. Short Tubular Batteries
2. Tall Tubular Batteries
3. Pure Sinewave Lithium Inverters
4. Solar Hybrid MPPT PCU
5. Lithium Inverter Batteries
6. Lithium Electric Vehicle Batteries (LFP)
7. Lithium Electric Vehicle Batteries (NMC)
8. Lithium Electric Vehicle Batteries (SHAKTI)

## Warranty Scheme Clarification

For tubular batteries, warranty shown as `A+B` (example: `18+18`, `24+24`) means:
- `A`: actual/full warranty period
- `B`: additional replacement/exchange window tied to old battery return and scrap-value adjustment

Important:
- Scrap value is variable by market and condition.
- Scrap cost cannot be deterministically pre-filled in the dataset.

## Points Scheme Summary

Points are provided in these product groups:
- Pure Sinewave Lithium Inverters
- Solar Hybrid MPPT PCU
- Lithium Inverter Batteries
- Lithium EV Batteries (LFP/NMC/SHAKTI)

No points were provided in the shared text for tubular battery sections.

### Points Distribution (as captured)

#### Pure Sinewave Lithium Inverters
- NER 1050: 10
- NER 1350: 10
- NER 2350: 20
- NER 3850: 20
- NER 5500: 40
- NER 10000: 80

#### Solar Hybrid MPPT PCU
- NER 3850: 80
- NER 5500: 80
- NER 11000: 100

#### Lithium Inverter Batteries
- 12660: 30
- 25660: 60
- 51248: 100

#### EV Batteries (LFP)
- MC51218LFP: 80
- MC60824LFP: 40
- MC6AH LFP Charger: 20

#### EV Batteries (NMC)
- MC48036NMC: 80
- MC60036NMC: 40
- MC6AH NMC Charger: 20

#### EV Batteries (SHAKTI)
- SY-SLFP100: 100
- ER20AH CHARGER: 20

## Data Quality / Validation Notes

1. One or more rows appear potentially inconsistent in source (example: NER 10000 MRP).
2. Charger entries are present inside EV battery sections; they are retained and marked in CSV via `product_type`.
3. If this dataset is used for billing or claims, reconcile each line against the original PDF before go-live.
