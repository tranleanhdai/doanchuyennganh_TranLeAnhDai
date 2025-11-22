  // src/api.ts
  import axios from "axios";
  import type {
    FloodRequest,
    FloodResponse,
    FloodTimeseriesResponse,
    RainfallResponse,
    CorrelationResponse,
  } from "./types";

  const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000",
  });
  export async function getAoi(): Promise<any> {
    // backend /aoi trả: { aoi_geojson: <FeatureCollection> }
    const res = await api.get<{ aoi_geojson: any }>("/aoi");
    return res.data.aoi_geojson; // 👈 trả đúng GeoJSON cho MapView
  }
  // --- Flood event detection ---
  export async function detectFlood(payload: FloodRequest): Promise<FloodResponse> {
    const res = await api.post<FloodResponse>("/flood", payload);
    return res.data;
  }

  // --- Flood timeseries ---
  export async function getFloodTimeseries(params: {
    years?: number;
    step_days?: number;
    min_diff_db?: number;
    elev_max_m?: number;
    scale_m?: number;
  } = {}): Promise<FloodTimeseriesResponse> {
    // backend trả {"data": [...]} => unwrap ra mảng
    const res = await api.get<{ data: FloodTimeseriesResponse }>(
      "/flood/timeseries",
      { params }
    );
    return res.data.data;
  }

  // --- Rainfall timeseries ---
  export async function getRainfall(params: {
    start: string;
    end: string;
    scale_m?: number;
  }): Promise<RainfallResponse> {
    // backend cũng trả {"data": [...]} => unwrap ra mảng
    const res = await api.get<{ data: RainfallResponse }>("/rainfall", {
      params,
    });
    return res.data.data;
  }

  // --- Flood–rain correlation ---
  export async function getCorrelation(params: {
    years?: number;
    step_days?: number;
    rainfall_scale_m?: number;
    min_diff_db?: number;
    elev_max_m?: number;
    scale_m?: number;
  } = {}): Promise<CorrelationResponse> {
    // backend trả đúng shape CorrelationResponse { data: [...], corr: number | null }
    const res = await api.get<CorrelationResponse>("/correlation", { params });
    return res.data;
  }
  // --- Download report (ZIP: map + CSV) ---
  export async function downloadReport(
    payload: FloodRequest,
    options: { years?: number; rainfall_scale_m?: number } = {}
  ): Promise<Blob> {
    const { years = 5, rainfall_scale_m = 5000 } = options;

    const res = await api.post<Blob>("/report", payload, {
      params: { years, rainfall_scale_m },
      responseType: "blob", // quan trọng: nhận nhị phân (zip)
    });

    return res.data;
  }
  export async function getForecast() {
    const res = await api.get("/forecast");
    return res.data;
  }