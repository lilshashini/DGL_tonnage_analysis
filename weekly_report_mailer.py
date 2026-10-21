import os
import sys
import urllib.parse
import pandas as pd
import logging
import datetime
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
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

# --- HELPER: Calculate Report Dates ---
def get_station_report_recipients(station, transport_mode="AIR"):
    """Use saved Tonnage assignments when configured; empty does not mean default."""
    from api import scheduler_db
    if scheduler_db.SUPABASE_URL and (scheduler_db.SUPABASE_SERVICE_ROLE_KEY or scheduler_db.SUPABASE_KEY):
        return scheduler_db.get_supabase_recipients(station["code"], is_branch=False, transport_mode=transport_mode)
    env_key = station.get("env_var") or f"RECIPIENTS_{station['code']}"
    configured = os.getenv(env_key) or os.getenv("RECIPIENT_EMAILS", "")
    return [email.strip() for email in configured.split(",") if email.strip()]


def get_report_dates():
    """Calculates report period dates:
    - If today is the 1st of the month (e.g. 2026-09-01): returns the full previous month (2026-08-01 to 2026-08-31).
    - If today is any subsequent day (e.g. 2026-09-08): returns month-to-date up to yesterday (2026-09-01 to 2026-09-07).
    """
    today = datetime.date.today()
    if today.day == 1:
        end = today - datetime.timedelta(days=1)
        start = end.replace(day=1)
    else:
        start = today.replace(day=1)
        end = today - datetime.timedelta(days=1)
    return start.strftime('%Y-%m-%d'), end.strftime('%Y-%m-%d')


def get_previous_week_dates():
    """Alias for backwards compatibility."""
    return get_report_dates()

def normalize_country(country: str, station_code: str = None) -> str:
    """Ensure country name matches the data warehouse representation (e.g. 'Viet Nam')."""
    if not country:
        return "Viet Nam" if station_code == "VNM" else ""
    clean = str(country).strip()
    if clean.lower().replace(" ", "") == "vietnam" or station_code == "VNM":
        return "Viet Nam"
    return clean


# --- 1. DATA EXTRACTION ---
def fetch_data(engine, station, start_date, end_date, transport_mode="AIR"):
    """Fetches custom tonnage data for a specific station, filtered by company code."""
    station_country = normalize_country(station.get("country"), station.get("code"))
    logging.info(f"Connecting to SQL Server to fetch tonnage data for {station['name']} ({station_country})...")
    try:
        if transport_mode == "SEA":
            from api.sea_database import build_sea_query
            query, params = build_sea_query(start_date, end_date, country=station_country,
                                           company_code=station["code"], branch=station.get("branch"))
            return pd.read_sql(text(query), engine, params=params)
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
            "country": station_country,
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
def generate_pdf(station_code, country, station_name, start_date, end_date, output_path, transport_mode="AIR", branch_code=None):
    """Generates A4 Landscape PDF dashboard in custom-sql mode via Playwright."""
    country = normalize_country(country, station_code)
    logging.info(f"Generating PDF dashboard via Playwright for {station_name} ({country})...")
    try:
        if transport_mode == "SEA":
            from api.sea_database import render_sea_query
            from api.pdf_service import generate_report_bundle as generate_dashboard_pdf
            sql_query = render_sea_query(start_date=start_date, end_date=end_date, country=country,
                                         company_code=station_code, branch=branch_code)
            next_day = datetime.date.fromisoformat(end_date) + datetime.timedelta(days=1)
            report_type = "monthly" if start_date.endswith("-01") and next_day.day == 1 else "weekly"
            generate_dashboard_pdf(output_path=output_path, start_date=start_date, end_date=end_date,
                country=country, company_code=station_code, branch=branch_code, mode="custom-sql",
                custom_sql=sql_query, transport_mode="SEA", report_type=report_type)
            return
        # 1. Format the SQL query (branch-wise if branch is set, station-wise otherwise)
        if branch_code:
            sql_query = f"""
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
    AND vs.Company = '{station_code}'
    AND vs.Branch = '{branch_code}'
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
        else:
            sql_query = f"""
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
    AND vs.Company = '{station_code}'
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
        
        # Use the same readiness checks and local API routing as dashboard emails.
        from api.pdf_service import generate_report_bundle as generate_dashboard_pdf
        next_day = datetime.date.fromisoformat(end_date) + datetime.timedelta(days=1)
        report_type = "monthly" if start_date.endswith("-01") and next_day.day == 1 else "weekly"
        generate_dashboard_pdf(output_path=output_path, start_date=start_date, end_date=end_date,
            country=country, company_code=station_code, branch=branch_code, mode="custom-sql",
            custom_sql=sql_query, transport_mode="AIR", report_type=report_type)

        logging.info(f"PDF successfully saved to {output_path}")
    except Exception as e:
        logging.error(f"Failed to generate PDF for {station_name}: {e}")
        raise


