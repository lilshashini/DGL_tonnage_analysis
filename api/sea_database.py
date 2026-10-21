"""Sea freight queries and rollups, isolated from the existing AIR queries."""
import calendar
from datetime import date

import pandas as pd

from api.database import build_multi_in_clause, run_query, to_clean_records

STATION_ZONES = {"IND": "Asia/Kolkata", "CMB": "Asia/Colombo", "VNM": "Asia/Ho_Chi_Minh",
                 "DAC": "Asia/Dhaka", "PKI": "Asia/Karachi", "NYC": "America/New_York"}
COUNTRY_ZONES = {"india": "Asia/Kolkata", "sri lanka": "Asia/Colombo", "vietnam": "Asia/Ho_Chi_Minh",
                 "bangladesh": "Asia/Dhaka", "pakistan": "Asia/Karachi"}
SEA_GROUP_SQL = "COALESCE(NULLIF(vt.ShippingLineGroup, ''), 'Unknown Group')"


def sea_shipping_group(row):
    for column in ("ShippinglineGroup", "shippinglineGroup", "ShippingLineGroup"):
        if row.get(column) is not None:
            return str(row[column]) if row[column] != "" else "Unknown Group"
    return "Unknown Group"


def sea_operational_date(row):
    """Naive SQL ETDs are station-local; convert explicit instants to that zone."""
    val = row["ETD"]
    if isinstance(val, (int, float)) and not isinstance(val, bool):
        if val > 1e11:
            timestamp = pd.to_datetime(val, unit="ms", utc=True)
        elif val >= 1e8:
            timestamp = pd.to_datetime(val, unit="s", utc=True)
        else:
            timestamp = pd.Timestamp(val)
    elif isinstance(val, str) and val.strip().isdigit() and len(val.strip()) >= 9:
        num = float(val.strip())
        if num > 1e11:
            timestamp = pd.to_datetime(num, unit="ms", utc=True)
        else:
            timestamp = pd.to_datetime(num, unit="s", utc=True)
    else:
        timestamp = pd.Timestamp(val)
    zone = (STATION_ZONES.get(str(row.get("Company_Code") or row.get("Company") or "").upper())
            or COUNTRY_ZONES.get(str(row.get("Origin_Country") or "").lower()))
    if timestamp.tzinfo is not None and zone:
        timestamp = timestamp.tz_convert(zone)
    return timestamp.date()


def build_sea_query(start_date, end_date, country=None, airline=None,
                    company_code=None, origin_city=None, destination_country=None,
                    destination_city=None, branch=None):
    """Consol report with company/revenue supplied by the linked financial view.

    TEU and volume belong to the consol. MAX prevents each linked shipment from
    multiplying those quantities; revenue is summed at consol grain.
    """
    params = {"start_date": start_date, "end_date": end_date}
    filters = "\n    ".join([
        build_multi_in_clause(column, value, params, prefix)
        for column, value, prefix in [
            ("vt.ConLoadPortCountryName", country, "country"),
            (SEA_GROUP_SQL, airline, "carrier"),
            ("vs.Company", company_code, "company"),
            ("COALESCE(vt.RealLoadPortCity, 'N/A')", origin_city, "origin_city"),
            ("COALESCE(vt.RealDisChargePortCountryName, 'N/A')", destination_country, "destination_country"),
            ("COALESCE(vt.RealDisChargePortCity, 'N/A')", destination_city, "destination_city"),
            ("vs.Branch", branch, "branch"),
        ]
    ])
    query = f"""
SELECT
    vt.ConsoleNumber AS Console_Number,
    vt.MasterBillNum AS Master_Bill_of_Lading,
    vt.ShippingLineGroup AS ShippinglineGroup,
    vt.ETD,
    COALESCE(vt.RealLoadPortCountryName, 'N/A') AS Origin_Country,
    COALESCE(vt.RealLoadPortCity, 'N/A') AS Origin_City,
    COALESCE(vt.RealDisChargePortCountryName, 'N/A') AS Destination_Country,
    COALESCE(vt.RealDisChargePortCity, 'N/A') AS Destination_City,
    COALESCE(MAX(vs.Company), 'Unlinked') AS Company_Code,
    ROUND(SUM(vs.Revenue_USD), 2) AS Revenue_USD,
    ROUND(MAX(vt.FCLTEU), 2) AS FCL_TEU_Count,
    ROUND(MAX(vt.LCLVolume), 2) AS LCL_Volume
FROM dbo.ChatData_ViewShipConsolTransport vt
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc
    ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs
    ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.TransportMode = 'SEA'
    AND vt.ETD >= :start_date
    AND vt.ETD <= :end_date
    {filters}
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.ShippingLineGroup,
    vt.ConsolTransportMode, vt.ETD,
    COALESCE(vt.RealLoadPortCountryName, 'N/A'),
    COALESCE(vt.RealLoadPortCity, 'N/A'),
    COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
    COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC
""".strip()
    return query, params


