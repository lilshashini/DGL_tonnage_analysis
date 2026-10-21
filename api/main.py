import os
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uuid
import secrets
import requests
from fastapi import FastAPI, HTTPException, BackgroundTasks, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Literal
from dotenv import load_dotenv

# Load credentials
load_dotenv(override=True)

# Import our custom modules
from api.database import (
    get_filtered_data,
    get_countries,
    get_airlines,
    get_weekly_data,
    get_monthly_data,
    get_kpi_summary,
    get_company_codes,
    get_origin_cities,
    get_destination_countries,
    get_destination_cities,
    get_branches,
    execute_custom_query,
    get_sector_carrier_distribution,
)
from api.sea_database import (
    get_sea_data, get_sea_kpi, get_sea_trends, get_sea_options,
    normalize_sea_records, render_sea_query, get_sea_sector_distribution, prepare_sea_query,
    get_sea_source_data,
    classify_sea_sectors,
)
from api.pdf_service import generate_report_bundle as generate_dashboard_pdf
from api.ledger_service import cleanup_report_files
from api.email_service import send_pdf_via_graph
from api.cloud_scheduler_service import sync_schedule_to_cloud, delete_cloud_scheduler_job
from api.scheduler_db import (
    TONNAGE_USERS_TABLE,
    get_headers as get_supabase_headers,
    init_scheduler_db,
    save_schedule,
    get_all_schedules,
    get_schedule,
    delete_schedule,
    update_schedule_status,
    get_supabase_stations,
    get_supabase_branches,
)
import json
import datetime

app = FastAPI(title="Tonnage Reporting API")

# Allow frontend dev server and Vercel deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def normalize_country_name(country: Optional[str], company_code: Optional[str] = None) -> Optional[str]:
    """Ensures country name matches the data warehouse representation ('Viet Nam')."""
    if not country:
        if company_code == "VNM":
            return "Viet Nam"
        return country
    clean = str(country).strip()
    if clean.lower().replace(" ", "") == "vietnam" or company_code == "VNM":
        return "Viet Nam"
    return clean


def extract_station_info_from_sql(custom_sql: str) -> tuple[Optional[str], Optional[str]]:
    """
    Extracts (company_code, country) from a SQL query string.
    Looks for pattern 'Company = <value>' and 'ConLoadPortCountryName = <value>'
    """
    if not custom_sql:
        return None, None
        
    import re
    company_code = None
    country = None
    
    # Matches: vs.Company = 'CMB' or Company = 'CMB' or Company='CMB'
    company_match = re.search(r"\b(?:[a-zA-Z0-9_]+\.)?Company\s*=\s*'([^']+)'", custom_sql, re.IGNORECASE)
    if company_match:
        company_code = company_match.group(1)
        
    country_match = re.search(r"\b(?:[a-zA-Z0-9_]+\.)?ConLoadPortCountryName\s*=\s*'([^']+)'", custom_sql, re.IGNORECASE)
    if country_match:
        country = normalize_country_name(country_match.group(1), company_code)
        
    return company_code, country


def extract_branch_info_from_sql(custom_sql: str) -> Optional[str]:
    """
    Extracts branch code from a SQL query string (e.g. vs.Branch = 'BLR').
    """
    if not custom_sql:
        return None
    import re
    branch_match = re.search(r"\b(?:[a-zA-Z0-9_]+\.)?Branch\s*=\s*'([^']+)'", custom_sql, re.IGNORECASE)
    if branch_match:
        return branch_match.group(1)
    return None


def generate_branchwise_sql(country: str, company_code: str, branch: str, start_date: str, end_date: str) -> str:
    """Generates the standard Branch-wise SQL query."""
    country = normalize_country_name(country, company_code) or "India"
    return f"""
SELECT
    vt.ConsoleNumber AS Console_Number,
    vt.MasterBillNum AS Master_Airway_Bill,
    vt.AirlineName1 AS Airline,
    vt.ConsolTransportMode AS Transport_Mode,
    vt.ETD,
    COALESCE(vt.RealLoadPortCountryName, 'N/A') AS Origin_Country,
    COALESCE(vt.RealLoadPortCity, 'N/A') AS Origin_City,
    COALESCE(vt.RealDisChargePortCountryName, 'N/A') AS Destination_Country,
    COALESCE(vt.RealDisChargePortCity, 'N/A') AS Destination_City,
    vs.Branch AS Branch_Code,
    vs.BranchName AS Branch_Name,
    vs.BranchCity AS Branch_City,
    vs.Consignor AS Consigner,
    vs.ConsignorName AS Consigner_Name,
    vs.Consignee AS Consignee,
    vs.ConsigneeName AS Consignee_Name,
    vs.AgentCode AS Agent_Code,
    vs.AgentName AS Agent_Name,
    COALESCE(MAX(vs.Company), 'Unlinked') AS Company_Code,
    COUNT(DISTINCT vs.ShipmentNumber) AS Total_Shipments,
    ROUND(MAX(vt.Air_ChargebleWeight), 2) AS Tonnage_Chargeable,
    ROUND(MAX(vt.Air_ActualWeight), 2) AS Tonnage_Actual,
    ROUND(SUM(vs.Revenue_USD), 2) AS Revenue_USD,
    ROUND(SUM(vs.Cost_USD), 2) AS Cost_USD,
    ROUND(SUM(vs.Profit_USD), 2) AS Profit_USD,
    ROUND(SUM(vs.Profit_USD) / NULLIF(SUM(vs.Revenue_USD), 0) * 100, 2) AS GP_Margin_Percent
FROM dbo.ChatData_ViewShipConsolTransport vt
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc
    ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs
    ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.ConLoadPortCountryName = '{country}'
    AND vt.ETD >= '{start_date}'
    AND vt.ETD <= '{end_date}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = '{company_code}'
    AND vs.Branch = '{branch}'
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1,
         vt.ConsolTransportMode, vt.ETD, 
         COALESCE(vt.RealLoadPortCountryName, 'N/A'),
         COALESCE(vt.RealLoadPortCity, 'N/A'),
         COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
         COALESCE(vt.RealDisChargePortCity, 'N/A'),
         vs.Branch,
         vs.BranchName,
         vs.BranchCity,
         vs.Consignor,
         vs.ConsignorName,
         vs.Consignee,
         vs.ConsigneeName,
         vs.AgentCode,
         vs.AgentName
ORDER BY vt.ETD DESC, vs.Branch, ROUND(SUM(vs.Revenue_USD), 2) DESC;
""".strip()



def extract_dates_from_sql(custom_sql: str) -> tuple[Optional[str], Optional[str]]:
    """
    Extracts start_date and end_date from ETD comparisons in the query.
    """
    if not custom_sql:
        return None, None
    import re
    start_date = None
    end_date = None
    
    start_match = re.search(r"\b(?:[a-zA-Z0-9_]+\.)?ETD\s*>=\s*'([^']+)'", custom_sql, re.IGNORECASE)
    if start_match:
        start_date = start_match.group(1)
        
    end_match = re.search(r"\b(?:[a-zA-Z0-9_]+\.)?ETD\s*<=\s*'([^']+)'", custom_sql, re.IGNORECASE)
    if not end_match:
        end_match = re.search(r"ETD\s*<\s*DATEADD\(day,\s*1,\s*CAST\('([^']+)'\s+AS\s+date\)\)", custom_sql, re.IGNORECASE)
    if end_match:
        end_date = end_match.group(1)
        
    return start_date, end_date


SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

