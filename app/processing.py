import datetime as dt
import ee

ee.Initialize()

# ===== AOI SAU SÁP NHẬP: HCM + BÌNH DƯƠNG + BÀ RỊA-VŨNG TÀU =====
# Bản merge V2 bạn vừa export (3 tỉnh gộp lại)
AOI_MERGED = ee.FeatureCollection(
    "users/tranleanhdaintd2/hcm_merged_v2"
).geometry()

# ===== AOI RIÊNG TỪNG TỈNH (để dành, sau này tách thống kê) =====
AOI_HCM = ee.FeatureCollection(
    "users/tranleanhdaintd2/hcm_only"
).geometry()

AOI_BD = ee.FeatureCollection(
    "users/tranleanhdaintd2/binhduong_only"
).geometry()

AOI_BRVT = ee.FeatureCollection(
    "users/tranleanhdaintd2/brvt_only"
).geometry()

# Biến AOI cũ – giữ lại cho các hàm phía dưới dùng,
# hiện tại = toàn vùng sau sáp nhập (3 tỉnh).
AOI = AOI_MERGED


# ---------- Helpers ----------


def _to_db(img: ee.Image) -> ee.Image:
    """Chuyển từ thang linear sang dB."""
    return ee.Image(10).multiply(img.log10())


def _lee_speckle(img_db: ee.Image) -> ee.Image:
    """Lọc nhiễu đơn giản 3x3."""
    return img_db.focal_mean(radius=1, units="pixels")


def load_s1_vv(aoi: ee.Geometry, start: str, end: str) -> ee.Image:
    """Lấy Sentinel-1 VV, median, lọc nhiễu, trả về ảnh dB."""
    col = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(aoi)
        .filterDate(start, end)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.eq("orbitProperties_pass", "DESCENDING"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .select("VV")
    )

    size = col.size()
    vv_db_fallback = ee.Image.constant(-20).rename("VV").clip(aoi)

    def _compose_db(ic: ee.ImageCollection) -> ee.Image:
        vv_lin = ic.map(
            lambda i: ee.Image.constant(10).pow(i.select("VV").divide(10))
        )
        vv_med_lin = vv_lin.median()
        vv_db = _to_db(vv_med_lin).rename("VV")
        return _lee_speckle(vv_db).clip(aoi)

    vv_db = ee.Image(
        ee.Algorithms.If(size.gt(0), _compose_db(col), vv_db_fallback)
    )
    return vv_db


def jrc_perm_water_mask() -> ee.Image:
    """Mask nước thường trực (occurrence >= 75%)."""
    return (
        ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
        .select("occurrence")
        .gte(75)
    )


def srtm_elev_mask(max_m: float) -> ee.Image:
    """Mask vùng có cao độ <= max_m (DEM SRTM)."""
    return ee.Image("USGS/SRTMGL1_003").lte(max_m)


def otsu_threshold(img_db: ee.Image, region: ee.Geometry, scale: int) -> ee.Number:
    """
    Ở đây dùng percentile 10% làm ngưỡng đơn giản (thay cho Otsu đầy đủ).
    Nếu reduceRegion rỗng -> fallback -15 dB.
    """
    img = img_db.rename("x")

    dct = img.reduceRegion(
        reducer=ee.Reducer.percentile([10]),
        geometry=region,
        scale=scale,
        bestEffort=True,
    )

    vals = ee.Dictionary(dct).values()
    p = ee.Algorithms.If(
        ee.Number(ee.List(vals).size()).gt(0),
        ee.List(vals).get(0),
        None,
    )

    return ee.Number(ee.Algorithms.If(p, p, -15))


def _area_km2_for_region(
    flood_img: ee.Image, region: ee.Geometry, scale: int
) -> ee.Number:
    """
    Tính diện tích ngập (km²) trong 1 vùng con (HCM / BD / BRVT).
    flood_img: ảnh mask 0/1 đã rename('flood').
    """
    stats_area = flood_img.multiply(ee.Image.pixelArea()).reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=region,
        scale=scale,
        maxPixels=1e13,
        bestEffort=True,
    ).get("flood")

    area_m2 = ee.Number(
        ee.Algorithms.If(stats_area, stats_area, ee.Number(0))
    )
    return area_m2.divide(1e6)


