import os
import sys
import urllib.parse
import pandas as pd
import requests
import base64
import logging
import datetime
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from msal import ConfidentialClientApplication
from playwright.sync_api import sync_playwright
from jinja2 import Environment, FileSystemLoader

# --- SETUP: Directories and Logging ---
os.makedirs("logs", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

logging.basicConfig(
    filename='logs/service.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Load environment variables
load_dotenv(override=True)

# --- HELPER: Calculate Last Week's Dates ---
def get_previous_week_dates():
    """Calculates the start (Monday) and end (Sunday) dates of the previous complete week."""
    today = datetime.date.today()
    last_monday = today - datetime.timedelta(days=today.weekday() + 7)
    last_sunday = today - datetime.timedelta(days=today.weekday() + 1)
    return last_monday.strftime('%Y-%m-%d'), last_sunday.strftime('%Y-%m-%d')

# --- 1. DATA EXTRACTION ---
def fetch_data(engine, station, start_date, end_date):
    """Fetches custom tonnage data for a specific station, filtered by company code."""
    logging.info(f"Connecting to SQL Server to fetch tonnage data for {station['name']}...")
    try:
        query = """
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
        WHERE vt.ConLoadPortCountryName = :country
            AND vt.ETD >= :start_date
            AND vt.ETD <= :end_date
            AND vt.TransportMode = 'AIR'
            AND vs.Company = :company_code
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
        """
        df = pd.read_sql(text(query), engine, params={
            "country": station["country"],
            "start_date": start_date,
            "end_date": end_date,
            "company_code": station["code"]
        })
        logging.info(f"Successfully fetched {len(df)} records for {station['name']}.")
        return df
    except Exception as e:
        logging.error(f"Failed to fetch data for {station['name']}: {e}")
        raise

# --- 2. PDF GENERATION ---
import socket

def is_port_open(port: int) -> bool:
    """Checks if a local port is actively open and listening."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(('127.0.0.1', port)) == 0

def generate_pdf(station_code, country, station_name, start_date, end_date, output_path):
    """Generates A4 Landscape PDF dashboard in custom-sql mode via Playwright."""
    logging.info(f"Generating PDF dashboard via Playwright for {station_name}...")
    try:
        # Auto-detect if port 3001 is active instead of 3000
        detected_port = 3000
        if is_port_open(3001) and not is_port_open(3000):
            detected_port = 3001
            
        base_url = os.getenv("FRONTEND_BASE_URL", f"http://localhost:{detected_port}")
        
        # 1. Format the SQL query matching the exact default query of the weekly reports dashboard
        sql_query = """
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
WHERE vt.ConLoadPortCountryName = '{country}'
    AND vt.ETD >= '{start_date}'
    AND vt.ETD <= '{end_date}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = '{company_code}'
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
        """.strip().format(
            country=country,
            start_date=start_date,
            end_date=end_date,
            company_code=station_code
        )
        
        # 2. Cache the SQL query in the FastAPI server's memory to retrieve a query_id
        query_id = None
        try:
            api_port = os.getenv("API_PORT", "8000")
            cache_url = f"http://127.0.0.1:{api_port}/api/cache-query"
            resp = requests.post(cache_url, json={"query": sql_query}, timeout=10)
            if resp.status_code == 200:
                query_id = resp.json().get("query_id")
                logging.info(f"Successfully cached query on FastAPI server. query_id={query_id}")
            else:
                logging.warning(f"Failed to cache query on FastAPI server: {resp.text}")
        except Exception as cache_err:
            logging.warning(f"Error caching query on FastAPI server: {cache_err}")

        # 3. Construct parameters with custom-sql mode and query ID
        params = {
            "mode": "custom-sql",
            "include_weekly_visual": "true",
            "include_weekly_ledger": "true",
            "include_monthly_visual": "true",
            "include_monthly_ledger": "true",
            "max_data_rows": 100,
            "country": country,
            "company_code": station_code
        }
        if query_id:
            params["query_id"] = query_id
        else:
            params["custom_sql"] = sql_query
        
        query_string = urllib.parse.urlencode(params)
        target_url = f"{base_url}/print-view?{query_string}"
        
        if sys.platform == 'win32':
            import asyncio
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            
            # Navigate to the print view URL
            page.goto(target_url, wait_until="load", timeout=120000)
            
            # Wait for pdf-ready element
            try:
                page.wait_for_selector("#pdf-ready", timeout=120000)
            except Exception:
                logging.warning("pdf-ready indicator not found, proceeding with PDF capture")
                
            page.wait_for_timeout(1000)
            
            # Save as landscape A4 PDF
            page.pdf(path=output_path, format="A4", landscape=True, print_background=True)
            browser.close()
            
        logging.info(f"PDF successfully saved to {output_path}")
    except Exception as e:
        logging.error(f"Failed to generate PDF for {station_name}: {e}")
        raise


def send_email_via_graph(pdf_path, station_name, start_date, end_date, recipients):
    """Sends email with PDF attachment using Microsoft Graph API."""
    logging.info(f"Authenticating with Microsoft Graph API to send email for {station_name}...")
    try:
        tenant_id = os.getenv("MAIL_AZURE_TENANT_ID") or os.getenv("AZURE_TENANT_ID")
        client_id = os.getenv("MAIL_AZURE_CLIENT_ID") or os.getenv("AZURE_CLIENT_ID")
        client_secret = os.getenv("MAIL_AZURE_CLIENT_SECRET") or os.getenv("AZURE_CLIENT_SECRET")
        sender = os.getenv("SENDER_EMAIL")
        
        # Authenticate with MSAL
        app = ConfidentialClientApplication(client_id, authority=f"https://login.microsoftonline.com/{tenant_id}", client_credential=client_secret)
        result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        
        if "access_token" not in result:
            raise Exception("Could not acquire Azure token. Check credentials and App Permissions (Mail.Send).")
        
        logging.info(f"Preparing email payload for {station_name}...")
        # Read PDF to base64
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        b64_pdf = base64.b64encode(pdf_bytes).decode('utf-8')
        
        to_recipients = [{"emailAddress": {"address": email.strip()}} for email in recipients]
        
        email_msg = {
            "message": {
                "subject": f"Weekly Air Freight Tonnage Dashboard - {station_name} ({start_date} to {end_date})",
                "body": {
                    "contentType": "Text",
                    "content": f"Dear Recipient,\n\nPlease find attached the Weekly Air Freight Tonnage and Revenue Performance Dashboard for {station_name} covering the period from {start_date} to {end_date}.\n\nBest Regards,\nBI Support Team"
                },
                "toRecipients": to_recipients,
                "attachments": [
                    {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        "name": f"Weekly_Tonnage_Report_{station_name.replace(' ', '_')}.pdf",
                        "contentType": "application/pdf",
                        "contentBytes": b64_pdf
                    }
                ]
            },
            "saveToSentItems": "true"
        }
        
        headers = {
            "Authorization": f"Bearer {result['access_token']}",
            "Content-Type": "application/json"
        }
        
        endpoint = f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail"
        response = requests.post(endpoint, headers=headers, json=email_msg)
        
        if response.status_code == 202:
            logging.info(f"Report for {station_name} sent successfully via Microsoft Graph!")
        else:
            logging.error(f"Failed to send email for {station_name}: {response.text}")
            
    except Exception as e:
        logging.error(f"Email distribution for {station_name} failed: {e}")
        raise

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    logging.info("--- Starting Weekly Report Job ---")
    
    # 1. Calculate dates
    start_date, end_date = get_previous_week_dates()
    logging.info(f"Report Period calculated: {start_date} to {end_date}")
    
    # 2. Database connection
    try:
        db_pass = urllib.parse.quote_plus(os.getenv("DB_PASSWORD", ""))
        db_server = os.getenv("DB_SERVER", "")
        db_name = "DartBIDW"
        db_user = os.getenv("DB_USER", "")
        
        conn_str = f"mssql+pyodbc:///?odbc_connect=DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={db_server};DATABASE={db_name};UID={db_user};PWD={db_pass}"
        engine = create_engine(conn_str)
    except Exception as e:
        logging.critical(f"Failed to build database engine: {e}")
        sys.exit(1)
        
    # 3. Define stations to process
    STATIONS = [
        {"code": "CMB", "country": "Sri Lanka", "name": "Colombo (Sri Lanka)", "env_var": "RECIPIENTS_CMB"},
        {"code": "IND", "country": "India", "name": "India", "env_var": "RECIPIENTS_IND"},
        {"code": "VNM", "country": "Viet Nam", "name": "Viet Nam", "env_var": "RECIPIENTS_VNM"},
        {"code": "DAC", "country": "Bangladesh", "name": "Bangladesh", "env_var": "RECIPIENTS_DAC"},
        {"code": "PKI", "country": "Pakistan", "name": "Pakistan", "env_var": "RECIPIENTS_PKI"},
        {"code": "NYC", "country": "United States", "name": "United States", "env_var": "RECIPIENTS_NYC"},
    ]
    
    for station in STATIONS:
        logging.info(f"Processing station: {station['name']} ({station['code']})")
        pdf_file_path = f"outputs/Weekly_Tonnage_Report_{station['code']}.pdf"
        
        # Get recipients for this station
        recipients_str = os.getenv(station["env_var"]) or os.getenv("RECIPIENT_EMAILS", "")
        recipients = [r.strip() for r in recipients_str.split(",") if r.strip()]
        
        if not recipients:
            logging.warning(f"No recipients configured for {station['name']}. Skipping.")
            continue
            
        try:
            report_data = fetch_data(engine, station, start_date, end_date)
            if report_data.empty:
                logging.info(f"No records found for {station['name']} in this period. Skipping email.")
                continue
                
            generate_pdf(station["code"], station["country"], station["name"], start_date, end_date, pdf_file_path)
            send_email_via_graph(pdf_file_path, station["name"], start_date, end_date, recipients)
            logging.info(f"Job for {station['name']} completed successfully.")
        except Exception as e:
            logging.error(f"Job for {station['name']} failed: {e}")
            
    logging.info("--- Weekly Report Job Completed ---")