def sea_master_key(value):
    """Exclude only NULL; preserve spaces, case and all non-null bill values."""
    return None if value is None else str(value)


def sea_master_number(row):
    for column in ("Master_Bill_of_Lading", "Master_Airway_Bill", "MasterBillNum"):
        if column in row:
            return sea_master_key(row[column])
    return None


def count_sea_masters(records):
    """Distinct actual bills, independent of how many consols use each bill."""
    return len({key for row in records if (key := sea_master_number(row)) is not None})


def normalize_sea_records(records):
    """Expose one consol record, including compatibility aliases for API charts."""
    consols = {}
    for source in records:
        number = source.get("Console_Number") or source.get("ConsoleNumber")
        if not number:
            raise ValueError("Sea reports require Console_Number so quantities can be counted once per consol.")
        teu = float(source.get("FCL_TEU_Count", source.get("TEUCount", source.get("Total_TEU", source.get("Total_Tonnage", 0)))) or 0)
        volume = float(source.get("LCL_Volume", source.get("Volume_M3", source.get("Total_Volume_M3", 0))) or 0)
        revenue = float(source.get("Revenue_USD", source.get("Total_Revenue", 0)) or 0)
        if number not in consols:
            consols[number] = {key: source.get(key) for key in (
                "ETD", "Origin_Country", "Origin_City", "Destination_Country", "Destination_City", "Company_Code")}
            consols[number].update(Console_Number=number,
                Master_Bill_of_Lading=sea_master_number(source),
                ShippinglineGroup=sea_shipping_group(source),
                FCL_TEU_Count=0, LCL_Volume=0, Revenue_USD=0)
            if "Destination_Sector" in source:
                consols[number]["Destination_Sector"] = source["Destination_Sector"]
        row = consols[number]
        if row["Master_Bill_of_Lading"] is None:
            row["Master_Bill_of_Lading"] = sea_master_number(source)
        row["FCL_TEU_Count"] = max(row["FCL_TEU_Count"], teu)
        row["LCL_Volume"] = max(row["LCL_Volume"], volume)
        row["Revenue_USD"] += revenue
    for row in consols.values():
        row.update(Airline=row["ShippinglineGroup"], Total_Tonnage=row["FCL_TEU_Count"],
                   Total_Volume_M3=row["LCL_Volume"], Total_Revenue=round(row["Revenue_USD"], 2))
    return list(consols.values())


def prepare_sea_query(sql):
    """Protect consol quantities in pasted versions of the supplied joined SQL."""
    import re
    from api.sea_query_optimizer import _without_comments
    code = _without_comments(sql)
    if (re.search(r"\bTransportMode\s*=\s*'SEA'", code, re.I)
            and re.search(r"\bGROUP\s+BY\s+[\s\S]*\bvt\.ConsoleNumber\b", code, re.I)):
        return re.sub(r"\bSUM\s*\(\s*vt\.(FCLTEU|LCLVolume)\s*\)", r"MAX(vt.\1)", sql, flags=re.I)
    return sql