# ---------- Main flood pipeline cho 1 sự kiện (dùng cho /flood) ----------


def detect_flood(
    aoi_fc,
    pre_start: str,
    pre_end: str,
    event_start: str,
    event_end: str,
    min_diff_db: float = -2.0,
    elev_max_m: float = 15,
    scale: int = 30,
):
    """
    Phát hiện ngập cho 1 khoảng thời gian:
    - Luôn dùng AOI sau sáp nhập (AOI_MERGED = HCM + BD + BR-VT).
    - aoi_fc giữ lại chỉ để tương thích với main.py, nhưng bị bỏ qua.

    LƯU Ý:
    - Các thống kê area_km2, pixel_count hiện tại là
      TỔNG DIỆN TÍCH NGẬP TOÀN VÙNG SAU SÁP NHẬP (3 tỉnh),
      đồng thời có thêm area_km2_hcm / bd / brvt.
    """

    aoi = AOI  # = AOI_MERGED

    # VV dB trước và trong sự kiện
    pre_vv = load_s1_vv(aoi, pre_start, pre_end)
    evt_vv = load_s1_vv(aoi, event_start, event_end)

    # chênh lệch dB
    delta = evt_vv.subtract(pre_vv)  # event - pre (dB)

    # ngưỡng nước từ event
    otsu = otsu_threshold(evt_vv, aoi, scale)
    water_evt = evt_vv.lte(otsu)

    # giảm dB đủ mạnh
    drop = delta.lte(min_diff_db)

    # kết hợp
    flood = water_evt.And(drop)

    # bỏ nước thường trực + địa hình cao
    flood = flood.updateMask(jrc_perm_water_mask().Not())
    if elev_max_m is not None:
        flood = flood.updateMask(srtm_elev_mask(elev_max_m))

    # đảm bảo band name ổn định để reduceRegion không null
    flood = flood.updateMask(flood).rename("flood").clip(aoi)

    # --- Thống kê tổng (fallback 0 server-side) ---
    stats_count = flood.reduceRegion(
        reducer=ee.Reducer.count(),
        geometry=aoi,
        scale=scale,
        maxPixels=1e13,
        bestEffort=True,
    ).get("flood")
    pixel_count = ee.Number(
        ee.Algorithms.If(stats_count, stats_count, ee.Number(0))
    )

    stats_area = flood.multiply(ee.Image.pixelArea()).reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=aoi,
        scale=scale,
        maxPixels=1e13,
        bestEffort=True,
    ).get("flood")
    area_m2 = ee.Number(
        ee.Algorithms.If(stats_area, stats_area, ee.Number(0))
    )
    area_km2 = area_m2.divide(1e6)

    # --- Diện tích ngập cho từng khu: HCM / BD / BRVT ---
    area_km2_hcm = _area_km2_for_region(flood, AOI_HCM, scale)
    area_km2_bd = _area_km2_for_region(flood, AOI_BD, scale)
    area_km2_brvt = _area_km2_for_region(flood, AOI_BRVT, scale)

    # --- Vector hóa ---
    vectors = flood.selfMask().reduceToVectors(
        geometry=aoi,
        scale=scale,
        maxPixels=1e13,
        geometryType="polygon",
        labelProperty="class",
        eightConnected=True,
    )
    aoi_fc = ee.FeatureCollection([ee.Feature(aoi, {})])

    # 👇 TRẢ THÊM 3 ẢNH pre / event / delta
    return {
        "image": flood,  # mask nhị phân (0/1) cho map & tính toán
        "aoi": aoi,
        "pixel_count": pixel_count,
        "area_km2": area_km2,
        "area_km2_hcm": area_km2_hcm,
        "area_km2_bd": area_km2_bd,
        "area_km2_brvt": area_km2_brvt,
        "vectors": vectors,
        "aoi_fc": aoi_fc,
        "pre_vv_db": pre_vv,
        "evt_vv_db": evt_vv,
        "delta_db": delta,
        # NOTE: nếu sau này bạn muốn tách theo tỉnh,
        # có thể dùng AOI_HCM, AOI_BD, AOI_BRVT ở đây.
    }


