// src/types.ts
import type * as GeoJSON from "geojson";

// ================== FLOOD REQUEST/RESPONSE ==================

export interface FloodRequest {
  aoi_asset?: string;
  pre_start: string;
  pre_end: string;
  event_start: string;
  event_end: string;
  min_diff_db?: number;
  elev_max_m?: number;
  scale_m?: number;
  max_vertices?: number;
  thumb_size?: number;
}

// tổng + chia theo 3 vùng
export interface FloodStats {
  // tổng toàn vùng sau sáp nhập (3 tỉnh gộp)
  area_km2: number;
  pixel_count: number;
  scale_m: number;

  // chia riêng từng vùng (backend sẽ trả về 3 số này)
  area_km2_hcm: number;
  area_km2_bd: number;
  area_km2_brvt: number;
}

// các URL ảnh map từ backend
export interface FloodMapLayers {
  flood?: string | null;     // composite ngập (mask + AOI)
  pre_vv?: string | null;    // VV pre
  event_vv?: string | null;  // VV event
  delta_db?: string | null;  // ΔdB
}

// ranh giới từng vùng (GeoJSON) để vẽ trên MapView
export interface FloodRegions {
  merged: GeoJSON.FeatureCollection; // ranh 3 tỉnh gộp
  hcm: GeoJSON.FeatureCollection;    // ranh TP.HCM cũ
  bd: GeoJSON.FeatureCollection;     // ranh Bình Dương
  brvt: GeoJSON.FeatureCollection;   // ranh Bà Rịa – Vũng Tàu
}

// ⚠ Kiểu dữ liệu trả về từ backend /flood
export interface FloodResponse {
  stats: FloodStats;
  polygons_geojson: GeoJSON.FeatureCollection;
  aoi_geojson: GeoJSON.FeatureCollection | null;

  // ảnh PNG cho các layer
  layers?: FloodMapLayers | null;

  // ranh giới 3 vùng + merged (option vì backend cũ có thể chưa trả)
  regions_geojson?: FloodRegions | null;
}

// ================== FLOOD TIMESERIES ==================

export interface FloodTimeseriesPoint {
  date: string;
  area_km2: number;
  pixel_count: number;
  pre_start: string;
  pre_end: string;
  event_start: string;
  event_end: string;
}

export type FloodTimeseriesResponse = FloodTimeseriesPoint[];

// ================== RAINFALL ==================

export interface RainfallPoint {
  date: string;
  rain_mm: number;
}

export type RainfallResponse = RainfallPoint[];

// ================== CORRELATION ==================

export interface CorrelationPoint {
  date: string;
  rain_mm: number;
  area_km2: number;
}

export interface CorrelationResponse {
  data: CorrelationPoint[];
  corr: number | null;
}