def send_email_via_graph(pdf_path, station_name, start_date, end_date, recipients, transport_mode="AIR"):
    """Send the PDF and its complete Excel ledger through the shared sender."""
    from api.email_service import send_pdf_via_graph
    import calendar
    start_dt = datetime.datetime.strptime(start_date, '%Y-%m-%d').date() if isinstance(start_date, str) else start_date
    end_dt = datetime.datetime.strptime(end_date, '%Y-%m-%d').date() if isinstance(end_date, str) else end_date
    is_monthly = (start_dt.day == 1 and end_dt.day == calendar.monthrange(start_dt.year, start_dt.month)[1]
                  and start_dt.month == end_dt.month and start_dt.year == end_dt.year)
    rep_label = "Monthly" if is_monthly else "Weekly"
    freight_name = "Sea" if transport_mode == "SEA" else "Air"
    send_pdf_via_graph(
        pdf_path=pdf_path,
        recipient_email=",".join(email.strip() for email in recipients),
        subject=f"{rep_label} {freight_name} Freight Tonnage Dashboard - {station_name} ({start_date} to {end_date})",
        body=f"Dear Recipient,\n\nPlease find attached the {rep_label} {freight_name} Freight Tonnage and Revenue Performance Dashboard for {station_name} covering the period from {start_date} to {end_date}. The separate Consol Ledger Excel contains all fetched report records for data checking.\n\nBest Regards,\nBI Support Team",
        attachment_name=f"{freight_name}_{rep_label}_Tonnage_Report_{station_name.replace(' ', '_')}_{start_date}_to_{end_date}.pdf",
    )

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate and email air or sea freight reports.")
    parser.add_argument("--transport-mode", choices=["AIR", "SEA"], default="AIR")
    transport_mode = parser.parse_args().transport_mode
    logging.info("--- Starting Weekly Report Job ---")
    
    # 1. Calculate dates
    start_date, end_date = get_previous_week_dates()
    logging.info(f"Report Period calculated: {start_date} to {end_date}")
    
    # 2. Database connection
    try:
        db_pass = urllib.parse.quote_plus(os.getenv("DB_PASSWORD", ""))
        db_server = os.getenv("DB_SERVER", "")
        db_name = os.getenv("DB_NAME", "DartBIDW")
        db_user = os.getenv("DB_USER", "")
        
        from api.database import get_odbc_driver
        driver = get_odbc_driver()
        trust_cert = ""
        if "18" in driver or os.getenv("DB_TRUST_SERVER_CERTIFICATE", "yes").lower() in ("yes", "true", "1"):
            trust_cert = ";TrustServerCertificate=yes"

        login_timeout = os.getenv("DB_LOGIN_TIMEOUT", "15")
        conn_str = f"mssql+pyodbc:///?odbc_connect=DRIVER={{{driver}}};SERVER={db_server};DATABASE={db_name};UID={db_user};PWD={db_pass}{trust_cert};LoginTimeout={login_timeout}"
        engine = create_engine(conn_str)
    except Exception as e:
        logging.critical(f"Failed to build database engine: {e}")
        sys.exit(1)
        
    # 3. Define stations to process (dynamically from Supabase with fallback)
    try:
        from api.scheduler_db import get_supabase_stations
        STATIONS = get_supabase_stations()
    except Exception as e:
        logging.warning(f"Could not load dynamic stations from Supabase: {e}")
        STATIONS = [
            {"code": "CMB", "country": "Sri Lanka", "name": "Colombo (Sri Lanka)", "env_var": "RECIPIENTS_CMB"},
            {"code": "IND", "country": "India", "name": "India", "env_var": "RECIPIENTS_IND"},
            {"code": "VNM", "country": "Viet Nam", "name": "Viet Nam", "env_var": "RECIPIENTS_VNM"},
            {"code": "DAC", "country": "Bangladesh", "name": "Bangladesh", "env_var": "RECIPIENTS_DAC"},
            {"code": "PKI", "country": "Pakistan", "name": "Pakistan", "env_var": "RECIPIENTS_PKI"},
            {"code": "NYC", "country": "United States", "name": "United States", "env_var": "RECIPIENTS_NYC"},
        ]
    
    for station in STATIONS:
        station["country"] = normalize_country(station.get("country"), station.get("code"))
        logging.info(f"Processing station: {station['name']} ({station['code']}) - Country: {station['country']}")
        mode_prefix = "Sea_" if transport_mode == "SEA" else ""
        pdf_file_path = f"outputs/{mode_prefix}Weekly_Tonnage_Report_{station['code']}.pdf"
        
        # A branch assignment never opts a user into the parent station report.
        try:
            recipients = get_station_report_recipients(station, transport_mode)
        except Exception as error:
            logging.error("Could not verify recipients for %s; skipping report: %s", station["code"], error)
            continue
        
        if not recipients:
            logging.warning(f"No recipients configured for {station['name']}. Skipping.")
            continue
            
        try:
            report_data = fetch_data(engine, station, start_date, end_date, transport_mode=transport_mode)
            if report_data.empty:
                logging.info(f"No records found for {station['name']} in this period. Skipping email.")
                continue
                
            generate_pdf(station["code"], station["country"], station["name"], start_date, end_date, pdf_file_path,
                         transport_mode=transport_mode, branch_code=station.get("branch"))
            send_email_via_graph(pdf_file_path, station["name"], start_date, end_date, recipients, transport_mode=transport_mode)
            logging.info(f"Job for {station['name']} completed successfully.")
        except Exception as e:
            logging.error(f"Job for {station['name']} failed: {e}")
            
    logging.info("--- Weekly Report Job Completed ---")
