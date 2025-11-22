# precompute_timeseries.py
import json
from processing import generate_flood_timeseries

def main():
    series = generate_flood_timeseries(
        years=10,
        step_days=30,
        min_diff_db=-2.0,
        elev_max_m=15,
        scale=30,
    )
    with open("flood_timeseries_10y.json", "w", encoding="utf-8") as f:
        json.dump(series, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(series)} records to flood_timeseries_10y.json")

if __name__ == "__main__":
    main()