def get_current_admin(authorization: Optional[str] = Header(None)) -> dict:
    """
    Verifies the JWT token sent in the Authorization header.
    Calls Supabase auth API to verify the token and retrieve the user's email,
    then verifies if the user's email exists in the allowed_admins table.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Bypassing Auth: SUPABASE_URL or SUPABASE_KEY is not set.")
        return {"email": "local_admin@test.com", "name": "Local Admin"}
        
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Please log in."
        )
        
    token = authorization.split(" ")[1]
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "apikey": SUPABASE_KEY
    }
    
    try:
        user_resp = requests.get(f"{SUPABASE_URL}/auth/v1/user", headers=auth_headers, timeout=5)
        if user_resp.status_code != 200:
            raise HTTPException(
                status_code=401,
                detail="Invalid session or expired token. Please log in again."
            )
        
        user_data = user_resp.json()
        email = user_data.get("email")
        if not email:
            raise HTTPException(status_code=401, detail="Email not found in session user data.")
            
        # Check if email is in public.allowed_admins
        db_headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
        admin_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/allowed_admins?email=eq.{email}&select=*",
            headers=db_headers,
            timeout=5
        )
        
        if admin_resp.status_code != 200 or len(admin_resp.json()) == 0:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: {email} is not registered as an authorized administrator."
            )
            
        admin_info = admin_resp.json()[0]
        return {
            "id": user_data.get("id"),
            "email": email,
            "name": admin_info.get("name") or email
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication check failed: {str(e)}")

# --- SERVE NEXT.JS STATIC EXPORT ---
# The Dockerfile builds the frontend into /app/frontend_build
# FastAPI mounts it so the dashboard is accessible at the root URL.
_FRONTEND_BUILD = os.path.join(os.path.dirname(__file__), "..", "frontend_build")
_FRONTEND_BUILD = os.path.normpath(_FRONTEND_BUILD)

@app.get("/", include_in_schema=False)
def serve_root():
    """Serves the Next.js index.html at the root URL."""
    index = os.path.join(_FRONTEND_BUILD, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return JSONResponse({"message": "Backend API is running. Frontend build not found."})

@app.get("/print-view", include_in_schema=False)
@app.get("/print-view/", include_in_schema=False)
def serve_print_view():
    """Serves the print-view page."""
    page1 = os.path.join(_FRONTEND_BUILD, "print-view", "index.html")
    page2 = os.path.join(_FRONTEND_BUILD, "print-view.html")
    if os.path.exists(page1):
        return FileResponse(page1)
    elif os.path.exists(page2):
        return FileResponse(page2)
    return JSONResponse({"error": "print-view not found"}, status_code=404)


# --- DATA MODELS ---
class ReportRequest(BaseModel):
    recipient_email: str
    transport_mode: Literal["AIR", "SEA", "BOTH"] = "AIR"
    # Standard mode fields (optional for custom-sql mode)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    country: Optional[str] = None
    airline: Optional[str] = None
    company_code: Optional[str] = None
    origin_city: Optional[str] = None
    destination_country: Optional[str] = None
    destination_city: Optional[str] = None
    branch: Optional[str] = None
    # Custom SQL mode fields
    mode: Optional[str] = "standard"  # "standard" or "custom-sql"
    custom_sql: Optional[str] = None
    # Section selection for PDF optimization
    include_weekly_visual: bool = True
    include_weekly_ledger: bool = True
    include_monthly_visual: bool = True
    include_monthly_ledger: bool = True
    include_sector_distribution: bool = True
    include_sea_sector_distribution: bool = True
    max_data_rows: int = 100  # Limit table rows to reduce PDF size
    report_type: Optional[str] = "weekly"


class CustomQueryRequest(BaseModel):
    query: str
    transport_mode: Literal["AIR", "SEA"] = "AIR"
    include_sea_sectors: bool = False


class SectorDistributionRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    country: Optional[str] = None
    company_code: Optional[str] = None
    custom_sql: Optional[str] = None
    transport_mode: Literal["AIR", "SEA"] = "AIR"
    airline: Optional[str] = None
    origin_city: Optional[str] = None
    destination_country: Optional[str] = None
    destination_city: Optional[str] = None
    branch: Optional[str] = None


# --- ENDPOINT 1: Fetch Dynamic JSON Data (with dynamic filters) ---
@app.get("/api/data")
def fetch_data(
    start_date: str,
    end_date: str,
    country: str = None,
    airline: str = None,
    company_code: str = None,
    origin_city: str = None,
    destination_country: str = None,
    destination_city: str = None,
    branch: str = None,
    transport_mode: Literal["AIR", "SEA"] = "AIR",
    request: Request = None,
    include_sea_sectors: bool = False,
):
    """Provides filtered JSON data for the React frontend to display charts."""
    try:
        include_ledger = request is not None and request.headers.get("X-Consol-Ledger") == "true"
        if include_ledger or (transport_mode == "SEA" and include_sea_sectors):
            records = (get_sea_source_data if transport_mode == "SEA" else get_filtered_data)(
                start_date, end_date, country, airline, company_code, origin_city,
                destination_country, destination_city, branch)
            prepared = classify_sea_sectors(records) if transport_mode == "SEA" and include_sea_sectors else records
            data = normalize_sea_records(prepared) if transport_mode == "SEA" else records
            result = {"status": "success", "data": data}
            if include_ledger:
                result["ledger_records"] = records
            return result
        data = (get_sea_data if transport_mode == "SEA" else get_filtered_data)(
            start_date, end_date, country, airline, company_code, origin_city, destination_country, destination_city, branch
        )
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sector-carrier-distribution")
def fetch_sector_carrier_distribution(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    country: Optional[str] = None,
    company_code: Optional[str] = None,
    custom_sql: Optional[str] = None,
    query_id: Optional[str] = None,
    transport_mode: Literal["AIR", "SEA"] = "AIR",
    airline: Optional[str] = None,
    origin_city: Optional[str] = None,
    destination_country: Optional[str] = None,
    destination_city: Optional[str] = None,
    branch: Optional[str] = None,
):
    """Provides sector-wise carrier tonnage distribution data."""
    try:
        sql_str = None
        if query_id and query_id in query_cache:
            sql_str = query_cache[query_id]
        elif custom_sql:
            sql_str = custom_sql

        if sql_str:
            sql_company, sql_country = extract_station_info_from_sql(sql_str)
            sql_start, sql_end = extract_dates_from_sql(sql_str)
            if sql_country:
                country = sql_country
            if sql_company:
                company_code = sql_company
            if sql_start:
                start_date = sql_start
            if sql_end:
                end_date = sql_end
            if transport_mode == "SEA":
                branch = extract_branch_info_from_sql(sql_str) or branch

        # Fallbacks to prevent validation/query errors
        if transport_mode == "AIR" and (not country or country == ""):
            country = "India"
        if not start_date or start_date == "":
            start_date = "2025-01-01"
        if not end_date or end_date == "":
            end_date = "2025-12-31"

        if transport_mode == "SEA":
            data = get_sea_sector_distribution(start_date, end_date, country, company_code,
                                               airline, origin_city, destination_country, destination_city, branch)
        else:
            data = get_sector_carrier_distribution(start_date, end_date, country, company_code)
        return {"status": "success", "data": data}
    except Exception as e:
        print(f"Warning in sector-carrier distribution: {e}")
        return {"status": "success", "data": [], "warning": str(e)}


@app.post("/api/sector-carrier-distribution")
def fetch_sector_carrier_distribution_post(req: SectorDistributionRequest):
    """Accept report SQL in the body so long queries never exceed URL limits."""
    return fetch_sector_carrier_distribution(**req.model_dump())


# --- ENDPOINT 2: KPI Summary cards ---
@app.get("/api/kpi")
def fetch_kpi(
    start_date: str,
    end_date: str,
    country: str = None,
    airline: str = None,
    company_code: str = None,
    origin_city: str = None,
    destination_country: str = None,
    destination_city: str = None,
    branch: str = None,
    transport_mode: Literal["AIR", "SEA"] = "AIR",
):
    """Returns aggregate KPI totals."""
    try:
        kpi = (get_sea_kpi if transport_mode == "SEA" else get_kpi_summary)(
            start_date, end_date, country, airline, company_code, origin_city, destination_country, destination_city, branch
        )
        return {"status": "success", "data": kpi}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 3: Weekly trend data ---
@app.get("/api/weekly")
def fetch_weekly(
    start_date: str,
    end_date: str,
    country: str = None,
    airline: str = None,
    company_code: str = None,
    origin_city: str = None,
    destination_country: str = None,
    destination_city: str = None,
    branch: str = None,
    transport_mode: Literal["AIR", "SEA"] = "AIR",
):
    """Returns data grouped by week for trend charts."""
    try:
        data = ((lambda *args: get_sea_trends("weekly", *args)) if transport_mode == "SEA" else get_weekly_data)(
            start_date, end_date, country, airline, company_code, origin_city, destination_country, destination_city, branch
        )
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 3.1: Monthly trend data ---
@app.get("/api/monthly")
def fetch_monthly(
    start_date: str,
    end_date: str,
    country: str = None,
    airline: str = None,
    company_code: str = None,
    origin_city: str = None,
    destination_country: str = None,
    destination_city: str = None,
    branch: str = None,
    transport_mode: Literal["AIR", "SEA"] = "AIR",
):
    """Returns data grouped by month for trend charts."""
    try:
        data = ((lambda *args: get_sea_trends("monthly", *args)) if transport_mode == "SEA" else get_monthly_data)(
            start_date, end_date, country, airline, company_code, origin_city, destination_country, destination_city, branch
        )
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# --- ENDPOINT 4: Countries dropdown ---
@app.get("/api/countries")
def fetch_countries(start_date: str, end_date: str, company_code: str = None, transport_mode: Literal["AIR", "SEA"] = "AIR"):
    """Returns distinct origin countries for the filter dropdown."""
    try:
        countries = get_sea_options("countries", start_date, end_date, company_code=company_code) if transport_mode == "SEA" else get_countries(start_date, end_date, company_code)
        return {"status": "success", "data": countries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5: Airlines dropdown ---
@app.get("/api/airlines")
def fetch_airlines(start_date: str, end_date: str, country: str = None, transport_mode: Literal["AIR", "SEA"] = "AIR"):
    """Returns distinct airlines (optionally filtered by country) for the filter dropdown."""
    try:
        airlines = get_sea_options("airlines", start_date, end_date, country=country) if transport_mode == "SEA" else get_airlines(start_date, end_date, country)
        return {"status": "success", "data": airlines}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.1: Company Codes dropdown ---
@app.get("/api/company-codes")
def fetch_company_codes(start_date: str, end_date: str):
    """Returns distinct sending forwarder company codes."""
    try:
        codes = get_company_codes(start_date, end_date)
        return {"status": "success", "data": codes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.2: Origin Cities dropdown ---
@app.get("/api/origin-cities")
def fetch_origin_cities(start_date: str, end_date: str, country: str = None, transport_mode: Literal["AIR", "SEA"] = "AIR"):
    """Returns distinct origin cities, optionally filtered by country."""
    try:
        cities = get_sea_options("origin-cities", start_date, end_date, country=country) if transport_mode == "SEA" else get_origin_cities(start_date, end_date, country)
        return {"status": "success", "data": cities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.3: Destination Countries dropdown ---
@app.get("/api/destination-countries")
def fetch_destination_countries(start_date: str, end_date: str, transport_mode: Literal["AIR", "SEA"] = "AIR"):
    """Returns distinct destination countries."""
    try:
        countries = get_sea_options("destination-countries", start_date, end_date) if transport_mode == "SEA" else get_destination_countries(start_date, end_date)
        return {"status": "success", "data": countries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.4: Destination Cities dropdown ---
@app.get("/api/destination-cities")
def fetch_destination_cities(start_date: str, end_date: str, country: str = None, transport_mode: Literal["AIR", "SEA"] = "AIR"):
    """Returns distinct destination cities, optionally filtered by destination country."""
    try:
        cities = get_sea_options("destination-cities", start_date, end_date, country=country) if transport_mode == "SEA" else get_destination_cities(start_date, end_date, country)
        return {"status": "success", "data": cities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.4.1: Branches dropdown ---
@app.get("/api/branches")
def fetch_branches(company_code: str = None):
    """Returns distinct branches, optionally filtered by company code."""
    try:
        branches = get_branches(company_code)
        return {"status": "success", "data": branches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Cache store for custom SQL queries to prevent URL length limit issues
query_cache = {}


BRANCH_FULL_NAMES = {
    "BLR": "Bengaluru (BLR)",
    "MAA": "Chennai (MAA)",
    "HYD": "Hyderabad (HYD)",
    "AMD": "Ahmedabad (AMD)",
    "BOM": "Mumbai (BOM)",
    "PNQ": "Pune (PNQ)",
    "DEL": "Delhi (DEL)",
    "CCU": "Kolkata (CCU)",
}

STATION_NAMES = {
    "CMB": "Colombo (Sri Lanka)",
    "IND": "India",
    "VNM": "Viet Nam",
    "DAC": "Bangladesh",
    "PKI": "Pakistan",
    "NYC": "United States",
    "OTHER": "Corporate / Other"
}

def build_email_metadata(
    start_date: str,
    end_date: str,
    country: Optional[str] = None,
    company_code: Optional[str] = None,
    branch: Optional[str] = None,
    report_type: str = "weekly",
    transport_mode: Literal["AIR", "SEA", "BOTH"] = "AIR",
) -> tuple[str, str, str]:
    """
    Constructs email Subject, Body, and PDF Attachment Filename.
    Includes Station, Branch (with Station if Branch is present), Date Range, and PDF Filename in Body.
    """
    import re
    rep_title = "Monthly" if (report_type and str(report_type).lower() == "monthly") else "Weekly"

    # Resolve station / country name
    station_str = country or ""
    if not station_str and company_code:
        station_str = STATION_NAMES.get(company_code, company_code)
    if not station_str:
        station_str = "Global"

    # Clean country name (strip 2-letter codes like LK, IN, etc.)
    station_clean = re.sub(r'^[A-Z]{2}\s*[-–:]?\s*', '', station_str).strip()
    station_clean = re.sub(r'^(LK|IN|VN|BD|PK|US)\s+', '', station_clean, flags=re.IGNORECASE).strip()
    station_clean = normalize_country_name(station_clean, company_code) or station_clean

    # Resolve branch name if present
    branch_str = ""
    if branch:
        codes = [b.strip() for b in branch.split(",") if b.strip()]
        names = [BRANCH_FULL_NAMES.get(c, c) for c in codes]
        branch_str = ", ".join(names)

    # Build target label
    if branch_str:
        # If branch is present, include station as well!
        target_label = f"Station: {station_clean} - {branch_str} Branch"
    elif station_clean != "Global":
        target_label = f"Station: {station_clean}"
    else:
        target_label = "Global (All Stations)"

    date_range_str = f"{start_date} to {end_date}" if (start_date and end_date) else "N/A"

    # Construct PDF attachment filename including station, branch, and date range
    clean_target_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', target_label.replace("Station: ", "")).strip('_')
    clean_date_filename = re.sub(r'[^a-zA-Z0-9_\-]', '_', date_range_str)
    attachment_name = f"{rep_title}_Tonnage_Report_{clean_target_filename}_{clean_date_filename}.pdf"

    if transport_mode == "BOTH":
        freight_name = "Air & Sea"
        attachment_name = "Air_and_Sea_" + attachment_name
    elif transport_mode == "SEA":
        freight_name = "Sea"
        attachment_name = "Sea_" + attachment_name
    else:
        freight_name = "Air"

    # Subject line
    subject = f"{rep_title} {freight_name} Freight Tonnage Dashboard - {target_label} ({date_range_str})"

    # Explain the PDF and the complete source-data ledger attachments.
    plural_reports = "Dashboards" if transport_mode == "BOTH" else "Dashboard"
    body = (
        f"Dear Recipient,\n\n"
        f"Please find attached the {rep_title} {freight_name} Freight Tonnage and Revenue Performance {plural_reports} "
        f"for {station_clean} Station"
        + (f" ({branch_str} Branch)" if branch_str else "")
        + f" covering the period from {start_date} to {end_date}.\n\n"
        f"The separate Consol Ledger Excel attachment contains all fetched report records for data checking.\n\n"
        f"Best regards,\n"
        f"BI Support Team"
    )
    return subject, body, attachment_name


# --- HELPER: Background Task for PDF & Email ---
def process_pdf_and_email(req: ReportRequest):
    """Runs in the background so the frontend doesn't hang waiting for Playwright."""
    os.makedirs("outputs", exist_ok=True)
    temp_pdf_path = f"outputs/report_{uuid.uuid4().hex}.pdf"
    
    query_id = None
    if req.mode == "custom-sql" and req.custom_sql:
        query_id = str(uuid.uuid4())
        query_cache[query_id] = req.custom_sql
        
    # Resolve company_code and country from SQL if in custom-sql mode
    company_val = req.company_code
    country_val = normalize_country_name(req.country, company_val)
    if req.mode == "custom-sql" and req.custom_sql:
        req.custom_sql = re.sub(
            r"(\b(?:[a-zA-Z0-9_]+\.)?(?:ConLoadPortCountryName|RealLoadPortCountryName|RealDisChargePortCountryName|ConDischargePortCountryName)\s*=\s*)'Vietnam'",
            r"\1'Viet Nam'",
            req.custom_sql,
            flags=re.IGNORECASE
        )
        sql_company, sql_country = extract_station_info_from_sql(req.custom_sql)
        if not company_val and sql_company:
            company_val = sql_company
        if not country_val and sql_country:
            country_val = sql_country

    try:
        generate_dashboard_pdf(
            start_date=req.start_date,
            end_date=req.end_date,
            country=country_val,
            airline=req.airline,
            output_path=temp_pdf_path,
            company_code=company_val,
            origin_city=req.origin_city,
            destination_country=req.destination_country,
            destination_city=req.destination_city,
            branch=req.branch,
            include_weekly_visual=req.include_weekly_visual,
            include_weekly_ledger=req.include_weekly_ledger,
            include_monthly_visual=req.include_monthly_visual,
            include_monthly_ledger=req.include_monthly_ledger,
            include_sector_distribution=req.include_sector_distribution,
            include_sea_sector_distribution=req.include_sea_sector_distribution,
            max_data_rows=req.max_data_rows,
            mode=req.mode,
            custom_sql=req.custom_sql,
            query_id=query_id,
            report_type=req.report_type or "weekly",
            transport_mode=req.transport_mode,
        )
        
        subject, body, attachment_name = build_email_metadata(
            start_date=req.start_date,
            end_date=req.end_date,
            country=country_val or req.country,
            company_code=company_val or req.company_code,
            branch=req.branch,
            report_type=req.report_type or "weekly",
            transport_mode=req.transport_mode,
        )

        send_pdf_via_graph(
            pdf_path=temp_pdf_path,
            recipient_email=req.recipient_email,
            subject=subject,
            body=body,
            attachment_name=attachment_name
        )
    except Exception as e:
        from api.email_service import log_email_transaction
        log_email_transaction(req.recipient_email, "TASK_ERROR", str(e))
        print(f"Background Task Failed: {e}")
    finally:
        cleanup_report_files(temp_pdf_path)


