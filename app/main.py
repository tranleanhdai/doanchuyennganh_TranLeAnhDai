import os
import json
import datetime as dt
from pathlib import Path
import io
import csv
import zipfile
import requests

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from dotenv import load_dotenv
import ee
from ee.ee_exception import EEException

from .ee_utils import init_ee
from .models import (
    FloodRequest,
    FloodResponse,
    FloodStats,
    FloodMapLayers,
    FloodRegions,
)
from .processing import (
    AOI,
    AOI_HCM,
    AOI_BD,
    AOI_BRVT,
    detect_flood,
    to_geojson,
    thumb_url,
    rainfall_timeseries,
    flood_rain_correlation_from_cached,
    make_flood_map_image,
    make_vv_image,
    make_delta_image,
)

# --- Load biến môi trường & init Earth Engine ---
load_dotenv()
init_ee()
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY")

app = FastAPI(
    title="GEE Flood API",
    version="0.1.0",
    description="API phát hiện và thống kê ngập cho TP.HCM sau sáp nhập (S1 + GEE)",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Đường dẫn file cache time-series 10 năm ----
TIMESERIES_CACHE_PATH = Path(__file__).resolve().parent / "flood_timeseries_10y.json"

# ============================================================
#  CẤU HÌNH DỰ BÁO MƯA & CẢNH BÁO NGUY CƠ NGẬP (OpenWeather)
# ============================================================

HCM_LAT = 10.82
HCM_LON = 106.63

RAIN_3D_MEDIUM = 40.0
RAIN_3D_HIGH = 80.0


def classify_risk(rain_3d: float) -> str:
    if rain_3d >= RAIN_3D_HIGH:
        return "high"
    elif rain_3d >= RAIN_3D_MEDIUM:
        return "medium"
    else:
        return "low"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/aoi")
async def get_aoi():
    """
    Trả về ranh giới AOI (TP.HCM sau sáp nhập) dưới dạng GeoJSON
    để frontend vẽ viền vàng trên MapView.
    (Giữ endpoint cũ để không vỡ UI hiện tại.)
    """
    try:
        aoi_fc = ee.FeatureCollection(ee.Feature(AOI))
        aoi_gj = to_geojson(aoi_fc, max_features=1)
        return {"aoi_geojson": aoi_gj}
    except EEException as e:
        return JSONResponse(
            status_code=502,
            content={"detail": f"Earth Engine error (get_aoi): {str(e)}"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error (get_aoi): {str(e)}"},
        )


# ====================== NGẬP SỰ KIỆN =======================


@app.post("/flood", response_model=FloodResponse)
async def flood(req: FloodRequest):
    aoi_asset = req.aoi_asset or os.getenv("AOI_ASSET")

    if not aoi_asset:
        raise HTTPException(
            status_code=400,
            detail="AOI asset not provided and AOI_ASSET env missing",
        )

    try:
        result = detect_flood(
            aoi_asset,
            req.pre_start,
            req.pre_end,
            req.event_start,
            req.event_end,
            req.min_diff_db if req.min_diff_db is not None else -2.0,
            req.elev_max_m or 15,
            req.scale_m or 30,
        )

        # ====== LẤY CÁC THỐNG KÊ DIỆN TÍCH ======
        area_km2 = float(ee.Number(result["area_km2"]).getInfo())
        pixel_count = int(ee.Number(result["pixel_count"]).getInfo())

        area_km2_hcm = float(ee.Number(result["area_km2_hcm"]).getInfo())
        area_km2_bd = float(ee.Number(result["area_km2_bd"]).getInfo())
        area_km2_brvt = float(ee.Number(result["area_km2_brvt"]).getInfo())

        # vector ngập & AOI merge
        gj = to_geojson(result["vectors"])
        aoi_gj = to_geojson(result["aoi_fc"], max_features=1)

        # ====== GEOJSON RANH GIỚI TỪNG KHU (HCM / BD / BRVT / MERGED) ======
        merged_fc = ee.FeatureCollection(ee.Feature(AOI))
        hcm_fc = ee.FeatureCollection(ee.Feature(AOI_HCM))
        bd_fc = ee.FeatureCollection(ee.Feature(AOI_BD))
        brvt_fc = ee.FeatureCollection(ee.Feature(AOI_BRVT))

        merged_gj = to_geojson(merged_fc, max_features=1)
        hcm_gj = to_geojson(hcm_fc, max_features=1)
        bd_gj = to_geojson(bd_fc, max_features=1)
        brvt_gj = to_geojson(brvt_fc, max_features=1)

        # ====== TẠO CÁC LAYER ẢNH ĐỂ WEBGIS HIỂN THỊ ======
        flood_img = ee.Image(result["image"])
        aoi_geom = result["aoi"]
        thumb_size = getattr(req, "thumb_size", None) or 1024

        # 1) Ảnh composite ngập (nền tối + AOI vàng + vùng ngập xanh)
        flood_img_vis = make_flood_map_image(flood_img, aoi_geom)
        flood_thumb = thumb_url(
            flood_img_vis, aoi_geom, size=thumb_size, is_mask=False
        )

        # 2) Ảnh VV pre / event / delta (dB)
        pre_vv_db = ee.Image(result["pre_vv_db"])
        evt_vv_db = ee.Image(result["evt_vv_db"])
        delta_db = ee.Image(result["delta_db"])

        pre_img = make_vv_image(pre_vv_db, aoi_geom)
        evt_img = make_vv_image(evt_vv_db, aoi_geom)
        delta_img = make_delta_image(delta_db, aoi_geom)

        pre_thumb = thumb_url(pre_img, aoi_geom, size=thumb_size, is_mask=False)
        evt_thumb = thumb_url(evt_img, aoi_geom, size=thumb_size, is_mask=False)
        delta_thumb = thumb_url(delta_img, aoi_geom, size=thumb_size, is_mask=False)

        return FloodResponse(
            stats=FloodStats(
                area_km2=area_km2,
                pixel_count=pixel_count,
                scale_m=req.scale_m or 30,
                area_km2_hcm=area_km2_hcm,
                area_km2_bd=area_km2_bd,
                area_km2_brvt=area_km2_brvt,
            ),
            polygons_geojson=gj,
            aoi_geojson=aoi_gj,
            # thumbnail nhỏ (UI cũ) dùng luôn composite flood
            thumb_url=flood_thumb,
            # các lớp PNG cho WebGIS
            layers=FloodMapLayers(
                flood=flood_thumb,
                pre_vv=pre_thumb,
                event_vv=evt_thumb,
                delta_db=delta_thumb,
            ),
            # ranh giới từng khu để hiển thị thêm overlay trên MapView
            regions_geojson=FloodRegions(
                merged=merged_gj,
                hcm=hcm_gj,
                bd=bd_gj,
                brvt=brvt_gj,
            ),
        )

    except EEException as e:
        return JSONResponse(
            status_code=502,
            content={"detail": f"Earth Engine error: {str(e)}"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"},
        )


# ==================== CHUỖI THỜI GIAN NGẬP =================


@app.get("/flood/timeseries")
async def flood_timeseries():
    try:
        if not TIMESERIES_CACHE_PATH.exists():
            raise HTTPException(
                status_code=500,
                detail=(
                    "Timeseries cache chưa tồn tại. "
                    "Hãy chạy script precompute_timeseries.py để tạo file."
                ),
            )

        with open(TIMESERIES_CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        return {"data": data}

    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"},
        )


# ========================= LƯỢNG MƯA ========================


@app.get("/rainfall")
async def rainfall(
    start: str,
    end: str,
    scale_m: int = 5000,
):
    try:
        data = rainfall_timeseries(
            start_date=start,
            end_date=end,
            scale=scale_m,
        )
        return {"data": data}
    except EEException as e:
        return JSONResponse(
            status_code=502,
            content={"detail": f"Earth Engine error: {str(e)}"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"},
        )


# ===================== TƯƠNG QUAN MƯA–NGẬP =================


@app.get("/correlation")
async def correlation(
    years: int = 5,
    rainfall_scale_m: int = 5000,
):
    try:
        if not TIMESERIES_CACHE_PATH.exists():
            raise HTTPException(
                status_code=500,
                detail=(
                    "Timeseries cache chưa tồn tại. "
                    "Hãy chạy script precompute_timeseries.py để tạo file."
                ),
            )

        with open(TIMESERIES_CACHE_PATH, "r", encoding="utf-8") as f:
            all_series = json.load(f)

        if not isinstance(all_series, list) or not all_series:
            return {"data": [], "corr": None}

        all_series_sorted = sorted(all_series, key=lambda r: r["date"])

        if years and years > 0:
            last_date = dt.date.fromisoformat(all_series_sorted[-1]["date"])
            cutoff = last_date - dt.timedelta(days=365 * years)
            flood_series = [
                rec
                for rec in all_series_sorted
                if dt.date.fromisoformat(rec["date"]) >= cutoff
            ]
        else:
            flood_series = all_series_sorted

        result = flood_rain_correlation_from_cached(
            flood_series=flood_series,
            rainfall_scale=rainfall_scale_m,
        )
        return result

    except HTTPException:
        raise
    except EEException as e:
        return JSONResponse(
            status_code=502,
            content={"detail": f"Earth Engine error: {str(e)}"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error: {str(e)}"},
        )


# ================= DỰ BÁO MƯA & CẢNH BÁO NGẬP ================


@app.get("/forecast")
async def get_flood_risk_forecast():
    """
    Dự báo nguy cơ ngập dựa trên lượng mưa dự báo 5 ngày (3h forecast) của OpenWeather.
    """
    if not OPENWEATHER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENWEATHER_API_KEY chưa được cấu hình trong biến môi trường.",
        )

    try:
        url = "https://api.openweathermap.org/data/2.5/forecast"
        params = {
            "lat": HCM_LAT,
            "lon": HCM_LON,
            "appid": OPENWEATHER_API_KEY,
            "units": "metric",  # nhiệt độ °C, mưa mm
        }

        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Không gọi được OpenWeather forecast: {e}",
        )

    # list: các bước dự báo 3h
    items = data.get("list", [])
    if not items:
        raise HTTPException(
            status_code=500,
            detail="Không có dữ liệu forecast từ OpenWeather.",
        )

    # Gộp mưa theo ngày (giờ VN UTC+7)
    daily_rain: dict[str, float] = {}
    TZ_OFFSET_HOURS = 7

    for it in items:
        try:
            ts = it.get("dt")
            if ts is None:
                continue

            dt_utc = dt.datetime.utcfromtimestamp(ts)
            dt_local = dt_utc + dt.timedelta(hours=TZ_OFFSET_HOURS)
            date_str = dt_local.date().isoformat()

            rain_3h = it.get("rain", {}).get("3h", 0.0)
            rain_val = float(rain_3h) if rain_3h is not None else 0.0
        except Exception:
            continue

        daily_rain[date_str] = daily_rain.get(date_str, 0.0) + rain_val

    if not daily_rain:
        raise HTTPException(
            status_code=500,
            detail="Không gom được lượng mưa theo ngày từ OpenWeather.",
        )

    # Sắp xếp ngày, chỉ lấy khoảng 7 ngày đầu cho UI
    sorted_dates = sorted(daily_rain.keys())
    raw_daily = [
        {"date": d, "rain_mm": round(daily_rain[d], 2)}
        for d in sorted_dates[:7]
    ]

    # Tổng mưa 3 ngày & 5 ngày
    rain_3d = round(sum(r["rain_mm"] for r in raw_daily[:3]), 2)
    rain_5d = round(sum(r["rain_mm"] for r in raw_daily[:5]), 2)

    risk_level = classify_risk(rain_3d)

    city = data.get("city", {})
    location_name = city.get("name") or "TP.HCM (xấp xỉ tâm vùng)"

    result = {
        "location": {
            "name": location_name,
            "lat": HCM_LAT,
            "lon": HCM_LON,
        },
        "rain_3d_mm": rain_3d,
        "rain_5d_mm": rain_5d,
        "risk_level": risk_level,
        "thresholds": {
            "rain_3d_medium": RAIN_3D_MEDIUM,
            "rain_3d_high": RAIN_3D_HIGH,
        },
        "raw_daily": raw_daily,
    }

    return result


# ====================== BÁO CÁO ZIP =========================


@app.post("/report")
async def create_report(
    req: FloodRequest,
    years: int = 5,
    rainfall_scale_m: int = 5000,
):
    """
    Tạo 1 file ZIP gồm:
      - flood_map.png        : ảnh bản đồ ngập (nền tối + ranh giới AOI vàng + vùng ngập xanh)
      - flood_timeseries.csv : chuỗi diện tích ngập (dùng cache 10 năm, lọc N năm gần nhất)
      - rainfall.csv         : chuỗi lượng mưa tương ứng (CHIRPS)
      - metadata.json        : thông tin sự kiện hiện tại
    """
    # ========= 1. Ảnh bản đồ ngập từ GEE =========
    aoi_asset = req.aoi_asset or os.getenv("AOI_ASSET")
    if not aoi_asset:
        raise HTTPException(
            status_code=400,
            detail="AOI asset not provided and AOI_ASSET env missing",
        )

    try:
        # chạy detect_flood giống endpoint /flood
        result = detect_flood(
            aoi_asset,
            req.pre_start,
            req.pre_end,
            req.event_start,
            req.event_end,
            req.min_diff_db if req.min_diff_db is not None else -2.0,
            req.elev_max_m or 15,
            req.scale_m or 30,
        )

        # thống kê sự kiện hiện tại (tổng vùng merge)
        area_km2 = float(ee.Number(result["area_km2"]).getInfo())
        pixel_count = int(ee.Number(result["pixel_count"]).getInfo())

        # flood mask & AOI geometry
        flood_img = ee.Image(result["image"])
        aoi_geom = result["aoi"]

        # tạo ảnh composite (nền tối + AOI border vàng + flood xanh)
        map_img = make_flood_map_image(flood_img, aoi_geom)

        # size lấy từ req.thumb_size nếu có, mặc định 1024
        thumb_size = getattr(req, "thumb_size", None) or 1024

        # lấy URL PNG từ GEE (img đã visualize, nên is_mask=False)
        thumb = thumb_url(map_img, aoi_geom, size=thumb_size, is_mask=False)

        # tải PNG về backend
        resp = requests.get(thumb, timeout=60)
        resp.raise_for_status()
        flood_png = resp.content

    except EEException as e:
        return JSONResponse(
            status_code=502,
            content={"detail": f"Earth Engine error (flood/report): {str(e)}"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error (flood/report): {str(e)}"},
        )

    # ========= 2. Chuỗi ngập từ cache 10 năm =========
    try:
        if not TIMESERIES_CACHE_PATH.exists():
            raise HTTPException(
                status_code=500,
                detail=(
                    "Timeseries cache chưa tồn tại. "
                    "Hãy chạy script precompute_timeseries.py để tạo file."
                ),
            )

        with open(TIMESERIES_CACHE_PATH, "r", encoding="utf-8") as f:
            all_series = json.load(f)

        if not isinstance(all_series, list) or not all_series:
            raise HTTPException(
                status_code=500,
                detail="Timeseries cache rỗng hoặc sai định dạng.",
            )

        all_series_sorted = sorted(all_series, key=lambda r: r["date"])

        if years and years > 0:
            last_date = dt.date.fromisoformat(all_series_sorted[-1]["date"])
            cutoff = last_date - dt.timedelta(days=365 * years)
            flood_series = [
                rec
                for rec in all_series_sorted
                if dt.date.fromisoformat(rec["date"]) >= cutoff
            ]
        else:
            flood_series = all_series_sorted

        # Chuẩn bị khoảng thời gian cho CHIRPS
        dates = [dt.date.fromisoformat(rec["date"]) for rec in flood_series]
        start_date = min(dates).isoformat()
        end_date = max(dates).isoformat()

        # ========= 3. Chuỗi mưa CHIRPS =========
        rain_series = rainfall_timeseries(
            start_date=start_date,
            end_date=end_date,
            scale=rainfall_scale_m,
        )

    except HTTPException:
        raise
    except EEException as e:
        return JSONResponse(
            status_code=502,
            content={"detail": f"Earth Engine error (rainfall/report): {str(e)}"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error (timeseries/report): {str(e)}"},
        )

    # ========= 4. Tạo CSV trong bộ nhớ =========
    # 4.1 flood_timeseries.csv
    flood_output = io.StringIO()
    flood_fields = [
        "date",
        "area_km2",
        "pixel_count",
        "pre_start",
        "pre_end",
        "event_start",
        "event_end",
    ]
    flood_writer = csv.DictWriter(flood_output, fieldnames=flood_fields)
    flood_writer.writeheader()
    for row in flood_series:
        flood_writer.writerow(
            {
                "date": row.get("date"),
                "area_km2": row.get("area_km2"),
                "pixel_count": row.get("pixel_count"),
                "pre_start": row.get("pre_start"),
                "pre_end": row.get("pre_end"),
                "event_start": row.get("event_start"),
                "event_end": row.get("event_end"),
            }
        )
    flood_csv_bytes = flood_output.getvalue().encode("utf-8")

    # 4.2 rainfall.csv
    rain_output = io.StringIO()
    rain_fields = ["date", "rain_mm"]
    rain_writer = csv.DictWriter(rain_output, fieldnames=rain_fields)
    rain_writer.writeheader()
    for row in rain_series:
        rain_writer.writerow(
            {
                "date": row.get("date"),
                "rain_mm": row.get("rain_mm"),
            }
        )
    rain_csv_bytes = rain_output.getvalue().encode("utf-8")

    # 4.3 metadata.json (thông tin sự kiện hiện tại)
    meta = {
        "pre_start": req.pre_start,
        "pre_end": req.pre_end,
        "event_start": req.event_start,
        "event_end": req.event_end,
        "area_km2_event": area_km2,
        "pixel_count_event": pixel_count,
        "years_for_series": years,
        "rainfall_scale_m": rainfall_scale_m,
    }
    meta_bytes = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")

    # ========= 5. Gói tất cả vào ZIP =========
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("flood_map.png", flood_png)
        zf.writestr("flood_timeseries.csv", flood_csv_bytes)
        zf.writestr("rainfall.csv", rain_csv_bytes)
        zf.writestr("metadata.json", meta_bytes)

    zip_buffer.seek(0)

    filename = (
        f"flood_report_{req.event_start}_to_{req.event_end}.zip"
        .replace(":", "-")
    )

    return StreamingResponse(
        zip_buffer,
        media_type="application/x-zip-compressed",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
