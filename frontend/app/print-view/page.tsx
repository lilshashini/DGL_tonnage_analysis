"use client";

import { useState, useEffect, useCallback, Suspense, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { Plane, Globe, CheckSquare, Square, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// In production: frontend & backend share the same Cloud Run host → use relative URLs.
// In local dev: Next.js runs on :3000, backend on :8000 → use absolute localhost URL.
const API = process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? ""   // Empty string = relative URL (same host as the page)
    : "http://localhost:8000");


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

const PIE_COLORS = ["#4299E1", "#81E6D9", "#CBD5E0", "#5A67D8", "#ED64A6"];
const TEN_COLORS = ["#4299E1", "#319795", "#ED64A6", "#5A67D8", "#81E6D9", "#ED8936", "#ECC94B", "#48BB78", "#9F7AEA", "#CBD5E0"];

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
const parseWeeklyData = (rows: any[]) => {
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
      const date = new Date(etdVal);
      if (isNaN(date.getTime())) return;

      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      const weekStr = monday.toISOString().slice(0, 10);

      const tempDate = new Date(date.valueOf());
      tempDate.setHours(0, 0, 0, 0);
      tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
      const week1 = new Date(tempDate.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((tempDate.valueOf() - week1.valueOf()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);

      const key = weekStr;
      if (!weeklyMap[key]) {
        weeklyMap[key] = {
          Year: date.getFullYear(),
          Week: weekNum,
          Week_Start: weekStr,
          Total_Tonnage: 0,
          Total_Revenue: 0,
          Total_Shipments: 0,
          week_label: `W${weekNum} '${String(date.getFullYear()).slice(-2)}`,
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
const parseMonthlyData = (rows: any[]) => {
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
      const date = new Date(etdVal);
      if (isNaN(date.getTime())) return;
      const yr = date.getFullYear();
      const mo = date.getMonth() + 1;
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
  const startDate = searchParams?.get("start_date") || "2025-06-01";
  const endDate = searchParams?.get("end_date") || "2026-05-21";
  const country = searchParams?.get("country") || "";
  const airline = searchParams?.get("airline") || "";
  const companyCode = searchParams?.get("company_code") || "";
  const originCity = searchParams?.get("origin_city") || "";
  const destinationCountry = searchParams?.get("destination_country") || "";
  const destinationCity = searchParams?.get("destination_city") || "";
  const branch = searchParams?.get("branch") || "";
  const maxDataRows = parseInt(searchParams?.get("max_data_rows") || "100");
  const mode = searchParams?.get("mode") || "standard";

  const getSqlDateRange = () => {
    if (sqlQuery) {
      const startMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s*>\s*=\s*['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);
      const endMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s*<\s*=\s*['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);
      const betweenMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s+between\s+['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?\s+and\s+['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);

      const standardizeDate = (dStr: string) => dStr.replace(/[_/.]/g, '-');
      if (betweenMatch) {
        return `${standardizeDate(betweenMatch[1])} to ${standardizeDate(betweenMatch[2])}`;
      } else if (startMatch && endMatch) {
        return `${standardizeDate(startMatch[1])} to ${standardizeDate(endMatch[1])}`;
      }
    }

    if (data.length === 0) return "";
    const dates = data.map(r => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return null;
      const d = new Date(etdVal);
      return isNaN(d.getTime()) ? null : d;
    }).filter(Boolean) as Date[];
    if (dates.length === 0) return "";
    const minD = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${minD.getFullYear()}-${pad(minD.getMonth() + 1)}-${pad(minD.getDate())} to ${maxD.getFullYear()}-${pad(maxD.getMonth() + 1)}-${pad(maxD.getDate())}`;
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

  const getStationLabel = () => {
    if (branch) {
      const branchCodes = branch.split(",");
      const branchNames = branchCodes.map(code => {
        const trimmed = code.trim();
        const name = branchMap[trimmed] || trimmed;
        return name
          .replace("Dart Global Logistics", "DGL")
          .replace("DGL SUPPLY CHAIN SOLUTIONS", "DGL SCS")
          .replace(" (PVT) LTD", "")
          .replace(" PVT LTD", "")
          .replace(" LTD", "");
      });
      return branchNames.join(", ");
    }
    if (companyCode && country) {
      return `${country} (${companyCode})`;
    } else if (companyCode) {
      return companyCode === "OTHER" ? "Corporate / Other" : companyCode;
    } else if (country) {
      return country;
    }
    return "Global";
  };

  const [data, setData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [kpi, setKpi] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [showRouteBreakdown, setShowRouteBreakdown] = useState(searchParams?.get("show_route_breakdown") !== "false");

  // Section selection state - read from URL params or default to all true
  const [selectedSections, setSelectedSections] = useState({
    weeklyVisual: searchParams?.get("include_weekly_visual") !== "false",
    weeklyLedger: searchParams?.get("include_weekly_ledger") !== "false",
    monthlyVisual: searchParams?.get("include_monthly_visual") !== "false",
    monthlyLedger: searchParams?.get("include_monthly_ledger") !== "false",
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
    });
  };

  // Deselect all sections
  const deselectAllSections = () => {
    setSelectedSections({
      weeklyVisual: false,
      weeklyLedger: false,
      monthlyVisual: false,
      monthlyLedger: false,
    });
  };

  const fetchPrintData = useCallback(async () => {
    setLoading(true);
    try {
      const mode = searchParams?.get("mode");
      const queryId = searchParams?.get("query_id");
      let customSql = searchParams?.get("custom_sql");

      if (mode === "custom-sql") {
        if (queryId) {
          try {
            const cacheRes = await fetch(`${API}/api/get-cached-query/${queryId}`);
            const cacheData = await cacheRes.json();
            if (cacheRes.status === 200 && cacheData.status === "success") {
              customSql = cacheData.query;
            }
          } catch (e) {
            console.error("Failed to fetch cached custom query", e);
          }
        }

        if (customSql) {
          setSqlQuery(customSql);
          const res = await fetch(`${API}/api/custom-query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: customSql }),
          });
          const d = await res.json();
          if (res.status === 200 && d.status === "success") {
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

            setKpi({
              Total_Tonnage: totalTonnage,
              Total_Revenue: totalRevenue,
              Total_Cost: totalCost,
              Total_Profit: totalProfit,
              GP_Margin: gpMargin,
              Total_Shipments: totalShipments,
              Unique_Airlines: airlinesSet.size,
              Unique_Countries: countriesSet.size,
            });

            // Dynamic Date Groupings using same logic
            setWeeklyData(parseWeeklyData(records));
            setMonthlyData(parseMonthlyData(records));
          }
        }
      } else {
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
        if (country) params.append("country", country);
        if (airline) params.append("airline", airline);
        if (companyCode) params.append("company_code", companyCode);
        if (originCity) params.append("origin_city", originCity);
        if (destinationCountry) params.append("destination_country", destinationCountry);
        if (destinationCity) params.append("destination_city", destinationCity);
        if (branch) params.append("branch", branch);

        const [dataRes, weekRes, monthRes, kpiRes] = await Promise.all([
          fetch(`${API}/api/data?${params}`),
          fetch(`${API}/api/weekly?${params}`),
          fetch(`${API}/api/monthly?${params}`),
          fetch(`${API}/api/kpi?${params}`),
        ]);
        const [d, w, m, k] = await Promise.all([dataRes.json(), weekRes.json(), monthRes.json(), kpiRes.json()]);
        if (d.status === "success") setData(d.data);
        if (w.status === "success") setWeeklyData(w.data);
        if (m.status === "success") setMonthlyData(m.data);
        if (k.status === "success") setKpi(k.data);
      }
    } catch (e) {
      console.error("Failed to load print preview", e);
    }
    setLoading(false);
  }, [startDate, endDate, country, airline, companyCode, originCity, destinationCountry, destinationCity, branch, searchParams]);

  useEffect(() => {
    fetchPrintData();
  }, [fetchPrintData]);

  // Update selected sections when URL parameters change (from parent preview modal)
  useEffect(() => {
    setSelectedSections({
      weeklyVisual: searchParams?.get("include_weekly_visual") !== "false",
      weeklyLedger: searchParams?.get("include_weekly_ledger") !== "false",
      monthlyVisual: searchParams?.get("include_monthly_visual") !== "false",
      monthlyLedger: searchParams?.get("include_monthly_ledger") !== "false",
    });
    setShowRouteBreakdown(searchParams?.get("show_route_breakdown") !== "false");
  }, [searchParams?.get("include_weekly_visual"), searchParams?.get("include_weekly_ledger"), searchParams?.get("include_monthly_visual"), searchParams?.get("include_monthly_ledger"), searchParams?.get("show_route_breakdown")]);

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
      const date = new Date(etdVal);
      if (isNaN(date.getTime())) return;
      const td = new Date(date.valueOf());
      td.setHours(0, 0, 0, 0);
      td.setDate(td.getDate() + 3 - (td.getDay() + 6) % 7);
      const w1 = new Date(td.getFullYear(), 0, 4);
      const wn = 1 + Math.round(((td.valueOf() - w1.valueOf()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
      const yr = date.getFullYear();
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
      const date = new Date(etdVal);
      if (isNaN(date.getTime())) return;
      const td = new Date(date.valueOf());
      td.setHours(0, 0, 0, 0);
      td.setDate(td.getDate() + 3 - (td.getDay() + 6) % 7);
      const w1 = new Date(td.getFullYear(), 0, 4);
      const wn = 1 + Math.round(((td.valueOf() - w1.valueOf()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
      const yr = date.getFullYear();
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

  const weekStackLabels = (() => {
    const weekSet = new Map<string, string>();
    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = new Date(etdVal);
      if (isNaN(date.getTime())) return;
      const td = new Date(date.valueOf());
      td.setHours(0, 0, 0, 0);
      td.setDate(td.getDate() + 3 - (td.getDay() + 6) % 7);
      const w1 = new Date(td.getFullYear(), 0, 4);
      const wn = 1 + Math.round(((td.valueOf() - w1.valueOf()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
      const yr = date.getFullYear();
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
      const date = new Date(etdVal);
      if (isNaN(date.getTime())) return;
      const dateStr = date.toISOString().slice(0, 10);
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const label = `${dayNames[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;

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
      const endMatch = sqlQuery.match(/(?:[a-zA-Z0-9_]+\.)?(?:etd|etd_date)\s*<\s*=\s*['"]?(\d{4}[-/._]\d{2}[-/._]\d{2})['"]?/i);
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
        const d = new Date(etdVal);
        return isNaN(d.getTime()) ? null : d;
      }).filter(Boolean) as Date[];
      if (dates.length > 0) {
        const minD = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
        const pad = (n: number) => String(n).padStart(2, '0');
        startStr = `${minD.getFullYear()}-${pad(minD.getMonth() + 1)}-${pad(minD.getDate())}`;
        endStr = `${maxD.getFullYear()}-${pad(maxD.getMonth() + 1)}-${pad(maxD.getDate())}`;
      }
    }

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      const current = new Date(start);
      current.setHours(12, 0, 0, 0);
      const last = new Date(end);
      last.setHours(12, 0, 0, 0);

      // Limit range generation to a maximum of 31 days to prevent chart overflow
      let iterations = 0;
      while (current <= last && iterations < 31) {
        const dateStr = current.toISOString().slice(0, 10);
        if (!dayMap[dateStr]) {
          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const label = `${dayNames[current.getDay()]} ${current.getDate()}/${current.getMonth() + 1}`;
          dayMap[dateStr] = { date_label: label, sortKey: dateStr };
          topAirlines.forEach((airlineName) => {
            dayMap[dateStr][airlineName] = 0;
          });
          dayMap[dateStr]["Others"] = 0;
        }
        current.setDate(current.getDate() + 1);
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

  const dailyStackedAirlineData = getDailyStackedAirlineData();
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
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        fill="#2D3748"
        fontSize={6.5}
        fontWeight="bold"
        textAnchor="middle"
      >
        {formatNumber(row.total_tonnage)}
      </text>
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

  return (
    <div className="flex flex-col items-center bg-slate-150 py-4 gap-8 print:block print:p-0 print:gap-0 print:bg-transparent select-none">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          span.rounded-full {
            display: inline-block !important;
          }
          .print-page-container:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}} />
      {/* Hidden indicator for PDF capture readiness */}
      <div id="pdf-ready" style={{ display: 'none' }}>ready</div>

      {/* ── SECTIONS STATUS INDICATOR ── */}
      <div className="print:hidden w-full max-w-[1123px] bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow-sm p-3 mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs font-semibold text-blue-900">
              PDF Sections:
              <span className="ml-2">
                {selectedSections.weeklyVisual && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold mr-1 inline-block">{mode === "custom-sql" ? "Weekly Operational Performance" : "Weekly Charts"}</span>}
                {selectedSections.weeklyLedger && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold mr-1 inline-block">{mode === "custom-sql" ? "Airline Performance Summary — Top 10" : "Weekly Tables"}</span>}
                {selectedSections.monthlyVisual && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold mr-1 inline-block">{mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Charts"}</span>}
                {selectedSections.monthlyLedger && mode !== "custom-sql" && <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-[10px] font-bold mr-1 inline-block">Monthly Tables</span>}
              </span>
            </p>
          </div>
          <span className="text-[10px] font-bold text-blue-600 bg-white px-2.5 py-1 rounded-full border border-blue-200">
            {mode === "custom-sql"
              ? `${[selectedSections.weeklyVisual, selectedSections.weeklyLedger, selectedSections.monthlyVisual].filter(Boolean).length} / 3 Sections (${(selectedSections.weeklyVisual ? 3 : 0) +
              (selectedSections.weeklyLedger ? 1 : 0) +
              (selectedSections.monthlyVisual ? 1 : 0)
              } Pages)`
              : `${Object.values(selectedSections).filter(Boolean).length} / 4 Sections (${Object.values(selectedSections).filter(Boolean).length} Pages)`
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
                    {mode === "custom-sql" ? "Weekly Operational Performance" : "Weekly Dashboard"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mode === "custom-sql" ? "All 4 Visuals" : "Charts & KPIs"}
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
                    {mode === "custom-sql" ? "Airline Performance Summary — Top 10" : "Weekly Ledger"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mode === "custom-sql" ? "Airline details & metrics" : "Carrier details"}
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
                    {mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Dashboard"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mode === "custom-sql" ? "Route details & metrics" : "Trends & insights"}
                  </p>
                </div>
              </div>
            </button>

            {/* Section 4: Monthly Ledger */}
            {mode !== "custom-sql" && (
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
                    <p className="font-semibold text-sm text-slate-800">Monthly Ledger</p>
                    <p className="text-xs text-slate-500 mt-0.5">Financial summary</p>
                  </div>
                </div>
              </button>
            )}
          </div>

          {mode === "custom-sql" && (
            <div className="flex items-center gap-2 mt-2 pt-3 border-t border-slate-250/80">
              <input
                type="checkbox"
                id="show-route-breakdown"
                checked={showRouteBreakdown}
                onChange={(e) => setShowRouteBreakdown(e.target.checked)}
                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 cursor-pointer"
              />
              <label htmlFor="show-route-breakdown" className="text-xs font-semibold text-slate-600 cursor-pointer select-none">
                Include detailed Route Breakdowns (Origin Country → Destination Country) under each Airline row
              </label>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-md p-2 text-xs text-slate-600">
            <span className="font-semibold">Tip:</span> Deselect sections you don't need to reduce file size and printing time. Use Ctrl+P to print when ready.
          </div>
        </div>
      </div>

      {/* ── SECTION 1: WEEKLY VISUAL DASHBOARD (Page 1 & 2 for custom SQL, or Page 1 for Standard) ── */}
      {selectedSections.weeklyVisual && (
        mode === "custom-sql" ? (
          <>
            {/* PAGE 1: Operational Visuals - Airlines */}
            <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] h-[794px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none" style={{ pageBreakAfter: "always", breakAfter: "page" }}>
              {/* Print Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                  <div>
                    <h1 className="text-lg font-bold text-slate-800 tracking-tight">DGL Tonnage Analysis</h1>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Dart Global Logistics · Weekly Operational Performance — Airline Breakdown
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-black font-bold text-[11px] flex items-center gap-1">
                    📅 {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5 justify-end max-w-[500px]">
                    {companyCode && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        🏢 Entity: {companyCode}
                      </span>
                    )}
                    {branch && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        🏢 Branch: {branch}
                      </span>
                    )}
                    {destinationCountry && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* KPI Cards Row */}
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Revenue</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Revenue)}</h3>
                  <span className="text-[8px] text-blue-500 font-semibold">✓ Consol Revenue</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Cost</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Cost)}</h3>
                  <span className="text-[8px] text-rose-500 font-semibold">✗ Total Expenses</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Profit</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Profit)}</h3>
                  <span className="text-[8px] text-emerald-600 font-semibold">✓ Net Earnings</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Tonnage</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Tonnage)} kg</h3>
                  <span className="text-[8px] text-indigo-600 font-semibold">✈️ Active Weight</span>
                </div>
              </div>

              {/* Expanded Charts Grid */}
              <div className="grid grid-cols-12 gap-4 mt-4 h-[450px] flex-1">
                {/* Left: Top 10 Airlines Tonnage Share */}
                <div className="col-span-8 border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-1 shrink-0">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Top 10 Airlines Tonnage Share</span>
                    <span className="text-[7.5px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border">Day-by-Day Stack</span>
                  </div>
                  <div className="h-[250px] w-full mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={dailyStackedAirlineData}
                        margin={{ top: 5, right: 10, left: 4, bottom: dailyStackedAirlineData.length > 10 ? 15 : 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} horizontal={true} />
                        <XAxis
                          dataKey="date_label"
                          type="category"
                          tick={{ fontSize: 7, fill: "#4A5568", fontWeight: 650 }}
                          axisLine={{ stroke: "#E2E8F0" }}
                          tickLine={false}
                          interval={dailyStackedAirlineData.length > 14 ? Math.floor(dailyStackedAirlineData.length / 14) : 0}
                        />
                        <YAxis
                          type="number"
                          tick={{ fontSize: 7, fill: "#A0AEC0" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                          width={28}
                        />
                        {top10AirlinesNames.map((airlineName, idx) => (
                          <Bar
                            key={airlineName}
                            dataKey={airlineName}
                            stackId="airlines"
                            fill={getAirlineColor(airlineName, idx)}
                          />
                        ))}
                        <Bar
                          key="Others"
                          dataKey="Others"
                          stackId="airlines"
                          fill="#CBD5E0"
                        />
                        <Bar
                          key="total_tonnage_label"
                          dataKey="total_tonnage_label"
                          stackId="airlines"
                          fill="transparent"
                          label={<CustomLabel />}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legends Grid (2-column layout for 10 items) */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 pr-1 border-t border-slate-100 pt-1.5 shrink-0">
                    {top10Airlines.map((entry, idx) => {
                      const pct = totalTop10Tonnage > 0 ? ((entry.tonnage / totalTop10Tonnage) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={entry.name} className="flex items-center justify-between text-[7.5px] border-b border-slate-50 pb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getAirlineColor(entry.name, idx) }} />
                            <span className="font-semibold text-slate-700 truncate max-w-[110px]" title={entry.name}>
                              {entry.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 text-right">
                            <span className="font-bold text-[#2D3748] tabular-nums">{formatNumber(entry.tonnage)} kg</span>
                            <span className="text-slate-400 font-medium">({pct}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Airline Tonnage Share (Pie) */}
                <div className="col-span-4 border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-full">
                  <div className="border-b border-[#F1F5F9] pb-1 shrink-0">
                    <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Airline Tonnage Share</span>
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
                        >
                          {airlinePieData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.name === "Others" ? "#CBD5E0" : getAirlineColor(entry.name, index)} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center flex flex-col justify-center items-center pointer-events-none">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Total</span>
                      <span className="text-xs font-extrabold text-[#2D3748] tracking-tight">
                        {formatNumber(kpi.Total_Tonnage)} kg
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 mt-1 overflow-hidden flex-1">
                    {airlinePieData.map((entry: any, idx: number) => {
                      const pct = kpi.Total_Tonnage > 0 ? ((entry.value / kpi.Total_Tonnage) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={entry.name} className="flex items-center justify-between text-[8px] text-slate-500">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.name === "Others" ? "#CBD5E0" : getAirlineColor(entry.name, idx) }} />
                            <span className="truncate max-w-[85px] font-semibold">{entry.name}</span>
                          </div>
                          <span className="font-bold text-slate-700 shrink-0 text-[8px]">{formatNumber(entry.value)} kg ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Print Footer */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[8px] text-slate-400 shrink-0">
                <span>Generated via Headless Chromium PDF Print Engine</span>
                <span>© 2026 Dart Global Logistics · Operational Performance — Airline Breakdown Page</span>
              </div>
            </div>

            {/* PAGE 2: Operational Visuals - Airline Tonnage by Week Period */}
            <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] h-[794px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none" style={{ pageBreakAfter: "always", breakAfter: "page" }}>
              {/* Print Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                  <div>
                    <h1 className="text-lg font-bold text-slate-800 tracking-tight">DGL Tonnage Analysis</h1>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Dart Global Logistics · Weekly Operational Performance — Weekly Airline Trend
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-black font-bold text-[11px] flex items-center gap-1">
                    📅 {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5 justify-end max-w-[500px]">
                    {companyCode && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        🏢 Entity: {companyCode}
                      </span>
                    )}
                    {branch && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        🏢 Branch: {branch}
                      </span>
                    )}
                    {destinationCountry && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Weekly Trend Chart in Large Container */}
              <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between h-[540px] mt-4 flex-1">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-1.5 shrink-0">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Airline Tonnage by Week Period</span>
                  <span className="bg-indigo-50 text-indigo-700 text-[8px] px-2 py-0.5 rounded font-black uppercase shrink-0">
                    {airlineWeeklyStackData.length} Airlines
                  </span>
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
                        tick={{ fontSize: 8, fill: "#A0AEC0" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        dataKey="airline"
                        type="category"
                        tick={{ fontSize: 8, fill: "#4A5568", fontWeight: 600 }}
                        axisLine={{ stroke: "#E2E8F0" }}
                        tickLine={false}
                        width={150}
                      />
                      {weekStackLabels.map((wkLabel, wIdx) => (
                        <Bar
                          key={wkLabel}
                          dataKey={wkLabel}
                          stackId="awstack"
                          radius={wIdx === weekStackLabels.length - 1 ? [0, 3, 3, 0] : [0, 0, 0, 0]}
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
                      <div key={entry.name} className="flex items-center justify-between text-[7.5px] border-b border-slate-50 pb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getAirlineColor(entry.name, idx) }} />
                          <span className="font-semibold text-slate-700 truncate max-w-[110px]" title={entry.name}>
                            {entry.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 text-right">
                          <span className="font-bold text-[#2D3748] tabular-nums">{formatNumber(entry.tonnage)} kg</span>
                          <span className="text-slate-400 font-medium">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Print Footer */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[8px] text-slate-400 shrink-0 mt-4">
                <span>Generated via Headless Chromium PDF Print Engine</span>
                <span>© 2026 Dart Global Logistics · Operational Performance — Airline Tonnage by Week Period Page</span>
              </div>
            </div>

            {/* PAGE 3: Operational Visuals - Trade Routes */}
            <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] h-[794px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none" style={{ pageBreakAfter: "always", breakAfter: "page" }}>
              {/* Print Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                  <div>
                    <h1 className="text-lg font-bold text-slate-800 tracking-tight">DGL Tonnage Analysis</h1>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Dart Global Logistics · Weekly Operational Performance — Trade Route Breakdown
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-black font-bold text-[11px] flex items-center gap-1">
                    📅 {getSqlDateRange() || `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                  </span>
                  <div className="flex flex-wrap gap-1 mt-0.5 justify-end max-w-[500px]">
                    {companyCode && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        🏢 Entity: {companyCode}
                      </span>
                    )}
                    {branch && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        🏢 Branch: {branch}
                      </span>
                    )}
                    {destinationCountry && (
                      <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                        📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 3: Route Distribution Trade Routes by Tonnage (Top 5 + Others) */}
              <div className="border border-slate-200 rounded-xl p-6 bg-white shadow-sm flex flex-row items-center justify-between h-[540px] gap-12 mt-6 flex-1">
                <div className="flex flex-col justify-between h-full shrink-0 w-[350px]">
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-400">Trade Routes by Tonnage (Top 5 + Others)</span>
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
                        >
                          {tradeRouteData.map((entry, index) => (
                            <Cell key={`tr-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center flex flex-col justify-center items-center pointer-events-none">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Weight</span>
                      <span className="text-sm font-extrabold text-[#2D3748] tracking-tight">
                        {formatNumber(tradeRouteData.reduce((s, r) => s + r.value, 0))} kg
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-3 overflow-y-auto h-full max-h-full">
                  {tradeRouteData.map((entry, idx) => {
                    const total = tradeRouteData.reduce((s, r) => s + r.value, 0);
                    const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={entry.name} className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          {entry.isOthers ? (
                            <span className="truncate font-bold text-slate-700 text-sm">Others</span>
                          ) : (
                            <div className="flex flex-col min-w-0 leading-normal">
                              <span className="truncate max-w-[400px] font-bold text-slate-800 text-sm" title={`${entry.originCity} → ${entry.destCity}`}>
                                {entry.originCity} → {entry.destCity}
                              </span>
                              <span className="truncate max-w-[400px] text-[10px] font-semibold text-slate-400" title={`${entry.originCountry} → ${entry.destCountry}`}>
                                {entry.originCountry} → {entry.destCountry}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="font-bold text-slate-800 shrink-0 text-right text-sm leading-normal">
                          <div>{formatNumber(entry.value)} kg</div>
                          <div className="text-[10px] font-semibold text-slate-400">{pct}%</div>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Print Footer */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[8px] text-slate-400 shrink-0 mt-4">
                <span>Generated via Headless Chromium PDF Print Engine</span>
                <span>© 2026 Dart Global Logistics · Operational Performance — Trade Route Breakdown Page</span>
              </div>
            </div>
          </>
        ) : (
          /* Standard Page 1 */
          <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] h-[794px] overflow-hidden flex flex-col justify-between shadow-lg print:shadow-none" style={{ pageBreakAfter: "always", breakAfter: "page" }}>
            {/* Print Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                <div>
                  <h1 className="text-lg font-bold text-slate-800 tracking-tight">DGL Tonnage Analysis</h1>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Dart Global Logistics · Weekly Operational Performance Dashboard
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-black font-bold text-[11px] flex items-center gap-1">
                  📅 {startDate} to {endDate}
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5 justify-end max-w-[500px]">
                  {companyCode && (
                    <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                      🏢 Entity: {companyCode}
                    </span>
                  )}
                  {branch && (
                    <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                      🏢 Branch: {branch}
                    </span>
                  )}
                  {destinationCountry && (
                    <span className="text-[7px] uppercase font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded">
                      📍 To: {destinationCity ? `${destinationCity}, ` : ""}{destinationCountry}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Revenue</span>
                <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Revenue)}</h3>
                <span className="text-[8px] text-blue-500 font-semibold">✓ Consol Revenue</span>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Cost</span>
                <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Cost)}</h3>
                <span className="text-[8px] text-rose-500 font-semibold">✗ Total Expenses</span>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Profit</span>
                <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Profit)}</h3>
                <span className="text-[8px] text-emerald-600 font-semibold">✓ Net Earnings</span>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Tonnage</span>
                <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Tonnage)} kg</h3>
                <span className="text-[8px] text-indigo-600 font-semibold">✈️ Active Weight</span>
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
                      <XAxis dataKey="week_label" tick={{ fontSize: 8, fill: "#718096" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 8, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Area type="monotone" dataKey="Total_Revenue" stroke="#3182CE" strokeWidth={2} fill="url(#printArea)" dot={{ fill: "#3182CE", r: 3 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right: Airline wise Tonnage Chart */}
              <div className="col-span-4 border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col justify-between h-[450px]">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Airline Carrier Tonnage</span>
                  {selectedAirlines.length > 0 && (
                    <Badge variant="outline" className="border-blue-200 text-blue-600 bg-blue-50/50 text-[6px] font-bold px-1 py-0.2 rounded shrink-0">
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
                        tick={{ fontSize: 8, fill: "#A0AEC0" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 8, fill: "#4A5568", fontWeight: 600 }}
                        axisLine={{ stroke: "#E2E8F0" }}
                        tickLine={false}
                        width={70}
                      />
                      <Bar dataKey="tonnage" radius={[0, 4, 4, 0]} maxBarSize={14}>
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
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[8px] text-slate-400">
              <span>Generated via Headless Chromium PDF Print Engine</span>
              <span>© 2026 Dart Global Logistics · Visual Summary Page</span>
            </div>
          </div>
        )
      )}

      {/* ── SECTION 2: WEEKLY DETAILED CARRIER LEDGER / Airline Performance Summary (Page 2+, Dynamic Flow) ── */}
      {selectedSections.weeklyLedger && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] min-h-[794px] flex flex-col print:block justify-between shadow-lg print:shadow-none print:min-h-0" style={{ pageBreakAfter: "always", breakAfter: "page" }}>

          <div className="flex flex-col print:block gap-6 flex-1">
            {/* Print Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                <div>
                  <h1 className="text-lg font-bold text-slate-800 tracking-tight">DGL Tonnage Analysis</h1>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Dart Global Logistics · {mode === "custom-sql" ? "Airline Performance Summary — Top 10" : "Weekly Carrier Metrics Detailed Ledger"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-black font-bold text-[11px] flex items-center gap-1">
                  📅 {mode === "custom-sql" ? (getSqlDateRange() || `${startDate} to ${endDate}`) : `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                </span>
              </div>
            </div>

            {/* Carrier Metrics Table / Airline Performance Table */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex-1">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#F1F5F9]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                  {mode === "custom-sql" ? "Airline Performance Summary — Top 10" : "Weekly Carrier Ledger"}
                </span>
                <span className="text-[8px] text-slate-400 font-bold">
                  {mode === "custom-sql" ? "Top 10 Airlines + Others" : `All Carrier Records (${data.length})`}
                </span>
              </div>
              <div>
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[8px] tracking-wider bg-slate-50/50">
                      {mode === "custom-sql" ? (
                        <>
                          <th className="px-3 py-1.5 w-8">#</th>
                          <th className="px-3 py-1.5">Airline</th>
                          <th className="px-3 py-1.5 text-right">Tonnage (kg)</th>
                          <th className="px-3 py-1.5 text-right">Shipments</th>
                          <th className="px-3 py-1.5 text-right">Shipment Revenue (USD)</th>
                          <th className="px-3 py-1.5 text-right">Shipment Cost (USD)</th>
                          <th className="px-3 py-1.5 text-right">Gross Profit (USD)</th>
                          <th className="px-3 py-1.5 text-right">GP Margin</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-1.5">Branch</th>
                          <th className="px-3 py-1.5">Airline Name</th>
                          <th className="px-3 py-1.5">Origin</th>
                          <th className="px-3 py-1.5">Destination</th>
                          <th className="px-3 py-1.5 text-right">Revenue</th>
                          <th className="px-3 py-1.5 text-right">Tonnage</th>
                          <th className="px-3 py-1.5 text-right">Shipments</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {mode === "custom-sql" ? (
                      (() => {
                        // Aggregate raw rows by Airline and Route
                        const aggMap: {
                          [key: string]: {
                            airline: string;
                            tonnage: number;
                            revenue: number;
                            cost: number;
                            shipments: number;
                            routes: {
                              [routeKey: string]: {
                                originCountry: string;
                                destCountry: string;
                                tonnage: number;
                                revenue: number;
                                cost: number;
                                shipments: number;
                              };
                            };
                          }
                        } = {};

                        data.forEach((r: any) => {
                          const airline = r.Airline ?? r.AirlineName1 ?? r.carrier ?? "Unknown";
                          if (!aggMap[airline]) {
                            aggMap[airline] = { airline, tonnage: 0, revenue: 0, cost: 0, shipments: 0, routes: {} };
                          }
                          const tonnage = Number(r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.Total_Tonnage ?? r.tonnage ?? 0);
                          const revenue = Number(r.Revenue_USD ?? r.Total_Revenue ?? r.revenue ?? 0);
                          const cost = Number(r.Cost_USD ?? r.Total_Cost ?? r.cost ?? 0);
                          const shipments = Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);

                          aggMap[airline].tonnage += tonnage;
                          aggMap[airline].revenue += revenue;
                          aggMap[airline].cost += cost;
                          aggMap[airline].shipments += shipments;

                          const originCountry = r.Origin_Country ?? r.ConLoadPortCountryName ?? r.origin_country ?? "—";
                          const destCountry = r.Destination_Country ?? r.DestCountry ?? r.dest_country ?? "—";
                          const routeKey = `${originCountry} → ${destCountry}`;

                          if (!aggMap[airline].routes[routeKey]) {
                            aggMap[airline].routes[routeKey] = {
                              originCountry,
                              destCountry,
                              tonnage: 0,
                              revenue: 0,
                              cost: 0,
                              shipments: 0
                            };
                          }
                          const rt = aggMap[airline].routes[routeKey];
                          rt.tonnage += tonnage;
                          rt.revenue += revenue;
                          rt.cost += cost;
                          rt.shipments += shipments;
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
                          routes: others.reduce((acc: any, o) => {
                            Object.values(o.routes || {}).forEach((rt: any) => {
                              const routeKey = `${rt.originCountry} → ${rt.destCountry}`;
                              if (!acc[routeKey]) {
                                acc[routeKey] = { ...rt };
                              } else {
                                acc[routeKey].tonnage += rt.tonnage;
                                acc[routeKey].revenue += rt.revenue;
                                acc[routeKey].cost += rt.cost;
                                acc[routeKey].shipments += rt.shipments;
                              }
                            });
                            return acc;
                          }, {})
                        } : null;

                        const rows = othersRow ? [...top10, othersRow] : top10;
                        const grandTotal = {
                          tonnage: rows.reduce((s, r) => s + r.tonnage, 0),
                          revenue: rows.reduce((s, r) => s + r.revenue, 0),
                          cost: rows.reduce((s, r) => s + r.cost, 0),
                          shipments: rows.reduce((s, r) => s + r.shipments, 0),
                        };

                        if (rows.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="text-center py-6 text-slate-400">No airline aggregate data available.</td>
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
                              return (
                                <Fragment key={i}>
                                  <tr className={`hover:bg-slate-50/50 ${isOthers ? "bg-slate-50/30 italic" : ""}`}>
                                    <td className="px-3 py-1.5 text-slate-400 font-bold tabular-nums">
                                      {isOthers ? "—" : (
                                        <span
                                          className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-extrabold text-white"
                                          style={{ backgroundColor: getAirlineColor(row.airline, i) }}
                                        >
                                          {i + 1}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`font-semibold ${isOthers ? "text-slate-500 italic" : "text-slate-800"}`}>
                                          {row.airline}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                      <div className="flex flex-col items-end gap-0.5">
                                        <span className="font-bold text-blue-600">{formatNumber(row.tonnage)} kg</span>
                                        <div className="h-0.5 rounded-full bg-slate-100 w-10 overflow-hidden">
                                          <div
                                            className="h-full rounded-full"
                                            style={{ width: `${pct}%`, backgroundColor: getAirlineColor(row.airline, i) }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-slate-500 font-semibold tabular-nums">{formatNumber(row.shipments)}</td>
                                    <td className="px-3 py-1.5 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                    <td className="px-3 py-1.5 text-right font-semibold text-slate-500 tabular-nums">{formatCurrency(row.cost)}</td>
                                    <td className="px-3 py-1.5 text-right font-bold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                      <span className={`font-bold text-[8px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                        {gpMargin.toFixed(1)}%
                                      </span>
                                    </td>
                                  </tr>
                                  {showRouteBreakdown && sortedRoutes.length > 0 && (
                                    sortedRoutes.map((route, rIdx) => {
                                      const routeGpMargin = route.revenue > 0 ? ((route.revenue + route.cost) / route.revenue * 100) : 0;
                                      return (
                                        <tr key={`${i}-route-${rIdx}`} className="bg-[#EBF8FF]/50 text-slate-950 text-[8.5px] border-l-4 border-blue-300">
                                          <td className="px-3 py-1 text-center text-[8px] text-blue-400 font-bold"></td>
                                          <td className="px-3 py-1 pl-8">
                                            <span className="font-semibold text-slate-950">{route.originCountry} → {route.destCountry}</span>
                                          </td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-950 font-bold">{formatNumber(route.tonnage)} kg</td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-950 font-semibold">{formatNumber(route.shipments)}</td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-950 font-bold">{formatCurrency(route.revenue)}</td>
                                          <td className="px-3 py-1 text-right tabular-nums text-slate-950 font-semibold">{formatCurrency(route.cost)}</td>
                                          <td className="px-3 py-1 text-right tabular-nums font-extrabold text-slate-950">{formatCurrency(route.revenue + route.cost)}</td>
                                          <td className="px-3 py-1 text-right tabular-nums">
                                            <span className="font-extrabold text-slate-950">
                                              {routeGpMargin.toFixed(1)}%
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </Fragment>
                              );
                            })}
                            {/* Grand Total Row */}
                            <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80 font-extrabold text-[9px]">
                              <td className="px-3 py-1.5 text-slate-500" colSpan={2}>TOTAL</td>
                              <td className="px-3 py-1.5 text-right text-blue-600 tabular-nums">{formatNumber(grandTotal.tonnage)} kg</td>
                              <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                              <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td>
                              <td className="px-3 py-1.5 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td>
                              <td className="px-3 py-1.5 text-right">
                                <span className="font-bold text-slate-600 text-[8px]">
                                  {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                                </span>
                              </td>
                            </tr>
                          </>
                        );
                      })()
                    ) : (
                      data.slice(0, maxDataRows).map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-bold text-slate-500">{row.Company_Code ?? "—"}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800 truncate max-w-[150px]">{row.Airline ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-500 truncate max-w-[150px]">
                            {row.Origin_City ? `${row.Origin_City}, ` : ""}{row.Origin_Country ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500 truncate max-w-[150px]">
                            {row.Destination_City ? `${row.Destination_City}, ` : ""}{row.Destination_Country ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-blue-600">
                            {row.Total_Revenue != null ? formatCurrency(row.Total_Revenue) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600 font-semibold">
                            {row.Total_Tonnage != null ? `${formatNumber(row.Total_Tonnage)} kg` : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-400">
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
          <div className="border-t border-slate-200 pt-2 mt-4 flex items-center justify-between text-[8px] text-slate-400">
            <span>Generated via Headless Chromium PDF Print Engine</span>
            <span>© 2026 Dart Global Logistics · {mode === "custom-sql" ? "Airline Performance Summary — Top 10" : "Carrier Ledger"} Page</span>
          </div>
        </div>
      )}

      {/* ── SECTION 3: MONTHLY VISUAL DASHBOARD / Trade Route Performance Summary (Page 3) ── */}
      {selectedSections.monthlyVisual && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] min-h-[794px] flex flex-col print:block justify-between shadow-lg print:shadow-none print:min-h-0" style={{ pageBreakAfter: "always", breakAfter: "page" }}>

          {/* Print Header */}
          <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
            <div className="flex items-center gap-2.5">
              <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
              <div>
                <h1 className="text-lg font-bold text-slate-800 tracking-tight">DGL Tonnage Analysis</h1>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Dart Global Logistics · {mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Strategic Analysis & Contribution Dashboard"}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-black font-bold text-[11px] flex items-center gap-1">
                📅 {mode === "custom-sql" ? (getSqlDateRange() || `${startDate} to ${endDate}`) : `${startDate} to ${endDate}`} | Station: {getStationLabel()}
              </span>
            </div>
          </div>

          {mode === "custom-sql" ? (
            /* Custom SQL Mode: Render Trade Route Performance Summary — Top 10 Table */
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex-1 mt-4">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#F1F5F9]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Trade Route Performance Summary — Top 10</span>
                <span className="text-[8px] text-slate-400 font-bold">Top 10 Routes + Others</span>
              </div>
              <div>
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[8px] tracking-wider bg-slate-50/50">
                      <th className="px-3 py-1.5 w-8">#</th>
                      <th className="px-3 py-1.5">Origin Country</th>
                      <th className="px-3 py-1.5">Origin City</th>
                      <th className="px-3 py-1.5">Destination Country</th>
                      <th className="px-3 py-1.5">Destination City</th>
                      <th className="px-3 py-1.5 text-right">Tonnage (kg)</th>
                      <th className="px-3 py-1.5 text-right">Shipments</th>
                      <th className="px-3 py-1.5 text-right">Shipment Revenue (USD)</th>
                      <th className="px-3 py-1.5 text-right">Shipment Cost</th>
                      <th className="px-3 py-1.5 text-right">Gross Profit (USD)</th>
                      <th className="px-3 py-1.5 text-right">GP Margin</th>
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
                        }
                      } = {};

                      data.forEach((r: any) => {
                        const originCountry = r.Origin_Country ?? r.ConLoadPortCountryName ?? r.origin_country ?? "—";
                        const destCountry = r.Destination_Country ?? r.DestCountry ?? r.dest_country ?? "—";
                        const originCity = r.Origin_City ?? r.OriginCity ?? r.origin_city ?? "—";
                        const destCity = r.Destination_City ?? r.DestCity ?? r.dest_city ?? "—";
                        const key = `${originCountry}||${destCountry}||${originCity}||${destCity}`;
                        if (!routeMap[key]) {
                          routeMap[key] = { originCountry, destCountry, originCity, destCity, tonnage: 0, revenue: 0, cost: 0, shipments: 0 };
                        }
                        routeMap[key].tonnage += Number(r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.Total_Tonnage ?? r.tonnage ?? 0);
                        routeMap[key].revenue += Number(r.Revenue_USD ?? r.Total_Revenue ?? r.revenue ?? 0);
                        routeMap[key].cost += Number(r.Cost_USD ?? r.Total_Cost ?? r.cost ?? 0);
                        routeMap[key].shipments += Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);
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
                      } : null;

                      const rows = othersRow ? [...top10, othersRow] : top10;
                      const grandTotal = {
                        tonnage: rows.reduce((s, r) => s + r.tonnage, 0),
                        revenue: rows.reduce((s, r) => s + r.revenue, 0),
                        cost: rows.reduce((s, r) => s + r.cost, 0),
                        shipments: rows.reduce((s, r) => s + r.shipments, 0),
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
                            return (
                              <tr key={i} className={`hover:bg-slate-50/50 ${bgClass}`}>
                                <td className="px-3 py-1.5 text-slate-400 font-bold tabular-nums">
                                  {isOthers ? "—" : (
                                    <span
                                      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-extrabold text-slate-800 border border-slate-300"
                                      style={{ backgroundColor: solidBgColor }}
                                    >
                                      {i + 1}
                                    </span>
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
                                    <span className="font-bold text-[#319795]">{formatNumber(row.tonnage)} kg</span>
                                    <div className="h-0.5 rounded-full bg-slate-100 w-10 overflow-hidden">
                                      <div
                                        className="h-full rounded-full"
                                        style={{ width: `${pct}%`, backgroundColor: color }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-right text-slate-500 font-semibold tabular-nums">{formatNumber(row.shipments)}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                <td className="px-3 py-1.5 text-right font-semibold text-slate-500 tabular-nums">{formatCurrency(row.cost)}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  <span className={`font-bold text-[8px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                    {gpMargin.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                          {/* Grand Total Row */}
                          <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80 font-extrabold text-[9px]">
                            <td className="px-3 py-1.5 text-slate-500" colSpan={2}>TOTAL</td>
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5" />
                            <td className="px-3 py-1.5 text-right text-[#319795] tabular-nums">{formatNumber(grandTotal.tonnage)} kg</td>
                            <td className="px-3 py-1.5 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                            <td className="px-3 py-1.5 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td>
                            <td className="px-3 py-1.5 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <span className="font-bold text-slate-600 text-[8px]">
                                {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                              </span>
                            </td>
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
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Revenue</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Revenue)}</h3>
                  <span className="text-[8px] text-blue-500 font-semibold">✓ Consol Revenue</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Cost</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Cost)}</h3>
                  <span className="text-[8px] text-rose-500 font-semibold">✗ Total Expenses</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Profit</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatCurrency(kpi.Total_Profit)}</h3>
                  <span className="text-[8px] text-emerald-600 font-semibold">✓ Net Earnings</span>
                </div>
                <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col justify-between h-[72px]">
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Total Tonnage</span>
                  <h3 className="text-lg font-extrabold text-slate-800 leading-none">{formatNumber(kpi.Total_Tonnage)} kg</h3>
                  <span className="text-[8px] text-indigo-600 font-semibold">✈️ Active Weight</span>
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
                        >
                          {doughnutData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center flex flex-col justify-center items-center">
                      <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Share</span>
                      <span className="text-[9px] font-extrabold text-[#2D3748]">{formatCurrency(kpi.Total_Revenue).slice(0, 7)}</span>
                    </div>
                  </div>

                  <div className="space-y-1 mt-2 overflow-hidden flex-1">
                    {doughnutData.slice(0, 4).map((entry, idx) => (
                      <div key={entry.name} className="flex items-center justify-between text-[9px] text-slate-500">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="truncate max-w-[90px] font-semibold">{entry.name}</span>
                        </div>
                        <span className="font-bold text-slate-700">{formatCurrency(entry.value)}</span>
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
                        <XAxis dataKey="month_label" tick={{ fontSize: 8, fill: "#718096" }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                        <YAxis tick={{ fontSize: 8, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Area type="monotone" dataKey="Total_Revenue" stroke="#319795" strokeWidth={2} fill="url(#printAreaMonthly)" dot={{ fill: "#319795", r: 3 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Print Footer */}
          <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[8px] text-slate-400">
            <span>Generated via Headless Chromium PDF Print Engine</span>
            <span>© 2026 Dart Global Logistics · {mode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Visual Summary"} Page</span>
          </div>
        </div>
      )}

      {/* ── SECTION 4: MONTHLY DETAILED FINANCIAL LEDGER / Detailed Raw Query Ledger (Page 4+, Dynamic Flow) ── */}
      {selectedSections.monthlyLedger && mode !== "custom-sql" && (
        <div className="print-page-container bg-white text-slate-900 p-8 w-[1123px] min-h-[794px] flex flex-col print:block justify-between shadow-lg print:shadow-none print:min-h-0">

          <div className="flex flex-col print:block gap-6 flex-1">
            {/* Print Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                <div>
                  <h1 className="text-lg font-bold text-slate-800 tracking-tight">DGL Tonnage Analysis</h1>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Dart Global Logistics · {mode === "custom-sql" ? "Detailed Raw Query Ledger" : "Monthly Strategic Analysis & Contribution Ledger"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-black font-bold text-[11px] flex items-center gap-1">
                  📅 {mode === "custom-sql" ? (getSqlDateRange() || `${startDate} to ${endDate}`) : `${startDate} to ${endDate}`} | Station: {getStationLabel()}
                </span>
              </div>
            </div>

            {/* Monthly Summary Table / Detailed Raw Query Ledger */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex-1">
              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#F1F5F9]">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">
                  {mode === "custom-sql" ? "Detailed Raw Query Ledger" : "Monthly Financial Ledger"}
                </span>
                <span className="text-[8px] text-slate-400 font-bold">
                  {mode === "custom-sql" ? `Query Result Records (${data.length})` : `All Monthly Records (${monthlyData.length})`}
                </span>
              </div>
              <div>
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[8px] tracking-wider bg-slate-50/55">
                      {mode === "custom-sql" ? (
                        data.length > 0 ? (
                          Object.keys(data[0]).map((key) => (
                            <th key={key} className="px-3 py-1.5 first:rounded-l-md last:rounded-r-md">
                              {key.replace(/_/g, " ")}
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
                          <th className="px-3 py-1.5 text-right">Tonnage</th>
                          <th className="px-3 py-1.5 text-right">Shipments</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {mode === "custom-sql" ? (
                      data.slice(0, maxDataRows).map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          {Object.entries(row).map(([key, val]: any, cellIdx) => {
                            const isPrice = key.toLowerCase().includes("revenue") || key.toLowerCase().includes("cost") || key.toLowerCase().includes("profit") || key.toLowerCase().includes("amount") || key.toLowerCase().includes("usd");
                            const isWeight = key.toLowerCase().includes("tonnage") || key.toLowerCase().includes("weight");
                            const isNumeric = typeof val === "number";

                            let displayVal = val;
                            if (val == null) {
                              displayVal = "—";
                            } else if (isPrice && isNumeric) {
                              displayVal = formatCurrency(val);
                            } else if (isWeight && isNumeric) {
                              displayVal = `${formatNumber(val)} kg`;
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
                          <td className="px-3 py-1.5 font-bold text-slate-500">{row.Year}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800">{row.month_label ? row.month_label.split(" '")[0] : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-bold text-teal-600">
                            {row.Total_Revenue != null ? formatCurrency(row.Total_Revenue) : "$0"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600 font-semibold">
                            {row.Total_Tonnage != null ? `${formatNumber(row.Total_Tonnage)} kg` : "0 kg"}
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-400">
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
          <div className="border-t border-slate-200 pt-2 mt-4 flex items-center justify-between text-[8px] text-slate-400">
            <span>Generated via Headless Chromium PDF Print Engine</span>
            <span>© 2026 Dart Global Logistics · {mode === "custom-sql" ? "Detailed Raw Query Ledger" : "Monthly Ledger"} Page</span>
          </div>
        </div>
      )}

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
