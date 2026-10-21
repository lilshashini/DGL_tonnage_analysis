"use client";

import { freightEtdDate, freightDayParts } from "@/lib/operational-date";

import { useState, useEffect, useCallback, Suspense, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Line, LabelList, ComposedChart
} from "recharts";
import { Plane, Globe, CheckSquare, Square, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { TransportMode, freightText, formatFreightQuantity } from "@/lib/freight";
import { SeaConsolReport } from "@/components/sea-consol-report";
import { getApiBaseUrl } from "@/lib/api";

// In production / Cloud Run / Playwright container: frontend & backend share the same host/port → use relative URLs ("").
// In local development: Next.js dev server runs on :3000/:3001/:3002, backend on :8000 → use absolute localhost URL.
declare global {
  interface Window {
    __FREIGHT_PRINT_CONFIG__?: { apiBaseUrl: string; customSql?: string };
  }
}
const API = (typeof window !== "undefined" ? window.__FREIGHT_PRINT_CONFIG__?.apiBaseUrl : undefined) ?? getApiBaseUrl();


const formatCurrency = (val: number | null | undefined) => {
  if (val == null) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(val);
};

const formatNumber = (val: number | null | undefined) => {
  if (val == null) return "0";
  return Number(val).toLocaleString("en-US", { maximumFractionDigits: 0 });
};

const PIE_COLORS = ["#4299E1", "#81E6D9", "#ED8936", "#5A67D8", "#ED64A6"];
const TEN_COLORS = ["#4299E1", "#319795", "#ED64A6", "#5A67D8", "#81E6D9", "#ED8936", "#ECC94B", "#48BB78", "#9F7AEA", "#718096"];

// Branded airline colors — matched by lowercase substring of airline name
const AIRLINE_COLORS: { [key: string]: string } = {
  "turkish": "#e65757ff",
  "vietnam": "#005e80",
  "etihad": "#C4921B",
  "asiana": "#464A4C",
  "air canada": "#ff938bff",
  "cathay": "#005D63",
};

// Returns the branded color for a known airline, falling back to TEN_COLORS[idx]
const getAirlineColor = (airlineName: string, fallbackIdx: number): string => {
  const lower = (airlineName || "").toLowerCase();
  for (const [key, color] of Object.entries(AIRLINE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return TEN_COLORS[fallbackIdx % TEN_COLORS.length];
};

// Parse weekly trend data dynamically from custom SQL result rows
const parseWeeklyData = (rows: any[], transportMode: TransportMode) => {
  const hasWeek = rows.some((r) => r.Week !== undefined || r.week !== undefined || r.Week_Number !== undefined);
  if (hasWeek) {
    const weeklyMap: { [key: string]: any } = {};
    rows.forEach((r) => {
      const yr = r.Year ?? r.year ?? 2025;
      const wk = r.Week ?? r.week ?? r.Week_Number ?? 1;
      const key = `${yr}-W${wk}`;
      if (!weeklyMap[key]) {
        weeklyMap[key] = {
          Year: yr,
          Week: wk,
          Total_Tonnage: 0,
          Total_Revenue: 0,
          Total_Shipments: 0,
          week_label: `W${wk} '${String(yr).slice(-2)}`,
        };
      }
      weeklyMap[key].Total_Tonnage += Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);
      weeklyMap[key].Total_Revenue += Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0);
      weeklyMap[key].Total_Shipments += Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);
    });
    return Object.values(weeklyMap).sort((a: any, b: any) => a.Year !== b.Year ? a.Year - b.Year : a.Week - b.Week);
  }

  const hasEtd = rows.some((r) => r.ETD || r.etd || r.etd_date);
  if (hasEtd) {
    const weeklyMap: { [key: string]: any } = {};
    rows.forEach((r) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;

      const day = date.getUTCDay();
      const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
      const weekStr = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;

      const tempDate = new Date(monday.valueOf());
      tempDate.setUTCHours(0, 0, 0, 0);
      tempDate.setUTCDate(tempDate.getUTCDate() + 3 - (tempDate.getUTCDay() + 6) % 7);
      const week1 = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 4));
      const weekNum = 1 + Math.round(((tempDate.valueOf() - week1.valueOf()) / 86400000 - 3 + (tempDate.getUTCDay() + 6) % 7) / 7);

      const key = weekStr;
      if (!weeklyMap[key]) {
        weeklyMap[key] = {
          Year: date.getUTCFullYear(),
          Week: weekNum,
          Week_Start: weekStr,
          Total_Tonnage: 0,
          Total_Revenue: 0,
          Total_Shipments: 0,
          week_label: `W${weekNum} '${String(date.getUTCFullYear()).slice(-2)}`,
        };
      }
      weeklyMap[key].Total_Tonnage += Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);
      weeklyMap[key].Total_Revenue += Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0);
      weeklyMap[key].Total_Shipments += Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);
    });
    return Object.values(weeklyMap).sort((a: any, b: any) => a.Week_Start.localeCompare(b.Week_Start));
  }

  return [];
};

// Parse monthly trend data dynamically from custom SQL result rows
const parseMonthlyData = (rows: any[], transportMode: TransportMode) => {
  const monthsNames: { [key: number]: string } = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec"
  };

  const hasMonth = rows.some((r) => r.Month !== undefined || r.month !== undefined || r.Month_Number !== undefined);
  if (hasMonth) {
    const monthlyMap: { [key: string]: any } = {};
    rows.forEach((r) => {
      const yr = r.Year ?? r.year ?? 2025;
      const mo = r.Month ?? r.month ?? r.Month_Number ?? 1;
      const key = `${yr}-${mo}`;
      if (!monthlyMap[key]) {
        monthlyMap[key] = {
          Year: yr,
          Month: mo,
          Total_Tonnage: 0,
          Total_Revenue: 0,
          Total_Shipments: 0,
          month_label: `${monthsNames[mo]} '${String(yr).slice(-2)}`,
        };
      }
      monthlyMap[key].Total_Tonnage += Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);
      monthlyMap[key].Total_Revenue += Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0);
      monthlyMap[key].Total_Shipments += Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);
    });
    return Object.values(monthlyMap).sort((a: any, b: any) => a.Year !== b.Year ? a.Year - b.Year : a.Month - b.Month);
  }

  const hasEtd = rows.some((r) => r.ETD || r.etd || r.etd_date);
  if (hasEtd) {
    const monthlyMap: { [key: string]: any } = {};
    rows.forEach((r) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const yr = date.getUTCFullYear();
      const mo = date.getUTCMonth() + 1;
      const key = `${yr}-${mo}`;
      if (!monthlyMap[key]) {
        monthlyMap[key] = {
          Year: yr,
          Month: mo,
          Total_Tonnage: 0,
          Total_Revenue: 0,
          Total_Shipments: 0,
          month_label: `${monthsNames[mo]} '${String(yr).slice(-2)}`,
        };
      }
      monthlyMap[key].Total_Tonnage += Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);
      monthlyMap[key].Total_Revenue += Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0);
      monthlyMap[key].Total_Shipments += Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);
    });
    return Object.values(monthlyMap).sort((a: any, b: any) => a.Year !== b.Year ? a.Year - b.Year : a.Month - b.Month);
  }

  return [];
};