# --- ENDPOINT 5.4.5: Public configuration (Supabase config) ---
@app.get("/api/config")
def get_config():
    """Returns public configuration variables (like Supabase URL and Key) to the frontend at runtime."""
    return {
        "supabaseUrl": os.environ.get("SUPABASE_URL", ""),
        "supabaseAnonKey": os.environ.get("SUPABASE_KEY", ""),
        "schedulerTimezone": os.environ.get("GCP_SCHEDULER_TIMEZONE", "Asia/Colombo"),
    }


# --- ENDPOINT 5.5: Recipients list dropdown (static .env config) ---
@app.get("/api/recipients")
def fetch_recipients():
    """Returns the comma-separated candidate recipient emails from .env config."""
    try:
        emails = os.getenv("RECIPIENT_EMAILS", "shashini.hq@dartglobal.com")
        email_list = [email.strip() for email in emails.split(",") if email.strip()]
        return {"status": "success", "data": email_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.5.1: Station-specific recipients from .env ---
@app.get("/api/station-recipients")
def fetch_station_recipients():
    """Returns the configured recipients for each station and branch from .env config."""
    try:
        dummy_emails = {
            "shashini.hq@dartglobal.com",
        }
        stations = ["CMB", "IND", "VNM", "DAC", "PKI", "NYC", "BLR", "MAA", "HYD", "AMD", "BOM", "PNQ", "DEL", "CCU"]
        result = {}
        for code in stations:
            emails_str = os.getenv(f"RECIPIENTS_{code}") or os.getenv("RECIPIENT_EMAILS", "")
            emails = [
                email.strip() for email in emails_str.split(",")
                if email.strip() and email.strip().lower() not in dummy_emails
            ]
            result[code] = emails
        return {"status": "success", "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.6: Fetch real Azure AD org users via Microsoft Graph ---
@app.get("/api/org-users")
def fetch_org_users():
    """
    Fetches all licensed users in the Azure AD tenant via Microsoft Graph API.
    Groups them by department and jobTitle for the Admin Panel categorization.
    Requires User.Read.All (or Directory.Read.All) Application permission granted in Azure.
    """
    try:
        from msal import ConfidentialClientApplication
        import requests as req_lib

        tenant_id = os.getenv("FETCH_AZURE_TENANT_ID") or os.getenv("AZURE_TENANT_ID")
        client_id = os.getenv("FETCH_AZURE_CLIENT_ID") or os.getenv("AZURE_CLIENT_ID")
        client_secret = os.getenv("FETCH_AZURE_CLIENT_SECRET") or os.getenv("AZURE_CLIENT_SECRET")

        if not all([tenant_id, client_id, client_secret]):
            return {
                "status": "not_configured",
                "total": 0,
                "users": [],
                "byDepartment": {},
                "byJobTitle": {},
                "detail": "Azure FETCH credentials not configured in environment."
            }

        # Authenticate with MSAL
        msal_app = ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret,
        )
        token_result = msal_app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )

        if "access_token" not in token_result:
            error_desc = token_result.get("error_description", "Unknown auth error")
            raise HTTPException(status_code=401, detail=f"Azure AD auth failed: {error_desc}")

        headers = {
            "Authorization": f"Bearer {token_result['access_token']}",
            "Content-Type": "application/json",
        }

        # Fetch users — select only the fields we need to minimize payload
        select_fields = "displayName,mail,userPrincipalName,jobTitle,department,officeLocation,accountEnabled,country"
        url = f"https://graph.microsoft.com/v1.0/users?$select={select_fields}&$top=999&$filter=accountEnabled eq true"

        all_users = []
        while url:
            resp = req_lib.get(url, headers=headers, timeout=15)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=resp.status_code,
                    detail=f"Graph API error: {resp.text[:400]}"
                )
            page = resp.json()
            all_users.extend(page.get("value", []))
            url = page.get("@odata.nextLink")  # Handle pagination

        # Filter: only users with a real email address (skip service accounts etc.)
        users_with_email = [
            u for u in all_users
            if u.get("mail") or u.get("userPrincipalName", "").endswith("@dartglobal.com")
        ]

        # Build categorised structure
        by_department: dict = {}
        by_job_title: dict = {}
        flat_list = []

        for u in users_with_email:
            email = u.get("mail") or u.get("userPrincipalName", "")
            display_name = u.get("displayName", email)
            department = u.get("department") or "Unassigned"
            job_title = u.get("jobTitle") or "No Title"
            office = u.get("officeLocation") or ""
            country = u.get("country") or ""

            user_obj = {
                "email": email,
                "displayName": display_name,
                "jobTitle": job_title,
                "department": department,
                "officeLocation": office,
                "country": country,
            }
            flat_list.append(user_obj)

            # Group by department
            if department not in by_department:
                by_department[department] = []
            by_department[department].append(user_obj)

            # Group by job title
            if job_title not in by_job_title:
                by_job_title[job_title] = []
            by_job_title[job_title].append(user_obj)

        # Sort departments and users within each department alphabetically
        by_department_sorted = {
            dept: sorted(users, key=lambda x: x["displayName"])
            for dept, users in sorted(by_department.items())
        }
        by_job_title_sorted = {
            title: sorted(users, key=lambda x: x["displayName"])
            for title, users in sorted(by_job_title.items())
        }

        return {
            "status": "success",
            "total": len(flat_list),
            "users": sorted(flat_list, key=lambda x: x["displayName"]),
            "byDepartment": by_department_sorted,
            "byJobTitle": by_job_title_sorted,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Org users fetch failed: {str(e)}")



# --- ENDPOINT 5.7: Diagnostics ---
@app.get("/api/diagnose")
def run_diagnostics():
    """Runs a series of tests to verify Azure AD credentials, network connectivity, and database access."""
    results = {
        "timestamp": datetime.datetime.now().isoformat(),
        "environment_variables": {},
        "azure_auth_test": {},
        "database_test": {},
        "recent_logs": []
    }
    
    # 1. Check environment variables
    env_keys = [
        "MAIL_AZURE_TENANT_ID", "MAIL_AZURE_CLIENT_ID", "MAIL_AZURE_CLIENT_SECRET", "SENDER_EMAIL",
        "FETCH_AZURE_TENANT_ID", "FETCH_AZURE_CLIENT_ID", "FETCH_AZURE_CLIENT_SECRET",
        "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET",
        "ONPREM_API_URL", "DB_SERVER", "DB_NAME", "DB_USER"
    ]
    for key in env_keys:
        val = os.getenv(key)
        if val:
            # Mask the secret for security
            if "SECRET" in key or "PASSWORD" in key:
                results["environment_variables"][key] = f"Present (len={len(val)}, starts with {val[:3]}...)"
            else:
                results["environment_variables"][key] = f"Present ({val})"
        else:
            results["environment_variables"][key] = "Missing"
            
    # 2. Test Microsoft Entra (Azure AD) Client Credentials Flow for sending emails
    tenant_id = os.getenv("MAIL_AZURE_TENANT_ID") or os.getenv("AZURE_TENANT_ID")
    client_id = os.getenv("MAIL_AZURE_CLIENT_ID") or os.getenv("AZURE_CLIENT_ID")
    client_secret = os.getenv("MAIL_AZURE_CLIENT_SECRET") or os.getenv("AZURE_CLIENT_SECRET")
    
    if not all([tenant_id, client_id, client_secret]):
        results["azure_auth_test"]["status"] = "Skipped"
        results["azure_auth_test"]["error"] = "Missing Azure credentials."
    else:
        try:
            from msal import ConfidentialClientApplication
            
            app_msal = ConfidentialClientApplication(
                client_id,
                authority=f"https://login.microsoftonline.com/{tenant_id}",
                client_credential=client_secret
            )
            token_res = app_msal.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
            
            if "access_token" in token_res:
                results["azure_auth_test"]["status"] = "Success"
                results["azure_auth_test"]["token_type"] = token_res.get("token_type")
                results["azure_auth_test"]["details"] = "Acquired Entra ID access token successfully."
            else:
                results["azure_auth_test"]["status"] = "Failed"
                results["azure_auth_test"]["error"] = token_res.get("error")
                results["azure_auth_test"]["error_description"] = token_res.get("error_description")
        except Exception as ex:
            results["azure_auth_test"]["status"] = "Failed"
            results["azure_auth_test"]["error"] = str(ex)
            
    # 3. Test Database Connectivity
    onprem_url = os.getenv("ONPREM_API_URL")
    if onprem_url:
        try:
            import requests as req_lib
            resp = req_lib.post(onprem_url, json={"sql_query": "SELECT 1 AS test"}, timeout=5)
            results["database_test"]["onprem_api"] = {
                "status": "Success" if resp.status_code == 200 else f"Failed (HTTP {resp.status_code})",
                "response_body": resp.text[:200]
            }
        except Exception as ex:
            results["database_test"]["onprem_api"] = {
                "status": "Failed",
                "error": str(ex)
            }
    else:
        results["database_test"]["onprem_api"] = "Not configured"
        
    try:
        from api.database import get_engine
        from sqlalchemy import text
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        results["database_test"]["direct_connection"] = "Success"
    except Exception as ex:
        results["database_test"]["direct_connection"] = f"Failed: {str(ex)}"
        
    # 4. Check if localhost port is reachable (needed for Playwright PDF generation)
    import socket
    cloud_run_port = int(os.environ.get("PORT", 8080))
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2.0)
            result_code = s.connect_ex(('127.0.0.1', cloud_run_port))
            if result_code == 0:
                results["playwright_localhost_check"] = {
                    "status": "Port Open",
                    "port": cloud_run_port,
                    "message": f"127.0.0.1:{cloud_run_port} is reachable — Playwright can connect to the frontend."
                }
            else:
                results["playwright_localhost_check"] = {
                    "status": "Port Closed",
                    "port": cloud_run_port,
                    "message": f"127.0.0.1:{cloud_run_port} is NOT reachable — Playwright will fail to load the print-view page.",
                    "error_code": result_code
                }
    except Exception as ex:
        results["playwright_localhost_check"] = {"status": "Error", "error": str(ex)}

    # 5. Fetch the email history logs
    log_file = "logs/email_history.log"
    if os.path.exists(log_file):
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
            results["recent_logs"] = [line.strip() for line in lines[-30:]]
        except Exception as ex:
            results["recent_logs"] = [f"Error reading log file: {str(ex)}"]
    else:
        results["recent_logs"] = ["Log file logs/email_history.log does not exist yet inside container."]
        
    return results