# ---------- Phiên bản nhẹ cho TIMESERIES: chỉ tính stats, không vector ----------


def detect_flood_stats_only(
    pre_start: str,
    pre_end: str,
    event_start: str,
    event_end: str,
    min_diff_db: float = -2.0,
    elev_max_m: float = 15,
    scale: int = 30,
):
    """
    Pipeline giống detect_flood nhưng KHÔNG vector hóa,
    chỉ trả về (area_km2, pixel_count) dạng ee.Number.
    Dùng riêng cho generate_flood_timeseries để nhẹ hơn.

    LƯU Ý: vẫn là thống kê TRÊN TOÀN VÙNG SAU SÁP NHẬP (3 tỉnh).
    """
    aoi = AOI

    pre_vv = load_s1_vv(aoi, pre_start, pre_end)
    evt_vv = load_s1_vv(aoi, event_start, event_end)

    delta = evt_vv.subtract(pre_vv)
    otsu = otsu_threshold(evt_vv, aoi, scale)
    water_evt = evt_vv.lte(otsu)
    drop = delta.lte(min_diff_db)
    flood = water_evt.And(drop)

    flood = flood.updateMask(jrc_perm_water_mask().Not())
    if elev_max_m is not None:
        flood = flood.updateMask(srtm_elev_mask(elev_max_m))

    flood = flood.updateMask(flood).rename("flood").clip(aoi)

    stats_count = flood.reduceRegion(
        reducer=ee.Reducer.count(),
        geometry=aoi,
        scale=scale,
        maxPixels=1e13,
        bestEffort=True,
    ).get("flood")
    pixel_count = ee.Number(
        ee.Algorithms.If(stats_count, stats_count, ee.Number(0))
    )

    stats_area = flood.multiply(ee.Image.pixelArea()).reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=aoi,
        scale=scale,
        maxPixels=1e13,
        bestEffort=True,
    ).get("flood")
    area_m2 = ee.Number(
        ee.Algorithms.If(stats_area, stats_area, ee.Number(0))
    )
    area_km2 = area_m2.divide(1e6)

    return area_km2, pixel_count


def to_geojson(fc, max_features: int = 10000):
    """
    Chuyển FeatureCollection sang GeoJSON, giới hạn số feature
    để tránh lỗi 'Collection query aborted after accumulating over 5000 elements'.
    """
    fc = ee.FeatureCollection(fc).limit(max_features)
    return fc.getInfo()


# ---------- TẠO ẢNH BẢN ĐỒ NGẬP CHO REPORT / WEBGIS ----------


def make_flood_map_image(flood_img: ee.Image, aoi: ee.Geometry) -> ee.Image:
    """
    Tạo ảnh bản đồ ngập để xuất PNG:
    - Nền tối
    - Ranh giới AOI màu vàng
    - Vùng ngập màu xanh dương

    flood_img: ảnh mask 0/1 (band "flood") từ detect_flood["image"].
    """
    base = (
        ee.Image.constant([10, 10, 15])  # hơi xám một chút
        .rename(["R", "G", "B"])
        .visualize(bands=["R", "G", "B"], min=0, max=50)
    )

    flood_vis = (
        ee.Image(flood_img)
        .selfMask()
        .visualize(min=0, max=1, palette=["00BFFF"])  # DeepSkyBlue
    )

    aoi_border = (
        ee.Image()
        .byte()
        .paint(aoi, 1, 3)
        .visualize(palette=["FFFF00"])
    )

    return base.blend(flood_vis).blend(aoi_border)


def make_vv_image(vv_db: ee.Image, aoi: ee.Geometry) -> ee.Image:
    """
    Visualize VV dB (pre hoặc event) với thang xám + viền AOI vàng.
    """
    vv_vis = (
        vv_db.clip(aoi)
        .visualize(
            min=-25,
            max=0,
            palette=["000000", "333333", "888888", "FFFFFF"],
        )
    )

    aoi_border = (
        ee.Image()
        .byte()
        .paint(aoi, 1, 3)
        .visualize(palette=["FFFF00"])
    )

    return vv_vis.blend(aoi_border)