function PrintViewContent() {
  const searchParams = useSearchParams();
  const transportMode: TransportMode = searchParams?.get("transport_mode") === "SEA" ? "SEA" : "AIR";
  const isSea = transportMode === "SEA";
  const sectorDivisor = isSea ? 1 : 1000;
  const formatNumber = (value: number | null | undefined) => formatFreightQuantity(value, transportMode);
  const formatTonnage = (val: number | null | undefined) => {
    if (val == null || val === 0) return "-";
    return val.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  };
  const getDefaultDateRange = () => {
    const now = new Date();
    const currentDay = now.getDay();
    const daysToPrevMonday = (currentDay === 0 ? 6 : currentDay - 1) + 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToPrevMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const pad = (n: number) => String(n).padStart(2, '0');
    const format = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return {
      start: format(monday),
      end: format(sunday),
    };
  };

  const defaultDates = getDefaultDateRange();
  const startDate = searchParams?.get("start_date") || defaultDates.start;
  const endDate = searchParams?.get("end_date") || defaultDates.end;
  const country = searchParams?.get("country") || "";
  const airline = searchParams?.get("airline") || "";
  const companyCode = searchParams?.get("company_code") || "";
  const originCity = searchParams?.get("origin_city") || "";
  const destinationCountry = searchParams?.get("destination_country") || "";
  const destinationCity = searchParams?.get("destination_city") || "";
  const branch = searchParams?.get("branch") || "";
  const maxDataRows = parseInt(searchParams?.get("max_data_rows") || "100");
  const mode = searchParams?.get("mode") || "standard";
  const reportType = searchParams?.get("report_type") || "weekly";

  const getSqlDateRange = () => {
    // 1. If explicit start_date and end_date were provided via query parameters, use them
    const paramStart = searchParams?.get("start_date");
    const paramEnd = searchParams?.get("end_date");
    if (paramStart && paramEnd) {
      return `${paramStart} to ${paramEnd}`;
    }

    // 2. If SQL query is available, extract date range from ETD filters in SQL
    if (sqlQuery) {
      const startMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s*>\s*=\s*['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);
      const endMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s*<\s*=\s*['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i) || sqlQuery.match(/ETD\s*<\s*DATEADD\(day,\s*1,\s*CAST\('([^']+)'\s+AS\s+date\)\)/i);
      const betweenMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s+between\s+['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?\s+and\s+['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);

      const standardizeDate = (dStr: string) => dStr.replace(/[_/.]/g, '-');
      if (betweenMatch) {
        return `${standardizeDate(betweenMatch[1])} to ${standardizeDate(betweenMatch[2])}`;
      } else if (startMatch && endMatch) {
        return `${standardizeDate(startMatch[1])} to ${standardizeDate(endMatch[1])}`;
      }
    }

    // 3. Fallback to min and max date from data rows if available
    if (data.length > 0) {
      const dates = data.map(r => {
        const etdVal = r.ETD ?? r.etd ?? r.etd_date;
        if (!etdVal) return null;
        const d = freightEtdDate(r, transportMode);
        return isNaN(d.getTime()) ? null : d;
      }).filter(Boolean) as Date[];
      if (dates.length > 0) {
        const minD = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
        const pad = (n: number) => String(n).padStart(2, '0');
        const label = (d: Date) => {
          const { year, month, day } = freightDayParts(d, transportMode);
          return `${year}-${pad(month)}-${pad(day)}`;
        };
        return `${label(minD)} to ${label(maxD)}`;
      }
    }

    return startDate && endDate ? `${startDate} to ${endDate}` : "";
  };

  const [branchMap, setBranchMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const res = await fetch(`${API}/api/branches`);
        const d = await res.json();
        if (d.status === "success" && Array.isArray(d.data)) {
          const mapping: Record<string, string> = {};
          d.data.forEach((b: any) => {
            mapping[b.code] = b.name;
          });
          setBranchMap(mapping);
        }
      } catch (e) {
        console.error("Failed to fetch branches in print view", e);
      }
    };
    fetchBranches();
  }, []);

  const cleanCountryName = (str?: string): string => {
    if (!str) return "";
    const res = str
      .replace(/^[A-Z]{2}\s*[-–:]?\s*/, "")
      .replace(/^(LK|IN|VN|BD|PK|US)\s+/i, "")
      .trim();
    if (res.toLowerCase().replace(/\s+/g, "") === "vietnam") {
      return "Viet Nam";
    }
    return res;
  };

  const getStationLabel = () => {
    let resolvedCompanyCode = companyCode;
    let resolvedCountry = cleanCountryName(country);
    let resolvedBranch = branch;

    // Extract from custom SQL if present
    if (mode === "custom-sql" && sqlQuery) {
      const companyMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?Company\s*=\s*['"]([^'"]+)['"]/i);
      if (companyMatch && !resolvedCompanyCode) {
        resolvedCompanyCode = companyMatch[1];
      }
      const countryMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?ConLoadPortCountryName\s*=\s*['"]([^'"]+)['"]/i);
      if (countryMatch && !resolvedCountry) {
        resolvedCountry = cleanCountryName(countryMatch[1]);
      }
      const branchMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?Branch\s*=\s*['"]([^'"]+)['"]/i);
      if (branchMatch && !resolvedBranch) {
        resolvedBranch = branchMatch[1];
      }
    }

    const BRANCH_FULL_NAMES: Record<string, string> = {
      "BLR": "Bengaluru (BLR)",
      "MAA": "Chennai (MAA)",
      "HYD": "Hyderabad (HYD)",
      "AMD": "Ahmedabad (AMD)",
      "BOM": "Mumbai (BOM)",
      "PNQ": "Pune (PNQ)",
      "DEL": "Delhi (DEL)",
      "CCU": "Kolkata (CCU)",
    };

    const STATION_NAMES: Record<string, string> = {
      "CMB": "Colombo (Sri Lanka)",
      "IND": "India",
      "VNM": "Viet Nam",
      "DAC": "Bangladesh",
      "PKI": "Pakistan",
      "NYC": "United States",
      "OTHER": "Corporate / Other"
    };

    let branchStr = "";
    if (resolvedBranch) {
      const branchCodes = resolvedBranch.split(",");
      const formattedBranches = branchCodes.map(code => {
        const trimmed = code.trim();
        const full = BRANCH_FULL_NAMES[trimmed] || branchMap[trimmed] || trimmed;
        return full
          .replace("Dart Global Logistics", "DGL")
          .replace("DGL SUPPLY CHAIN SOLUTIONS", "DGL SCS")
          .replace(" (PVT) LTD", "")
          .replace(" PVT LTD", "")
          .replace(" LTD", "");
      });
      branchStr = formattedBranches.join(", ");
    }

    if (branchStr) {
      if (resolvedCountry || isSea) {
        return `${resolvedCountry} - ${branchStr} Branch`;
      }
      return `${branchStr} Branch`;
    }

    if (resolvedCompanyCode && resolvedCountry) {
      const resolvedCompany = STATION_NAMES[resolvedCompanyCode] || resolvedCompanyCode;
      if (resolvedCompany.toLowerCase() === resolvedCountry.toLowerCase()) {
        return resolvedCountry;
      }
      return `${resolvedCountry} (${resolvedCompany})`;
    } else if (resolvedCompanyCode) {
      return STATION_NAMES[resolvedCompanyCode] || resolvedCompanyCode;
    } else if (resolvedCountry) {
      return resolvedCountry;
    }
    return "Global";
  };

  const [data, setData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [sectorCarrierData, setSectorCarrierData] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [printError, setPrintError] = useState("");
  const [renderReady, setRenderReady] = useState(false);
  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [showRouteBreakdown, setShowRouteBreakdown] = useState(searchParams?.get("show_route_breakdown") !== "false");

  // Section selection state - read from URL params or default to all true
  const [selectedSections, setSelectedSections] = useState({
    weeklyVisual: searchParams?.get("include_weekly_visual") !== "false",
    weeklyLedger: searchParams?.get("include_weekly_ledger") !== "false",
    monthlyVisual: searchParams?.get("include_monthly_visual") !== "false",
    monthlyLedger: searchParams?.get("include_monthly_ledger") !== "false",
    sectorDistribution: searchParams?.get("include_sector_distribution") !== "false",
    seaSectorDistribution: searchParams?.get("include_sea_sector_distribution") !== "false",
  });

  // Toggle section selection
  const toggleSection = (section: keyof typeof selectedSections) => {
    setSelectedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Select all sections
  const selectAllSections = () => {
    setSelectedSections({
      weeklyVisual: true,
      weeklyLedger: true,
      monthlyVisual: true,
      monthlyLedger: true,
      sectorDistribution: true,
      seaSectorDistribution: true,
    });
  };

  // Deselect all sections
  const deselectAllSections = () => {
    setSelectedSections({
      weeklyVisual: false,
      weeklyLedger: false,
      monthlyVisual: false,
      monthlyLedger: false,
      sectorDistribution: false,
      seaSectorDistribution: false,
    });
  };

  const fetchPrintData = useCallback(async () => {
    setLoading(true);
    setPrintError("");
    setRenderReady(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const loadJson = async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || result.status !== "success") throw new Error(result.detail || "Could not load report data.");
      return result;
    };
    const sectorParams = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
    for (const [key, value] of Object.entries({ country, airline, company_code: companyCode, origin_city: originCity,
      destination_country: destinationCountry, destination_city: destinationCity, branch })) {
      if (value) sectorParams.set(key, value);
    }
    let sectorTask: Promise<any> | undefined;
    const startSectors = (customSql?: string) => {
      if (isSea || searchParams?.get("include_sector_distribution") === "false") return;
      // Start in parallel with the main report query. Attach the rejection
      // handler immediately so a failed sector request is never unhandled.
      sectorTask = (customSql
        ? loadJson(`${API}/api/sector-carrier-distribution`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...Object.fromEntries(sectorParams), custom_sql: customSql }),
        })
        : loadJson(`${API}/api/sector-carrier-distribution?${sectorParams}`))
        .then(result => ({ result }), error => ({ error }));
    };
    try {
      const mode = searchParams?.get("mode");
      const queryId = searchParams?.get("query_id");
      let customSql = window.__FREIGHT_PRINT_CONFIG__?.customSql || searchParams?.get("custom_sql");

      if (mode === "custom-sql") {
        if (queryId && !customSql) {
          const cacheData = await loadJson(`${API}/api/get-cached-query/${queryId}`);
          customSql = cacheData.query;
        }
        if (!customSql) throw new Error("Report query is missing or expired. Reopen the preview and try again.");
        if (customSql) {
          customSql = customSql.replace(/(\b(?:[a-zA-Z0-9_]+\.)?(?:ConLoadPortCountryName|RealLoadPortCountryName|RealDisChargePortCountryName|ConDischargePortCountryName)\s*=\s*)'Vietnam'/gi, "$1'Viet Nam'");
          startSectors(customSql);
          setSqlQuery(customSql);
          const d = await loadJson(`${API}/api/custom-query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: customSql, transport_mode: transportMode,
              include_sea_sectors: isSea && selectedSections.seaSectorDistribution }),
          });
          if (d.status === "success") {
            const records = d.data;
            setData(records);

            // Dynamic client-side aggregates
            const totalTonnage = records.reduce((sum: number, r: any) => sum + Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0), 0);
            const totalRevenue = records.reduce((sum: number, r: any) => sum + Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0), 0);
            const totalCost = records.reduce((sum: number, r: any) => sum + Number(r.Total_Cost ?? r.Cost_USD ?? r.cost ?? 0), 0);
            const totalProfit = records.reduce((sum: number, r: any) => sum + Number(r.Total_Profit ?? r.Profit_USD ?? r.profit ?? 0), 0);
            const gpMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
            const totalShipments = records.reduce((sum: number, r: any) => sum + Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1), 0);

            const airlinesSet = new Set(records.map((r: any) => r.Airline ?? r.AirlineName1 ?? r.carrier).filter(Boolean));
            const countriesSet = new Set(records.map((r: any) => r.Origin_Country ?? r.ConLoadPortCountryName ?? r.country).filter(Boolean));
            const mastersSet = new Set(records.map((r: any) => r.Console_Number ?? r.ConsoleNumber ?? r.Master_Airway_Bill ?? r.MasterBillNum ?? r.Console_No ?? r.Number_of_Masters).filter(Boolean));
            const totalMasters = records.reduce((sum: number, r: any) => sum + Number(r.Number_of_Masters ?? r.Total_Masters ?? 0), 0) || mastersSet.size || records.length;

            setKpi({
              Total_Tonnage: totalTonnage,
              Total_Revenue: totalRevenue,
              Total_Cost: totalCost,
              Total_Profit: totalProfit,
              GP_Margin: gpMargin,
              Total_Shipments: totalShipments,
              Total_Masters: totalMasters,
              Unique_Airlines: airlinesSet.size,
              Unique_Countries: countriesSet.size,
            });

            // Dynamic Date Groupings using same logic
            setWeeklyData(parseWeeklyData(records, transportMode));
            setMonthlyData(parseMonthlyData(records, transportMode));

          }
        }
      } else {
        startSectors();
        const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
        if (isSea) params.set("include_sea_sectors", String(selectedSections.seaSectorDistribution));
        if (country) params.append("country", country);
        if (airline) params.append("airline", airline);
        if (companyCode) params.append("company_code", companyCode);
        if (originCity) params.append("origin_city", originCity);
        if (destinationCountry) params.append("destination_country", destinationCountry);
        if (destinationCity) params.append("destination_city", destinationCity);
        if (branch) params.append("branch", branch);

        const [d, w, m, k] = await Promise.all([
          loadJson(`${API}/api/data?${params}`),
          isSea ? Promise.resolve({status: "success", data: []}) : loadJson(`${API}/api/weekly?${params}`),
          isSea ? Promise.resolve({status: "success", data: []}) : loadJson(`${API}/api/monthly?${params}`),
          isSea ? Promise.resolve({status: "success", data: null}) : loadJson(`${API}/api/kpi?${params}`),
        ]);
        const failed = [d, w, m, k].find(result => result.status !== "success");
        if (failed) throw new Error(failed.detail || "Could not load report data.");
        if (d.status === "success") setData(d.data);
        if (w.status === "success") setWeeklyData(w.data);
        if (m.status === "success") setMonthlyData(m.data);
        if (k.status === "success") setKpi(k.data);
      }

      if (sectorTask) {
        const outcome = await sectorTask;
        if (outcome.error) throw outcome.error;
        if (outcome.result.warning) throw new Error(outcome.result.warning);
        setSectorCarrierData(outcome.result.data);
      } else {
        setSectorCarrierData([]);
      }
    } catch (e) {
      console.error("Failed to load print preview", e);
      setPrintError(controller.signal.aborted ? "Report data took longer than 45 seconds. Please retry or reduce the date range."
        : e instanceof Error ? e.message : "Could not load report data.");
    } finally {
      clearTimeout(timeout);
      controller.abort();
      setLoading(false);
    }
  }, [startDate, endDate, country, airline, companyCode, originCity, destinationCountry, destinationCity, branch, transportMode, searchParams, selectedSections.seaSectorDistribution]);

  useEffect(() => {
    fetchPrintData();
  }, [fetchPrintData]);

  useEffect(() => {
    if (loading || printError) return;
    let cancelled = false;
    // Signal only after fonts and the chart layout have rendered; the PDF
    // service can capture immediately without a fixed one-second sleep.
    Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]).then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!cancelled) setRenderReady(true);
      }));
    });
    return () => { cancelled = true; };
  }, [loading, printError]);

  // Update selected sections when URL parameters change (from parent preview modal)
  useEffect(() => {
    setSelectedSections({
      weeklyVisual: searchParams?.get("include_weekly_visual") !== "false",
      weeklyLedger: searchParams?.get("include_weekly_ledger") !== "false",
      monthlyVisual: searchParams?.get("include_monthly_visual") !== "false",
      monthlyLedger: searchParams?.get("include_monthly_ledger") !== "false",
      sectorDistribution: searchParams?.get("include_sector_distribution") !== "false",
      seaSectorDistribution: searchParams?.get("include_sea_sector_distribution") !== "false",
    });
    setShowRouteBreakdown(searchParams?.get("show_route_breakdown") !== "false");
  }, [
    searchParams?.get("include_weekly_visual"),
    searchParams?.get("include_weekly_ledger"),
    searchParams?.get("include_monthly_visual"),
    searchParams?.get("include_monthly_ledger"),
    searchParams?.get("include_sector_distribution"),
    searchParams?.get("include_sea_sector_distribution"),
    searchParams?.get("show_route_breakdown")
  ]);

  // Process data for Doughnut distribution (top 4 countries + others)
  const getDoughnutData = () => {
    const grouped = data.reduce((acc: any, curr: any) => {
      const countryName = curr.Origin_Country || "Unknown Hub";
      acc[countryName] = (acc[countryName] || 0) + (curr.Total_Revenue || 0);
      return acc;
    }, {});

    const sorted = Object.entries(grouped)
      .map(([name, value]) => ({ name, value: value as number }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 4) return sorted;
    const top4 = sorted.slice(0, 4);
    const othersVal = sorted.slice(4).reduce((sum, item) => sum + item.value, 0);
    return [...top4, { name: "Others", value: othersVal }];
  };

  const doughnutData = getDoughnutData();

  const selectedAirlines = airline ? airline.split(",").map((a: string) => a.trim()) : [];

  // Process data for Airline Carrier wise tonnage (Top 10 overall, or highlight selected ones)
  const getAirlineWiseData = () => {
    const aggregated = data.reduce((acc: any, curr: any) => {
      const carrier = curr.Airline ?? curr.AirlineName1 ?? curr.carrier ?? "Unknown Carrier";
      acc[carrier] = (acc[carrier] || 0) + Number(curr.Tonnage_Chargeable ?? curr.Air_ChargebleWeight ?? curr.Total_Tonnage ?? curr.tonnage ?? 0);
      return acc;
    }, {});

    const sorted = Object.entries(aggregated)
      .map(([name, tonnage]) => ({
        name,
        tonnage: tonnage as number,
        isSelected: selectedAirlines.includes(name)
      }))
      .sort((a, b) => b.tonnage - a.tonnage);

    return sorted.slice(0, 10);
  };

  const airlineWiseData = getAirlineWiseData();

  // Process data for Airline Carrier Tonnage Pie Chart (Top 4 + Others)
  const getAirlinePieData = () => {
    const aggregated = data.reduce((acc: any, curr: any) => {
      const carrier = curr.Airline ?? curr.AirlineName1 ?? curr.carrier ?? "Unknown Carrier";
      acc[carrier] = (acc[carrier] || 0) + Number(curr.Tonnage_Chargeable ?? curr.Air_ChargebleWeight ?? curr.Total_Tonnage ?? curr.tonnage ?? 0);
      return acc;
    }, {});

    const sorted = Object.entries(aggregated)
      .map(([name, tonnage]) => ({
        name,
        value: tonnage as number
      }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 4) return sorted;
    const top4 = sorted.slice(0, 4);
    const othersVal = sorted.slice(4).reduce((sum, item) => sum + item.value, 0);
    return [...top4, { name: "Others", value: othersVal }];
  };

  const airlinePieData = getAirlinePieData();

  // Airline × Week stacked data — each row = one airline, each column = a week period
  const getAirlineWeeklyStackData = () => {
    const topAirlines = getAirlineWiseData().slice(0, 10).map(a => a.name);
    const weekSet = new Map<string, string>(); // sortKey → label
    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const td = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      td.setUTCDate(td.getUTCDate() + 3 - (td.getUTCDay() + 6) % 7);
      const w1 = new Date(Date.UTC(td.getUTCFullYear(), 0, 4));
      const wn = 1 + Math.round(((td.valueOf() - w1.valueOf()) / 86400000 - 3 + (w1.getUTCDay() + 6) % 7) / 7);
      const yr = date.getUTCFullYear();
      const sk = `${yr}-${String(wn).padStart(2, '0')}`;
      if (!weekSet.has(sk)) weekSet.set(sk, `W${wn}'${String(yr).slice(-2)}`);
    });
    const sortedWeeks = Array.from(weekSet.entries()).sort(([a], [b]) => a.localeCompare(b));
    const weekLabels = sortedWeeks.map(([, l]) => l);
    const weekSortKeys = sortedWeeks.map(([k]) => k);

    const airlineWeekMap: { [airline: string]: { [wk: string]: number } } = {};
    topAirlines.forEach(name => { airlineWeekMap[name] = {}; });

    data.forEach((r: any) => {
      const carrier = r.Airline ?? r.AirlineName1 ?? r.carrier ?? "Unknown Carrier";
      if (!topAirlines.includes(carrier)) return;
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const td = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      td.setUTCDate(td.getUTCDate() + 3 - (td.getUTCDay() + 6) % 7);
      const w1 = new Date(Date.UTC(td.getUTCFullYear(), 0, 4));
      const wn = 1 + Math.round(((td.valueOf() - w1.valueOf()) / 86400000 - 3 + (w1.getUTCDay() + 6) % 7) / 7);
      const yr = date.getUTCFullYear();
      const sk = `${yr}-${String(wn).padStart(2, '0')}`;
      const wIdx = weekSortKeys.indexOf(sk);
      if (wIdx === -1) return;
      const lbl = weekLabels[wIdx];
      const ton = Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);
      airlineWeekMap[carrier][lbl] = (airlineWeekMap[carrier][lbl] || 0) + ton;
    });

    return topAirlines.map((name, idx) => {
      const row: { [key: string]: any } = { airline: name, colorIdx: idx };
      weekLabels.forEach(wk => { row[wk] = airlineWeekMap[name][wk] || 0; });
      return row;
    });
  };

  const airlineWeeklyStackData = getAirlineWeeklyStackData();

  // Sector Tonnage Distribution (dual-axis chart & table) data helpers
  const getSectorChartData = () => {
    let tEurope = 0, tUSA = 0, tSEAsia = 0, tAfrica = 0, tIndiaSub = 0, tMidEast = 0, tAustralia = 0, tOthers = 0;
    
    sectorCarrierData.forEach((row: any) => {
      tEurope += Number(row.Europe || 0);
      tUSA += Number(row.USA || 0);
      tSEAsia += Number(row.South_East_Asia || 0);
      tAfrica += Number(row.Africa || 0);
      tIndiaSub += Number(row.India_Sub_Continent || 0);
      tMidEast += Number(row.Middle_East || 0);
      tAustralia += Number(row.Australia || 0);
      tOthers += Number(row.North_America_Other || 0) + Number(row.Central_America || 0) + Number(row.South_America || 0) + Number(row.Northern_Asia || 0) + Number(row.South_Africa || 0) + Number(row.Pacific_Islands || 0) + Number(row.Others || 0);
    });

    const total = tEurope + tUSA + tSEAsia + tAfrica + tIndiaSub + tMidEast + tAustralia + tOthers;
    const pct = (val: number) => total > 0 ? (val / total) * 100 : 0;

    return [
      { name: "Europe", tonnage: tEurope / sectorDivisor, contribution: pct(tEurope) },
      { name: "USA", tonnage: tUSA / sectorDivisor, contribution: pct(tUSA) },
      { name: "S.East Asia", tonnage: tSEAsia / sectorDivisor, contribution: pct(tSEAsia) },
      { name: "Africa", tonnage: tAfrica / sectorDivisor, contribution: pct(tAfrica) },
      { name: "India & Sub Cont.", tonnage: tIndiaSub / sectorDivisor, contribution: pct(tIndiaSub) },
      { name: "Mid East", tonnage: tMidEast / sectorDivisor, contribution: pct(tMidEast) },
      { name: "Australia", tonnage: tAustralia / sectorDivisor, contribution: pct(tAustralia) },
      { name: "Other Sectors", tonnage: tOthers / sectorDivisor, contribution: pct(tOthers) },
    ];
  };

  const getSectorTableRows = () => {
    const sorted = [...sectorCarrierData].sort((a, b) => b.Total_Tons - a.Total_Tons);
    const top20 = sorted.slice(0, 20);
    const others = sorted.slice(20);

    const convertRow = (r: any) => ({
      name: r.Airline || "Unknown Carrier",
      exp: Number((r.Air_Exp_Tong / sectorDivisor).toFixed(3)),
      imp: Number((r.Air_Imp_Tong / sectorDivisor).toFixed(3)),
      total: Number((r.Total_Tons / sectorDivisor).toFixed(3)),
      europe: Number((r.Europe / sectorDivisor).toFixed(3)),
      usa: Number((r.USA / sectorDivisor).toFixed(3)),
      northAmericaOther: Number((r.North_America_Other / sectorDivisor).toFixed(3)),
      centralAmerica: Number((r.Central_America / sectorDivisor).toFixed(3)),
      southAmerica: Number((r.South_America / sectorDivisor).toFixed(3)),
      middleEast: Number((r.Middle_East / sectorDivisor).toFixed(3)),
      southEastAsia: Number((r.South_East_Asia / sectorDivisor).toFixed(3)),
      indiaSubContinent: Number((r.India_Sub_Continent / sectorDivisor).toFixed(3)),
      northernAsia: Number((r.Northern_Asia / sectorDivisor).toFixed(3)),
      africa: Number((r.Africa / sectorDivisor).toFixed(3)),
      southAfrica: Number((r.South_Africa / sectorDivisor).toFixed(3)),
      australia: Number((r.Australia / sectorDivisor).toFixed(3)),
      pacificIslands: Number((r.Pacific_Islands / sectorDivisor).toFixed(3)),
      others: Number((r.Others / sectorDivisor).toFixed(3))
    });

    const rows = top20.map(convertRow);

    if (others.length > 0) {
      const othersRowCombined = others.reduce((acc, curr) => {
        acc.Air_Exp_Tong += curr.Air_Exp_Tong;
        acc.Air_Imp_Tong += curr.Air_Imp_Tong;
        acc.Total_Tons += curr.Total_Tons;
        acc.Europe += curr.Europe;
        acc.USA += curr.USA;
        acc.North_America_Other += curr.North_America_Other;
        acc.Central_America += curr.Central_America;
        acc.South_America += curr.South_America;
        acc.Middle_East += curr.Middle_East;
        acc.South_East_Asia += curr.South_East_Asia;
        acc.India_Sub_Continent += curr.India_Sub_Continent;
        acc.Northern_Asia += curr.Northern_Asia;
        acc.Africa += curr.Africa;
        acc.South_Africa += curr.South_Africa;
        acc.Australia += curr.Australia;
        acc.Pacific_Islands += curr.Pacific_Islands;
        acc.Others += curr.Others;
        return acc;
      }, {
        Airline: "OTHERS - Total",
        Air_Exp_Tong: 0,
        Air_Imp_Tong: 0,
        Total_Tons: 0,
        Europe: 0,
        USA: 0,
        North_America_Other: 0,
        Central_America: 0,
        South_America: 0,
        Middle_East: 0,
        South_East_Asia: 0,
        India_Sub_Continent: 0,
        Northern_Asia: 0,
        Africa: 0,
        South_Africa: 0,
        Australia: 0,
        Pacific_Islands: 0,
        Others: 0
      });
      rows.push({
        ...convertRow(othersRowCombined),
        isOthersRow: true
      } as any);
    }

    // Grand Total Row
    const grandTotalCombined = sorted.reduce((acc, curr) => {
      acc.Air_Exp_Tong += curr.Air_Exp_Tong;
      acc.Air_Imp_Tong += curr.Air_Imp_Tong;
      acc.Total_Tons += curr.Total_Tons;
      acc.Europe += curr.Europe;
      acc.USA += curr.USA;
      acc.North_America_Other += curr.North_America_Other;
      acc.Central_America += curr.Central_America;
      acc.South_America += curr.South_America;
      acc.Middle_East += curr.Middle_East;
      acc.South_East_Asia += curr.South_East_Asia;
      acc.India_Sub_Continent += curr.India_Sub_Continent;
      acc.Northern_Asia += curr.Northern_Asia;
      acc.Africa += curr.Africa;
      acc.South_Africa += curr.South_Africa;
      acc.Australia += curr.Australia;
      acc.Pacific_Islands += curr.Pacific_Islands;
      acc.Others += curr.Others;
      return acc;
    }, {
      Airline: "Total",
      Air_Exp_Tong: 0,
      Air_Imp_Tong: 0,
      Total_Tons: 0,
      Europe: 0,
      USA: 0,
      North_America_Other: 0,
      Central_America: 0,
      South_America: 0,
      Middle_East: 0,
      South_East_Asia: 0,
      India_Sub_Continent: 0,
      Northern_Asia: 0,
      Africa: 0,
      South_Africa: 0,
      Australia: 0,
      Pacific_Islands: 0,
      Others: 0
    });

    rows.push({
      ...convertRow(grandTotalCombined),
      isGrandTotal: true
    } as any);

    return rows;
  };

  const chartData = getSectorChartData();
  const sectorChartMaximum = chartData.reduce((sum, sector) => sum + sector.tonnage, 0) || 1;
  const tableRows = getSectorTableRows();

  const weekStackLabels = (() => {
    const weekSet = new Map<string, string>();
    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const td = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      td.setUTCDate(td.getUTCDate() + 3 - (td.getUTCDay() + 6) % 7);
      const w1 = new Date(Date.UTC(td.getUTCFullYear(), 0, 4));
      const wn = 1 + Math.round(((td.valueOf() - w1.valueOf()) / 86400000 - 3 + (w1.getUTCDay() + 6) % 7) / 7);
      const yr = date.getUTCFullYear();
      const sk = `${yr}-${String(wn).padStart(2, '0')}`;
      if (!weekSet.has(sk)) weekSet.set(sk, `W${wn}'${String(yr).slice(-2)}`);
    });
    return Array.from(weekSet.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  })();

  // Process data for Trade Routes Pie Chart (Top 5 + Others) — used in SQL Sandbox mode
  const getTradeRouteData = () => {
    const grouped = data.reduce((acc: any, curr: any) => {
      const originCountry = curr.Origin_Country || curr.ConLoadPortCountryName || "";
      const originCity = curr.Origin_City || curr.OriginCity || curr.origin_city || "";
      const hasOriginCity = originCity && originCity !== "N/A" && originCity !== "—";
      const originCityClean = hasOriginCity ? originCity : "Unknown City";
      const originCountryClean = originCountry || "Unknown Country";

      const destCountry = curr.Destination_Country || curr.DestCountry || curr.dest_country || "";
      const destCity = curr.Destination_City || curr.DestCity || curr.dest_city || "";
      const hasDestCity = destCity && destCity !== "N/A" && destCity !== "—";
      const destCityClean = hasDestCity ? destCity : "Unknown City";
      const destCountryClean = destCountry || "Unknown Country";

      const key = `${originCityClean}||${originCountryClean}||${destCityClean}||${destCountryClean}`;
      acc[key] = (acc[key] || 0) + Number(curr.Total_Tonnage ?? curr.Tonnage_Chargeable ?? curr.Air_ChargebleWeight ?? curr.tonnage ?? 0);
      return acc;
    }, {});

    const sorted = Object.entries(grouped)
      .map(([key, value]) => {
        const [originCity, originCountry, destCity, destCountry] = key.split("||");
        const name = `${originCity} (${originCountry}) → ${destCity} (${destCountry})`;
        return {
          name,
          originCity,
          originCountry,
          destCity,
          destCountry,
          value: value as number,
          isOthers: false,
        };
      })
      .sort((a, b) => b.value - a.value);

    if (sorted.length <= 5) return sorted;
    const top5 = sorted.slice(0, 5);
    const othersVal = sorted.slice(5).reduce((sum, item) => sum + item.value, 0);
    return [
      ...top5,
      {
        name: "Others",
        originCity: "Others",
        originCountry: "Various",
        destCity: "Others",
        destCountry: "Various",
        value: othersVal,
        isOthers: true,
      },
    ];
  };

  const tradeRouteData = getTradeRouteData();

  // Process day-by-day stacked airline tonnage share including empty/zero days and total aggregates
  const getDailyStackedAirlineData = () => {
    const topAirlines = getAirlineWiseData().map(a => a.name);
    const dayMap: { [key: string]: { date_label: string; sortKey: string;[key: string]: any } } = {};

    // 1. Process database records
    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const label = `${dayNames[date.getUTCDay()]} ${date.getUTCDate()}/${date.getUTCMonth() + 1}`;

      const carrier = r.Airline ?? r.AirlineName1 ?? r.carrier ?? "Unknown Carrier";
      const ton = Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = { date_label: label, sortKey: dateStr };
        // Initialize top airlines to 0
        topAirlines.forEach((airlineName) => {
          dayMap[dateStr][airlineName] = 0;
        });
        dayMap[dateStr]["Others"] = 0;
      }

      if (topAirlines.includes(carrier)) {
        dayMap[dateStr][carrier] = (dayMap[dateStr][carrier] || 0) + ton;
      } else {
        dayMap[dateStr]["Others"] = (dayMap[dateStr]["Others"] || 0) + ton;
      }
    });

    // 2. Parse date range parameters and fill missing empty days
    let startStr = startDate;
    let endStr = endDate;

    if (sqlQuery) {
      const startMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s*>\s*=\s*['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);
      const endMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s*<\s*=\s*['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i) || sqlQuery.match(/ETD\s*<\s*DATEADD\(day,\s*1,\s*CAST\('([^']+)'\s+AS\s+date\)\)/i);
      const betweenMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s+between\s+['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?\s+and\s+['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);

      const standardizeDate = (dStr: string) => dStr.replace(/[_/.]/g, '-');
      if (betweenMatch) {
        startStr = standardizeDate(betweenMatch[1]);
        endStr = standardizeDate(betweenMatch[2]);
      } else if (startMatch && endMatch) {
        startStr = standardizeDate(startMatch[1]);
        endStr = standardizeDate(endMatch[1]);
      }
    }

    // Fallback if custom SQL query has no date parameters, or for standard mode
    if (data.length > 0 && (!startStr || (mode === "custom-sql" && !sqlQuery.match(/(?:etd|etd_date)/i)))) {
      const dates = data.map(r => {
        const etdVal = r.ETD ?? r.etd ?? r.etd_date;
        if (!etdVal) return null;
        const d = freightEtdDate(r, transportMode);
        return isNaN(d.getTime()) ? null : d;
      }).filter(Boolean) as Date[];
      if (dates.length > 0) {
        const minD = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
        const pad = (n: number) => String(n).padStart(2, '0');
        startStr = `${minD.getUTCFullYear()}-${pad(minD.getUTCMonth() + 1)}-${pad(minD.getUTCDate())}`;
        endStr = `${maxD.getUTCFullYear()}-${pad(maxD.getUTCMonth() + 1)}-${pad(maxD.getUTCDate())}`;
      }
    }

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const current = new Date(start);
      current.setUTCHours(12, 0, 0, 0);
      const last = new Date(end);
      last.setUTCHours(12, 0, 0, 0);

      // Limit range generation to a maximum of 32 days (full 31-day month + 1 buffer)
      let iterations = 0;
      while (current <= last && iterations < 32) {
        const dateStr = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
        if (!dayMap[dateStr]) {
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const label = `${dayNames[current.getUTCDay()]} ${current.getUTCDate()}/${current.getUTCMonth() + 1}`;
          dayMap[dateStr] = { date_label: label, sortKey: dateStr };
          topAirlines.forEach((airlineName) => {
            dayMap[dateStr][airlineName] = 0;
          });
          dayMap[dateStr]["Others"] = 0;
        }
        current.setUTCDate(current.getUTCDate() + 1);
        iterations++;
      }
    }

    // 3. Pre-calculate total tonnage and transparent label tracker for stack rendering
    Object.keys(dayMap).forEach((dateStr) => {
      const dayData = dayMap[dateStr];
      const total = topAirlines.reduce((sum, name) => sum + (dayData[name] || 0), 0) + (dayData["Others"] || 0);
      dayData.total_tonnage = total;
      dayData.total_tonnage_label = 0;
    });

    return Object.values(dayMap)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  const getWeeklyStackedAirlineData = () => {
    const topAirlines = getAirlineWiseData().map(a => a.name);
    const weekMap: { [key: string]: { week_label: string; sortKey: string; month: number;[key: string]: any } } = {};

    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      let sortKey: string;
      let weekLabel: string;
      let recordMonth: number = 1;

      if (etdVal) {
        const date = freightEtdDate(r, transportMode);
        if (isNaN(date.getTime())) return;
        recordMonth = date.getUTCMonth() + 1;
        const td = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        td.setUTCDate(td.getUTCDate() + 3 - (td.getUTCDay() + 6) % 7);
        const w1 = new Date(Date.UTC(td.getUTCFullYear(), 0, 4));
        const wn = 1 + Math.round(((td.valueOf() - w1.valueOf()) / 86400000 - 3 + (w1.getUTCDay() + 6) % 7) / 7);
        const yr = date.getUTCFullYear();
        sortKey = `${yr}-${String(wn).padStart(2, '0')}`;
        weekLabel = `W${wn} '${String(yr).slice(-2)}`;
      } else {
        const yr = r.Year ?? r.year;
        const mo = r.Month ?? r.month;
        if (!yr || !mo) return;
        recordMonth = Number(mo);
        sortKey = `${yr}-${String(mo).padStart(2, '0')}`;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        weekLabel = `${monthNames[(mo as number) - 1]} '${String(yr).slice(-2)}`;
      }

      const carrier = r.Airline ?? r.AirlineName1 ?? r.carrier ?? 'Unknown Carrier';
      const ton = Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);

      if (!weekMap[sortKey]) {
        weekMap[sortKey] = { week_label: weekLabel, sortKey, month: recordMonth };
        topAirlines.forEach((airlineName) => { weekMap[sortKey][airlineName] = 0; });
        weekMap[sortKey]['Others'] = 0;
      }

      if (topAirlines.includes(carrier)) {
        weekMap[sortKey][carrier] = (weekMap[sortKey][carrier] || 0) + ton;
      } else {
        weekMap[sortKey]['Others'] = (weekMap[sortKey]['Others'] || 0) + ton;
      }
    });

    Object.keys(weekMap).forEach((sortKey) => {
      const weekData = weekMap[sortKey];
      const total = topAirlines.reduce((sum, name) => sum + (weekData[name] || 0), 0) + (weekData["Others"] || 0);
      weekData.total_tonnage = total;
      weekData.total_tonnage_label = 0;
    });

    return Object.values(weekMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  const dailyStackedAirlineData = getDailyStackedAirlineData();
  const weeklyStackedAirlineData = getWeeklyStackedAirlineData();
  const top10Airlines = getAirlineWiseData();
  const totalTop10Tonnage = top10Airlines.reduce((sum, item) => sum + item.tonnage, 0);
  const top10AirlinesNames = top10Airlines.map(a => a.name);

  // Process data for stacked class breakdown
  const stackedWeightBars = weeklyData.slice(-12).map((item) => {
    const total = item.Total_Shipments ?? 0;
    const heavyClass = Math.round(total * 0.72);
    const lightClass = total - heavyClass;
    return {
      week: item.week_label || `W${item.Week}`,
      Converted: heavyClass,
      Cancelled: lightClass
    };
  });

  const CustomLabel = (props: any) => {
    const { x, y, width, index } = props;
    const row = dailyStackedAirlineData[index];
    if (!row || !row.total_tonnage || row.total_tonnage === 0) return null;
    
    const isRotated = dailyStackedAirlineData.length > 8;
    return (
      <g transform={`translate(${x + width / 2}, ${y - 6})`}>
        <text
          x={0}
          y={0}
          fill="#2D3748"
          fontSize={isRotated ? 9.5 : 11}
          fontWeight="bold"
          textAnchor={isRotated ? "start" : "middle"}
          transform={isRotated ? "rotate(-90)" : undefined}
        >
          {formatNumber(row.total_tonnage)}
        </text>
      </g>
    );
  };

  const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const value = payload.value;

    const isRotated = dailyStackedAirlineData.length > 8;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          fill="#4A5568"
          fontSize={13.5}
          fontWeight={650}
          textAnchor={isRotated ? "end" : "middle"}
          transform={isRotated ? "rotate(-35)" : undefined}
        >
          {value}
        </text>
      </g>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-12 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Preparing A4 Landscape Print View...</p>
      </div>
    );
  }

  if (printError) return <div id="print-error" role="alert" className="p-8 text-rose-700">Report could not be generated: {printError}</div>;

  return (
    <div className="flex flex-col items-center bg-white py-4 print:block print:p-0 select-none">
      <style dangerouslySetInnerHTML={{
        __html: `
        .print-page-container {
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          display: block !important;
          padding-top: 16px;
          padding-bottom: 16px;
        }
        .sea-print-volume table { font-size: 11px; }
        .sea-print-volume th, .sea-print-volume td {
          padding-top: 4px;
          padding-bottom: 4px;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            margin: 0;
            padding: 0;
            background: white !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          span.rounded-full {
            display: inline-block !important;
          }
          .print-page-container {
            width: 100% !important;
            padding: 12px 0 !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
            break-after: auto !important;
            page-break-after: auto !important;
            box-shadow: none !important;
          }
          .sea-print-report { padding-bottom: 0 !important; }
          .sea-print-report .sea-report-group { margin-top: 0 !important; }
          .sea-print-report .sea-report-group ~ .sea-report-group {
            break-before: page;
            page-break-before: always;
          }
          .print-page-container > .border-b-2,
          .report-heading {
            break-inside: avoid !important;
            break-after: avoid !important;
          }
          .print-page-container .overflow-x-auto,
          .print-page-container .overflow-y-auto {
            overflow: visible !important;
            max-height: none !important;
          }
          .print-page-container thead { display: table-header-group; }
          .print-page-container tr,
          .print-page-container .recharts-wrapper { break-inside: avoid; }
          .print-page-container tbody tr:last-child { break-before: avoid; }
        }
      `}} />
      {/* Hidden indicator for PDF capture readiness */}
      {renderReady && <div id="pdf-ready" className="opacity-0 pointer-events-none absolute" style={{ width: '1px', height: '1px' }}>ready</div>}

      {/* ── SECTIONS STATUS INDICATOR ── */}
      <div className="print:hidden w-full max-w-[1123px] bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow-sm p-3 mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs font-semibold text-blue-900">
              PDF Sections:
              <span className="ml-2">
                {selectedSections.weeklyVisual && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-bold mr-1 inline-block">{isSea ? "Weekly Operational Performance" : mode === "custom-sql" ? "Weekly Operational Performance" : "Weekly Charts"}</span>}
                {selectedSections.weeklyLedger && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[9px] font-bold mr-1 inline-block">{isSea ? "Shipping Line Summary" : mode === "custom-sql" ? freightText("Airline Performance Summary — Top 10", transportMode) : "Weekly Tables"}</span>}
                {selectedSections.monthlyVisual && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-bold mr-1 inline-block">{isSea ? "Trade Route Summary" : mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Charts"}</span>}
                {selectedSections.monthlyLedger && !isSea && mode !== "custom-sql" && <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-[9px] font-bold mr-1 inline-block">Monthly Tables</span>}
                {isSea && selectedSections.seaSectorDistribution && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[9px] font-bold mr-1 inline-block">Top 20 Shipping Lines by Sector</span>}
              </span>
            </p>
          </div>
          <span className="text-[9px] font-bold text-blue-600 bg-white px-2.5 py-1 rounded-full border border-blue-200">
            {isSea ? `${[selectedSections.weeklyVisual, selectedSections.weeklyLedger, selectedSections.monthlyVisual, selectedSections.seaSectorDistribution].filter(Boolean).length} / 4 Sections · Paged layout` : mode === "custom-sql"
              ? `${[selectedSections.weeklyVisual, selectedSections.weeklyLedger, selectedSections.monthlyVisual].filter(Boolean).length} / 3 Sections · Continuous layout`
              : `${[selectedSections.weeklyVisual, selectedSections.weeklyLedger, selectedSections.monthlyVisual, selectedSections.monthlyLedger, selectedSections.sectorDistribution].filter(Boolean).length} / 4 Sections · Continuous layout`
            }
          </span>
        </div>
      </div>

      {/* ── SECTION SELECTOR (Only visible on screen, hidden when printing) ── */}
      <div className="print:hidden w-full max-w-[1123px] bg-white border border-slate-200 rounded-lg shadow-md p-4 mx-auto">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Printer className="w-4 h-4 text-indigo-600" />
                Customize PDF Sections
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Select which sections to include in your PDF export and preview</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAllSections}
                className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 font-semibold transition-colors"
              >
                Select All
              </button>
              <button
                onClick={deselectAllSections}
                className="text-xs px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md hover:bg-slate-200 font-semibold transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {/* Section 1: Weekly Visual */}
            <button
              onClick={() => toggleSection('weeklyVisual')}
              className={`p-3 rounded-lg border-2 transition-all text-left ${selectedSections.weeklyVisual
                ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
            >
              <div className="flex items-start gap-2">
                {selectedSections.weeklyVisual ? (
                  <CheckSquare className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    {isSea ? "Weekly Operational Performance" : mode === "custom-sql" ? "Weekly Operational Performance" : "Weekly Dashboard"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isSea ? "Shipping-line share and daily FCL charts" : mode === "custom-sql" ? "All 4 Visuals" : "Charts & KPIs"}
                  </p>
                </div>
              </div>
            </button>

            {/* Section 2: Weekly Ledger */}
            <button
              onClick={() => toggleSection('weeklyLedger')}
              className={`p-3 rounded-lg border-2 transition-all text-left ${selectedSections.weeklyLedger
                ? 'border-blue-400 bg-blue-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
            >
              <div className="flex items-start gap-2">
                {selectedSections.weeklyLedger ? (
                  <CheckSquare className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    {isSea ? "Shipping Line Consol Summary" : mode === "custom-sql" ? freightText("Airline Performance Summary — Top 10", transportMode) : "Weekly Ledger"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isSea ? "FCL TEUs, LCL volume and revenue" : mode === "custom-sql" ? freightText("Airline details & metrics", transportMode) : "Carrier details"}
                  </p>
                </div>
              </div>
            </button>

            {/* Section 3: Monthly Visual */}
            <button
              onClick={() => toggleSection('monthlyVisual')}
              className={`p-3 rounded-lg border-2 transition-all text-left ${selectedSections.monthlyVisual
                ? 'border-teal-400 bg-teal-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
            >
              <div className="flex items-start gap-2">
                {selectedSections.monthlyVisual ? (
                  <CheckSquare className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-sm text-slate-800">
                    {isSea ? "Trade Route Consol Summary" : mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Dashboard"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isSea ? "Top 5 FCL / LCL pie charts and Top 10 route totals" : mode === "custom-sql" ? "Route details & metrics" : "Trends & insights"}
                  </p>
                </div>
              </div>
            </button>

            {/* Section 4: Monthly Ledger */}
            {(!isSea && mode !== "custom-sql") && (
              <button
                onClick={() => toggleSection('monthlyLedger')}
                className={`p-3 rounded-lg border-2 transition-all text-left ${selectedSections.monthlyLedger
                  ? 'border-purple-400 bg-purple-50 shadow-sm'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
              >
                <div className="flex items-start gap-2">
                  {selectedSections.monthlyLedger ? (
                    <CheckSquare className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-semibold text-sm text-slate-800">{isSea ? "Consol Ledger" : "Monthly Ledger"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{isSea ? "One row per consol" : "Financial summary"}</p>
                  </div>
                </div>
              </button>
            )}

            {/* Section 5: Sector Tonnage Distribution */}
            {!isSea && <button
              onClick={() => toggleSection('sectorDistribution')}
              className={`p-3 rounded-lg border-2 transition-all text-left ${selectedSections.sectorDistribution
                ? 'border-rose-450 bg-rose-50/60 border-rose-300 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
            >
              <div className="flex items-start gap-2">
                {selectedSections.sectorDistribution ? (
                  <CheckSquare className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-sm text-slate-800">Sector Distribution</p>
                  <p className="text-xs text-slate-500 mt-0.5">Top 20 carriers &amp; sectors</p>
                </div>
              </div>
            </button>}
          </div>

          {isSea && <button type="button" onClick={() => toggleSection("seaSectorDistribution")}
            className={`mt-3 w-full p-3 rounded-lg border-2 text-left ${selectedSections.seaSectorDistribution ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-start gap-2">
              {selectedSections.seaSectorDistribution ? <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" /> : <Square className="w-5 h-5 text-slate-400 shrink-0" />}
              <div><p className="font-semibold text-sm text-slate-800">Top 20 Shipping Lines - Sector wise</p>
                <p className="text-xs text-slate-500 mt-0.5">FCL / LCL geographical contribution charts and destination sector tables</p></div>
            </div>
          </button>}

          {mode === "custom-sql" && (
            <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-250/80">
              <input
                type="checkbox"
                id="show-route-breakdown"
                checked={showRouteBreakdown}
                onChange={(e) => setShowRouteBreakdown(e.target.checked)}
                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 cursor-pointer"
              />
              <label htmlFor="show-route-breakdown" className="text-xs font-semibold text-slate-600 cursor-pointer select-none">{freightText("\n                Include detailed Route Breakdowns (Origin Country → Destination Country) under each Airline row\n              ", transportMode)}</label>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-md p-2 text-xs text-slate-600">
            <span className="font-semibold">Tip:</span> Deselect sections you don't need to reduce file size and printing time. Use Ctrl+P to print when ready.
          </div>
        </div>
      </div>

      {isSea && <div className="print-page-container sea-print-report bg-white p-8 w-[1123px]">
        <SeaConsolReport records={data} print showRouteBreakdown={showRouteBreakdown} dateRange={getSqlDateRange()} station={`Station: ${getStationLabel()}`}
          sections={selectedSections} maxRows={maxDataRows} viewMode={mode === "custom-sql" ? "custom-sql" : "standard"} reportType={reportType} />
      </div>}
      {!isSea && <>
      {/* ── SECTION 1: WEEKLY VISUAL DASHBOARD (Page 1 & 2 for custom SQL, or Page 1 for Standard) ── */}
      {selectedSections.weeklyVisual && (
        mode === "custom-sql" ? (
          <>
            {/* PAGE 1: Operational Visuals - Airlines */}
            <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none">
              {/* Print Header */}
              <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
                {/* Top Row: Logo & Main Title (left) + Branch & Dest Badges (right) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
                  </div>
                  <div className="flex gap-1 justify-end items-center">
                    {destinationCountry && (
                      <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                        📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Subtitle (left) and Date / Station (right) aligned baseline */}
                <div className="flex items-baseline justify-between mt-1">
                  <p className="text-[12.5px] font-semibold text-slate-400 leading-none">
                    Dart Global Logistics · {reportType === "monthly" ? "Monthly" : "Weekly"}{freightText(" Operational Performance — Airline Breakdown\n                  ", transportMode)}</p>
                  <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                    {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                  </span>
                </div>
              </div>

              {/* KPI Cards Row */}
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">Total Revenue</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Revenue)}</h3>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">{freightText("Total Tonnage", transportMode)}</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Tonnage)}{freightText(" kg", transportMode)}</h3>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">No of Shipments</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Shipments)}</h3>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">No of Masters</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Masters ?? kpi.Number_of_Masters ?? kpi.Weekly_Total_Masters ?? kpi.Unique_Masters)}</h3>
                </div>
              </div>

              {/* Expanded Charts Grid */}
              <div className="grid grid-cols-12 gap-4 mt-4 h-[450px] flex-1">
                {/* Left: Top 10 Airlines Tonnage Share */}
                <div className="col-span-8 border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-1 shrink-0">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">{freightText("Top 10 Airlines Tonnage Share", transportMode)}</span>
                    <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border">
                      Day-by-Day Stack
                    </span>
                  </div>
                  <div className="h-[250px] w-full mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={dailyStackedAirlineData}
                        margin={{ top: 45, right: 10, left: 4, bottom: dailyStackedAirlineData.length > 8 ? 35 : 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} horizontal={true} />
                        <XAxis
                          dataKey="date_label"
                          type="category"
                          height={45}
                          tick={<CustomXAxisTick />}
                          axisLine={{ stroke: "#E2E8F0" }}
                          tickLine={false}
                          interval={dailyStackedAirlineData.length > 14 ? Math.floor(dailyStackedAirlineData.length / 14) : 0}
                        />
                        <YAxis
                          type="number"
                          tick={{ fontSize: 13.5, fill: "#A0AEC0" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => isSea ? formatNumber(v) : `${(v / 1000).toFixed(0)}k`}
                          width={55}
                        />
                        {top10AirlinesNames.map((airlineName, idx) => (
                          <Bar
                            key={airlineName}
                            dataKey={airlineName}
                            stackId="airlines"
                            fill={getAirlineColor(airlineName, idx)}
                            isAnimationActive={false}
                          />
                        ))}
                        <Bar
                          key="Others"
                          dataKey="Others"
                          stackId="airlines"
                          fill="#718096"
                          isAnimationActive={false}
                        />
                        <Bar
                          key="total_tonnage_label"
                          dataKey="total_tonnage_label"
                          stackId="airlines"
                          fill="transparent"
                          label={<CustomLabel />}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legends Grid (2-column layout for 10 items) */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 pr-1 border-t border-slate-100 pt-1.5 shrink-0">
                    {(() => {
                      const totalAllTonnage = data.reduce((sum: number, r: any) => sum + Number(r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.Total_Tonnage ?? r.tonnage ?? 0), 0);
                      const totalTop10Tonnage = top10Airlines.reduce((sum, item) => sum + item.tonnage, 0);
                      const othersTonnage = totalAllTonnage > totalTop10Tonnage ? totalAllTonnage - totalTop10Tonnage : 0;
                      
                      return (
                        <>
                          {top10Airlines.map((entry, idx) => {
                            const pct = totalAllTonnage > 0 ? ((entry.tonnage / totalAllTonnage) * 100).toFixed(1) : "0.0";
                            return (
                              <div key={entry.name} className="flex items-start justify-between text-[12.5px] border-b border-slate-50 pb-0.5 gap-2">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: getAirlineColor(entry.name, idx) }} />
                                  <span className="font-bold text-slate-700 leading-snug" title={entry.name}>
                                    {entry.name}
                                  </span>
                                </div>
                                <div className="flex items-start gap-1 shrink-0 text-right mt-0.5">
                                  <span className="font-bold text-[#2D3748] tabular-nums">{formatNumber(entry.tonnage)}{freightText(" kg", transportMode)}</span>
                                  <span className="text-slate-400 font-medium">({pct}%)</span>
                                </div>
                              </div>
                            );
                          })}
                          {(() => {
                            const othersPct = totalAllTonnage > 0 ? ((othersTonnage / totalAllTonnage) * 100).toFixed(1) : "0.0";
                            return (
                              <div key="Others" className="flex items-start justify-between text-[12.5px] border-b border-slate-50 pb-0.5 gap-2">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <span className="w-2 h-2 rounded-full shrink-0 bg-[#718096] mt-1" />
                                  <span className="font-bold text-slate-700 leading-snug" title="Others">
                                    Others
                                  </span>
                                </div>
                                <div className="flex items-start gap-1 shrink-0 text-right mt-0.5">
                                  <span className="font-bold text-[#2D3748] tabular-nums">{formatNumber(othersTonnage)}{freightText(" kg", transportMode)}</span>
                                  <span className="text-slate-400 font-medium">({othersPct}%)</span>
                                </div>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Right: Airline Tonnage Share (Pie) */}
                <div className="col-span-4 border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-full">
                  <div className="border-b border-[#F1F5F9] pb-1 shrink-0">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">{freightText("Airline Tonnage Share", transportMode)}</span>
                  </div>
                  <div className="relative h-[220px] flex items-center justify-center mt-1 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={airlinePieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={64}
                          paddingAngle={2}
                          dataKey="value"
                          isAnimationActive={false}
                        >
                          {airlinePieData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.name === "Others" ? "#718096" : getAirlineColor(entry.name, index)} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center flex flex-col justify-center items-center pointer-events-none">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Total</span>
                      <span className="text-lg font-extrabold text-[#2D3748] tracking-tight">
                        {formatNumber(kpi.Total_Tonnage)}{freightText(" kg\n                      ", transportMode)}</span>
                    </div>
                  </div>
                  <div className="space-y-1 mt-1 overflow-hidden flex-1">
                    {airlinePieData.map((entry: any, idx: number) => {
                      const pct = kpi.Total_Tonnage > 0 ? ((entry.value / kpi.Total_Tonnage) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={entry.name} className="flex items-start justify-between text-[12.5px] text-slate-500 gap-2">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: entry.name === "Others" ? "#718096" : getAirlineColor(entry.name, idx) }} />
                            <span className="font-semibold text-slate-700 leading-snug">{entry.name}</span>
                          </div>
                          <span className="font-bold text-slate-700 shrink-0 text-[12.5px] text-right mt-0.5">{formatNumber(entry.value)}{freightText(" kg (", transportMode)}{pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Print Footer */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[12.5px] text-slate-400 shrink-0">
                <span></span>
                <span>{freightText("© 2026 Dart Global Logistics · Operational Performance — Airline Breakdown Page", transportMode)}</span>
              </div>
            </div>

            {/* PAGE 2: Operational Visuals - Airline Tonnage by Week Period */}
            <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none">
              {/* Print Header */}
              <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
                {/* Top Row: Logo & Main Title (left) + Branch & Dest Badges (right) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
                  </div>
                  <div className="flex gap-1 justify-end items-center">
                    {destinationCountry && (
                      <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                        📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Subtitle (left) and Date / Station (right) aligned baseline */}
                <div className="flex items-baseline justify-between mt-1">
                  <p className="text-[12.5px] font-semibold text-slate-400 leading-none">
                    Dart Global Logistics · {reportType === "monthly" ? "Monthly" : "Weekly"}{freightText(" Operational Performance — Weekly Airline Trend\n                  ", transportMode)}</p>
                  <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                    {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                  </span>
                </div>
              </div>

              {/* Weekly Trend Chart in Large Container */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between h-[540px] mt-4 flex-1">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-1.5 shrink-0">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">{freightText("Airline Tonnage by Week Period", transportMode)}</span>
                  <span className="bg-indigo-50 text-indigo-700 text-[12.5px] px-2 py-0.5 rounded font-black uppercase shrink-0">
                    {airlineWeeklyStackData.length}{freightText(" Airlines\n                  ", transportMode)}</span>
                </div>
                <div className="h-[360px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={airlineWeeklyStackData}
                      layout="vertical"
                      margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={true} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 14, fill: "#A0AEC0" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => isSea ? formatNumber(v) : `${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        dataKey="airline"
                        type="category"
                        tick={{ fontSize: 14, fill: "#4A5568", fontWeight: 600 }}
                        axisLine={{ stroke: "#E2E8F0" }}
                        tickLine={false}
                        width={210}
                      />
                      {weekStackLabels.map((wkLabel, wIdx) => (
                        <Bar
                          key={wkLabel}
                          dataKey={wkLabel}
                          stackId="awstack"
                          radius={wIdx === weekStackLabels.length - 1 ? [0, 3, 3, 0] : [0, 0, 0, 0]}
                          isAnimationActive={false}
                        >
                          {airlineWeeklyStackData.map((row: any) => (
                            <Cell
                              key={`${row.airline}-${wkLabel}`}
                              fill={getAirlineColor(row.airline, row.colorIdx)}
                              fillOpacity={weekStackLabels.length > 1 ? 0.45 + (wIdx / (weekStackLabels.length - 1)) * 0.55 : 1}
                            />
                          ))}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Legends Grid (2-column layout for 10 items) */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 pr-1 border-t border-slate-100 pt-1.5 shrink-0">
                  {top10Airlines.map((entry, idx) => {
                    const pct = totalTop10Tonnage > 0 ? ((entry.tonnage / totalTop10Tonnage) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={entry.name} className="flex items-start justify-between text-[12.5px] border-b border-slate-50 pb-0.5 gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: getAirlineColor(entry.name, idx) }} />
                          <span className="font-bold text-slate-700 leading-snug" title={entry.name}>
                            {entry.name}
                          </span>
                        </div>
                        <div className="flex items-start gap-1 shrink-0 text-right mt-0.5">
                          <span className="font-bold text-[#2D3748] tabular-nums">{formatNumber(entry.tonnage)}{freightText(" kg", transportMode)}</span>
                          <span className="text-slate-400 font-medium">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Print Footer */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[12.5px] text-slate-400 shrink-0 mt-4">
                <span></span>
                <span>{freightText("© 2026 Dart Global Logistics · Operational Performance — Airline Tonnage by Week Period Page", transportMode)}</span>
              </div>
            </div>

            {/* PAGE 3: Operational Visuals - Trade Routes */}
            <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none">
              {/* Print Header */}
              <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
                {/* Top Row: Logo & Main Title (left) + Branch & Dest Badges (right) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
                  </div>
                  <div className="flex gap-1 justify-end items-center">
                    {destinationCountry && (
                      <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                        📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Subtitle (left) and Date / Station (right) aligned baseline */}
                <div className="flex items-baseline justify-between mt-1">
                  <p className="text-[12.5px] font-semibold text-slate-400 leading-none">
                    Dart Global Logistics · {reportType === "monthly" ? "Monthly" : "Weekly"} Operational Performance — Trade Route Breakdown
                  </p>
                  <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                    {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                  </span>
                </div>
              </div>

              {/* Row 3: Route Distribution Trade Routes by Tonnage (Top 5 + Others) */}
              <div className="border border-slate-200 rounded-xl p-6 bg-white shadow-sm flex flex-row items-center justify-between h-[540px] gap-12 mt-6 flex-1">
                <div className="flex flex-col justify-between h-full shrink-0 w-[350px]">
                  <span className="text-lg uppercase tracking-wider font-bold text-slate-400">{freightText("Trade Routes by Tonnage (Top 5)", transportMode)}</span>
                  <div className="relative h-[430px] w-full flex items-center justify-center mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={tradeRouteData}
                          cx="50%"
                          cy="50%"
                          innerRadius={75}
                          outerRadius={140}
                          paddingAngle={2}
                          dataKey="value"
                          isAnimationActive={false}
                        >
                          {tradeRouteData.map((entry, index) => (
                            <Cell key={`tr-cell-${index}`} fill={entry.isOthers ? "#718096" : PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center flex flex-col justify-center items-center pointer-events-none">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{freightText("Total Weight", transportMode)}</span>
                      <span className="text-xl font-extrabold text-[#2D3748] tracking-tight">
                        {formatNumber(tradeRouteData.reduce((s, r) => s + r.value, 0))}{freightText(" kg\n                      ", transportMode)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-3 overflow-y-auto h-full max-h-full">
                  {tradeRouteData.map((entry, idx) => {
                    const total = tradeRouteData.reduce((s, r) => s + r.value, 0);
                    const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={entry.name} className="flex items-center justify-between text-[14.5px] text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.isOthers ? "#718096" : PIE_COLORS[idx % PIE_COLORS.length] }} />
                          {entry.isOthers ? (
                            <span className="truncate font-bold text-slate-700 text-[17px]">Others</span>
                          ) : (
                            <div className="flex flex-col min-w-0 leading-normal">
                              <span className="truncate max-w-[400px] font-bold text-slate-800 text-[17px]" title={`${entry.originCity} → ${entry.destCity}`}>
                                {entry.originCity} → {entry.destCity}
                              </span>
                              <span className="truncate max-w-[400px] text-[12.5px] font-semibold text-slate-400" title={`${entry.originCountry} → ${entry.destCountry}`}>
                                {entry.originCountry} → {entry.destCountry}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="font-bold text-slate-800 shrink-0 text-right text-[17px] leading-normal">
                          <div>{formatNumber(entry.value)}{freightText(" kg", transportMode)}</div>
                          <div className="text-[12.5px] font-semibold text-slate-400">{pct}%</div>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Print Footer */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[12.5px] text-slate-400 shrink-0 mt-4">
                <span></span>
                <span>© 2026 Dart Global Logistics · Operational Performance — Trade Route Breakdown Page</span>
              </div>
            </div>
          </>
        ) : (
          /* Standard Page 1 */
          <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none">
            {/* Print Header */}
            <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
              {/* Top Row: Logo & Main Title (left) + Branch & Dest Badges (right) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                  <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
                </div>
                <div className="flex gap-1 justify-end items-center">
                  {destinationCountry && (
                    <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                      📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Row: Subtitle (left) and Date / Station (right) aligned baseline */}
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-[12.5px] font-semibold text-slate-400 leading-none">
                  Dart Global Logistics · {reportType === "monthly" ? "Monthly" : "Weekly"} Operational Performance Dashboard
                </p>
                <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                  {startDate} to {endDate} | Station: {getStationLabel()}
                </span>
              </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">Total Revenue</span>
                <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Revenue)}</h3>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">{freightText("Total Tonnage", transportMode)}</span>
                <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Tonnage)}{freightText(" kg", transportMode)}</h3>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">No of Shipments</span>
                <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Shipments)}</h3>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">No of Masters</span>
                <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Masters ?? kpi.Number_of_Masters ?? kpi.Weekly_Total_Masters ?? kpi.Unique_Masters)}</h3>
              </div>
            </div>

            {/* Expanded Charts Grid */}
            <div className="grid grid-cols-12 gap-6 my-4 flex-1 items-stretch">
              {/* Left: Weekly Revenue Trend Area Chart */}
              <div className="col-span-8 border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between h-[450px]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Revenue Flow & Trends (Weekly)</span>
                <div className="h-[390px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="printArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4299E1" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                      <XAxis dataKey="week_label" tick={{ fontSize: 14, fill: "#718096" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 14, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
                      <Area type="monotone" dataKey="Total_Revenue" stroke="#3182CE" strokeWidth={2} fill="url(#printArea)" dot={{ fill: "#3182CE", r: 3 }} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right: Airline wise Tonnage Chart */}
              <div className="col-span-4 border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between h-[450px]">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">{freightText("Airline Carrier Tonnage", transportMode)}</span>
                  {selectedAirlines.length > 0 && (
                    <Badge variant="outline" className="border-blue-200 text-blue-600 bg-blue-50/50 text-[9px] font-bold px-1 py-0.2 rounded shrink-0">
                      Selection Active
                    </Badge>
                  )}
                </div>
                <div className="h-[390px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={airlineWiseData}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={true} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 14, fill: "#A0AEC0" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => isSea ? formatNumber(v) : `${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 14, fill: "#4A5568", fontWeight: 600 }}
                        axisLine={{ stroke: "#E2E8F0" }}
                        tickLine={false}
                        width={120}
                      />
                      <Bar dataKey="tonnage" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
                        {airlineWiseData.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.isSelected || selectedAirlines.length === 0 ? "#3182CE" : "#CBD5E0"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Print Footer */}
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[12.5px] text-slate-400">
              <span></span>
              <span>© 2026 Dart Global Logistics · Visual Summary Page</span>
            </div>
          </div>
        )
      )}

      {/* ── SECTION 3: MONTHLY VISUAL DASHBOARD / Trade Route Performance Summary (Page 3) ── */}
      {selectedSections.monthlyVisual && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none">

          {/* Print Header */}
          <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
            {/* Top Row: Logo & Main Title (left) + Branch & Dest Badges (right) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
              </div>
              <div className="flex gap-1 justify-end items-center">
                {destinationCountry && (
                  <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                    📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Row: Subtitle (left) and Date / Station (right) aligned baseline */}
            <div className="flex items-baseline justify-between mt-1">
              <p className="text-[12.5px] font-semibold text-slate-400 leading-none">
                Dart Global Logistics · {mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Strategic Analysis & Contribution Dashboard"}
              </p>
              <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                {mode === "custom-sql" ? (getSqlDateRange() || `${startDate} to ${endDate}`) : `${startDate} to ${endDate}`} | Station: {getStationLabel()}
              </span>
            </div>
          </div>

          {mode === "custom-sql" ? (
            /* Custom SQL Mode: Render Trade Route Performance Summary — Top 10 Table */
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex-1 mt-4">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#F1F5F9]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Trade Route Performance Summary — Top 10</span>
                <span className="text-[12.5px] text-slate-400 font-bold">Top 10 Routes</span>
              </div>
              <div>
                <table className="w-full text-left text-[14.5px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[12.5px] tracking-wider bg-slate-50/50">
                      <th className="px-3 py-1.5 w-8">#</th>
                      <th className="px-3 py-1.5">Origin Country</th>
                      <th className="px-3 py-1.5">Origin City</th>
                      <th className="px-3 py-1.5">Destination Country</th>
                      <th className="px-3 py-1.5">Destination City</th>
                      <th className="px-3 py-1.5 text-right">{freightText("Tonnage (kg)", transportMode)}</th>
                      <th className="px-3 py-1.5 text-right">No of Masters</th>
                      <th className="px-3 py-1.5 text-right">Shipments</th>
                      <th className="px-3 py-1.5 text-right">Shipment Revenue (USD)</th>
                      {/* <th className="px-3 py-1.5 text-right">Shipment Cost</th> */}
                      {/* <th className="px-3 py-1.5 text-right">Gross Profit (USD)</th> */}
                      {/* <th className="px-3 py-1.5 text-right">GP Margin</th> */}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {(() => {
                      // Aggregate raw rows by Origin Country + Dest Country + Origin City + Dest City
                      const routeMap: {
                        [key: string]: {
                          originCountry: string; destCountry: string;
                          originCity: string; destCity: string;
                          tonnage: number; revenue: number; cost: number; shipments: number;
                          mastersSet: Set<string>;
                          numericMasters: number;
                        }
                      } = {};

                      data.forEach((r: any) => {
                        const originCountry = r.Origin_Country ?? r.ConLoadPortCountryName ?? r.origin_country ?? "—";
                        const destCountry = r.Destination_Country ?? r.DestCountry ?? r.dest_country ?? "—";
                        const originCity = r.Origin_City ?? r.OriginCity ?? r.origin_city ?? "—";
                        const destCity = r.Destination_City ?? r.DestCity ?? r.dest_city ?? "—";
                        const key = `${originCountry}||${destCountry}||${originCity}||${destCity}`;
                        if (!routeMap[key]) {
                          routeMap[key] = {
                            originCountry, destCountry, originCity, destCity,
                            tonnage: 0, revenue: 0, cost: 0, shipments: 0,
                            mastersSet: new Set<string>(), numericMasters: 0
                          };
                        }
                        const tonnage = Number(r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.Total_Tonnage ?? r.tonnage ?? 0);
                        const revenue = Number(r.Revenue_USD ?? r.Total_Revenue ?? r.revenue ?? 0);
                        const cost = Number(r.Cost_USD ?? r.Total_Cost ?? r.cost ?? 0);
                        const shipments = Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);

                        const masterId = r.Console_Number ?? r.ConsoleNumber ?? r.Master_Airway_Bill ?? r.MasterBillNum ?? r.Console_No;
                        const numericMasterVal = Number(r.Number_of_Masters ?? r.Total_Masters ?? 0);

                        routeMap[key].tonnage += tonnage;
                        routeMap[key].revenue += revenue;
                        routeMap[key].cost += cost;
                        routeMap[key].shipments += shipments;
                        if (masterId !== undefined && masterId !== null && String(masterId).trim() !== "") {
                          routeMap[key].mastersSet.add(String(masterId).trim());
                        } else if (numericMasterVal > 0) {
                          routeMap[key].numericMasters += numericMasterVal;
                        } else {
                          routeMap[key].numericMasters += 1;
                        }
                      });

                      const sorted = Object.values(routeMap).sort((a, b) => b.tonnage - a.tonnage);
                      const top10 = sorted.slice(0, 10);
                      const others = sorted.slice(10);
                      const othersRow = others.length > 0 ? {
                        originCountry: `Others (${others.length} routes)`,
                        destCountry: "—", originCity: "—", destCity: "—",
                        tonnage: others.reduce((s, r) => s + r.tonnage, 0),
                        revenue: others.reduce((s, r) => s + r.revenue, 0),
                        cost: others.reduce((s, r) => s + r.cost, 0),
                        shipments: others.reduce((s, r) => s + r.shipments, 0),
                        mastersSet: others.reduce((accSet, o) => {
                          o.mastersSet.forEach((m) => accSet.add(m));
                          return accSet;
                        }, new Set<string>()),
                        numericMasters: others.reduce((s, r) => s + r.numericMasters, 0),
                      } : null;

                      const rows = othersRow ? [...top10, othersRow] : top10;

                      const grandMastersSet = new Set<string>();
                      let grandNumericMasters = 0;
                      rows.forEach((r: any) => {
                        if (r.mastersSet && r.mastersSet.size > 0) {
                          r.mastersSet.forEach((m: string) => grandMastersSet.add(m));
                        } else {
                          grandNumericMasters += (r.numericMasters || 0);
                        }
                      });

                      const grandTotal = {
                        tonnage: rows.reduce((s, r) => s + r.tonnage, 0),
                        revenue: rows.reduce((s, r) => s + r.revenue, 0),
                        cost: rows.reduce((s, r) => s + r.cost, 0),
                        shipments: rows.reduce((s, r) => s + r.shipments, 0),
                        masters: grandMastersSet.size > 0 ? grandMastersSet.size : grandNumericMasters,
                      };

                      const ROUTE_COLORS = ["#319795", "#4299E1", "#805AD5", "#D69E2E", "#E53E3E", "#38A169", "#DD6B20", "#3182CE", "#744210", "#2B6CB0"];

                      // Dynamically map each unique origin country to a single color
                      const countryColorsMap: { [country: string]: string } = {};
                      let nextColorIdx = 0;
                      const getCountryColor = (country: string): string => {
                        if (country.startsWith("Others")) return "#718096";
                        if (!countryColorsMap[country]) {
                          countryColorsMap[country] = ROUTE_COLORS[nextColorIdx % ROUTE_COLORS.length];
                          nextColorIdx++;
                        }
                        return countryColorsMap[country];
                      };

                      const DEST_BG_CLASSES = [
                        "bg-[#EBF8FF]/50", // Light Blue
                        "bg-[#F0FDF4]/50", // Light Green
                        "bg-[#FEF3C7]/40", // Light Amber
                        "bg-[#FAF5FF]/50", // Light Purple
                        "bg-[#FFF1F2]/50", // Light Rose
                        "bg-[#F0FDFA]/50", // Light Teal
                        "bg-[#EEF2FF]/50", // Light Indigo
                        "bg-[#FFFAF0]/50", // Light Orange
                        "bg-[#ECFEFF]/50", // Light Cyan
                        "bg-[#FDF2F8]/50", // Light Pink
                      ];

                      const destBgColorsMap: { [country: string]: string } = {};
                      let nextDestColorIdx = 0;
                      const getDestBgColorClass = (country: string): string => {
                        if (country === "—" || country.startsWith("Others") || !country) return "";
                        if (!destBgColorsMap[country]) {
                          destBgColorsMap[country] = DEST_BG_CLASSES[nextDestColorIdx % DEST_BG_CLASSES.length];
                          nextDestColorIdx++;
                        }
                        return destBgColorsMap[country];
                      };

                      if (rows.length === 0) {
                        return (
                          <tr>
                            <td colSpan={11} className="text-center py-6 text-slate-400">No trade route aggregate data available.</td>
                          </tr>
                        );
                      }

                      return (
                        <>
                          {rows.map((row, i) => {
                            const isOthers = row.originCountry.startsWith("Others");
                            const color = getCountryColor(row.originCountry);
                            const bgClass = isOthers ? "bg-slate-50/30 italic" : getDestBgColorClass(row.destCountry);

                            // Extract solid hex color from bgClass (e.g. "bg-[#EBF8FF]/50" -> "#EBF8FF")
                            const bgMatch = bgClass.match(/bg-\[([^\]]+)\]/);
                            const solidBgColor = bgMatch ? bgMatch[1].split('/')[0] : (bgClass.includes("bg-slate") ? "#F1F5F9" : "#CBD5E0");

                            const gpMargin = row.revenue > 0 ? ((row.revenue + row.cost) / row.revenue * 100) : 0;
                            const pct = grandTotal.tonnage > 0 ? (row.tonnage / grandTotal.tonnage * 100) : 0;
                            const rowMasters = row.mastersSet?.size > 0 ? row.mastersSet.size : row.numericMasters;
                            return (
                              <tr key={i} className={`hover:bg-slate-50/50 ${bgClass}`}>
                                <td className="px-3 py-1.5 text-center text-slate-400 font-bold tabular-nums">
                                  {isOthers ? "—" : (
                                    <div className="flex items-center justify-center">
                                      <span
                                        className="flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-extrabold text-slate-800 border border-slate-300 text-center leading-[18px] shrink-0"
                                        style={{ backgroundColor: solidBgColor }}
                                      >
                                        {i + 1}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`font-semibold ${isOthers ? "text-slate-500" : "text-slate-800"}`}>
                                      {row.originCountry}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-slate-600 font-medium">{row.originCity}</td>
                                <td className="px-3 py-1.5 text-slate-600 font-medium">{row.destCountry}</td>
                                <td className="px-3 py-1.5 text-slate-600 font-medium">{row.destCity}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-semibold text-[#319795]">{formatNumber(row.tonnage)}{freightText(" kg", transportMode)}</span>
                                    <div className="h-0.5 rounded-full bg-slate-100 w-10 overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{ width: `${pct}%`, backgroundColor: color }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-right text-slate-500 font-semibold tabular-nums">{formatNumber(rowMasters)}</td>
                                <td className="px-3 py-1.5 text-right text-slate-500 font-semibold tabular-nums">{formatNumber(row.shipments)}</td>
                                <td className="px-3 py-1.5 text-right font-semibold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                {/* <td className="px-3 py-1.5 text-right font-semibold text-slate-500 tabular-nums">{formatCurrency(row.cost)}</td> */}
                                {/* <td className="px-3 py-1.5 text-right font-semibold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td> */}
                                {/* <td className="px-3 py-1.5 text-right tabular-nums">
                                  <span className={`font-semibold text-[12.5px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                    {gpMargin.toFixed(1)}%
                                  </span>
                                </td> */}
                              </tr>
                            );
                          })}
                          {/* Grand Total Row */}
                          <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80 font-extrabold text-[13px]">
                            <td className="px-3 py-1.5 text-slate-500" colSpan={2}>TOTAL</td>
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5 text-right text-[#319795] tabular-nums">{formatNumber(grandTotal.tonnage)}{freightText(" kg", transportMode)}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.masters)}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                            {/* <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td> */}
                            {/* <td className="px-3 py-1.5 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td> */}
                            {/* <td className="px-3 py-1.5 text-right">
                              <span className="font-bold text-slate-600 text-[12.5px]">
                                {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                              </span>
                            </td> */}
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Standard Mode: Render original monthly visual charts */
            <>
              {/* KPI Cards Row */}
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">Total Revenue</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Revenue)}</h3>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">{freightText("Total Tonnage", transportMode)}</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Tonnage)}{freightText(" kg", transportMode)}</h3>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">No of Shipments</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Shipments)}</h3>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-center gap-1.5 h-[80px]">
                  <span className="text-[11.5px] uppercase tracking-wider font-extrabold text-slate-400">No of Masters</span>
                  <h3 className="text-2xl font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Masters ?? kpi.Number_of_Masters ?? kpi.Weekly_Total_Masters ?? kpi.Unique_Masters)}</h3>
                </div>
              </div>

              {/* Expanded Charts Grid */}
              <div className="grid grid-cols-12 gap-6 my-4 flex-1 items-stretch">

                {/* Left Column - Origin Contribution (Pie Chart) */}
                <div className="col-span-4 border border-slate-200 rounded-xl p-4 bg-white shadow-sm h-[450px] flex flex-col justify-between">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Origin Contribution</span>
                  <div className="relative h-[220px] flex items-center justify-center mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={doughnutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                          isAnimationActive={false}
                        >
                          {doughnutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.name === "Others" ? "#718096" : PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center flex flex-col justify-center items-center">
                      <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-widest">Share</span>
                      <span className="text-[9px] font-extrabold text-[#2D3748]">{formatCurrency(kpi.Total_Revenue).slice(0, 7)}</span>
                    </div>
                  </div>

                  <div className="space-y-1 mt-2 overflow-hidden flex-1">
                    {doughnutData.slice(0, 4).map((entry, idx) => (
                      <div key={entry.name} className="flex items-start justify-between text-[12px] text-slate-500 gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: entry.name === "Others" ? "#718096" : PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="font-semibold text-slate-700 leading-snug">{entry.name}</span>
                        </div>
                        <span className="font-bold text-slate-700 shrink-0 mt-0.5">{formatCurrency(entry.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column - Monthly Revenue Flow Area Chart */}
                <div className="col-span-8 border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between h-[450px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Revenue Flow & Trends (Monthly)</span>
                  <div className="h-[390px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="printAreaMonthly" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#319795" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                        <XAxis dataKey="month_label" tick={{ fontSize: 14, fill: "#718096" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                        <YAxis tick={{ fontSize: 14, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={50} />
                        <Area type="monotone" dataKey="Total_Revenue" stroke="#319795" strokeWidth={2} fill="url(#printAreaMonthly)" dot={{ fill: "#319795", r: 3 }} isAnimationActive={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Print Footer */}
          <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[9px] text-slate-400">
            <span></span>
            <span>© 2026 Dart Global Logistics · {mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Visual Summary"} Page</span>
          </div>
        </div>
      )}

      {/* ── SECTION 4: MONTHLY DETAILED FINANCIAL LEDGER / Detailed Raw Query Ledger (Page 4+, Dynamic Flow) ── */}
      {selectedSections.monthlyLedger && mode !== "custom-sql" && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] flex flex-col print:block justify-between shadow-lg print:shadow-none">

          <div className="flex flex-col print:block gap-6 flex-1">
            {/* Print Header */}
            <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
              {/* Top Row: Logo & Main Title (left) + Branch & Dest Badges (right) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                  <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
                </div>
                <div className="flex gap-1 justify-end items-center">
                  {destinationCountry && (
                    <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                      📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Row: Subtitle (left) and Date / Station (right) aligned baseline */}
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-[12.5px] font-semibold text-slate-400 leading-none">
                  Dart Global Logistics · {mode === "custom-sql" ? "Detailed Raw Query Ledger" : "Monthly Strategic Analysis & Contribution Ledger"}
                </p>
                <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                  {mode === "custom-sql" ? (getSqlDateRange() || `${startDate} to ${endDate}`) : `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                </span>
              </div>
            </div>

            {/* Monthly Summary Table / Detailed Raw Query Ledger */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex-1">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#F1F5F9]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                  {mode === "custom-sql" ? "Detailed Raw Query Ledger" : "Monthly Financial Ledger"}
                </span>
                <span className="text-[12.5px] text-slate-400 font-bold">
                  {mode === "custom-sql" ? `Query Result Records (${data.length})` : `All Monthly Records (${monthlyData.length})`}
                </span>
              </div>
              <div>
                <table className="w-full text-left text-[14.5px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[12.5px] tracking-wider bg-slate-50/55">
                      {mode === "custom-sql" ? (
                        data.length > 0 ? (
                          Object.keys(data[0]).filter(key => !isSea || !["Airline", "Total_Tonnage", "Total_Volume_M3", "Total_Revenue"].includes(key)).map((key) => (
                            <th key={key} className="px-3 py-1.5 first:rounded-l-md last:rounded-r-md">
                              {freightText(key.replace(/_/g, " "), transportMode)}
                            </th>
                          ))
                        ) : (
                          <th className="px-3 py-1.5">Custom SQL Columns</th>
                        )
                      ) : (
                        <>
                          <th className="px-3 py-1.5">Year</th>
                          <th className="px-3 py-1.5">Month</th>
                          <th className="px-3 py-1.5 text-right">Revenue (USD)</th>
                          <th className="px-3 py-1.5 text-right">{freightText("Tonnage", transportMode)}</th>
                          <th className="px-3 py-1.5 text-right">Shipments</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {mode === "custom-sql" ? (
                      data.slice(0, maxDataRows).map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          {Object.entries(row).filter(([key]) => !isSea || !["Airline", "Total_Tonnage", "Total_Volume_M3", "Total_Revenue"].includes(key)).map(([key, val]: any, cellIdx) => {
                            const isPrice = key.toLowerCase().includes("revenue") || key.toLowerCase().includes("cost") || key.toLowerCase().includes("profit") || key.toLowerCase().includes("amount") || key.toLowerCase().includes("usd");
                            const isWeight = key.toLowerCase().includes("tonnage") || key.toLowerCase().includes("weight");
                            const isNumeric = typeof val === "number";

                            let displayVal = val;
                            if (val == null) {
                              displayVal = "—";
                            } else if (isPrice && isNumeric) {
                              displayVal = formatCurrency(val);
                            } else if (isWeight && isNumeric) {
                              displayVal = `${formatNumber(val)} ${isSea ? "TEU" : "kg"}`;
                            } else if (isNumeric) {
                              displayVal = formatNumber(val);
                            }

                            return (
                              <td
                                key={cellIdx}
                                className={`px-3 py-1.5 text-slate-700 font-medium ${isNumeric ? "text-right tabular-nums" : ""
                                  } ${key.toLowerCase().includes("airline") || key.toLowerCase().includes("carrier") ? "font-bold text-slate-800" : ""}`}
                              >
                                {displayVal}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      monthlyData.slice(0, maxDataRows).map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-semibold text-slate-500">{row.Year}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800">{row.month_label ? row.month_label.split(" '")[0] : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-teal-600">
                            {row.Total_Revenue != null ? formatCurrency(row.Total_Revenue) : "$0"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700 font-semibold">
                            {row.Total_Tonnage != null ? freightText(`${formatNumber(row.Total_Tonnage)} ${isSea ? "TEU" : "kg"}`, transportMode) : freightText("0 kg", transportMode)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700 font-semibold">
                            {row.Total_Shipments != null ? formatNumber(row.Total_Shipments) : "0"}
                          </td>
                        </tr>
                      ))
                    )}
                    {data.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-6 text-slate-400">No records available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Print Footer */}
          <div className="border-t border-slate-200 pt-2 mt-4 flex items-center justify-between text-[12.5px] text-slate-400">
            <span></span>
            <span>© 2026 Dart Global Logistics · {mode === "custom-sql" ? "Detailed Raw Query Ledger" : "Monthly Ledger"} Page</span>
          </div>
        </div>
      )}

      {/* ── SECTION 5A: SECTOR TONNAGE DISTRIBUTION — CHART (Page at the end of the report) ── */}
      {selectedSections.sectorDistribution && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none">
          {/* Print Header */}
          <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
              </div>
              <div className="flex gap-1 justify-end items-center">
              </div>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <p className="text-[12.5px] font-semibold text-slate-400 leading-none">{freightText("\n                Dart Global Logistics · Sector-wise Carrier & Geographical Tonnage Performance — Chart\n              ", transportMode)}</p>
              <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
              </span>
            </div>
          </div>

          {/* Graphical Tonnage Contribution (Top half) */}
          <div className="flex flex-col gap-4 flex-1 overflow-hidden mt-4">
            {/* Top Chart Area */}
            <div data-geographical-chart="air" className="h-[480px] border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between shrink-0">
              <div className="border-b border-[#F1F5F9] pb-2 flex justify-between items-center shrink-0 mb-3">
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">{freightText("\n                  AIR EXPORTS - Geographical Tonnage Contribution (Tons vs Contribution %)\n                ", transportMode)}</span>
              </div>
              <div className="h-[410px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 30, right: 35, left: 15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: "#718096", fontWeight: 600 }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                    <YAxis yAxisId="left" domain={[0, sectorChartMaximum]} ticks={[0, 0.25, 0.5, 0.75, 1].map(share => share * sectorChartMaximum)} allowDataOverflow tick={{ fontSize: 11.5, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toLocaleString("en-US", {maximumFractionDigits: 3})} ${isSea ? "TEU" : "t"}`} width={75} />
                    <YAxis yAxisId="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} orientation="right" tick={{ fontSize: 11.5, fill: "#E53E3E" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={45} />
                    <Bar yAxisId="left" dataKey="tonnage" fill="#3182CE" radius={[4, 4, 0, 0]} barSize={40} name={freightText("Tonnage (Tons)", transportMode)} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="contribution" stroke="#E53E3E" strokeWidth={3} dot={{ fill: "#E53E3E", r: 4.5 }} activeDot={{ r: 6 }} name="Contribution %" isAnimationActive={false}>
                      <LabelList dataKey="contribution" position="top" formatter={(v: number) => `${v.toFixed(1)}%`} style={{ fontSize: 11, fill: "#E53E3E", fontWeight: 700 }} />
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Print Footer */}
          <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
            <span></span>
            <span>{freightText("© 2026 Dart Global Logistics · Sector-wise Carrier & Geographical Tonnage Performance — Chart Page", transportMode)}</span>
          </div>
        </div>
      )}

      {/* ── SECTION 5B: SECTOR TONNAGE DISTRIBUTION — DETAIL TABLE (Page at the end of the report) ── */}
      {selectedSections.sectorDistribution && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none">
          {/* Print Header */}
          <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
              </div>
              <div className="flex gap-1 justify-end items-center">
              </div>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <p className="text-[12.5px] font-semibold text-slate-400 leading-none">{freightText("\n                Dart Global Logistics · Sector-wise Carrier & Geographical Tonnage Performance — Detail Table\n              ", transportMode)}</p>
              <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
              </span>
            </div>
          </div>

          {/* Carrier Table Area */}
          <div className="flex flex-col gap-4 flex-1 overflow-hidden mt-4">
            {/* Table Container */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex-1 flex flex-col justify-between overflow-hidden">
              <div className="border-b border-[#F1F5F9] pb-2 flex justify-between items-center shrink-0 mb-2">
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">{freightText("\n                  TOP 20 AIR CARRIERS & Total Tonnage - Sector wise (Tons)\n                ", transportMode)}</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <table className="w-full text-left text-[10px] leading-tight border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-500 uppercase font-bold text-[9px] tracking-wider bg-slate-50/50">
                      <th rowSpan={2} className="px-1.5 py-1.5 first:rounded-l-md border-r border-[#E2E8F0] align-middle text-center">SL</th>
                      <th rowSpan={2} className="px-1.5 py-1.5 border-r border-[#E2E8F0] align-middle">CARRIER NAME</th>
                      <th colSpan={2} className="px-2 py-1 text-center bg-slate-100/80 border-b border-r border-[#E2E8F0] text-slate-700 font-extrabold">{freightText("TONNAGE (Tons)", transportMode)}</th>
                      <th colSpan={14} className="px-1 py-1 text-center text-slate-700 font-extrabold border-b border-[#E2E8F0]">{freightText("GEOGRAPHICAL SECTOR TONNAGE (Tons)", transportMode)}</th>
                    </tr>
                    <tr className="border-b border-[#E2E8F0] text-slate-500 uppercase font-bold text-[9px] tracking-wider bg-slate-50/50">
                      <th className="px-2 py-1 text-right bg-blue-50/40 text-blue-700 border-r border-[#E2E8F0]">EXP</th>
                      <th className="px-2 py-1 text-right bg-slate-100 font-extrabold text-slate-800 border-r border-[#E2E8F0]">TOTAL</th>
                      <th className="px-1 py-1 text-right">EUROPE</th>
                      <th className="px-1 py-1 text-right">USA</th>
                      <th className="px-1 py-1 text-right">NORTH AMERICA</th>
                      <th className="px-1 py-1 text-right">CENTRAL AMERICA</th>
                      <th className="px-1 py-1 text-right">SOUTH AMERICA</th>
                      <th className="px-1 py-1 text-right">MIDDLE EAST</th>
                      <th className="px-1 py-1 text-right">SOUTH EAST ASIA</th>
                      <th className="px-1 py-1 text-right">INDIA & SUB CONTINENT</th>
                      <th className="px-1 py-1 text-right">NORTHERN ASIA</th>
                      <th className="px-1 py-1 text-right">AFRICA</th>
                      <th className="px-1 py-1 text-right">SOUTH AFRICA</th>
                      <th className="px-1 py-1 text-right">AUSTRALIA</th>
                      <th className="px-1 py-1 text-right">PACIFIC</th>
                      <th className="px-1 py-1 text-right last:rounded-r-md">OTHERS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {tableRows.map((row: any, i: number) => {
                      const isTotal = row.isGrandTotal;
                      const isOthers = row.isOthersRow;
                      return (
                        <tr key={i} className={`${isTotal ? "font-extrabold bg-slate-100 border-t-2 border-slate-350 text-[11px]" : isOthers ? "font-bold bg-slate-50/50" : "hover:bg-slate-50/30 text-slate-700"}`}>
                          <td className="px-1.5 py-[3px] text-slate-400 font-semibold">{isTotal ? "" : isOthers ? "" : i + 1}</td>
                          <td className="px-1.5 py-[3px] font-bold whitespace-normal break-words" title={row.name}>{row.name}</td>
                          <td className={`px-2 py-[3px] text-right tabular-nums font-semibold text-blue-600 ${isTotal ? "bg-blue-100/50" : "bg-blue-50/20"}`}>{formatTonnage(row.exp)}</td>
                          <td className={`px-2 py-[3px] text-right tabular-nums font-black ${isTotal ? "bg-slate-200" : "bg-slate-100 text-slate-800"}`}>{formatTonnage(row.total)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.europe)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.usa)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.northAmericaOther)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.centralAmerica)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.southAmerica)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.middleEast)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.southEastAsia)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.indiaSubContinent)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.northernAsia)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.africa)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.southAfrica)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.australia)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.pacificIslands)}</td>
                          <td className="px-1 py-[3px] text-right tabular-nums">{formatTonnage(row.others)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Print Footer */}
          <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
            <span></span>
            <span>{freightText("© 2026 Dart Global Logistics · Sector-wise Carrier & Geographical Tonnage Performance — Detail Table Page", transportMode)}</span>
          </div>
        </div>
      )}


      {/* ── SECTION 2: WEEKLY DETAILED CARRIER LEDGER / Airline Performance Summary (Page 2+, Dynamic Flow) ── */}
      {selectedSections.weeklyLedger && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] flex flex-col print:block justify-between shadow-lg print:shadow-none">

          <div className="flex flex-col print:block gap-6 flex-1">
            {/* Print Header */}
            <div className="border-b-2 border-slate-200 pb-3 flex flex-col gap-1 shrink-0">
              {/* Top Row: Logo & Main Title (left) + Branch & Dest Badges (right) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                  <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight leading-none">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
                </div>
                <div className="flex gap-1 justify-end items-center">
                  {destinationCountry && (
                    <span className="text-[9px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded leading-none">
                      📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Row: Subtitle (left) and Date / Station (right) aligned baseline */}
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-[12.5px] font-semibold text-slate-400 leading-none">
                  Dart Global Logistics · {mode === "custom-sql" ? freightText("Airline Performance Summary — Top 10", transportMode) : "Weekly Carrier Metrics Detailed Ledger"}
                </p>
                <span className="text-slate-700 font-bold text-[12.5px] tabular-nums whitespace-nowrap leading-none">
                  {mode === "custom-sql" ? (getSqlDateRange() || `${startDate} to ${endDate}`) : `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                </span>
              </div>
            </div>

            {/* Carrier Metrics Table / Airline Performance Table */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex-1">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#F1F5F9]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                  {mode === "custom-sql" ? freightText("Airline Performance Summary — Top 10", transportMode) : "Weekly Carrier Ledger"}
                </span>
                <span className="text-[12.5px] text-slate-400 font-bold">
                  {mode === "custom-sql" ? freightText("Top 10 Airlines", transportMode) : `All Carrier Records (${data.length})`}
                </span>
              </div>
              <div>
                <table className="w-full text-left text-[12.5px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[9px] tracking-wider bg-slate-50/50">
                      {mode === "custom-sql" ? (
                        <>
                          <th className="px-3 py-1.5 w-8">#</th>
                          <th className="px-3 py-1.5">{freightText("Airline", transportMode)}</th>
                          <th className="px-3 py-1.5 text-right">{freightText("Tonnage (kg)", transportMode)}</th>
                          <th className="px-3 py-1.5 text-right">No of Masters</th>
                          <th className="px-3 py-1.5 text-right">Shipments</th>
                          <th className="px-3 py-1.5 text-right">Shipment Revenue (USD)</th>
                          {/* <th className="px-3 py-1.5 text-right">Shipment Cost (USD)</th> */}
                          {/* <th className="px-3 py-1.5 text-right">Gross Profit (USD)</th> */}
                          {/* <th className="px-3 py-1.5 text-right">GP Margin</th> */}
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-1.5">Branch</th>
                          <th className="px-3 py-1.5">{freightText("Airline Name", transportMode)}</th>
                          <th className="px-3 py-1.5">Origin</th>
                          <th className="px-3 py-1.5">Destination</th>
                          <th className="px-3 py-1.5 text-right">Revenue</th>
                          <th className="px-3 py-1.5 text-right">{freightText("Tonnage", transportMode)}</th>
                          <th className="px-3 py-1.5 text-right">Shipments</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {mode === "custom-sql" ? (
                      (() => {
                        // Aggregate raw rows by Airline and Route (using origin city → dest city)
                        const aggMap: {
                          [key: string]: {
                            airline: string;
                            tonnage: number;
                            revenue: number;
                            cost: number;
                            shipments: number;
                            mastersSet: Set<string>;
                            numericMasters: number;
                            routes: {
                              [routeKey: string]: {
                                originCity: string;
                                destCity: string;
                                tonnage: number;
                                revenue: number;
                                cost: number;
                                shipments: number;
                                mastersSet: Set<string>;
                                numericMasters: number;
                              };
                            };
                          }
                        } = {};

                        data.forEach((r: any) => {
                          const airline = r.Airline ?? r.AirlineName1 ?? r.carrier ?? "Unknown";
                          if (!aggMap[airline]) {
                            aggMap[airline] = { airline, tonnage: 0, revenue: 0, cost: 0, shipments: 0, mastersSet: new Set<string>(), numericMasters: 0, routes: {} };
                          }
                          const tonnage = Number(r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.Total_Tonnage ?? r.tonnage ?? 0);
                          const revenue = Number(r.Revenue_USD ?? r.Total_Revenue ?? r.revenue ?? 0);
                          const cost = Number(r.Cost_USD ?? r.Total_Cost ?? r.cost ?? 0);
                          const shipments = Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);

                          const masterId = r.Console_Number ?? r.ConsoleNumber ?? r.Master_Airway_Bill ?? r.MasterBillNum ?? r.Console_No;
                          const numericMasterVal = Number(r.Number_of_Masters ?? r.Total_Masters ?? 0);

                          aggMap[airline].tonnage += tonnage;
                          aggMap[airline].revenue += revenue;
                          aggMap[airline].cost += cost;
                          aggMap[airline].shipments += shipments;
                          if (masterId !== undefined && masterId !== null && String(masterId).trim() !== "") {
                            aggMap[airline].mastersSet.add(String(masterId).trim());
                          } else if (numericMasterVal > 0) {
                            aggMap[airline].numericMasters += numericMasterVal;
                          } else {
                            aggMap[airline].numericMasters += 1;
                          }

                          const originCity = r.Origin_City ?? r.OriginCity ?? r.origin_city ?? "—";
                          const destCity = r.Destination_City ?? r.DestCity ?? r.dest_city ?? "—";
                          const routeKey = `${originCity} → ${destCity}`;

                          if (!aggMap[airline].routes[routeKey]) {
                            aggMap[airline].routes[routeKey] = {
                              originCity,
                              destCity,
                              tonnage: 0,
                              revenue: 0,
                              cost: 0,
                              shipments: 0,
                              mastersSet: new Set<string>(),
                              numericMasters: 0
                            };
                          }
                          const rt = aggMap[airline].routes[routeKey];
                          rt.tonnage += tonnage;
                          rt.revenue += revenue;
                          rt.cost += cost;
                          rt.shipments += shipments;
                          if (masterId !== undefined && masterId !== null && String(masterId).trim() !== "") {
                            rt.mastersSet.add(String(masterId).trim());
                          } else if (numericMasterVal > 0) {
                            rt.numericMasters += numericMasterVal;
                          } else {
                            rt.numericMasters += 1;
                          }
                        });

                        const sorted = Object.values(aggMap).sort((a, b) => b.tonnage - a.tonnage);
                        const top10 = sorted.slice(0, 10);
                        const others = sorted.slice(10);
                        const othersRow = others.length > 0 ? {
                          airline: `Others (${others.length} airlines)`,
                          tonnage: others.reduce((s, r) => s + r.tonnage, 0),
                          revenue: others.reduce((s, r) => s + r.revenue, 0),
                          cost: others.reduce((s, r) => s + r.cost, 0),
                          shipments: others.reduce((s, r) => s + r.shipments, 0),
                          mastersSet: others.reduce((accSet, o) => {
                            o.mastersSet.forEach((m) => accSet.add(m));
                            return accSet;
                          }, new Set<string>()),
                          numericMasters: others.reduce((s, r) => s + r.numericMasters, 0),
                          routes: others.reduce((acc: any, o) => {
                            Object.values(o.routes || {}).forEach((rt: any) => {
                              const routeKey = `${rt.originCity} → ${rt.destCity}`;
                              if (!acc[routeKey]) {
                                acc[routeKey] = {
                                  ...rt,
                                  mastersSet: new Set<string>(rt.mastersSet),
                                };
                              } else {
                                acc[routeKey].tonnage += rt.tonnage;
                                acc[routeKey].revenue += rt.revenue;
                                acc[routeKey].cost += rt.cost;
                                acc[routeKey].shipments += rt.shipments;
                                rt.mastersSet.forEach((m: string) => acc[routeKey].mastersSet.add(m));
                                acc[routeKey].numericMasters += rt.numericMasters;
                              }
                            });
                            return acc;
                          }, {})
                        } : null;

                        const rows = othersRow ? [...top10, othersRow] : top10;

                        const grandMastersSet = new Set<string>();
                        let grandNumericMasters = 0;
                        rows.forEach((r: any) => {
                          if (r.mastersSet && r.mastersSet.size > 0) {
                            r.mastersSet.forEach((m: string) => grandMastersSet.add(m));
                          } else {
                            grandNumericMasters += (r.numericMasters || 0);
                          }
                        });

                        const grandTotal = {
                          tonnage: rows.reduce((s, r) => s + r.tonnage, 0),
                          revenue: rows.reduce((s, r) => s + r.revenue, 0),
                          cost: rows.reduce((s, r) => s + r.cost, 0),
                          shipments: rows.reduce((s, r) => s + r.shipments, 0),
                          masters: grandMastersSet.size > 0 ? grandMastersSet.size : grandNumericMasters,
                        };

                        if (rows.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="text-center py-6 text-slate-400">{freightText("No airline aggregate data available.", transportMode)}</td>
                            </tr>
                          );
                        }

                        return (
                          <>
                            {rows.map((row, i) => {
                              const isOthers = row.airline.startsWith("Others");
                              const gpMargin = row.revenue > 0 ? ((row.revenue + row.cost) / row.revenue * 100) : 0;
                              const pct = grandTotal.tonnage > 0 ? (row.tonnage / grandTotal.tonnage * 100) : 0;
                              const sortedRoutes = (Object.values(row.routes || {}) as any[]).sort((a, b) => b.tonnage - a.tonnage);
                              const rowMasters = row.mastersSet?.size > 0 ? row.mastersSet.size : row.numericMasters;

                              return (
                                <Fragment key={i}>
                                  <tr className={`hover:bg-slate-50/50 ${isOthers ? "bg-slate-50/30 italic" : ""}`}>
                                    <td className="px-3 py-1.5 text-slate-400 font-bold tabular-nums">
                                      {isOthers ? "—" : (
                                        <div className="flex items-center justify-center">
                                          <span
                                            className="flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-extrabold text-white text-center leading-[20px] shrink-0"
                                            style={{ backgroundColor: getAirlineColor(row.airline, i) }}
                                          >
                                            {i + 1}
                                          </span>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`font-bold ${isOthers ? "text-slate-500 italic" : "text-slate-800"}`}>
                                          {row.airline}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                      <div className="flex flex-col items-end gap-0.5">
                                        <span className="font-bold text-blue-600">{formatNumber(row.tonnage)}{freightText(" kg", transportMode)}</span>
                                        <div className="h-0.5 rounded-full bg-slate-100 w-10 overflow-hidden">
                                          <div
                                            className="h-full rounded-full"
                                            style={{ width: `${pct}%`, backgroundColor: getAirlineColor(row.airline, i) }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-slate-750 font-bold tabular-nums">{formatNumber(rowMasters)}</td>
                                    <td className="px-3 py-1.5 text-right text-slate-750 font-bold tabular-nums">{formatNumber(row.shipments)}</td>
                                    <td className="px-3 py-1.5 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                    {/* <td className="px-3 py-1.5 text-right font-bold text-slate-600 tabular-nums">{formatCurrency(row.cost)}</td> */}
                                    {/* <td className="px-3 py-1.5 text-right font-bold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td> */}
                                    {/* <td className="px-3 py-1.5 text-right tabular-nums">
                                      <span className={`font-bold text-[12.5px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                        {gpMargin.toFixed(1)}%
                                      </span>
                                    </td> */}
                                  </tr>
                                  {showRouteBreakdown && sortedRoutes.length > 0 && (
                                    sortedRoutes.map((route, rIdx) => {
                                      const routeGpMargin = route.revenue > 0 ? ((route.revenue + route.cost) / route.revenue * 100) : 0;
                                      const routeMasters = route.mastersSet?.size > 0 ? route.mastersSet.size : route.numericMasters;
                                      return (
                                        <tr key={`${i}-route-${rIdx}`} className="bg-[#EBF8FF]/50 text-slate-700 text-[12.5px] border-l-4 border-blue-300">
                                          <td className="px-3 py-1 text-center text-[11.5px] text-blue-400 font-bold"></td>
                                          <td className="px-3 py-1 pl-8">
                                            <span className="font-semibold text-slate-800">{route.originCity} → {route.destCity}</span>
                                          </td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-700 font-semibold">{formatNumber(route.tonnage)}{freightText(" kg", transportMode)}</td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-700 font-semibold">{formatNumber(routeMasters)}</td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-700 font-semibold">{formatNumber(route.shipments)}</td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-700 font-semibold">{formatCurrency(route.revenue)}</td>
                                          {/* <td className="px-3 py-1 text-right tabular-nums text-slate-700 font-semibold">{formatCurrency(route.cost)}</td> */}
                                          {/* <td className="px-3 py-1 text-right tabular-nums font-semibold text-slate-700">{formatCurrency(route.revenue + route.cost)}</td> */}
                                          {/* <td className="px-3 py-1 text-right tabular-nums">
                                            <span className="font-semibold text-slate-700">
                                              {routeGpMargin.toFixed(1)}%
                                            </span>
                                          </td> */}
                                        </tr>
                                      );
                                    })
                                  )}
                                </Fragment>
                              );
                            })}
                            {/* Grand Total Row */}
                            <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80 font-extrabold text-[13px]">
                              <td className="px-3 py-1.5 text-slate-500" colSpan={2}>TOTAL</td>
                              <td className="px-3 py-1.5 text-right text-blue-600 tabular-nums">{formatNumber(grandTotal.tonnage)}{freightText(" kg", transportMode)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.masters)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                              <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                              {/* <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td> */}
                              {/* <td className="px-3 py-1.5 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td> */}
                              {/* <td className="px-3 py-1.5 text-right">
                                <span className="font-bold text-slate-600 text-[12.5px]">
                                  {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                                </span>
                              </td> */}
                            </tr>
                          </>
                        );
                      })()
                    ) : (
                      data.slice(0, maxDataRows).map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-semibold text-slate-500">{row.Company_Code ?? "—"}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800 truncate max-w-[150px]">{row.Airline ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 font-semibold truncate max-w-[150px]">
                            {row.Origin_City ? `${row.Origin_City}, ` : ""}{row.Origin_Country ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-slate-600 font-semibold truncate max-w-[150px]">
                            {row.Destination_City ? `${row.Destination_City}, ` : ""}{row.Destination_Country ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold text-blue-600">
                            {row.Total_Revenue != null ? formatCurrency(row.Total_Revenue) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700 font-semibold">
                            {row.Total_Tonnage != null ? freightText(`${formatNumber(row.Total_Tonnage)} ${isSea ? "TEU" : "kg"}`, transportMode) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-700 font-semibold">
                            {row.Total_Shipments != null ? formatNumber(row.Total_Shipments) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                    {data.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-6 text-slate-400">No carrier ledger data available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Print Footer */}
          <div className="border-t border-slate-200 pt-2 mt-4 flex items-center justify-between text-[12.5px] text-slate-400">
            <span></span>
            <span>© 2026 Dart Global Logistics · {mode === "custom-sql" ? freightText("Airline Performance Summary — Top 10", transportMode) : "Carrier Ledger"} Page</span>
          </div>
        </div>
      )}

      </>}
    </div>
  );
}

export default function PrintView() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white p-12 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Preparing A4 Landscape Print View...</p>
      </div>
    }>
      <PrintViewContent />
    </Suspense>
  );
}