# --- ENDPOINT 5.8: Direct Email Test (no PDF, no Playwright) ---
@app.get("/api/test-email")
def test_email_direct(recipient: str = "shashini.hq@dartglobal.com"):
    """
    Sends a plain-text test email via MS Graph without PDF generation.
    Use this to confirm Graph API email sending works from Cloud Run.
    Usage: GET /api/test-email?recipient=someone@example.com
    """
    tenant_id = os.getenv("MAIL_AZURE_TENANT_ID") or os.getenv("AZURE_TENANT_ID")
    client_id = os.getenv("MAIL_AZURE_CLIENT_ID") or os.getenv("AZURE_CLIENT_ID")
    client_secret = os.getenv("MAIL_AZURE_CLIENT_SECRET") or os.getenv("AZURE_CLIENT_SECRET")
    sender = os.getenv("SENDER_EMAIL")

    if not all([tenant_id, client_id, client_secret, sender]):
        return {"status": "error", "message": "Missing Azure/email credentials in environment."}

    try:
        import requests as req_lib
        from msal import ConfidentialClientApplication

        # Step 1: Get access token
        msal_app = ConfidentialClientApplication(
            client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            client_credential=client_secret
        )
        token_result = msal_app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])

        if "access_token" not in token_result:
            return {
                "status": "auth_failed",
                "error": token_result.get("error"),
                "error_description": token_result.get("error_description")
            }

        # Step 2: Send a simple plain-text email (no attachment)
        email_payload = {
            "message": {
                "subject": "[Cloud Run Test] Email API Connectivity Check",
                "body": {
                    "contentType": "Text",
                    "content": (
                        "This is an automated test email sent directly from the Cloud Run container "
                        "using the Microsoft Graph API.\n\n"
                        "If you received this, email sending from Cloud Run is working correctly.\n\n"
                        "-- Tonnage Report App Diagnostics"
                    )
                },
                "toRecipients": [{"emailAddress": {"address": recipient}}]
            },
            "saveToSentItems": "false"
        }

        headers = {
            "Authorization": f"Bearer {token_result['access_token']}",
            "Content-Type": "application/json"
        }

        graph_url = f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail"
        response = req_lib.post(graph_url, headers=headers, json=email_payload, timeout=30)

        if response.status_code == 202:
            return {
                "status": "success",
                "message": f"Test email dispatched to {recipient} via MS Graph (HTTP 202). Check your inbox.",
                "sender": sender
            }
        else:
            return {
                "status": "send_failed",
                "http_status": response.status_code,
                "response": response.text[:500]
            }

    except Exception as ex:
        return {"status": "exception", "error": str(ex)}


