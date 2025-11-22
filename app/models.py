from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class FloodRequest(BaseModel):
    aoi_asset: Optional[str] = Field(
        None, description="EE asset id of AOI FeatureCollection"
    )
    pre_start: str
    pre_end: str
    event_start: str
    event_end: str
    min_diff_db: float = -2.0
    elev_max_m: Optional[float] = 15.0
    scale_m: int = 30
    max_vertices: int = 5000
    # dùng chung cho các ảnh map (PNG từ GEE)
    thumb_size: int = 1024


class FloodStats(BaseModel):
    # tổng trên vùng merge (3 tỉnh)
    area_km2: float
    pixel_count: int
    scale_m: int

    # diện tích ngập theo từng khu
    area_km2_hcm: float
    area_km2_bd: float
    area_km2_brvt: float


class FloodMapLayers(BaseModel):
    """Các URL ảnh từ GEE để hiển thị trên WebGIS."""
    flood: Optional[str] = None      # mask ngập (composite nền tối + AOI vàng)
    pre_vv: Optional[str] = None     # VV trước sự kiện
    event_vv: Optional[str] = None   # VV trong sự kiện
    delta_db: Optional[str] = None   # ΔdB (event - pre)


class FloodRegions(BaseModel):
    """GeoJSON ranh giới cho từng khu + vùng merge."""
    merged: Dict[str, Any]
    hcm: Dict[str, Any]
    bd: Dict[str, Any]
    brvt: Dict[str, Any]


class FloodResponse(BaseModel):
    stats: FloodStats
    polygons_geojson: Dict[str, Any]
    aoi_geojson: Optional[Dict[str, Any]] = None
    # giữ lại thumb_url cho UI cũ (thumbnail nhỏ)
    thumb_url: Optional[str] = None
    # các lớp ảnh hiển thị trên WebGIS
    layers: Optional[FloodMapLayers] = None
    # ranh giới từng khu để bật layer trên MapView
    regions_geojson: Optional[FloodRegions] = None
