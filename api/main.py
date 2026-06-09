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
load_dotenv()

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
        send_pdf_via_graph(pdf_path=temp_pdf_path, recipient_email=req.recipient_email)
    except Exception as e:
        from api.email_service import log_email_transaction
        log_email_transaction(req.recipient_email, "TASK_ERROR", str(e))
        print(f"Background Task Failed: {e}")
    finally:
        if os.path.exists(temp_pdf_path):
            os.remove(temp_pdf_path)


# --- ENDPOINT 5.5: Recipients list dropdown ---
@app.get("/api/recipients")
def fetch_recipients():
    """Returns the comma-separated candidate recipient emails from .env config."""
    try:
        emails = os.getenv("RECIPIENT_EMAILS", "shashini.hq@dartglobal.com")
        email_list = [email.strip() for email in emails.split(",") if email.strip()]
        return {"status": "success", "data": email_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 6: Trigger PDF Email ---
@app.post("/api/send-report")
def send_report(req: ReportRequest, background_tasks: BackgroundTasks):
    """Accepts filters and an email address, then triggers Playwright and MS Graph API."""
    if not req.recipient_email:
        raise HTTPException(status_code=400, detail="Recipient email is required.")
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



# --- RUNNER FOR DEVELOPMENT ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)