# --- ENDPOINT 6: Trigger PDF Email ---
@app.post("/api/send-report")
def send_report(req: ReportRequest):
    """Accepts filters and an email address, generates the PDF, and sends it synchronously."""
    if not req.recipient_email:
        raise HTTPException(status_code=400, detail="Recipient email is required.")
    
    if os.environ.get("VERCEL"):
        raise HTTPException(
            status_code=400,
            detail="PDF generation and email dispatch are not supported on Vercel serverless functions."
        )
    
    # Validate database configuration
    db_server = os.getenv("DB_SERVER", "").strip()
    db_user = os.getenv("DB_USER", "").strip()
    db_password = os.getenv("DB_PASSWORD", "").strip()
    
    if not db_server or not db_user or not db_password:
        missing = []
        if not db_server:
            missing.append("DB_SERVER")
        if not db_user:
            missing.append("DB_USER")
        if not db_password:
            missing.append("DB_PASSWORD")
        raise HTTPException(
            status_code=503,
            detail=f"Database not configured. Missing environment variables: {', '.join(missing)}. Please set these in Cloud Run."
        )
        
    os.makedirs("outputs", exist_ok=True)
    query_id = None
    if req.mode == "custom-sql" and req.custom_sql:
        query_id = str(uuid.uuid4())
        query_cache[query_id] = req.custom_sql
        
    # Resolve company_code and country from SQL if in custom-sql mode
    company_val = req.company_code
    country_val = normalize_country_name(req.country, company_val)
    if req.mode == "custom-sql" and req.custom_sql:
        req.custom_sql = re.sub(
            r"(\b(?:[a-zA-Z0-9_]+\.)?(?:ConLoadPortCountryName|RealLoadPortCountryName|RealDisChargePortCountryName|ConDischargePortCountryName)\s*=\s*)'Vietnam'",
            r"\1'Viet Nam'",
            req.custom_sql,
            flags=re.IGNORECASE
        )
        sql_company, sql_country = extract_station_info_from_sql(req.custom_sql)
        if not company_val and sql_company:
            company_val = sql_company
        if not country_val and sql_country:
            country_val = sql_country

    if req.transport_mode == "BOTH":
        temp_air_path = f"outputs/report_air_{uuid.uuid4().hex}.pdf"
        temp_sea_path = f"outputs/report_sea_{uuid.uuid4().hex}.pdf"
        temp_files_to_cleanup = [temp_air_path, temp_sea_path]
        try:
            # 1. Generate Air Freight report
            generate_dashboard_pdf(
                start_date=req.start_date,
                end_date=req.end_date,
                country=country_val,
                airline=req.airline,
                output_path=temp_air_path,
                company_code=company_val,
                origin_city=req.origin_city,
                destination_country=req.destination_country,
                destination_city=req.destination_city,
                branch=req.branch,
                include_weekly_visual=req.include_weekly_visual,
                include_weekly_ledger=req.include_weekly_ledger,
                include_monthly_visual=req.include_monthly_visual,
                include_monthly_ledger=req.include_monthly_ledger,
                include_sector_distribution=req.include_sector_distribution,
                include_sea_sector_distribution=req.include_sea_sector_distribution,
                max_data_rows=req.max_data_rows,
                mode=req.mode,
                custom_sql=req.custom_sql if req.mode == "custom-sql" else None,
                query_id=query_id,
                report_type=req.report_type or "weekly",
                transport_mode="AIR",
            )
            # 2. Generate Sea Freight report
            generate_dashboard_pdf(
                start_date=req.start_date,
                end_date=req.end_date,
                country=country_val,
                airline=req.airline,
                output_path=temp_sea_path,
                company_code=company_val,
                origin_city=req.origin_city,
                destination_country=req.destination_country,
                destination_city=req.destination_city,
                branch=req.branch,
                include_weekly_visual=req.include_weekly_visual,
                include_weekly_ledger=req.include_weekly_ledger,
                include_monthly_visual=req.include_monthly_visual,
                include_monthly_ledger=req.include_monthly_ledger,
                include_sector_distribution=req.include_sector_distribution,
                include_sea_sector_distribution=req.include_sea_sector_distribution,
                max_data_rows=req.max_data_rows,
                mode="standard",
                custom_sql=None,
                query_id=None,
                report_type=req.report_type or "weekly",
                transport_mode="SEA",
            )

            subject, body, _ = build_email_metadata(
                start_date=req.start_date,
                end_date=req.end_date,
                country=country_val or req.country,
                company_code=company_val or req.company_code,
                branch=req.branch,
                report_type=req.report_type or "weekly",
                transport_mode="BOTH",
            )
            _, _, air_att_name = build_email_metadata(
                start_date=req.start_date,
                end_date=req.end_date,
                country=country_val or req.country,
                company_code=company_val or req.company_code,
                branch=req.branch,
                report_type=req.report_type or "weekly",
                transport_mode="AIR",
            )
            _, _, sea_att_name = build_email_metadata(
                start_date=req.start_date,
                end_date=req.end_date,
                country=country_val or req.country,
                company_code=company_val or req.company_code,
                branch=req.branch,
                report_type=req.report_type or "weekly",
                transport_mode="SEA",
            )

            send_pdf_via_graph(
                recipient_email=req.recipient_email,
                subject=subject,
                body=body,
                attachments=[
                    {"path": temp_air_path, "name": air_att_name},
                    {"path": temp_sea_path, "name": sea_att_name},
                ]
            )
            return {
                "status": "success",
                "message": f"Both Air and Sea freight reports generated and email successfully sent to {req.recipient_email}."
            }
        except Exception as e:
            from api.email_service import log_email_transaction
            log_email_transaction(req.recipient_email, "HTTP_ERROR", str(e))
            print(f"Sync Email Dispatch Failed: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to generate or send report: {str(e)}")
        finally:
            cleanup_report_files(*temp_files_to_cleanup)

    temp_pdf_path = f"outputs/report_{uuid.uuid4().hex}.pdf"
    try:
        generate_dashboard_pdf(
            start_date=req.start_date,
            end_date=req.end_date,
            country=country_val,
            airline=req.airline,
            output_path=temp_pdf_path,
            company_code=company_val,
            origin_city=req.origin_city,
            destination_country=req.destination_country,
            destination_city=req.destination_city,
            branch=req.branch,
            include_weekly_visual=req.include_weekly_visual,
            include_weekly_ledger=req.include_weekly_ledger,
            include_monthly_visual=req.include_monthly_visual,
            include_monthly_ledger=req.include_monthly_ledger,
            include_sector_distribution=req.include_sector_distribution,
            include_sea_sector_distribution=req.include_sea_sector_distribution,
            max_data_rows=req.max_data_rows,
            mode=req.mode,
            custom_sql=req.custom_sql,
            query_id=query_id,
            report_type=req.report_type or "weekly",
            transport_mode=req.transport_mode,
        )
        
        subject, body, attachment_name = build_email_metadata(
            start_date=req.start_date,
            end_date=req.end_date,
            country=country_val or req.country,
            company_code=company_val or req.company_code,
            branch=req.branch,
            report_type=req.report_type or "weekly",
            transport_mode=req.transport_mode,
        )

        send_pdf_via_graph(
            pdf_path=temp_pdf_path,
            recipient_email=req.recipient_email,
            subject=subject,
            body=body,
            attachment_name=attachment_name
        )
        return {
            "status": "success",
            "message": f"Report generated and email successfully sent to {req.recipient_email}."
        }
    except Exception as e:
        from api.email_service import log_email_transaction
        log_email_transaction(req.recipient_email, "HTTP_ERROR", str(e))
        print(f"Sync Email Dispatch Failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate or send report: {str(e)}")
    finally:
        cleanup_report_files(temp_pdf_path)



# --- ENDPOINT 6.5: Custom SQL Query Cache ---
class CacheQueryRequest(BaseModel):
    query: str

@app.post("/api/cache-query")
def cache_query(req: CacheQueryRequest):
    """Temporarily stores a custom SQL query in memory, returning a query ID for URL params."""
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    query_id = str(uuid.uuid4())
    cleaned_query = re.sub(
        r"(\b(?:[a-zA-Z0-9_]+\.)?(?:ConLoadPortCountryName|RealLoadPortCountryName|RealDisChargePortCountryName|ConDischargePortCountryName)\s*=\s*)'Vietnam'",
        r"\1'Viet Nam'",
        req.query,
        flags=re.IGNORECASE
    )
    query_cache[query_id] = cleaned_query
    return {"status": "success", "query_id": query_id}