def make_delta_image(delta_db: ee.Image, aoi: ee.Geometry) -> ee.Image:
    """
    Visualize ΔdB (event - pre) với giả màu:
    giảm mạnh -> tím/xanh, ít thay đổi -> vàng.
    """
    delta_vis = (
        delta_db.clip(aoi)
        .visualize(
            min=-5,
            max=1,
            palette=[
                "440154",  # tím
                "3b528b",
                "21918c",
                "5ec962",
                "fde725",  # vàng
            ],
        )
    )

    aoi_border = (
        ee.Image()
        .byte()
        .paint(aoi, 1, 3)
        .visualize(palette=["FFFF00"])
    )

    return delta_vis.blend(aoi_border)


def thumb_url(img, region, size: int = 1024, is_mask: bool = True) -> str:
    """
    Tạo URL thumbnail:
    - Nếu is_mask=True  (mặc định): img là mask 0/1 -> tự selfMask, min/max 0–1
    - Nếu is_mask=False: img đã visualize (RGB) -> dùng trực tiếp, không đổi min/max
    """
    image = ee.Image(img)

    if is_mask:
        params = {
            "min": 0,
            "max": 1,
            "dimensions": size,
            "region": region,
            "format": "png",
        }
        image = image.selfMask()
    else:
        params = {
            "dimensions": size,
            "region": region,
            "format": "png",
        }

    return image.getThumbURL(params)


# ---------- Flood TIMESERIES (dùng cho script precompute) ----------


def generate_flood_timeseries(
    years: int = 3,
    step_days: int = 45,
    min_diff_db: float = -2.0,
    elev_max_m: float = 15,
    scale: int = 30,
):
    """
    Sinh chuỗi thời gian diện tích ngập.
    - Mặc định 3 năm gần nhất, mỗi ~45 ngày 1 điểm.
    - Với mỗi mốc:
        + pre: từ d-7 tới d-1
        + event: từ d tới d+2
    Trả về: list các dict {date, area_km2, pixel_count, ...}
    """

    today = dt.date.today()
    start = today - dt.timedelta(days=365 * years)

    dates = []
    d = start
    while d <= today:
        dates.append(d)
        d += dt.timedelta(days=step_days)

    series = []

    for d in dates:
        pre_start = (d - dt.timedelta(days=7)).isoformat()
        pre_end = (d - dt.timedelta(days=1)).isoformat()
        event_start = d.isoformat()
        event_end = (d + dt.timedelta(days=2)).isoformat()

        try:
            area_ee, pixels_ee = detect_flood_stats_only(
                pre_start=pre_start,
                pre_end=pre_end,
                event_start=event_start,
                event_end=event_end,
                min_diff_db=min_diff_db,
                elev_max_m=elev_max_m,
                scale=scale,
            )

            area_km2 = float(area_ee.getInfo())
            pixel_count = int(pixels_ee.getInfo())
        except Exception:
            continue

        series.append(
            {
                "date": d.isoformat(),
                "area_km2": area_km2,
                "pixel_count": pixel_count,
                "pre_start": pre_start,
                "pre_end": pre_end,
                "event_start": event_start,
                "event_end": event_end,
            }
        )

    return series


# ---------- RAINFALL (CHIRPS DAILY) ----------


def rainfall_timeseries(
    start_date: str,
    end_date: str,
    scale: int = 5000,
):
    """
    Tính lượng mưa trung bình (mm/ngày) trên toàn AOI
    dùng dataset CHIRPS Daily, cho khoảng thời gian [start_date, end_date].

    Trả về list các dict:
    [{ "date": "YYYY-MM-DD", "rain_mm": float }, ...]
    """
    start = ee.Date(start_date)
    end = ee.Date(end_date)

    col = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
        .filterDate(start, end)
        .filterBounds(AOI)
        .select("precipitation")
    )

    def per_image(img):
        mean_rain = img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=AOI,
            scale=scale,
            maxPixels=1e13,
            bestEffort=True,
        ).get("precipitation")

        date_str = img.date().format("YYYY-MM-dd")
        return ee.Feature(
            None,
            {
                "date": date_str,
                "rain_mm": mean_rain,
            },
        )

    fc = ee.FeatureCollection(col.map(per_image))

    features = fc.getInfo().get("features", [])
    data = []

    for f in features:
        props = f.get("properties", {})
        date = props.get("date")
        rain = props.get("rain_mm")
        rain_val = float(rain) if rain is not None else 0.0
        data.append({"date": date, "rain_mm": rain_val})

    return data


