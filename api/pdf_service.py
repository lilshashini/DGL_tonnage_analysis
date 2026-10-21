import os
import socket
import urllib.parse
import json
import logging
import time
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()
logger = logging.getLogger(__name__)

def is_port_open(port: int) -> bool:
    """Checks if a local port is actively open and listening."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(('127.0.0.1', port)) == 0

import urllib.request

def get_tonnage_base_url() -> str:
    """
    Detects which port the Tonnage Analysis frontend server is running on.
    Probes candidate ports (3001, 3000, 3002, 8000, 8080) to ensure we connect
    to the correct application even if another project is running on port 3000.
    """
    if os.environ.get("K_SERVICE") or os.environ.get("PORT"):
        cloud_run_port = int(os.environ.get("PORT", 8080))
        return f"http://127.0.0.1:{cloud_run_port}"

    custom_url = os.getenv("FRONTEND_BASE_URL")
    if custom_url:
        return custom_url

    # Check candidate ports in local dev
    candidate_ports = [3001, 3000, 3002, 8000, 8080]
    for port in candidate_ports:
        if is_port_open(port):
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{port}/print-view/", headers={"User-Agent": "HealthCheck"})
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        print(f"Detected Tonnage Analysis print view on port {port}")
                        return f"http://127.0.0.1:{port}"
            except Exception:
                pass

    if is_port_open(3001):
        return "http://127.0.0.1:3001"
    return "http://127.0.0.1:3000"

def generate_dashboard_pdf(
    output_path: str,
    start_date: str = None,
    end_date: str = None,
    country: str = None,
    airline: str = None,
    company_code: str = None,
    origin_city: str = None,
    destination_country: str = None,
    destination_city: str = None,
    branch: str = None,
    include_weekly_visual: bool = True,
    include_weekly_ledger: bool = True,
    include_monthly_visual: bool = True,
    include_monthly_ledger: bool = True,
    include_sector_distribution: bool = True,
    include_sea_sector_distribution: bool = True,
    max_data_rows: int = 100,
    mode: str = "standard",
    custom_sql: str = None,
    query_id: str = None,
    report_type: str = "weekly",
    transport_mode: str = "AIR",
    ledger_output_path: str = None,
):
    """
    Directs a headless browser to the frontend print view and captures a PDF.
    Supports both standard mode (with filters) and custom-sql mode (with SQL query).
    """
    if country and str(country).strip().lower().replace(" ", "") == "vietnam":
        country = "Viet Nam"
    if custom_sql:
        import re
        custom_sql = re.sub(
            r"(\b(?:[a-zA-Z0-9_]+\.)?(?:ConLoadPortCountryName|RealLoadPortCountryName|RealDisChargePortCountryName|ConDischargePortCountryName)\s*=\s*)'Vietnam'",
            r"\1'Viet Nam'",
            custom_sql,
            flags=re.IGNORECASE
        )
        custom_sql = re.sub(
            r"(\b(?:[a-zA-Z0-9_]+\.)?(?:ConLoadPortCountryName|RealLoadPortCountryName|RealDisChargePortCountryName|ConDischargePortCountryName)\s+IN\s*\([^)]*?)'Vietnam'([^)]*?\))",
            r"\1'Viet Nam'\2",
            custom_sql,
            flags=re.IGNORECASE
        )

    base_url = get_tonnage_base_url()
    
    # Construct the print-optimized frontend URL with filter parameters
    params = {"transport_mode": transport_mode}
    
    # Add mode and query-specific parameters
    if mode == "custom-sql":
        params["mode"] = "custom-sql"
        if query_id:
            params["query_id"] = query_id
        # custom_sql is injected below rather than placed in a potentially
        # oversized URL (and is available even when query_id has expired).
        # Pass station identification and date parameters to custom-sql mode
        if start_date: params["start_date"] = start_date
        if end_date: params["end_date"] = end_date
        if country: params["country"] = country
        if company_code: params["company_code"] = company_code
        if branch: params["branch"] = branch
        if airline: params["airline"] = airline
        if origin_city: params["origin_city"] = origin_city
        if destination_country: params["destination_country"] = destination_country
        if destination_city: params["destination_city"] = destination_city
    else:
        # Standard mode - add date range and filters
        if start_date: params["start_date"] = start_date
        if end_date: params["end_date"] = end_date
        if country: params["country"] = country
        if airline: params["airline"] = airline
        if company_code: params["company_code"] = company_code
        if origin_city: params["origin_city"] = origin_city
        if destination_country: params["destination_country"] = destination_country
        if destination_city: params["destination_city"] = destination_city
        if branch: params["branch"] = branch
    
    # Add section and row limit parameters (both modes)
    params["include_weekly_visual"] = str(include_weekly_visual).lower()
    params["include_weekly_ledger"] = str(include_weekly_ledger).lower()
    params["include_monthly_visual"] = str(include_monthly_visual).lower()
    params["include_monthly_ledger"] = str(include_monthly_ledger).lower()
    params["include_sector_distribution"] = str(include_sector_distribution).lower()
    params["include_sea_sector_distribution"] = str(include_sea_sector_distribution).lower()
    params["max_data_rows"] = max_data_rows
    params["report_type"] = report_type
    
    query_string = urllib.parse.urlencode(params)
    target_url = f"{base_url.rstrip('/')}/print-view/?{query_string}"
    
    import sys
    import asyncio
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    started = time.monotonic()
    # The browser must use this backend, even if the static frontend was built
    # with a production API URL. SQL is injected directly to avoid worker-local
    # query IDs and an extra network request during email generation.
    api_base = (f"http://127.0.0.1:{os.getenv('PORT', '8080')}"
                if os.environ.get("K_SERVICE") or os.environ.get("PORT")
                else f"http://127.0.0.1:{os.getenv('API_PORT', '8000')}")
    print_config = {"apiBaseUrl": api_base, "customSql": custom_sql}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                report_records = None
                def capture_report_records(response):
                    nonlocal report_records
                    path = urllib.parse.urlparse(response.url).path.rstrip("/")
                    expected = "/api/custom-query" if mode == "custom-sql" else "/api/data"
                    if path == expected and response.ok:
                        payload = response.json()
                        records = payload.get("ledger_records", payload.get("data"))
                        if payload.get("status") == "success" and isinstance(records, list):
                            report_records = records
                if ledger_output_path:
                    expected = "/api/custom-query" if mode == "custom-sql" else "/api/data"
                    # The ledger header belongs on the data request. A global
                    # header also reaches third-party fonts and fails CORS.
                    page.route(api_base + expected + "**", lambda route: route.fallback(
                        headers={**route.request.headers, "X-Consol-Ledger": "true"}))
                    page.on("response", capture_report_records)
                page.add_init_script("window.__FREIGHT_PRINT_CONFIG__ = " + json.dumps(print_config) + ";")
                page.on("pageerror", lambda err: logger.error("Print view error: %s", err))
                page.emulate_media(media="print")
                response = page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
                if response and response.status >= 400:
                    raise RuntimeError(f"Print view page returned HTTP {response.status}.")
                try:
                    page.wait_for_selector("#pdf-ready, #print-error", state="attached", timeout=60000)
                except Exception as exc:
                    raise RuntimeError("Report did not finish loading within 60 seconds. No PDF was generated or sent.") from exc
                if page.locator("#print-error").count():
                    raise RuntimeError(page.locator("#print-error").inner_text())
                if not page.locator(".print-page-container").count():
                    raise RuntimeError("Report has no printable pages. No PDF was generated or sent.")
                if ledger_output_path:
                    if report_records is None:
                        raise RuntimeError("Report records were unavailable for the Consol Ledger. No report was sent.")
                    from api.ledger_service import generate_consol_ledger
                    generate_consol_ledger(ledger_output_path, report_records, transport_mode)
                page.pdf(path=output_path, format="A4", landscape=True, print_background=True)
                logger.info("%s report PDF generated in %.2f seconds.", transport_mode, time.monotonic() - started)
            finally:
                browser.close()
    except Exception as e:
        print(f"PDF Generation Error: {str(e)}")
        raise


def generate_report_bundle(output_path: str, **kwargs):
    """Generate a PDF and its Excel ledger from the same fetched data response."""
    from api.ledger_service import ledger_path
    generate_dashboard_pdf(output_path, ledger_output_path=ledger_path(output_path), **kwargs)