@app.get("/api/get-cached-query/{query_id}")
def get_cached_query(query_id: str):
    """Retrieves a cached custom SQL query by its query ID."""
    query = query_cache.get(query_id)
    if not query:
        raise HTTPException(status_code=404, detail="Query not found or expired")
    return {"status": "success", "query": query}


# --- ENDPOINT 7: Custom SQL Query Sandbox Runner ---
@app.post("/api/custom-query")
def custom_query(req: CustomQueryRequest, request: Request = None):
    """Executes a custom SQL query directly against the engine in a sandbox environment."""
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="SQL query string cannot be empty.")
    
    try:
        import re
        query_modes = re.findall(r"\bTransportMode\s*=\s*'(AIR|SEA)'", req.query, re.IGNORECASE)
        if any(mode.upper() != req.transport_mode for mode in query_modes):
            raise ValueError("Query transport mode does not match the selected freight tab")
        effective_query = prepare_sea_query(req.query) if req.transport_mode == "SEA" else req.query
        records = execute_custom_query(effective_query)
        data = records
        if req.transport_mode == "SEA":
            data = normalize_sea_records(classify_sea_sectors(records) if req.include_sea_sectors else records)
        result = {"status": "success", "data": data, "rowCount": len(data), "effectiveQuery": effective_query}
        if request is not None and request.headers.get("X-Consol-Ledger") == "true":
            result["ledger_records"] = records
        return result
    except ValueError as e:
        # Validation errors
        raise HTTPException(status_code=400, detail=f"Invalid SQL: {str(e)}")
    except Exception as e:
        # Database errors
        error_msg = str(e)
        raise HTTPException(status_code=400, detail=f"Query execution failed: {error_msg}")


# --- REPORT SCHEDULING SYSTEM ---

class ScheduleCreateRequest(BaseModel):
    recipient_email: str
    frequency: str  # 'weekly', 'monthly', 'daily'
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    time_of_day: str  # "HH:MM" in 24-hour format
    filters: dict
    is_active: Optional[bool] = True


def get_report_dates_by_frequency(frequency: str, day_of_month: Optional[int] = None):
    """Calculates dynamic start and end dates relative to execution time.

    For monthly-cycle weekly reports (day_of_month > 1):
        Reports run on the configured day_of_month (e.g. 8, 15, 22) always cover:
        start = 1st of the current month, end = (day_of_month - 1) of current month
        Example: runs on 8th -> start=Sep 1, end=Sep 7 (7-day weekly report)
        Example: runs on 15th -> start=Sep 1, end=Sep 14 (14-day cumulative weekly report)
        Example: runs on 22nd -> start=Sep 1, end=Sep 21 (21-day cumulative weekly report)

    For monthly reports (day_of_month == 1):
        Covers the ENTIRE previous calendar month (1st to 30th/31st).
        Example: runs on Sep 1 -> start=Aug 1, end=Aug 31

    For traditional weekly frequency (day_of_week based):
        Covers month-to-date from 1st to yesterday.

    For daily frequency:
        Covers yesterday only (1-day window).
    """
    today = datetime.date.today()

    # Monthly-cycle: report fires on a fixed day of the month (1, 8, 15, 22, etc.)
    if day_of_month is not None:
        if day_of_month == 1:
            # 1st of month -> full previous calendar month
            end = today.replace(day=1) - datetime.timedelta(days=1)
            start = end.replace(day=1)
        else:
            # 8th/15th/22nd etc -> 1st of THIS month up to (day_of_month - 1)
            start = today.replace(day=1)
            # end = (day_of_month - 1) of current month; if today < day_of_month use yesterday
            try:
                end = today.replace(day=day_of_month - 1)
            except ValueError:
                end = today - datetime.timedelta(days=1)
        return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')

    # Traditional weekly frequency: month-to-date from 1st to yesterday
    if frequency == "weekly":
        if today.day == 1:
            end = today - datetime.timedelta(days=1)
            start = end.replace(day=1)
        else:
            start = today.replace(day=1)
            end = today - datetime.timedelta(days=1)
        return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')

    # Monthly frequency (legacy fallback)
    if frequency == "monthly":
        if today.day == 1:
            end = today - datetime.timedelta(days=1)
            start = end.replace(day=1)
        else:
            start = today.replace(day=1)
            end = today - datetime.timedelta(days=1)
        return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')

    # Daily frequency -> yesterday only
    if frequency == "daily":
        yesterday = today - datetime.timedelta(days=1)
        return yesterday.strftime('%Y-%m-%d'), yesterday.strftime('%Y-%m-%d')

    # Fallback: month-to-date
    if today.day == 1:
        end = today - datetime.timedelta(days=1)
        start = end.replace(day=1)
    else:
        start = today.replace(day=1)
        end = today - datetime.timedelta(days=1)
    return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')