def get_sea_source_data(*args, **kwargs):
    """Return query-result fields before chart aliases and consol normalization."""
    query, params = build_sea_query(*args, **kwargs)
    return to_clean_records(run_query(query, params))


def classify_sea_sectors(records):
    """Classify this report's rows using the cached country reference table.

    Copies preserve original query records for the Excel ledger. Grouping the
    reference by country prevents duplicate country entries multiplying cargo.
    """
    if not records:
        return []
    countries = to_clean_records(run_query("""
SELECT CountryName, MAX(Sector) AS Sector
FROM [DartBIDW].[dbo].[DimCountry]
GROUP BY CountryName
""".strip()))
    sector_by_country = {str(row.get("CountryName") or "").strip().casefold(): row.get("Sector")
                         for row in countries}
    return [dict(row, Destination_Sector=sector_by_country.get(
        str(row.get("Destination_Country") or "").strip().casefold()) or "Other") for row in records]


def get_sea_data(*args, **kwargs):
    return normalize_sea_records(get_sea_source_data(*args, **kwargs))


def get_sea_kpi(*args, **kwargs):
    records = get_sea_data(*args, **kwargs)
    def total(key):
        return round(sum(float(r.get(key) or 0) for r in records), 2)
    return {
        "Total_Tonnage": total("Total_Tonnage"), "Total_TEU": total("Total_Tonnage"),
        "FCL_TEU_Count": total("FCL_TEU_Count"), "LCL_Volume": total("LCL_Volume"),
        "Total_Volume_M3": total("Total_Volume_M3"),
        "Total_Revenue": total("Total_Revenue"),
        "Total_Consols": len(records),
        "Total_Masters": count_sea_masters(records),
        "Unique_Airlines": len({r["Airline"] for r in records}),
        "Unique_Countries": len({r["Origin_Country"] for r in records}),
    }


def get_sea_trends(period, *args, **kwargs):
    groups = {}
    masters = {}
    for row in get_sea_data(*args, **kwargs):
        if not row.get("ETD"):
            continue
        departure = sea_operational_date(row)
        if period == "weekly":
            year, number, _ = departure.isocalendar()
            label = f"W{number} '{str(year)[2:]}"
        else:
            year, number = departure.year, departure.month
            label = f"{calendar.month_abbr[number]} '{str(year)[2:]}"
        key = (year, number)
        if key not in groups:
            groups[key] = {"Year": year, "Week" if period == "weekly" else "Month": number,
                           "week_label" if period == "weekly" else "month_label": label,
                           "Total_Tonnage": 0, "Total_Volume_M3": 0,
                           "Total_Revenue": 0, "Total_Consols": 0}
            if period == "weekly":
                groups[key]["Week_Start"] = date.fromisocalendar(year, number, 1).isoformat()
        bills = masters.setdefault(key, set())
        bill = sea_master_key(sea_master_number(row))
        if bill is not None:
            bills.add(bill)
        groups[key]["Total_Masters"] = len(bills)
        groups[key]["Total_Consols"] += 1
        for metric in ("Total_Tonnage", "Total_Volume_M3", "Total_Revenue"):
            groups[key][metric] += float(row.get(metric) or 0)
    return [groups[key] for key in sorted(groups)]


