import os
import urllib.parse
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import requests

load_dotenv()

# Lazy-loaded database connection engine
_engine = None

def get_engine():
    global _engine
    if _engine is None:
        db_pass = urllib.parse.quote_plus(os.getenv("DB_PASSWORD", ""))
        db_server = os.getenv("DB_SERVER", "")
        db_name = "DartBIDW"
        db_user = os.getenv("DB_USER", "")
        conn_str = f"mssql+pyodbc:///?odbc_connect=DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={db_server};DATABASE={db_name};UID={db_user};PWD={db_pass}"
        _engine = create_engine(conn_str)
    return _engine

# On-Prem API endpoint configuration
ONPREM_API_URL = os.getenv("ONPREM_API_URL", "https://survey.dartglobal.com/chatbot/v1.0/data")



def run_query(sql_str: str, params: dict = None) -> pd.DataFrame:
    """Executes a SQL query either via the On-Prem HTTP API or falls back to direct database engine connection."""
    # If parameters are passed, format them into the SQL string
    if params:
        formatted_sql = sql_str
        for k, v in params.items():
            if v is None:
                val_str = "NULL"
            elif isinstance(v, str):
                # Escape single quotes in string parameter values to prevent syntax errors
                escaped_v = v.replace("'", "''")
                val_str = f"'{escaped_v}'"
            else:
                val_str = str(v)
            formatted_sql = formatted_sql.replace(f":{k}", val_str)
    else:
        formatted_sql = sql_str


    if ONPREM_API_URL:
        try:
            resp = requests.post(ONPREM_API_URL, json={"sql_query": formatted_sql}, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    return pd.DataFrame(data)
                elif isinstance(data, dict) and "error" in data:
                    raise Exception(f"API returned error: {data['error']}")
                else:
                    return pd.DataFrame(data)
            else:
                raise Exception(f"API request failed with status code {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"API Query failed ({e}). Falling back to direct database connection...")
    
    with get_engine().connect() as conn:
        return pd.read_sql(text(sql_str), conn, params=params)


def to_clean_records(df: pd.DataFrame) -> list:
    """Converts a pandas DataFrame to a list of dictionaries, cleaning NaN, Inf, NaT, and <NA> values for JSON compliance."""
    import math
    if df.empty:
        return []
    records = df.to_dict(orient="records")
    for r in records:
        for k, v in r.items():
            if isinstance(v, float) and not math.isfinite(v):
                r[k] = None
            elif pd.isna(v):
                r[k] = None
    return records



def build_multi_in_clause(column_expr: str, value_str: str, params: dict, param_prefix: str) -> str:
    """
    Parses a comma-separated string of values, adds param bindings to params dict,
    and returns the SQL IN clause string e.g. "AND column_expr IN (:prefix_0, :prefix_1)"
    """
    if not value_str or value_str == "all":
        return ""
    values = [v.strip() for v in value_str.split(",") if v.strip()]
    if not values:
        return ""
    
    placeholders = []
    for i, val in enumerate(values):
        param_name = f"{param_prefix}_{i}"
        placeholders.append(f":{param_name}")
        params[param_name] = val
    return f"AND {column_expr} IN ({', '.join(placeholders)})"


def get_filtered_data(
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
    """
    Fetches aggregated tonnage and revenue data based on dynamic filters.
    """
    params = {
        "start_date": start_date,
        "end_date": end_date,
    }

    # 1. Build company code filter
    company_filter = ""
    if company_code and company_code != "all":
        codes = [c.strip() for c in company_code.split(",") if c.strip()]
        all_branch_codes = []
        for c in codes:
            branches = get_branches(c)
            all_branch_codes.extend([b["code"] for b in branches])
        
        if not all_branch_codes:
            all_branch_codes = codes
            
        placeholders = []
        for i, code in enumerate(all_branch_codes):
            param_name = f"cc_{i}"
            placeholders.append(f":{param_name}")
            params[param_name] = code
        company_filter = f"AND RIGHT(vt.SendingForwarder, 3) IN ({', '.join(placeholders)})"

    # 2. Build IN clauses for other multi-select filters
    country_filter = build_multi_in_clause("vt.ConLoadPortCountryName", country, params, "country")
    airline_filter = build_multi_in_clause("vt.AirlineName1", airline, params, "airline")
    branch_filter = build_multi_in_clause("RIGHT(vt.SendingForwarder, 3)", branch, params, "branch")
    origin_city_filter = build_multi_in_clause("vt.ConLoadPortCity", origin_city, params, "origin_city")
    dest_country_filter = build_multi_in_clause("vt.ConDischargePortCountryName", destination_country, params, "dest_country")
    dest_city_filter = build_multi_in_clause("vt.ConDischargePortCity", destination_city, params, "dest_city")

    query = f"""
    WITH ConsolShipmentCounts AS (
        SELECT 
            vt.AirlineName1,
            vt.ConLoadPortCountryName,
            vt.ConLoadPortCity,
            vt.ConDischargePortCountryName,
            vt.ConDischargePortCity,
            vt.SendingForwarder,
            vt.Air_ChargebleWeight,
            vt.Revenue_USD,
            (SELECT COUNT(DISTINCT Link_ShipmentNum) 
             FROM dbo.ChatData_ViewShipConsolLink 
             WHERE Link_ConsolNumber = vt.ConsoleNumber) AS ShipmentCount
        FROM dbo.ChatData_ViewShipConsolTransport vt
        WHERE vt.TransportMode = 'AIR'
          AND vt.ETD >= :start_date 
          AND vt.ETD <= :end_date
          {company_filter}
          {country_filter}
          {airline_filter}
          {branch_filter}
          {origin_city_filter}
          {dest_country_filter}
          {dest_city_filter}
    )
    SELECT
        AirlineName1 AS Airline,
        ConLoadPortCountryName AS Origin_Country,
        ConLoadPortCity AS Origin_City,
        ConDischargePortCountryName AS Destination_Country,
        ConDischargePortCity AS Destination_City,
        RIGHT(SendingForwarder, 3) AS Company_Code,
        SUM(Air_ChargebleWeight) AS Total_Tonnage,
        SUM(Revenue_USD) AS Total_Revenue,
        SUM(ShipmentCount) AS Total_Shipments
    FROM ConsolShipmentCounts
    GROUP BY 
        AirlineName1, 
        ConLoadPortCountryName,
        ConLoadPortCity,
        ConDischargePortCountryName,
        ConDischargePortCity,
        RIGHT(SendingForwarder, 3)
    ORDER BY Total_Revenue DESC
    """
    df = run_query(query, params)
    return to_clean_records(df)


def get_countries(start_date: str, end_date: str, company_code: str = None):
    """Returns the distinct origin countries available within the date range, optionally filtered by company code."""
    params = {"start_date": start_date, "end_date": end_date}
    company_filter = ""
    if company_code and company_code != "all":
        codes = [c.strip() for c in company_code.split(",") if c.strip()]
        all_branch_codes = []
        for c in codes:
            branches = get_branches(c)
            all_branch_codes.extend([b["code"] for b in branches])
        
        if not all_branch_codes:
            all_branch_codes = codes
        
        placeholders = []
        for i, code in enumerate(all_branch_codes):
            param_name = f"cc_{i}"
            placeholders.append(f":{param_name}")
            params[param_name] = code
        company_filter = f"AND RIGHT(vt.SendingForwarder, 3) IN ({', '.join(placeholders)})"

    query = f"""
    SELECT DISTINCT vt.ConLoadPortCountryName AS country
    FROM dbo.ChatData_ViewShipConsolTransport vt
    WHERE vt.TransportMode = 'AIR'
      AND vt.ETD >= :start_date AND vt.ETD <= :end_date
      AND vt.ConLoadPortCountryName IS NOT NULL
      {company_filter}
    ORDER BY vt.ConLoadPortCountryName
    """
    df = run_query(query, params)
    
    countries_list = df["country"].dropna().tolist()
    
    if company_code and company_code != "all":
        primary_countries = {
            "IND": "India",
            "DSI": "India",
            "DAC": "Bangladesh",
            "CMB": "Sri Lanka",
            "DSC": "Sri Lanka",
            "PKI": "Pakistan",
            "SGP": "Singapore",
            "VNM": "Viet Nam",
            "IDN": "Indonesia",
            "CHN": "China",
            "CHI": "China",
            "DXB": "United Arab Emirates",
            "KEN": "Kenya",
            "MDG": "Madagascar",
            "NYC": "United States",
        }
        # Take the first selected company code to prioritize in sorting
        first_code = company_code.split(",")[0].strip()
        target_country = primary_countries.get(first_code)
        if target_country and target_country in countries_list:
            countries_list.remove(target_country)
            countries_list.insert(0, target_country)
            
    return countries_list


def get_airlines(start_date: str, end_date: str, country: str = None):
    """Returns the distinct airlines available within the date range and optional country filter."""
    query = """
    SELECT DISTINCT vt.AirlineName1 AS airline
    FROM dbo.ChatData_ViewShipConsolTransport vt
    WHERE vt.TransportMode = 'AIR'
      AND vt.ETD >= :start_date AND vt.ETD <= :end_date
      AND vt.AirlineName1 IS NOT NULL
      AND (:country IS NULL OR vt.ConLoadPortCountryName = :country)
    ORDER BY vt.AirlineName1
    """
    df = run_query(query, {"start_date": start_date, "end_date": end_date, "country": country})
    return df["airline"].dropna().tolist()


def get_weekly_data(
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
    """
    Returns aggregated data grouped by ISO week (Year + Week number) for trend charts.
    """
    params = {
        "start_date": start_date,
        "end_date": end_date,
    }

    # 1. Build company code filter
    company_filter = ""
    if company_code and company_code != "all":
        codes = [c.strip() for c in company_code.split(",") if c.strip()]
        all_branch_codes = []
        for c in codes:
            branches = get_branches(c)
            all_branch_codes.extend([b["code"] for b in branches])
        
        if not all_branch_codes:
            all_branch_codes = codes
            
        placeholders = []
        for i, code in enumerate(all_branch_codes):
            param_name = f"cc_{i}"
            placeholders.append(f":{param_name}")
            params[param_name] = code
        company_filter = f"AND RIGHT(vt.SendingForwarder, 3) IN ({', '.join(placeholders)})"

    # 2. Build IN clauses for other multi-select filters
    country_filter = build_multi_in_clause("vt.ConLoadPortCountryName", country, params, "country")
    airline_filter = build_multi_in_clause("vt.AirlineName1", airline, params, "airline")
    branch_filter = build_multi_in_clause("RIGHT(vt.SendingForwarder, 3)", branch, params, "branch")
    origin_city_filter = build_multi_in_clause("vt.ConLoadPortCity", origin_city, params, "origin_city")
    dest_country_filter = build_multi_in_clause("vt.ConDischargePortCountryName", destination_country, params, "dest_country")
    dest_city_filter = build_multi_in_clause("vt.ConDischargePortCity", destination_city, params, "dest_city")

    query = f"""
    WITH ConsolShipmentCounts AS (
        SELECT 
            vt.ETD,
            vt.Air_ChargebleWeight,
            vt.Revenue_USD,
            (SELECT COUNT(DISTINCT Link_ShipmentNum) 
             FROM dbo.ChatData_ViewShipConsolLink 
             WHERE Link_ConsolNumber = vt.ConsoleNumber) AS ShipmentCount
        FROM dbo.ChatData_ViewShipConsolTransport vt
        WHERE vt.TransportMode = 'AIR'
          AND vt.ETD >= :start_date 
          AND vt.ETD <= :end_date
          {company_filter}
          {country_filter}
          {airline_filter}
          {branch_filter}
          {origin_city_filter}
          {dest_country_filter}
          {dest_city_filter}
    )
    SELECT
        DATEPART(YEAR, ETD) AS Year,
        DATEPART(WEEK, ETD) AS Week,
        CAST(MIN(ETD) AS DATE) AS Week_Start,
        SUM(Air_ChargebleWeight) AS Total_Tonnage,
        SUM(Revenue_USD) AS Total_Revenue,
        SUM(ShipmentCount) AS Total_Shipments
    FROM ConsolShipmentCounts
    GROUP BY 
        DATEPART(YEAR, ETD),
        DATEPART(WEEK, ETD)
    ORDER BY Year, Week
    """
    df = run_query(query, params)
    # Format week label
    df["week_label"] = df.apply(
        lambda r: f"W{int(r['Week'])} '{str(int(r['Year']))[2:]}" if pd.notnull(r["Week"]) else "", axis=1
    )
    return to_clean_records(df)


def get_monthly_data(
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
    """
    Returns aggregated data grouped by Year and Month for monthly trends.
    """
    params = {
        "start_date": start_date,
        "end_date": end_date,
    }

    # 1. Build company code filter
    company_filter = ""
    if company_code and company_code != "all":
        codes = [c.strip() for c in company_code.split(",") if c.strip()]
        all_branch_codes = []
        for c in codes:
            branches = get_branches(c)
            all_branch_codes.extend([b["code"] for b in branches])
        
        if not all_branch_codes:
            all_branch_codes = codes
            
        placeholders = []
        for i, code in enumerate(all_branch_codes):
            param_name = f"cc_{i}"
            placeholders.append(f":{param_name}")
            params[param_name] = code
        company_filter = f"AND RIGHT(vt.SendingForwarder, 3) IN ({', '.join(placeholders)})"

    # 2. Build IN clauses for other multi-select filters
    country_filter = build_multi_in_clause("vt.ConLoadPortCountryName", country, params, "country")
    airline_filter = build_multi_in_clause("vt.AirlineName1", airline, params, "airline")
    branch_filter = build_multi_in_clause("RIGHT(vt.SendingForwarder, 3)", branch, params, "branch")
    origin_city_filter = build_multi_in_clause("vt.ConLoadPortCity", origin_city, params, "origin_city")
    dest_country_filter = build_multi_in_clause("vt.ConDischargePortCountryName", destination_country, params, "dest_country")
    dest_city_filter = build_multi_in_clause("vt.ConDischargePortCity", destination_city, params, "dest_city")

    query = f"""
    WITH ConsolShipmentCounts AS (
        SELECT 
            vt.ETD,
            vt.Air_ChargebleWeight,
            vt.Revenue_USD,
            (SELECT COUNT(DISTINCT Link_ShipmentNum) 
             FROM dbo.ChatData_ViewShipConsolLink 
             WHERE Link_ConsolNumber = vt.ConsoleNumber) AS ShipmentCount
        FROM dbo.ChatData_ViewShipConsolTransport vt
        WHERE vt.TransportMode = 'AIR'
          AND vt.ETD >= :start_date 
          AND vt.ETD <= :end_date
          {company_filter}
          {country_filter}
          {airline_filter}
          {branch_filter}
          {origin_city_filter}
          {dest_country_filter}
          {dest_city_filter}
    )
    SELECT
        DATEPART(YEAR, ETD) AS Year,
        DATEPART(MONTH, ETD) AS Month,
        SUM(Air_ChargebleWeight) AS Total_Tonnage,
        SUM(Revenue_USD) AS Total_Revenue,
        SUM(ShipmentCount) AS Total_Shipments
    FROM ConsolShipmentCounts
    GROUP BY 
        DATEPART(YEAR, ETD),
        DATEPART(MONTH, ETD)
    ORDER BY Year, Month
    """
    df = run_query(query, params)
    
    # Add formatted month label e.g. "Jun '25"
    months_names = {
        1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
        7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec"
    }
    
    def format_label(row):
        y = row["Year"]
        m = row["Month"]
        if pd.isnull(y) or pd.isnull(m):
            return ""
        return f"{months_names[int(m)]} '{str(int(y))[2:]}"
        
    df["month_label"] = df.apply(format_label, axis=1)
    return to_clean_records(df)


def get_kpi_summary(
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
    """Returns high-level KPI totals for the header cards."""
    params = {
        "start_date": start_date,
        "end_date": end_date,
    }

    # 1. Build company code filter
    company_filter = ""
    if company_code and company_code != "all":
        codes = [c.strip() for c in company_code.split(",") if c.strip()]
        all_branch_codes = []
        for c in codes:
            branches = get_branches(c)
            all_branch_codes.extend([b["code"] for b in branches])
        
        if not all_branch_codes:
            all_branch_codes = codes
            
        placeholders = []
        for i, code in enumerate(all_branch_codes):
            param_name = f"cc_{i}"
            placeholders.append(f":{param_name}")
            params[param_name] = code
        company_filter = f"AND RIGHT(vt.SendingForwarder, 3) IN ({', '.join(placeholders)})"

    # 2. Build IN clauses for other multi-select filters
    country_filter = build_multi_in_clause("vt.ConLoadPortCountryName", country, params, "country")
    airline_filter = build_multi_in_clause("vt.AirlineName1", airline, params, "airline")
    branch_filter = build_multi_in_clause("RIGHT(vt.SendingForwarder, 3)", branch, params, "branch")
    origin_city_filter = build_multi_in_clause("vt.ConLoadPortCity", origin_city, params, "origin_city")
    dest_country_filter = build_multi_in_clause("vt.ConDischargePortCountryName", destination_country, params, "dest_country")
    dest_city_filter = build_multi_in_clause("vt.ConDischargePortCity", destination_city, params, "dest_city")

    query = f"""
    WITH FilteredConsols AS (
        SELECT 
            vt.Air_ChargebleWeight,
            vt.Revenue_USD,
            vt.Cost_USD,
            vt.Profit_USD,
            vt.AirlineName1,
            vt.ConLoadPortCountryName,
            (SELECT COUNT(DISTINCT Link_ShipmentNum) 
             FROM dbo.ChatData_ViewShipConsolLink 
             WHERE Link_ConsolNumber = vt.ConsoleNumber) AS ShipmentCount
        FROM dbo.ChatData_ViewShipConsolTransport vt
        WHERE vt.TransportMode = 'AIR'
          AND vt.ETD >= :start_date 
          AND vt.ETD <= :end_date
          {company_filter}
          {country_filter}
          {airline_filter}
          {branch_filter}
          {origin_city_filter}
          {dest_country_filter}
          {dest_city_filter}
    )
    SELECT
        SUM(Air_ChargebleWeight) AS Total_Tonnage,
        SUM(Revenue_USD) AS Total_Revenue,
        SUM(Cost_USD) AS Total_Cost,
        SUM(Profit_USD) AS Total_Profit,
        CASE WHEN SUM(Revenue_USD) > 0 THEN (SUM(Profit_USD) / SUM(Revenue_USD)) * 100 ELSE 0 END AS GP_Margin,
        SUM(ShipmentCount) AS Total_Shipments,
        COUNT(DISTINCT AirlineName1) AS Unique_Airlines,
        COUNT(DISTINCT ConLoadPortCountryName) AS Unique_Countries
    FROM FilteredConsols
    """
    df = run_query(query, params)
    records = to_clean_records(df)
    return records[0] if len(records) > 0 else {}


def get_company_codes(start_date: str, end_date: str):
    """Returns distinct company codes from DartCusSurvey.dbo.Dim_DGLCompany."""
    query = """
    SELECT DISTINCT DGL_Company AS code, DGL_CompanyName AS name
    FROM [DartCusSurvey].[dbo].[Dim_DGLCompany]
    WHERE DGL_Company IS NOT NULL AND DGL_CompanyName IS NOT NULL
    ORDER BY DGL_Company
    """
    df = run_query(query)
    return to_clean_records(df)


def get_branches(company_code: str = None):
    """Returns distinct branches from DartBIDW.dbo.DimBranch, optionally filtered by company_code mapping."""
    query = """
    SELECT DISTINCT BranchCode AS code, BranchName AS name, City AS city
    FROM [DartBIDW].[dbo].[DimBranch]
    WHERE BranchCode IS NOT NULL AND BranchName IS NOT NULL
    """
    
    if company_code and company_code != "all":
        if company_code == "IND":
            query += " AND CountryCode = 'IN' AND CompanyID = '6932A1DD-FA9D-49DE-AC38-07487B0EBFF3'"
        elif company_code == "DSI":
            query += " AND CountryCode = 'IN' AND CompanyID = 'A82AE419-5BC4-437B-974A-9B5607B81074'"
        elif company_code == "DAC":
            query += " AND CountryCode = 'BD'"
        elif company_code == "CMB":
            query += " AND CountryCode = 'LK' AND (CompanyID = 'B8496F43-AB96-4977-8778-1B935A58257D' OR BranchName LIKE '%DART GLOBAL%')"
        elif company_code == "DSC":
            query += " AND CountryCode = 'LK' AND (CompanyID = 'EA4C8F4C-6F9B-4E69-8101-24F42B4A94C6' OR BranchName LIKE '%DGL SUPPLY%')"
        elif company_code == "PKI":
            query += " AND CountryCode = 'PK'"
        elif company_code == "SGP":
            query += " AND CountryCode = 'SG'"
        elif company_code == "VNM":
            query += " AND CountryCode = 'VN'"
        elif company_code == "IDN":
            query += " AND CountryCode = 'ID'"
        elif company_code in ("CHN", "CHI"):
            query += " AND CountryCode = 'CN'"
        elif company_code == "DXB":
            query += " AND CountryCode = 'AE'"
        elif company_code == "KEN":
            query += " AND CountryCode = 'KE'"
        elif company_code == "MDG":
            query += " AND CountryCode = 'MG'"
        elif company_code == "NYC":
            query += " AND CountryCode = 'US'"
            
    query += " ORDER BY BranchCode"
    df = run_query(query)
    return to_clean_records(df)


def get_origin_cities(start_date: str, end_date: str, country: str = None):
    """Returns distinct origin cities within the date range, optionally filtered by country."""
    query = """
    SELECT DISTINCT vt.ConLoadPortCity AS city
    FROM dbo.ChatData_ViewShipConsolTransport vt
    WHERE vt.TransportMode = 'AIR'
      AND vt.ETD >= :start_date AND vt.ETD <= :end_date
      AND vt.ConLoadPortCity IS NOT NULL
      AND (:country IS NULL OR vt.ConLoadPortCountryName = :country)
    ORDER BY vt.ConLoadPortCity
    """
    df = run_query(query, {"start_date": start_date, "end_date": end_date, "country": country})
    return df["city"].dropna().tolist()


def get_destination_countries(start_date: str, end_date: str):
    """Returns distinct destination countries within the date range."""
    query = """
    SELECT DISTINCT vt.ConDischargePortCountryName AS country
    FROM dbo.ChatData_ViewShipConsolTransport vt
    WHERE vt.TransportMode = 'AIR'
      AND vt.ETD >= :start_date AND vt.ETD <= :end_date
      AND vt.ConDischargePortCountryName IS NOT NULL
    ORDER BY vt.ConDischargePortCountryName
    """
    df = run_query(query, {"start_date": start_date, "end_date": end_date})
    return df["country"].dropna().tolist()


def get_destination_cities(start_date: str, end_date: str, country: str = None):
    """Returns distinct destination cities within the date range, optionally filtered by country."""
    query = """
    SELECT DISTINCT vt.ConDischargePortCity AS city
    FROM dbo.ChatData_ViewShipConsolTransport vt
    WHERE vt.TransportMode = 'AIR'
      AND vt.ETD >= :start_date AND vt.ETD <= :end_date
      AND vt.ConDischargePortCity IS NOT NULL
      AND (:country IS NULL OR vt.ConDischargePortCountryName = :country)
    ORDER BY vt.ConDischargePortCity
    """
    df = run_query(query, {"start_date": start_date, "end_date": end_date, "country": country})
    return df["city"].dropna().tolist()


def execute_custom_query(sql_str: str):
    """
    Executes a custom SQL query directly in a sandbox environment and returns the dataframe as a list of records.
    
    Safety checks:
    - Validates query is not empty
    - Prevents execution of certain dangerous operations
    - Executes in read-only context
    """
    if not sql_str or not sql_str.strip():
        raise ValueError("SQL query cannot be empty")
    
    # Normalize query
    sql_str = sql_str.strip()
    
    # Sandbox check: Prevent DROP, DELETE, INSERT, UPDATE, ALTER operations
    dangerous_keywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE']
    query_upper = sql_str.upper()
    
    for keyword in dangerous_keywords:
        # Simple check - if statement starts with dangerous keyword
        if query_upper.lstrip().startswith(keyword):
            raise ValueError(f"Query sandbox does not allow {keyword} operations. This is a read-only query execution environment.")
    
    try:
        df = run_query(sql_str)
        return to_clean_records(df)
    except Exception as e:
        # Re-raise with more context
        raise Exception(f"SQL execution error: {str(e)}")