def execute_scheduled_report_job(schedule_id: str):
    """Generates and emails a scheduled report. Triggered by Google Cloud Scheduler via HTTP."""
    import re
    print(f"Scheduler: Starting report execution for schedule {schedule_id}")
    config = get_schedule(schedule_id)
    if not config or not config.get("is_active"):
        print(f"Scheduler: Schedule {schedule_id} is inactive or does not exist. Aborting.")
        return False
        
    recipient_email = config["recipient_email"]
    frequency = config["frequency"]
    filters = config["filters"]
    transport_mode = filters.get("transport_mode", "AIR")
    if transport_mode not in ("AIR", "SEA", "BOTH"):
        raise ValueError("Invalid freight transport mode")
    day_of_month = config.get("day_of_month")  # e.g. 1, 8, 15, 22
    
    # For automated recurring reports (weekly, monthly, daily), dynamically calculate the current relative dates
    # so every scheduled run executes with the latest timeframe instead of stale frozen dates.
    # Pass day_of_month so monthly-cycle weekly reports get correct date ranges.
    start_date, end_date = get_report_dates_by_frequency(frequency, day_of_month=day_of_month)
    
    # Only use fixed dates if explicitly configured with use_fixed_dates flag
    if filters.get("use_fixed_dates") and filters.get("start_date") and filters.get("end_date"):
        start_date = filters["start_date"]
        end_date = filters["end_date"]
        
    temp_pdf_path = f"outputs/scheduled_report_{uuid.uuid4().hex}.pdf"
    temp_air_path = f"outputs/scheduled_air_{uuid.uuid4().hex}.pdf" if transport_mode == "BOTH" else None
    temp_sea_path = f"outputs/scheduled_sea_{uuid.uuid4().hex}.pdf" if transport_mode == "BOTH" else None
    os.makedirs("outputs", exist_ok=True)
    
    # Process mode and cache custom SQL query if needed
    company_val = filters.get("company_code")
    country_val = normalize_country_name(filters.get("country"), company_val)
    branch_val = filters.get("branch") or filters.get("branch_code")
    
    # Dynamically resolve station & branch metadata from Supabase if not provided
    db_stations = get_supabase_stations()
    db_branches = get_supabase_branches()
    
    if company_val and not country_val:
        st_match = next((s for s in db_stations if s.get("code") == company_val), None)
        if st_match and st_match.get("country"):
            country_val = st_match.get("country")
            
    if branch_val:
        br_match = next((b for b in db_branches if b.get("code") == branch_val), None)
        if br_match:
            country_val = br_match.get("country", country_val or "India")
            company_val = br_match.get("company_code", company_val or "IND")
    
    if transport_mode == "SEA":
        # Generate the same dedicated sea query for station and branch schedules.
        mode = filters.get("mode", "standard")
        custom_sql = filters.get("custom_sql")
        if mode == "custom-sql" and custom_sql:
            custom_sql = re.sub(r"ETD\s*>=\s*'[^']+'", f"ETD >= '{start_date}'", custom_sql, flags=re.IGNORECASE)
            custom_sql = re.sub(r"ETD\s*<=\s*'[^']+'", f"ETD <= '{end_date}'", custom_sql, flags=re.IGNORECASE)
            custom_sql = re.sub(r"ETD\s*<\s*DATEADD\(day,\s*1,\s*CAST\('[^']+'\s+AS\s+date\)\)",
                                f"ETD <= '{end_date}'", custom_sql, flags=re.IGNORECASE)
        else:
            mode = "custom-sql"
            custom_sql = render_sea_query(start_date=start_date, end_date=end_date,
                country=country_val, company_code=company_val, branch=branch_val,
                airline=filters.get("airline"), origin_city=filters.get("origin_city"),
                destination_country=filters.get("destination_country"),
                destination_city=filters.get("destination_city"))
    elif (company_val and company_val != "all") or branch_val:
        mode = "custom-sql"
        if branch_val or filters.get("report_level") == "branch":
            custom_sql = generate_branchwise_sql(
                country=country_val or "India",
                company_code=company_val or "IND",
                branch=branch_val or "BLR",
                start_date=start_date,
                end_date=end_date
            )
        elif company_val == "OTHER":
            # Dynamically exclude all registered station codes from Supabase
            registered_codes = [f"'{s['code']}'" for s in db_stations if s.get("code")]
            excluded_codes_str = ", ".join(registered_codes) if registered_codes else "'CMB', 'IND', 'VNM', 'DAC', 'PKI', 'NYC'"
            custom_sql = f"""
SELECT
    vt.ConsoleNumber AS Console_Number,
    vt.MasterBillNum AS Master_Airway_Bill,
    vt.AirlineName1 AS Airline,
    vt.ConsolTransportMode AS Transport_Mode,
    vt.ETD,
    COALESCE(vt.RealLoadPortCountryName, 'N/A') AS Origin_Country,
    COALESCE(vt.RealLoadPortCity, 'N/A') AS Origin_City,
    COALESCE(vt.RealDisChargePortCountryName, 'N/A') AS Destination_Country,
    COALESCE(vt.RealDisChargePortCity, 'N/A') AS Destination_City,
    COALESCE(MAX(vs.Company), 'Unlinked') AS Company_Code,
    COUNT(DISTINCT vs.ShipmentNumber) AS Total_Shipments,
    ROUND(MAX(vt.Air_ChargebleWeight), 2) AS Tonnage_Chargeable,
    ROUND(MAX(vt.Air_ActualWeight), 2) AS Tonnage_Actual,
    ROUND(SUM(vs.Revenue_USD), 2) AS Revenue_USD,
    ROUND(SUM(vs.Cost_USD), 2) AS Cost_USD,
    ROUND(SUM(vs.Profit_USD), 2) AS Profit_USD,
    ROUND(SUM(vs.Profit_USD) / NULLIF(SUM(vs.Revenue_USD), 0) * 100, 2) AS GP_Margin_Percent
FROM dbo.ChatData_ViewShipConsolTransport vt
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc
    ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs
    ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.ETD >= '{start_date}'
    AND vt.ETD <= '{end_date}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company NOT IN ({excluded_codes_str})
GROUP BY
    vt.ConsoleNumber,
    vt.MasterBillNum,
    vt.AirlineName1,
    vt.ConsolTransportMode,
    vt.ETD,
    COALESCE(vt.RealLoadPortCountryName, 'N/A'),
    COALESCE(vt.RealLoadPortCity, 'N/A'),
    COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
    COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC;
            """.strip()
        else:
            custom_sql = f"""
SELECT
    vt.ConsoleNumber AS Console_Number,
    vt.MasterBillNum AS Master_Airway_Bill,
    vt.AirlineName1 AS Airline,
    vt.ConsolTransportMode AS Transport_Mode,
    vt.ETD,
    COALESCE(vt.RealLoadPortCountryName, 'N/A') AS Origin_Country,
    COALESCE(vt.RealLoadPortCity, 'N/A') AS Origin_City,
    COALESCE(vt.RealDisChargePortCountryName, 'N/A') AS Destination_Country,
    COALESCE(vt.RealDisChargePortCity, 'N/A') AS Destination_City,
    COALESCE(MAX(vs.Company), 'Unlinked') AS Company_Code,
    COUNT(DISTINCT vs.ShipmentNumber) AS Total_Shipments,
    ROUND(MAX(vt.Air_ChargebleWeight), 2) AS Tonnage_Chargeable,
    ROUND(MAX(vt.Air_ActualWeight), 2) AS Tonnage_Actual,
    ROUND(SUM(vs.Revenue_USD), 2) AS Revenue_USD,
    ROUND(SUM(vs.Cost_USD), 2) AS Cost_USD,
    ROUND(SUM(vs.Profit_USD), 2) AS Profit_USD,
    ROUND(SUM(vs.Profit_USD) / NULLIF(SUM(vs.Revenue_USD), 0) * 100, 2) AS GP_Margin_Percent
FROM dbo.ChatData_ViewShipConsolTransport vt
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc
    ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs
    ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.ConLoadPortCountryName = '{country_val}'
    AND vt.ETD >= '{start_date}'
    AND vt.ETD <= '{end_date}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = '{company_val}'
GROUP BY
    vt.ConsoleNumber,
    vt.MasterBillNum,
    vt.AirlineName1,
    vt.ConsolTransportMode,
    vt.ETD,
    COALESCE(vt.RealLoadPortCountryName, 'N/A'),
    COALESCE(vt.RealLoadPortCity, 'N/A'),
    COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
    COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC;
            """.strip()
    else:
        mode = filters.get("mode", "standard")
        custom_sql = filters.get("custom_sql")
        # Ensure any saved custom_sql has its ETD date range synchronized to current dynamic start_date & end_date
        if custom_sql:
            custom_sql = re.sub(
                r"(\b(?:[a-zA-Z0-9_]+\.)?(?:ConLoadPortCountryName|RealLoadPortCountryName|RealDisChargePortCountryName|ConDischargePortCountryName)\s*=\s*)'Vietnam'",
                r"\1'Viet Nam'",
                custom_sql,
                flags=re.IGNORECASE
            )
            custom_sql = re.sub(
                r"(?:[a-zA-Z0-9_]+\.)?ETD\s*>=\s*'[^']+'",
                f"vt.ETD >= '{start_date}'",
                custom_sql,
                flags=re.IGNORECASE
            )
            custom_sql = re.sub(
                r"(?:[a-zA-Z0-9_]+\.)?ETD\s*<=\s*'[^']+'",
                f"vt.ETD <= '{end_date}'",
                custom_sql,
                flags=re.IGNORECASE
            )
        
    query_id = None
    if mode == "custom-sql" and custom_sql:
        query_id = str(uuid.uuid4())
        query_cache[query_id] = custom_sql
        
    # Resolve company_code and country from SQL if in custom-sql mode
    if mode == "custom-sql" and custom_sql:
        sql_company, sql_country = extract_station_info_from_sql(custom_sql)
        if not company_val and sql_company:
            company_val = sql_company
        if not country_val and sql_country:
            country_val = sql_country

    try:
        # Resolve report_type:
        # - day_of_month == 1 -> "monthly" (covering full previous calendar month)
        # - day_of_month > 1 (e.g. 8, 15, 22) -> "weekly" (covering 1st to day_of_month - 1 cumulative weekly data)
        # - day_of_month is None -> based on frequency
        if day_of_month is not None:
            resolved_report_type = "monthly" if day_of_month == 1 else "weekly"
        else:
            resolved_report_type = "monthly" if frequency == "monthly" else "weekly"

        if transport_mode == "BOTH":
            # 1. Generate Air Freight PDF
            generate_dashboard_pdf(
                start_date=start_date,
                end_date=end_date,
                country=country_val or filters.get("country"),
                airline=filters.get("airline"),
                output_path=temp_air_path,
                company_code=company_val or filters.get("company_code"),
                origin_city=filters.get("origin_city"),
                destination_country=filters.get("destination_country"),
                destination_city=filters.get("destination_city"),
                branch=branch_val or filters.get("branch"),
                include_weekly_visual=filters.get("include_weekly_visual", True),
                include_weekly_ledger=filters.get("include_weekly_ledger", True),
                include_monthly_visual=filters.get("include_monthly_visual", True),
                include_monthly_ledger=filters.get("include_monthly_ledger", True),
                include_sector_distribution=filters.get("include_sector_distribution", True),
                include_sea_sector_distribution=filters.get("include_sea_sector_distribution", True),
                max_data_rows=filters.get("max_data_rows", 100),
                mode=mode,
                custom_sql=custom_sql,
                query_id=query_id,
                report_type=resolved_report_type,
                transport_mode="AIR",
            )
            # 2. Generate Sea Freight PDF
            generate_dashboard_pdf(
                start_date=start_date,
                end_date=end_date,
                country=country_val or filters.get("country"),
                airline=filters.get("airline"),
                output_path=temp_sea_path,
                company_code=company_val or filters.get("company_code"),
                origin_city=filters.get("origin_city"),
                destination_country=filters.get("destination_country"),
                destination_city=filters.get("destination_city"),
                branch=branch_val or filters.get("branch"),
                include_weekly_visual=filters.get("include_weekly_visual", True),
                include_weekly_ledger=filters.get("include_weekly_ledger", True),
                include_monthly_visual=filters.get("include_monthly_visual", True),
                include_monthly_ledger=filters.get("include_monthly_ledger", True),
                include_sector_distribution=filters.get("include_sector_distribution", True),
                include_sea_sector_distribution=filters.get("include_sea_sector_distribution", True),
                max_data_rows=filters.get("max_data_rows", 100),
                mode="standard",
                custom_sql=None,
                query_id=None,
                report_type=resolved_report_type,
                transport_mode="SEA",
            )
            subject, body, _ = build_email_metadata(
                start_date=start_date,
                end_date=end_date,
                country=country_val or filters.get("country"),
                company_code=company_val or filters.get("company_code"),
                branch=branch_val or filters.get("branch"),
                report_type=resolved_report_type,
                transport_mode="BOTH",
            )
            _, _, air_att_name = build_email_metadata(
                start_date=start_date,
                end_date=end_date,
                country=country_val or filters.get("country"),
                company_code=company_val or filters.get("company_code"),
                branch=branch_val or filters.get("branch"),
                report_type=resolved_report_type,
                transport_mode="AIR",
            )
            _, _, sea_att_name = build_email_metadata(
                start_date=start_date,
                end_date=end_date,
                country=country_val or filters.get("country"),
                company_code=company_val or filters.get("company_code"),
                branch=branch_val or filters.get("branch"),
                report_type=resolved_report_type,
                transport_mode="SEA",
            )
            send_pdf_via_graph(
                recipient_email=recipient_email,
                subject=subject,
                body=body,
                attachments=[
                    {"path": temp_air_path, "name": air_att_name},
                    {"path": temp_sea_path, "name": sea_att_name},
                ]
            )
        else:
            generate_dashboard_pdf(
                start_date=start_date,
                end_date=end_date,
                country=country_val or filters.get("country"),
                airline=filters.get("airline"),
                output_path=temp_pdf_path,
                company_code=company_val or filters.get("company_code"),
                origin_city=filters.get("origin_city"),
                destination_country=filters.get("destination_country"),
                destination_city=filters.get("destination_city"),
                branch=branch_val or filters.get("branch"),
                include_weekly_visual=filters.get("include_weekly_visual", True),
                include_weekly_ledger=filters.get("include_weekly_ledger", True),
                include_monthly_visual=filters.get("include_monthly_visual", True),
                include_monthly_ledger=filters.get("include_monthly_ledger", True),
                include_sector_distribution=filters.get("include_sector_distribution", True),
                include_sea_sector_distribution=filters.get("include_sea_sector_distribution", True),
                max_data_rows=filters.get("max_data_rows", 100),
                mode=mode,
                custom_sql=custom_sql,
                query_id=query_id,
                report_type=resolved_report_type,
                transport_mode=transport_mode,
            )
            
            subject, body, attachment_name = build_email_metadata(
                start_date=start_date,
                end_date=end_date,
                country=country_val or filters.get("country"),
                company_code=company_val or filters.get("company_code"),
                branch=branch_val or filters.get("branch"),
                report_type=resolved_report_type,
                transport_mode=transport_mode,
            )
            
            send_pdf_via_graph(
                pdf_path=temp_pdf_path,
                recipient_email=recipient_email,
                subject=subject,
                body=body,
                attachment_name=attachment_name
            )
        print(f"Scheduler: Successfully sent report for schedule {schedule_id}")
        return True
    except Exception as e:
        from api.email_service import log_email_transaction
        log_email_transaction(recipient_email, "SCHEDULED_JOB_ERROR", str(e))
        print(f"Scheduler: Job execution failed for schedule {schedule_id}: {str(e)}")
        raise
    finally:
        cleanup_report_files(temp_pdf_path, temp_air_path, temp_sea_path)