def get_sea_options(kind, start_date, end_date, country=None, company_code=None):
    columns = {
        "countries": "vt.ConLoadPortCountryName",
        "airlines": SEA_GROUP_SQL,
        "origin-cities": "COALESCE(vt.RealLoadPortCity, 'N/A')",
        "destination-countries": "COALESCE(vt.RealDisChargePortCountryName, 'N/A')",
        "destination-cities": "COALESCE(vt.RealDisChargePortCity, 'N/A')",
    }
    column = columns[kind]
    country_column = "COALESCE(vt.RealDisChargePortCountryName, 'N/A')" if kind == "destination-cities" else "vt.ConLoadPortCountryName"
    params = {"start_date": start_date, "end_date": end_date}
    country_filter = build_multi_in_clause(country_column, country, params, "country")
    company_filter = build_multi_in_clause("vs.Company", company_code, params, "company")
    # Without a shipment-company filter these options depend only on transport
    # ports/carriers; DISTINCT makes both shipment LEFT JOINs unnecessary.
    shipment_joins = """
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs ON vs.ShipmentNumber = vsc.Link_ShipmentNum
""" if company_filter else ""
    query = f"""
SELECT DISTINCT {column} AS value
FROM dbo.ChatData_ViewShipConsolTransport vt
{shipment_joins}
WHERE vt.TransportMode = 'SEA'
    AND vt.ETD >= :start_date
    AND vt.ETD <= :end_date
    AND {column} IS NOT NULL
    {country_filter} {company_filter}
ORDER BY value
"""
    df = run_query(query, params)
    return df["value"].dropna().tolist() if "value" in df else []


def render_sea_query(**kwargs):
    """Render the same parameterized sea query for scheduled SQL/print reports."""
    query, params = build_sea_query(**kwargs)
    # Longest names first, so :country_1 cannot replace part of :country_10.
    for name in sorted(params, key=len, reverse=True):
        query = query.replace(f":{name}", "'" + str(params[name]).replace("'", "''") + "'")
    return query + ";"


def get_sea_sector_distribution(start_date, end_date, country=None, company_code=None,
                                airline=None, origin_city=None, destination_country=None,
                                destination_city=None, branch=None):
    query, params = build_sea_query(start_date, end_date, country, airline, company_code,
                                    origin_city, destination_country, destination_city, branch)
    query = query.rsplit("ORDER BY", 1)[0]
    sectors = {
        "Europe": "Europe Other", "USA": "USA", "North_America_Other": "North America Other",
        "Central_America": "Central America & Caribbean", "South_America": "South America",
        "Middle_East": "Middle East", "South_East_Asia": "South East Asia",
        "India_Sub_Continent": "India & Sub Continent", "Northern_Asia": "Northern Asia",
        "Africa": "Africa", "South_Africa": "South Africa", "Australia": "Australia",
        "Pacific_Islands": "Pacific Islands",
    }
    measures = ",\n".join(f"SUM(CASE WHEN dc.Sector = '{sector}' THEN COALESCE(c.FCL_TEU_Count, 0) ELSE 0 END) AS {name}" for name, sector in sectors.items())
    known = ", ".join(f"'{sector}'" for sector in sectors.values())
    sql = f"""
WITH SeaConsols AS ({query}),
Countries AS (SELECT CountryName, MAX(Sector) AS Sector FROM [DartBIDW].[dbo].[DimCountry] GROUP BY CountryName)
SELECT COALESCE(NULLIF(c.ShippinglineGroup, ''), 'Unknown Group') AS Airline,
    SUM(COALESCE(c.FCL_TEU_Count, 0)) AS Air_Exp_Tong,
    0 AS Air_Imp_Tong,
    SUM(COALESCE(c.FCL_TEU_Count, 0)) AS Total_Tons,
    SUM(COALESCE(c.LCL_Volume, 0)) AS Total_Volume_M3,
    {measures},
    SUM(CASE WHEN dc.Sector NOT IN ({known}) OR dc.Sector IS NULL THEN COALESCE(c.FCL_TEU_Count, 0) ELSE 0 END) AS Others
FROM SeaConsols c
LEFT JOIN Countries dc ON dc.CountryName = c.Destination_Country
GROUP BY COALESCE(NULLIF(c.ShippinglineGroup, ''), 'Unknown Group')
ORDER BY Total_Tons DESC
"""
    return to_clean_records(run_query(sql, params))