# ---------- FLOOD + RAIN CORRELATION (EE version – ít dùng) ----------


def _pearson_corr(xs, ys):
    """
    Tính hệ số tương quan Pearson đơn giản cho 2 list số.
    Trả về None nếu ít hơn 2 phần tử hoặc phương sai bằng 0.
    """
    n = len(xs)
    if n < 2:
        return None

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n

    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x == 0 or var_y == 0:
        return None

    cov = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    return cov / (var_x ** 0.5 * var_y ** 0.5)


def flood_rain_correlation(
    years: int = 5,
    step_days: int = 30,
    rainfall_scale: int = 5000,
    min_diff_db: float = -2.0,
    elev_max_m: float = 15,
    scale: int = 30,
):
    """
    PHIÊN BẢN ĐẦY ĐỦ – tính luôn chuỗi ngập bằng GEE (chạy nặng).
    Giữ lại để dùng offline / script nếu cần, nhưng frontend không gọi nữa.
    """

    flood_series = generate_flood_timeseries(
        years=years,
        step_days=step_days,
        min_diff_db=min_diff_db,
        elev_max_m=elev_max_m,
        scale=scale,
    )

    if not flood_series:
        return {"data": [], "corr": None}

    start_date = flood_series[0]["date"]
    end_date = flood_series[-1]["date"]

    rain_series = rainfall_timeseries(
        start_date=start_date,
        end_date=end_date,
        scale=rainfall_scale,
    )

    rain_map = {r["date"]: r["rain_mm"] for r in rain_series}

    combined = []
    rains = []
    areas = []

    for f in flood_series:
        d = f["date"]
        if d in rain_map:
            rain = float(rain_map[d]) if rain_map[d] is not None else 0.0
            area = float(f["area_km2"])
            combined.append(
                {
                    "date": d,
                    "rain_mm": rain,
                    "area_km2": area,
                }
            )
            rains.append(rain)
            areas.append(area)

    corr = _pearson_corr(rains, areas) if combined else None

    return {
        "data": combined,
        "corr": corr,
    }


# ---------- FLOOD + RAIN CORRELATION (dùng chuỗi NGẬP CACHE) ----------


def flood_rain_correlation_from_cached(
    flood_series,
    rainfall_scale: int = 5000,
):
    """
    Nhận sẵn flood_series (list dict từ JSON cache),
    chỉ gọi CHIRPS cho mưa và tính tương quan.

    flood_series: [{ "date": "YYYY-MM-DD", "area_km2": float, ... }, ...]
    """
    if not flood_series:
        return {"data": [], "corr": None}

    # đảm bảo sort theo thời gian
    sorted_series = sorted(flood_series, key=lambda r: r["date"])

    # Lấy khoảng thời gian cần cho CHIRPS
    dates = [dt.date.fromisoformat(rec["date"]) for rec in sorted_series]
    start_date = min(dates).isoformat()
    end_date = max(dates).isoformat()

    rain_series = rainfall_timeseries(
        start_date=start_date,
        end_date=end_date,
        scale=rainfall_scale,
    )

    rain_map = {r["date"]: r["rain_mm"] for r in rain_series}

    combined = []
    rains = []
    areas = []

    for f in sorted_series:
        d = f["date"]
        if d in rain_map:
            rain = float(rain_map[d]) if rain_map[d] is not None else 0.0
            area = float(f.get("area_km2", 0.0))
            combined.append(
                {
                    "date": d,
                    "rain_mm": rain,
                    "area_km2": area,
                }
            )
            rains.append(rain)
            areas.append(area)

    corr = _pearson_corr(rains, areas) if combined else None

    return {
        "data": combined,
        "corr": corr,
    }