def _verify_scheduler_token(request_token: Optional[str]) -> bool:
    """Accept a Cloud Scheduler request only when its configured secret matches."""
    secret = os.environ.get("SCHEDULER_SECRET_TOKEN", "")
    return bool(secret and request_token and secrets.compare_digest(request_token, secret))


@app.on_event("startup")
def startup_event():
    """Initializes the backend on startup."""
    print("FastAPI Startup: Ready. Scheduling database is managed by Supabase.")



@app.get("/api/schedules")
def api_list_schedules(transport_mode: Literal["AIR", "SEA", "BOTH", "ALL"] = "AIR", current_user: dict = Depends(get_current_admin)):
    """Returns a list of all defined report schedules."""
    try:
        schedules = [s for s in get_all_schedules()
                     if transport_mode == "ALL" or (s.get("filters") or {}).get("transport_mode", "AIR") in (transport_mode, "BOTH")]
        return {"status": "success", "data": schedules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/schedules")
def api_create_schedule(req: ScheduleCreateRequest, current_user: dict = Depends(get_current_admin)):
    """Registers a new schedule in Supabase and creates a Google Cloud Scheduler job."""
    if req.filters.get("transport_mode", "AIR") not in ("AIR", "SEA", "BOTH"):
        raise HTTPException(status_code=400, detail="transport_mode must be AIR, SEA, or BOTH")
    req.filters.setdefault("transport_mode", "AIR")
    # Weekly schedules need either day_of_week (Mon-Sun) OR day_of_month (month-cycle: 8, 15, 22)
    if req.frequency == "weekly" and req.day_of_week is None and req.day_of_month is None:
        raise HTTPException(status_code=400, detail="day_of_week or day_of_month is required for weekly schedules")
    if req.frequency == "monthly":
        if req.day_of_month is None:
            raise HTTPException(status_code=400, detail="day_of_month is required for monthly schedules")
        if not (1 <= req.day_of_month <= 31):
            raise HTTPException(status_code=400, detail="day_of_month must be between 1 and 31")

    try:
        hour, minute = map(int, req.time_of_day.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="time_of_day must be in 'HH:MM' 24-hour format")

    try:
        # Schedule creators belong to Tonnage's own user table, independently of NPS.
        created_by_id = None
        admin_email = current_user.get("email")
        if admin_email and SUPABASE_URL and SUPABASE_KEY:
            try:
                db_headers = get_supabase_headers()
                user_lookup_resp = requests.get(
                    f"{SUPABASE_URL}/rest/v1/{TONNAGE_USERS_TABLE}?email=eq.{admin_email}&select=id",
                    headers=db_headers,
                    timeout=5
                )
                if user_lookup_resp.status_code == 200 and len(user_lookup_resp.json()) > 0:
                    created_by_id = user_lookup_resp.json()[0].get("id")
            except Exception as lookup_err:
                print(f"Warning: Could not resolve admin email in {TONNAGE_USERS_TABLE}: {lookup_err}")

        schedule_id = str(uuid.uuid4())
        save_schedule(
            schedule_id=schedule_id,
            recipient_email=req.recipient_email,
            frequency=req.frequency,
            day_of_week=req.day_of_week,
            day_of_month=req.day_of_month,
            time_of_day=req.time_of_day,
            filters_dict=req.filters,
            is_active=1 if req.is_active else 0,
            created_by=created_by_id
        )

        config = get_schedule(schedule_id)
        if config:
            try:
                sync_schedule_to_cloud(config)
            except Exception as e:
                print(f"Cloud Scheduler: Warning - could not sync schedule {schedule_id}: {e}")

        return {"status": "success", "message": "Schedule created successfully", "id": schedule_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/schedules/{schedule_id}/toggle")
def api_toggle_schedule(schedule_id: str, current_user: dict = Depends(get_current_admin)):
    """Enables or disables a report schedule in Supabase and syncs the state to Google Cloud Scheduler."""
    config = get_schedule(schedule_id)
    if not config:
        raise HTTPException(status_code=404, detail="Schedule not found")

    try:
        new_status = 0 if config["is_active"] else 1
        update_schedule_status(schedule_id, new_status)

        updated_config = get_schedule(schedule_id)
        if updated_config:
            try:
                sync_schedule_to_cloud(updated_config)
            except Exception as e:
                print(f"Cloud Scheduler: Warning - could not sync toggle for {schedule_id}: {e}")

        status_label = "activated" if new_status else "deactivated"
        return {"status": "success", "message": f"Schedule successfully {status_label}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/schedules/{schedule_id}/run")
def api_run_schedule_manually(
    schedule_id: str,
    x_scheduler_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    """
    Triggers immediate execution of a schedule.
    Called by:
      - The UI 'Run Now' button (sends Authorization header)
      - Google Cloud Scheduler at the configured cron time (sends X-Scheduler-Token header)
    """
    is_scheduler = False
    # If a token is present in the request (i.e., called by Cloud Scheduler), verify it
    if x_scheduler_token is not None:
        if _verify_scheduler_token(x_scheduler_token):
            is_scheduler = True
        else:
            raise HTTPException(status_code=403, detail="Invalid scheduler token.")

    # If NOT triggered by Cloud Scheduler, verify user identity using get_current_admin
    if not is_scheduler:
        get_current_admin(authorization)

    config = get_schedule(schedule_id)
    if not config:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if not config.get("is_active"):
        print(f"Schedule {schedule_id} is inactive. Skipping.")
        return {"status": "skipped", "message": "Schedule is currently inactive."}

    try:
        # Run synchronously to prevent CPU throttling on Cloud Run
        executed = execute_scheduled_report_job(schedule_id)
        if executed is False:
            return {"status": "skipped", "message": "Schedule became inactive or was removed before execution."}
        return {"status": "success", "message": "Report generated and email accepted for sending."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.delete("/api/schedules/{schedule_id}")
def api_delete_schedule(schedule_id: str, current_user: dict = Depends(get_current_admin)):
    """Deletes a schedule from Supabase and removes its Google Cloud Scheduler job."""
    try:
        delete_schedule(schedule_id)
        try:
            delete_cloud_scheduler_job(schedule_id)
        except Exception as e:
            print(f"Cloud Scheduler: Warning - could not delete job for {schedule_id}: {e}")
        return {"status": "success", "message": "Schedule deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BatchDeleteSchedulesRequest(BaseModel):
    schedule_ids: List[str]


@app.post("/api/schedules/batch-delete")
def api_batch_delete_schedules(req: BatchDeleteSchedulesRequest, current_user: dict = Depends(get_current_admin)):
    """Deletes multiple schedules from Supabase and removes their Google Cloud Scheduler jobs."""
    if not req.schedule_ids:
        raise HTTPException(status_code=400, detail="No schedule IDs provided for deletion.")

    deleted_count = 0
    errors = []
    for sid in req.schedule_ids:
        try:
            delete_schedule(sid)
            try:
                delete_cloud_scheduler_job(sid)
            except Exception as e:
                print(f"Cloud Scheduler: Warning - could not delete job for {sid}: {e}")
            deleted_count += 1
        except Exception as e:
            errors.append(f"{sid}: {str(e)}")

    if errors and deleted_count == 0:
        raise HTTPException(status_code=500, detail="; ".join(errors))

    return {
        "status": "success",
        "deleted_count": deleted_count,
        "errors": errors,
        "message": f"Successfully deleted {deleted_count} schedule{'s' if deleted_count != 1 else ''}."
    }



# --- MOUNT STATIC FILES (must be after all API routes) ---
# Serves Next.js _next/static bundles, images, etc.
if os.path.exists(_FRONTEND_BUILD):
    # Mount _next directory for chunks/CSS/JS
    _next_dir = os.path.join(_FRONTEND_BUILD, "_next")
    if os.path.exists(_next_dir):
        app.mount("/_next", StaticFiles(directory=_next_dir), name="nextjs_assets")
    # Mount images and other public assets
    app.mount("/images", StaticFiles(directory=os.path.join(_FRONTEND_BUILD, "images")), name="images") if os.path.exists(os.path.join(_FRONTEND_BUILD, "images")) else None
    # Mount everything else (favicon, etc.)
    app.mount("/static_root", StaticFiles(directory=_FRONTEND_BUILD), name="static_root")


# --- RUNNER FOR DEVELOPMENT ---
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
