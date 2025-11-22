# Hệ thống phân tích và đánh giá ngập TP.HCM sau sáp nhập
Dự án gồm 2 phần:
- **gee-flood-api**: Backend FastAPI + Google Earth Engine
- **gee-flood-web**: Frontend React + Vite + TypeScript

## 1. Yêu cầu hệ thống
- Python 3.10+
- Node.js 18+
- Git
- Tài khoản Google Earth Engine đã kích hoạt API
- OpenWeather API Key (cho module dự báo mưa)

---

# 2. Backend (gee-flood-api)
## Cài đặt
```bash
cd gee-flood-api
python -m venv venv
.\venv\Scripts\activate    # Windows
pip install -r requirements.txt
