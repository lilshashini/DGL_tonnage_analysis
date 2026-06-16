import os
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uuid
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
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
)
from api.pdf_service import generate_dashboard_pdf
from api.email_service import send_pdf_via_graph
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from api.scheduler_db import (
    init_scheduler_db,
    save_schedule,
    get_all_schedules,
    get_schedule,
    delete_schedule,
    update_schedule_status,
)
import json
import datetime

# Create background scheduler
scheduler = AsyncIOScheduler()

app = FastAPI(title="Tonnage Reporting API")

# Allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATA MODELS ---
class ReportRequest(BaseModel):
    recipient_email: str
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
    max_data_rows: int = 100  # Limit table rows to reduce PDF size


class CustomQueryRequest(BaseModel):
    query: str



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
):
    """Provides filtered JSON data for the React frontend to display charts."""
    try:
        data = get_filtered_data(
            start_date, end_date, country, airline, company_code, origin_city, destination_country, destination_city, branch
        )
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
):
    """Returns aggregate KPI totals."""
    try:
        kpi = get_kpi_summary(
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
):
    """Returns data grouped by week for trend charts."""
    try:
        data = get_weekly_data(
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
):
    """Returns data grouped by month for trend charts."""
    try:
        data = get_monthly_data(
            start_date, end_date, country, airline, company_code, origin_city, destination_country, destination_city, branch
        )
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# --- ENDPOINT 4: Countries dropdown ---
@app.get("/api/countries")
def fetch_countries(start_date: str, end_date: str, company_code: str = None):
    """Returns distinct origin countries for the filter dropdown."""
    try:
        countries = get_countries(start_date, end_date, company_code)
        return {"status": "success", "data": countries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5: Airlines dropdown ---
@app.get("/api/airlines")
def fetch_airlines(start_date: str, end_date: str, country: str = None):
    """Returns distinct airlines (optionally filtered by country) for the filter dropdown."""
    try:
        airlines = get_airlines(start_date, end_date, country)
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
def fetch_origin_cities(start_date: str, end_date: str, country: str = None):
    """Returns distinct origin cities, optionally filtered by country."""
    try:
        cities = get_origin_cities(start_date, end_date, country)
        return {"status": "success", "data": cities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.3: Destination Countries dropdown ---
@app.get("/api/destination-countries")
def fetch_destination_countries(start_date: str, end_date: str):
    """Returns distinct destination countries."""
    try:
        countries = get_destination_countries(start_date, end_date)
        return {"status": "success", "data": countries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 5.4: Destination Cities dropdown ---
@app.get("/api/destination-cities")
def fetch_destination_cities(start_date: str, end_date: str, country: str = None):
    """Returns distinct destination cities, optionally filtered by destination country."""
    try:
        cities = get_destination_cities(start_date, end_date, country)
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


# --- HELPER: Background Task for PDF & Email ---
def process_pdf_and_email(req: ReportRequest):
    """Runs in the background so the frontend doesn't hang waiting for Playwright."""
    os.makedirs("outputs", exist_ok=True)
    temp_pdf_path = f"outputs/report_{uuid.uuid4().hex}.pdf"
    
    query_id = None
    if req.mode == "custom-sql" and req.custom_sql:
        query_id = str(uuid.uuid4())
        query_cache[query_id] = req.custom_sql
        
    try:
        generate_dashboard_pdf(
            start_date=req.start_date,
            end_date=req.end_date,
            country=req.country,
            airline=req.airline,
            output_path=temp_pdf_path,
            company_code=req.company_code,
            origin_city=req.origin_city,
            destination_country=req.destination_country,
            destination_city=req.destination_city,
            branch=req.branch,
            include_weekly_visual=req.include_weekly_visual,
            include_weekly_ledger=req.include_weekly_ledger,
            include_monthly_visual=req.include_monthly_visual,
            include_monthly_ledger=req.include_monthly_ledger,
            max_data_rows=req.max_data_rows,
            mode=req.mode,
            custom_sql=req.custom_sql,
            query_id=query_id,
        )
        # Format a meaningful subject and body based on request filters
        station_label = "Global"
        if req.country and req.company_code:
            station_label = f"{req.country} ({req.company_code})"
        elif req.country:
            station_label = req.country
        elif req.company_code:
            station_label = req.company_code
            if req.company_code == "OTHER":
                station_label = "Corporate / Other"

        date_range_label = ""
        if req.start_date and req.end_date:
            date_range_label = f" ({req.start_date} to {req.end_date})"

        subject = f"Weekly Air Freight Tonnage Dashboard - {station_label}{date_range_label}"
        body = (
            f"Dear Recipient,\n\n"
            f"Please find attached the Weekly Air Freight Tonnage and Revenue Performance Dashboard for {station_label} "
            f"covering the period from {req.start_date or 'N/A'} to {req.end_date or 'N/A'}.\n\n"
            f"Best Regards,\n"
            f"BI Support Team"
        )
        attachment_name = f"Weekly_Tonnage_Report_{req.company_code or 'Global'}.pdf"

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
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)


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
    """Returns the configured recipients for each station from .env config."""
    try:
        stations = ["CMB", "IND", "VNM", "DAC", "PKI", "NYC"]
        result = {}
        for code in stations:
            emails_str = os.getenv(f"RECIPIENTS_{code}") or os.getenv("RECIPIENT_EMAILS", "")
            emails = [email.strip() for email in emails_str.split(",") if email.strip()]
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
            raise HTTPException(status_code=500, detail="Azure FETCH credentials not configured in .env")

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



# --- ENDPOINT 6: Trigger PDF Email ---
@app.post("/api/send-report")
def send_report(req: ReportRequest, background_tasks: BackgroundTasks):
    """Accepts filters and an email address, then triggers Playwright and MS Graph API."""
    if not req.recipient_email:
        raise HTTPException(status_code=400, detail="Recipient email is required.")
    
    if os.environ.get("VERCEL"):
        raise HTTPException(
            status_code=400,
            detail="PDF generation and email dispatch are not supported on Vercel serverless functions (Playwright Chromium binaries cannot be run). Please host your backend on Render, Railway, or a VPS to use email capabilities."
        )
        
    background_tasks.add_task(process_pdf_and_email, req)
    return {
        "status": "processing",
        "message": f"Report generation started. An email will be dispatched to {req.recipient_email} shortly.",
    }



# --- ENDPOINT 6.5: Custom SQL Query Cache ---
class CacheQueryRequest(BaseModel):
    query: str

@app.post("/api/cache-query")
def cache_query(req: CacheQueryRequest):
    """Temporarily stores a custom SQL query in memory, returning a query ID for URL params."""
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    query_id = str(uuid.uuid4())
    query_cache[query_id] = req.query
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
def custom_query(req: CustomQueryRequest):
    """Executes a custom SQL query directly against the engine in a sandbox environment."""
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="SQL query string cannot be empty.")
    
    try:
        data = execute_custom_query(req.query)
        return {"status": "success", "data": data, "rowCount": len(data)}
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


def get_report_dates_by_frequency(frequency: str):
    """Calculates start and end dates relative to execution time."""
    today = datetime.date.today()
    if frequency == "weekly":
        # Monday to Sunday of previous complete week
        start = today - datetime.timedelta(days=today.weekday() + 7)
        end = today - datetime.timedelta(days=today.weekday() + 1)
    elif frequency == "monthly":
        # First to last day of previous calendar month
        first_of_this_month = today.replace(day=1)
        end = first_of_this_month - datetime.timedelta(days=1)
        start = end.replace(day=1)
    else:
        # Fallback daily or daily schedules cover last 7 days of trend data
        start = today - datetime.timedelta(days=7)
        end = today
    return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')


def execute_scheduled_report_job(schedule_id: str):
    """Fired by APScheduler to generate and email a scheduled report."""
    print(f"APScheduler: Starting report execution for schedule {schedule_id}")
    config = get_schedule(schedule_id)
    if not config or not config.get("is_active"):
        print(f"APScheduler: Schedule {schedule_id} is inactive or does not exist. Aborting job.")
        return
        
    recipient_email = config["recipient_email"]
    frequency = config["frequency"]
    filters = config["filters"]
    
    # Check if custom dates are specified in filters, otherwise calculate relative dates
    if filters.get("start_date") and filters.get("end_date"):
        start_date = filters["start_date"]
        end_date = filters["end_date"]
    else:
        start_date, end_date = get_report_dates_by_frequency(frequency)
    temp_pdf_path = f"outputs/scheduled_report_{uuid.uuid4().hex}.pdf"
    os.makedirs("outputs", exist_ok=True)
    
    # Process mode and cache custom SQL query if needed
    company_val = filters.get("company_code")
    country_val = filters.get("country")
    
    if company_val and company_val != "all":
        mode = "custom-sql"
        if company_val == "OTHER":
            custom_sql = f"""
SELECT
    vt.ConsoleNumber AS Console_Number,
    vt.MasterBillNum AS Master_Airway_Bill,
    vt.AirlineName1 AS Airline,
    vt.ConsolTransportMode AS Transport_Mode,
    vt.ETD,
    vt.ConLoadPortCountryName AS Origin_Country,
    COALESCE(MAX(vs.OriginCity), 'N/A') AS Origin_City,
    COALESCE(MAX(vs.DestCity), 'N/A') AS Destination_City,
    COALESCE(MAX(vs.DestCountry), 'N/A') AS Destination_Country,
    COALESCE(MAX(vs.Company), 'Unlinked') AS Company_Code,
    COUNT(DISTINCT vs.ShipmentNumber) AS Total_Shipments,
    ROUND(vt.Air_ChargebleWeight, 2) AS Tonnage_Chargeable,
    ROUND(vt.Air_ActualWeight, 2) AS Tonnage_Actual,
    ROUND(vt.Revenue_USD, 2) AS Revenue_USD,
    ROUND(vt.Cost_USD, 2) AS Cost_USD,
    ROUND(vt.Profit_USD, 2) AS Profit_USD,
    ROUND((vt.Profit_USD / NULLIF(vt.Revenue_USD, 0)) * 100, 2) AS GP_Margin_Percent
FROM dbo.ChatData_ViewShipConsolTransport vt
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.ETD >= '{start_date}'
    AND vt.ETD <= '{end_date}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company NOT IN ('CMB', 'IND', 'VNM', 'DAC', 'PKI', 'NYC')
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1, vt.ConsolTransportMode, vt.ETD, vt.ConLoadPortCountryName, vt.Air_ChargebleWeight, vt.Air_ActualWeight, vt.Revenue_USD, vt.Cost_USD, vt.Profit_USD
ORDER BY vt.ETD DESC, vt.Revenue_USD DESC;
            """.strip()
        else:
            custom_sql = f"""
SELECT
    vt.ConsoleNumber AS Console_Number,
    vt.MasterBillNum AS Master_Airway_Bill,
    vt.AirlineName1 AS Airline,
    vt.ConsolTransportMode AS Transport_Mode,
    vt.ETD,
    vt.ConLoadPortCountryName AS Origin_Country,
    COALESCE(MAX(vs.OriginCity), 'N/A') AS Origin_City,
    COALESCE(MAX(vs.DestCity), 'N/A') AS Destination_City,
    COALESCE(MAX(vs.DestCountry), 'N/A') AS Destination_Country,
    COALESCE(MAX(vs.Company), 'Unlinked') AS Company_Code,
    COUNT(DISTINCT vs.ShipmentNumber) AS Total_Shipments,
    ROUND(vt.Air_ChargebleWeight, 2) AS Tonnage_Chargeable,
    ROUND(vt.Air_ActualWeight, 2) AS Tonnage_Actual,
    ROUND(vt.Revenue_USD, 2) AS Revenue_USD,
    ROUND(vt.Cost_USD, 2) AS Cost_USD,
    ROUND(vt.Profit_USD, 2) AS Profit_USD,
    ROUND((vt.Profit_USD / NULLIF(vt.Revenue_USD, 0)) * 100, 2) AS GP_Margin_Percent
FROM dbo.ChatData_ViewShipConsolTransport vt
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.ConLoadPortCountryName = '{country_val}'
    AND vt.ETD >= '{start_date}'
    AND vt.ETD <= '{end_date}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = '{company_val}'
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1, vt.ConsolTransportMode, vt.ETD, vt.ConLoadPortCountryName, vt.Air_ChargebleWeight, vt.Air_ActualWeight, vt.Revenue_USD, vt.Cost_USD, vt.Profit_USD
ORDER BY vt.ETD DESC, vt.Revenue_USD DESC;
            """.strip()
    else:
        mode = filters.get("mode", "standard")
        custom_sql = filters.get("custom_sql")
        
    query_id = None
    if mode == "custom-sql" and custom_sql:
        query_id = str(uuid.uuid4())
        query_cache[query_id] = custom_sql
        
    try:
        generate_dashboard_pdf(
            start_date=start_date,
            end_date=end_date,
            country=filters.get("country"),
            airline=filters.get("airline"),
            output_path=temp_pdf_path,
            company_code=filters.get("company_code"),
            origin_city=filters.get("origin_city"),
            destination_country=filters.get("destination_country"),
            destination_city=filters.get("destination_city"),
            branch=filters.get("branch"),
            include_weekly_visual=filters.get("include_weekly_visual", True),
            include_weekly_ledger=filters.get("include_weekly_ledger", True),
            include_monthly_visual=filters.get("include_monthly_visual", True),
            include_monthly_ledger=filters.get("include_monthly_ledger", True),
            max_data_rows=filters.get("max_data_rows", 100),
            mode=mode,
            custom_sql=custom_sql,
            query_id=query_id,
        )
        
        # Build email subject and description labels
        station_label = "Global"
        country_val = filters.get("country")
        company_val = filters.get("company_code")
        if country_val and company_val:
            station_label = f"{country_val} ({company_val})"
        elif country_val:
            station_label = country_val
        elif company_val:
            station_label = company_val
            if company_val == "OTHER":
                station_label = "Corporate / Other"
                
        subject = f"Scheduled Air Freight Tonnage Dashboard - {station_label} ({start_date} to {end_date})"
        body = (
            f"Dear Recipient,\n\n"
            f"Please find attached the scheduled Air Freight Tonnage and Revenue Performance Dashboard for {station_label} "
            f"covering the period from {start_date} to {end_date}.\n\n"
            f"Best Regards,\n"
            f"BI Support Team"
        )
        attachment_name = f"Scheduled_Tonnage_Report_{company_val or 'Global'}.pdf"
        
        send_pdf_via_graph(
            pdf_path=temp_pdf_path,
            recipient_email=recipient_email,
            subject=subject,
            body=body,
            attachment_name=attachment_name
        )
        print(f"APScheduler: Successfully sent report for schedule {schedule_id}")
    except Exception as e:
        from api.email_service import log_email_transaction
        log_email_transaction(recipient_email, "SCHEDULED_JOB_ERROR", str(e))
        print(f"APScheduler: Job execution failed for schedule {schedule_id}: {str(e)}")
    finally:
        if os.path.exists(temp_pdf_path):
            try:
                os.remove(temp_pdf_path)
            except Exception:
                pass


def register_schedule_in_apscheduler(config: dict):
    """Schedules or updates a cron job in APScheduler according to its DB config."""
    job_id = config["id"]
    
    # Remove existing job if it is registered
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        
    if not config["is_active"]:
        return
        
    frequency = config["frequency"]
    time_str = config["time_of_day"]
    hour, minute = map(int, time_str.split(":"))
    
    trigger = None
    if frequency == "weekly":
        trigger = CronTrigger(day_of_week=config["day_of_week"], hour=hour, minute=minute)
    elif frequency == "monthly":
        trigger = CronTrigger(day=config["day_of_month"], hour=hour, minute=minute)
    elif frequency == "daily":
        trigger = CronTrigger(hour=hour, minute=minute)
        
    if trigger:
        scheduler.add_job(
            execute_scheduled_report_job,
            trigger=trigger,
            args=[job_id],
            id=job_id,
            max_instances=1,
            replace_existing=True
        )
        print(f"APScheduler: Job {job_id} scheduled for {frequency} run at {time_str}")


def load_active_jobs_into_scheduler():
    """Initializes schedules from local SQLite and loads them as background tasks."""
    schedules = get_all_schedules()
    for s in schedules:
        if s.get("is_active"):
            try:
                register_schedule_in_apscheduler(s)
            except Exception as e:
                print(f"APScheduler: Failed to load schedule {s.get('id')}: {e}")


@app.on_event("startup")
def startup_scheduler():
    print("FastAPI Startup: Initializing local SQLite database...")
    init_scheduler_db()
    if not os.environ.get("VERCEL"):
        print("FastAPI Startup: Starting background scheduler...")
        load_active_jobs_into_scheduler()
        scheduler.start()
    else:
        print("FastAPI Startup: Running on Vercel, background scheduler disabled.")


@app.on_event("shutdown")
def shutdown_scheduler():
    if not os.environ.get("VERCEL"):
        print("FastAPI Shutdown: Stopping background scheduler...")
        scheduler.shutdown()



@app.get("/api/schedules")
def api_list_schedules():
    """Returns a list of all defined report schedules."""
    try:
        schedules = get_all_schedules()
        return {"status": "success", "data": schedules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/schedules")
def api_create_schedule(req: ScheduleCreateRequest):
    """Registers a new schedule in SQLite and loads it into the running APScheduler."""
    if req.frequency == "weekly" and req.day_of_week is None:
        raise HTTPException(status_code=400, detail="day_of_week is required for weekly schedules")
    if req.frequency == "monthly" and req.day_of_month is None:
        raise HTTPException(status_code=400, detail="day_of_month is required for monthly schedules")
        
    try:
        hour, minute = map(int, req.time_of_day.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError()
    except Exception:
        raise HTTPException(status_code=400, detail="time_of_day must be in 'HH:MM' 24-hour format")
        
    try:
        schedule_id = str(uuid.uuid4())
        save_schedule(
            schedule_id=schedule_id,
            recipient_email=req.recipient_email,
            frequency=req.frequency,
            day_of_week=req.day_of_week,
            day_of_month=req.day_of_month,
            time_of_day=req.time_of_day,
            filters_dict=req.filters,
            is_active=1 if req.is_active else 0
        )
        
        config = get_schedule(schedule_id)
        if config:
            register_schedule_in_apscheduler(config)
            
        return {"status": "success", "message": "Schedule created successfully", "id": schedule_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/schedules/{schedule_id}/toggle")
def api_toggle_schedule(schedule_id: str):
    """Enables or disables a report schedule, adding/removing it from the active scheduler."""
    config = get_schedule(schedule_id)
    if not config:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    try:
        new_status = 0 if config["is_active"] else 1
        update_schedule_status(schedule_id, new_status)
        
        updated_config = get_schedule(schedule_id)
        if updated_config:
            register_schedule_in_apscheduler(updated_config)
            
        status_label = "activated" if new_status else "deactivated"
        return {"status": "success", "message": f"Schedule successfully {status_label}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/schedules/{schedule_id}/run")
def api_run_schedule_manually(schedule_id: str, background_tasks: BackgroundTasks):
    """Immediately triggers the execution of a schedule, running it as a background task."""
    config = get_schedule(schedule_id)
    if not config:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    if os.environ.get("VERCEL"):
        raise HTTPException(
            status_code=400,
            detail="Scheduled report execution is not supported on Vercel because Playwright Chromium is unavailable in serverless environments. Please deploy on Render or a VPS to use email capabilities."
        )
        
    try:
        background_tasks.add_task(execute_scheduled_report_job, schedule_id)
        return {"status": "success", "message": "Report generation and email dispatch started."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.delete("/api/schedules/{schedule_id}")
def api_delete_schedule(schedule_id: str):
    """Deletes a schedule from both SQLite and APScheduler."""
    try:
        delete_schedule(schedule_id)
        if scheduler.get_job(schedule_id):
            scheduler.remove_job(schedule_id)
        return {"status": "success", "message": "Schedule deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- RUNNER FOR DEVELOPMENT ---
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    is_dev = os.environ.get("PORT") is None
    uvicorn.run("api.main:app", host="0.0.0.0", port=port, reload=is_dev)