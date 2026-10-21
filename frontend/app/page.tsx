"use client";

import { freightEtdDate, freightIsoWeek, freightDayParts } from "@/lib/operational-date";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Line, LabelList, ComposedChart
} from "recharts";
import {
  Calendar, Globe, Plane, RefreshCw, Send, X, ArrowUpRight, ArrowDownRight, Layers, FileText, Printer, CheckCircle,
  Users, Check, ChevronDown, Plus, Settings, Eye, Info, LayoutDashboard, BarChart2, ShieldCheck,
  Mail, Clock, UserCheck, Trash2, Bell, Database, Lock, ChevronRight, Play, AlertTriangle, AlertCircle,
  Building2, MapPin, Search, Sparkles, SlidersHorizontal, Filter, PlusCircle, CheckSquare, SendHorizontal, AtSign, Zap, CheckCheck,
  PanelLeftClose, PanelLeftOpen
} from "lucide-react";

import { Ship, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createClient } from "@supabase/supabase-js";
import { TONNAGE_USERS_TABLE } from "@/lib/tonnage-tables";
import { classifyRecipientLocations } from "@/lib/recipient-locations";
import { buildRecipientGroups, recipientAssignmentCodes, updateRecipientAssignment } from "@/lib/recipient-assignments";
import { resolveScheduleScope } from "@/lib/schedule-scope";

import { TransportMode, freightText, buildFreightQuery, formatFreightQuantity } from "@/lib/freight";
import { SeaConsolReport } from "@/components/sea-consol-report";
import { ReportRecipientPicker, ReportRecipient, isReportEmail } from "@/components/report-recipient-picker";
import { getApiBaseUrl } from "@/lib/api";

// In production / Cloud Run / Playwright container: frontend & backend share the same host/port → use relative URLs ("").
// In local development: Next.js dev server runs on :3000/:3001/:3002, backend on :8000 → use absolute localhost URL.
const API = getApiBaseUrl();

// Both freight workspaces use the same authenticated session.
let sharedAuthClient: ReturnType<typeof createClient> | null = null;


// Formatting helpers matching the clean image style
// Formatting helpers matching the clean image style
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

const cleanCountryName = (countryStr?: string): string => {
  if (!countryStr) return "";
  const res = countryStr
    .replace(/^[A-Z]{2}\s*[-–:]?\s*/, "")
    .replace(/^(LK|IN|VN|BD|PK|US)\s+/i, "")
    .trim();
  if (res.toLowerCase().replace(/\s+/g, "") === "vietnam") {
    return "Viet Nam";
  }
  return res;
};

// Customized Pie Chart Colors matching user's image
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

interface StationInfo {
  code: string;
  country: string;
  name: string;
  envVar: string;
  matchCountries: string[];
  isCustom?: boolean;
}

interface BranchInfo {
  code: string;
  name: string;
  city?: string;
  company_code?: string;
  country?: string;
  isCustom?: boolean;
}

const DEFAULT_STATIONS: StationInfo[] = [
  { code: "CMB", country: "Sri Lanka", name: "Colombo (Sri Lanka)", envVar: "RECIPIENTS_CMB", matchCountries: ["sri lanka", "colombo"] },
  { code: "IND", country: "India", name: "India (National)", envVar: "RECIPIENTS_IND", matchCountries: ["india"] },
  { code: "VNM", country: "Viet Nam", name: "Viet Nam", envVar: "RECIPIENTS_VNM", matchCountries: ["viet nam", "vietnam", "hanoi", "hcm"] },
  { code: "DAC", country: "Bangladesh", name: "Bangladesh", envVar: "RECIPIENTS_DAC", matchCountries: ["bangladesh", "dhaka"] },
  { code: "PKI", country: "Pakistan", name: "Pakistan", envVar: "RECIPIENTS_PKI", matchCountries: ["pakistan", "karachi", "lahore"] },
  { code: "NYC", country: "United States", name: "United States (NYC)", envVar: "RECIPIENTS_NYC", matchCountries: ["united states", "usa", "us", "new york", "nyc"] },
];

const STATIONS: StationInfo[] = DEFAULT_STATIONS;

const DEFAULT_BRANCH_OPTIONS: BranchInfo[] = [
  { code: "BLR", name: "Bengaluru (BLR)", city: "Bengaluru" },
  { code: "MAA", name: "Chennai (MAA)", city: "Chennai" },
  { code: "HYD", name: "Hyderabad (HYD)", city: "Hyderabad" },
  { code: "AMD", name: "Ahmedabad (AMD)", city: "Ahmedabad" },
  { code: "BOM", name: "Mumbai (BOM)", city: "Mumbai" },
  { code: "PNQ", name: "Pune (PNQ)", city: "Pune" },
  { code: "DEL", name: "Delhi (DEL)", city: "Delhi" },
  { code: "CCU", name: "Kolkata (CCU)", city: "Kolkata" },
  { code: "COK", name: "Cochin (COK)", city: "Cochin" },
];

const getStationForUser = (user: any, activeStations: StationInfo[] = DEFAULT_STATIONS) => {
  const userCountry = (user.country || "").toLowerCase().trim();
  const userOffice = (user.officeLocation || "").toLowerCase().trim();
  const userEmail = (user.email || "").toLowerCase().trim();

  // Try country first
  for (const station of activeStations) {
    if (station.matchCountries && station.matchCountries.some(c => userCountry.includes(c))) {
      return station.code;
    }
  }

  // Try officeLocation
  for (const station of activeStations) {
    if ((station.matchCountries && station.matchCountries.some(c => userOffice.includes(c))) || userOffice.includes(station.code.toLowerCase())) {
      return station.code;
    }
  }

  // Fallbacks for cities or codes in officeLocation/email
  if (userOffice.includes("colombo") || userOffice.includes("cmb") || userEmail.includes("cmb")) return "CMB";
  if (userOffice.includes("india") || userOffice.includes("ind") || userEmail.includes("ind")) return "IND";
  if (userOffice.includes("vietnam") || userOffice.includes("viet nam") || userOffice.includes("hanoi") || userOffice.includes("hcm") || userOffice.includes("vnm") || userEmail.includes("vnm")) return "VNM";
  if (userOffice.includes("bangladesh") || userOffice.includes("dhaka") || userOffice.includes("dac") || userEmail.includes("dac")) return "DAC";
  if (userOffice.includes("pakistan") || userOffice.includes("karachi") || userOffice.includes("lahore") || userOffice.includes("pki") || userEmail.includes("pki")) return "PKI";
  if (userOffice.includes("usa") || userOffice.includes("new york") || userOffice.includes("nyc") || userEmail.includes("nyc") || userEmail.includes(".us")) return "NYC";

  return "OTHER";
};

// Helper for readable day ordinals (1st, 2nd, 8th, etc.)
const getOrdinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const getMonthlyDayOptionLabel = (day: number): string => {
  const ord = getOrdinal(day);
  if (day === 1) {
    return `${ord} of every month — Monthly Report (Whole previous month 1st–30th/31st)`;
  }
  if (day === 8) {
    return `${ord} of every month — Weekly Report (1st–7th cumulative daily data: 7 days)`;
  }
  if (day === 15) {
    return `${ord} of every month — Weekly Report (1st–14th cumulative daily data: 14 days)`;
  }
  if (day === 22) {
    return `${ord} of every month — Weekly Report (1st–21st cumulative daily data: 21 days)`;
  }
  if (day === 2) {
    return `${ord} of every month — Weekly Report (1st day data)`;
  }
  return `${ord} of every month — Weekly Report (1st–${getOrdinal(day - 1)} cumulative daily data)`;
};




// Premium Multi-Select Dropdown Component
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
  isObject = false,
  wrapOptions = false,
  emoji = "🔍",
  widthClass = "min-w-[150px]"
}: {
  label: string;
  options: any[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
  isObject?: boolean;
  wrapOptions?: boolean;
  emoji?: string;
  widthClass?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.multiselect-${label.replace(/\s+/g, "")}`)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [label]);

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((x) => x !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (isObject) {
      onChange(options.map((o) => o.code));
    } else {
      onChange(options);
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const getDisplayText = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === options.length) return `All ${label}s`;
    return `${selected.length} Selected`;
  };

  return (
    <div className={`relative flex flex-col gap-1 w-full ${widthClass} multiselect-${label.replace(/\s+/g, "")}`}>
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 w-full bg-white border border-[#E2E8F0] hover:border-[#CBD5E0] px-3 text-xs text-slate-700 rounded-md flex items-center justify-between transition-all shadow-sm"
      >
        <span className="truncate mr-1 font-medium flex items-center gap-1.5">
          <span className="text-slate-400 shrink-0">{emoji}</span>
          <span className="truncate text-slate-700">{getDisplayText()}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white border border-[#CBD5E0] rounded-lg shadow-xl z-50 p-2 text-slate-805 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between px-2 py-1 mb-1.5 border-b border-slate-100 pb-1">
            <button
              onClick={handleSelectAll}
              className="text-[10px] text-[#3182CE] hover:text-[#2B6CB0] font-bold uppercase tracking-wider"
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              className="text-[10px] text-slate-400 hover:text-slate-600 font-bold uppercase tracking-wider"
            >
              Clear All
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
            {options.map((opt) => {
              const code = isObject ? opt.code : opt;
              const name = isObject ? opt.name : opt;
              const isChecked = selected.includes(code);
              return (
                <div
                  key={code}
                  onClick={() => handleToggle(code)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${isChecked ? "bg-[#EBF8FF] text-[#2B6CB0] font-semibold" : "hover:bg-slate-50 text-slate-700"
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => { }}
                    className="w-3.5 h-3.5 shrink-0 rounded border-slate-300 text-[#3182CE] focus:ring-[#3182CE] pointer-events-none"
                  />
                  <span className={wrapOptions ? "min-w-0 whitespace-normal [overflow-wrap:anywhere]" : "truncate"}>
                    {isObject ? `${code} - ${name.replace("Dart Global Logistics", "DGL").replace("DGL SUPPLY CHAIN SOLUTIONS", "DGL SCS")}` : name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


function FreightDashboard({ transportMode, onModeChange }: { transportMode: TransportMode; onModeChange: (mode: TransportMode) => void }) {
  const isSea = transportMode === "SEA";
  const sectorDivisor = isSea ? 1 : 1000;
  const formatNumber = (value: number | null | undefined) => formatFreightQuantity(value, transportMode);
  const formatTonnage = (val: number | null | undefined) => {
    if (val == null || val === 0) return "-";
    return val.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  };
  // Sidebar active section
  const [activeSection, setActiveSection] = useState<"dashboard" | "weekly-reports" | "monthly-reports" | "admin" | "email-scheduling" | "users">("dashboard");

  // Sidebar collapse/expand state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dgl_sidebar_collapsed");
      if (saved !== null) {
        setIsSidebarCollapsed(saved === "true");
      }
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem("dgl_sidebar_collapsed", String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  };

  // --- AUTH GATE STATES ---
  const [supabase, setSupabase] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdminVerified, setIsAdminVerified] = useState(false);

  useEffect(() => {
    // Helper to boot the Supabase client with given credentials
    const bootSupabase = (url: string, key: string) => {
      const client = sharedAuthClient || (sharedAuthClient = createClient(url, key));
      setSupabase(client);

      client.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        if (session) {
          checkAdminWhitelist(client, session.user.email);
        } else {
          setAuthLoading(false);
        }
      });

      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        if (session) {
          checkAdminWhitelist(client, session.user.email);
        } else {
          setIsAdminVerified(false);
          setAuthLoading(false);
        }
      });

      return () => subscription.unsubscribe();
    };

    // Try to fetch config from FastAPI backend first (production path)
    fetch(`${API}/api/config`)
      .then((res) => res.json())
      .then(({ supabaseUrl, supabaseAnonKey, schedulerTimezone }) => {
        if (schedulerTimezone) setSchedulerTimezone(schedulerTimezone);
        if (supabaseUrl && supabaseAnonKey) {
          bootSupabase(supabaseUrl, supabaseAnonKey);
        } else {
          // Backend returned empty — fall back to build-time env vars (local dev)
          const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          if (envUrl && envKey) {
            bootSupabase(envUrl, envKey);
          } else {
            setAuthLoading(false);
          }
        }
      })
      .catch((err) => {
        console.warn("Could not reach /api/config, falling back to env vars:", err);
        // Backend unreachable — use env vars directly (local dev fallback)
        const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (envUrl && envKey) {
          bootSupabase(envUrl, envKey);
        } else {
          setAuthLoading(false);
        }
      });
  }, []);

  const checkAdminWhitelist = async (client: any, email: string) => {
    if (!client) return;
    setAuthLoading(true);
    try {
      const { data, error } = await client
        .from("allowed_admins")
        .select("email")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        console.error("Error checking whitelist:", error);
        setIsAdminVerified(false);
      } else if (data) {
        setIsAdminVerified(true);
      } else {
        setIsAdminVerified(false);
      }
    } catch (err) {
      console.error("Whitelist check failed:", err);
      setIsAdminVerified(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      alert("Supabase client is not initialized. Please configure your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local first.");
      return;
    }
    setLoginError("");
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput,
        password: passwordInput,
      });
      if (error) {
        setLoginError(error.message);
        setAuthLoading(false);
      } else {
        // The onAuthStateChange listener will automatically detect the session,
        // verify the email in allowed_admins, and set authLoading to false.
      }
    } catch (err: any) {
      setLoginError(err.message || "An unexpected error occurred.");
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setIsAdminVerified(false);
    setEmailInput("");
    setPasswordInput("");
    setLoginError("");
  };

  const getAuthHeaders = async () => {
    if (!supabase) {
      return {
        "Content-Type": "application/json",
        "Authorization": "",
      };
    }
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      "Authorization": session ? `Bearer ${session.access_token}` : "",
    };
  };

  // Derived dashboardMode from active section
  const dashboardMode = (activeSection === "weekly-reports" || activeSection === "monthly-reports") ? "custom-sql" : "standard";

  // Dynamic default weekly date range (previous complete Monday - Sunday)
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

  const defaultDateRange = getDefaultDateRange();

  // Filter States
  const [startDate, setStartDate] = useState(defaultDateRange.start);
  const [endDate, setEndDate] = useState(defaultDateRange.end);

  // Multi-Select filter selections
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedOriginCities, setSelectedOriginCities] = useState<string[]>([]);
  const [selectedDestCountries, setSelectedDestCountries] = useState<string[]>([]);
  const [selectedDestCities, setSelectedDestCities] = useState<string[]>([]);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [expandedAirlines, setExpandedAirlines] = useState<Record<string, boolean>>({});

  // Dropdown option lists
  const [countries, setCountries] = useState<string[]>([]);
  const [airlines, setAirlines] = useState<string[]>([]);
  const [companyCodes, setCompanyCodes] = useState<{ code: string, name: string }[]>([]);
  const [branches, setBranches] = useState<{ code: string, name: string }[]>([]);
  const [originCities, setOriginCities] = useState<string[]>([]);
  const [destinationCountries, setDestinationCountries] = useState<string[]>([]);
  const [destinationCities, setDestinationCities] = useState<string[]>([]);

  // Multiple Recipient States
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [sqlReportRecipients, setSqlReportRecipients] = useState<Partial<Record<"weekly" | "monthly", string[]>>>({});
  const [lastExecutedSql, setLastExecutedSql] = useState<Partial<Record<"weekly" | "monthly", string>>>({});
  const sqlReportKey = activeSection === "weekly-reports" ? "weekly" : "monthly";
  const activeRecipients = dashboardMode === "custom-sql" ? sqlReportRecipients[sqlReportKey] ?? [] : selectedEmails;
  const [availableEmails, setAvailableEmails] = useState<string[]>([]);
  const [customEmailInput, setCustomEmailInput] = useState("");
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);

  // Modal preview state
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [cachedQueryId, setCachedQueryId] = useState<string | null>(null);
  const previewGeneration = useRef(0);
  const previewCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {if (previewCloseTimer.current) clearTimeout(previewCloseTimer.current);}, []);

  const openPdfPreview = async () => {
    previewGeneration.current += 1;
    if (previewCloseTimer.current) clearTimeout(previewCloseTimer.current);
    if (dashboardMode === "custom-sql") {
      setLoading(true);
      try {
        const activeSql = activeSection === "weekly-reports" ? weeklySqlText : monthlySqlText;
        const res = await fetch(`${API}/api/cache-query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: activeSql, transport_mode: transportMode }),
        });
        const d = await res.json();
        if (d.status === "success" && d.query_id) {
          setCachedQueryId(d.query_id);
        }
      } catch (err) {
        console.error("Failed to cache query for preview", err);
      } finally {
        setLoading(false);
      }
    }
    setShowPdfPreview(true);
  };

  // Load candidate recipients from API
  const fetchRecipients = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/recipients`);
      const d = await res.json();
      if (d.status === "success") {
        setAvailableEmails(d.data);
        // Default select the first email if nothing is selected yet
        if (d.data.length > 0) {
          setSelectedEmails((prev) => prev.length === 0 ? [d.data[0]] : prev);
          setSqlReportRecipients(prev => ({weekly: prev.weekly ?? [d.data[0]], monthly: prev.monthly ?? [d.data[0]]}));
        }
      }
    } catch (e) {
      console.error("Recipients fetch failed", e);
    }
  }, []);

  useEffect(() => { fetchRecipients(); }, [fetchRecipients]);

  const DUMMY_EMAILS = [
    "management@dartglobal.com",
    "ops@dartglobal.com",
    "sales@dartglobal.com",
    "admin@dartglobal.com",
    "test@dartglobal.com",
    "demo@dartglobal.com",
    "dummy@dartglobal.com",
    "user@dartglobal.com",
  ];

  // --- DB USERS FROM SUPABASE ---
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [dbUsersLoading, setDbUsersLoading] = useState(false);
  const [sqlRecipientUsers, setSqlRecipientUsers] = useState<ReportRecipient[]>([]);
  const [sqlRecipientUsersLoading, setSqlRecipientUsersLoading] = useState(false);
  const [sqlRecipientUsersError, setSqlRecipientUsersError] = useState("");

  const fetchSqlRecipientUsers = useCallback(async (client: any) => {
    setSqlRecipientUsersLoading(true);
    setSqlRecipientUsersError("");
    try {
      const {data, error} = await client.from(TONNAGE_USERS_TABLE).select("email, display_name, is_air, is_sea").order("display_name");
      if (error) throw error;
      setSqlRecipientUsers((data || []).map((user: any) => ({
        email: user.email,
        name: user.display_name || user.email,
        is_air: user.is_air ?? true,
        is_sea: user.is_sea ?? false,
      })));
    } catch {
      setSqlRecipientUsersError("Saved users could not be loaded. You can still enter an email address.");
    } finally {
      setSqlRecipientUsersLoading(false);
    }
  }, []);

  const fetchDbUsers = useCallback(async (client?: any) => {
    const supabaseClient = client || supabase;
    if (!supabaseClient) return;
    setDbUsersLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from(TONNAGE_USERS_TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching db users:", error);
      } else {
        const cleanUsers = (data || []).filter(
          (u: any) => !DUMMY_EMAILS.includes((u.email || "").toLowerCase().trim())
        ).map((u: any) => ({
          ...u,
          is_air: u.is_air ?? true,
          is_sea: u.is_sea ?? false,
        }));
        setDbUsers(cleanUsers);
      }
    } catch (err) {
      console.error("Failed to fetch db users:", err);
    } finally {
      setDbUsersLoading(false);
    }
  }, [supabase]);

  // --- SYSTEM USERS & RECIPIENTS STATE & HANDLERS ---
  const [dbUserFreightFilter, setDbUserFreightFilter] = useState<"ALL" | "AIR" | "SEA">("ALL");
  const [isAddRecipientModalOpen, setIsAddRecipientModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<any | null>(null);
  const [recipientFormEmail, setRecipientFormEmail] = useState("");
  const [recipientFormName, setRecipientFormName] = useState("");
  const [recipientFormStation, setRecipientFormStation] = useState("Global");
  const [recipientFormIsAir, setRecipientFormIsAir] = useState(true);
  const [recipientFormIsSea, setRecipientFormIsSea] = useState(false);
  const [recipientFormLoading, setRecipientFormLoading] = useState(false);
  const [recipientFormError, setRecipientFormError] = useState("");

  const handleToggleFreightMode = async (userId: string, mode: "is_air" | "is_sea", currentValue: boolean) => {
    if (!supabase) return;
    const nextVal = !currentValue;
    setDbUsers(prev => prev.map(u => u.id === userId ? { ...u, [mode]: nextVal } : u));
    try {
      const { error } = await supabase
        .from(TONNAGE_USERS_TABLE)
        .update({ [mode]: nextVal })
        .eq("id", userId);
      if (error) throw error;
    } catch (err: any) {
      console.error("Failed to update user freight mode:", err);
      setDbUsers(prev => prev.map(u => u.id === userId ? { ...u, [mode]: currentValue } : u));
      alert(`Failed to update mode: ${err.message || "Unknown error"}`);
    }
  };

  const handleOpenAddRecipient = (initialStation?: string) => {
    setEditingRecipient(null);
    setRecipientFormEmail("");
    setRecipientFormName("");
    setRecipientFormStation(initialStation || "Global");
    setRecipientFormIsAir(transportMode === "AIR");
    setRecipientFormIsSea(transportMode === "SEA");
    setRecipientFormError("");
    setIsAddRecipientModalOpen(true);
  };

  const handleOpenEditRecipient = (u: any) => {
    setEditingRecipient(u);
    setRecipientFormEmail(u.email || "");
    setRecipientFormName(u.display_name || "");
    setRecipientFormStation(u.station ?? "");
    setRecipientFormIsAir(u.is_air ?? true);
    setRecipientFormIsSea(u.is_sea ?? false);
    setRecipientFormError("");
    setIsAddRecipientModalOpen(true);
  };

  const handleSaveRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const email = recipientFormEmail.trim().toLowerCase();
    if (!email || !isReportEmail(email)) {
      setRecipientFormError("Please enter a valid email address.");
      return;
    }
    if (!recipientFormIsAir && !recipientFormIsSea) {
      setRecipientFormError("Please select at least one freight report mode (Air Freight or Sea Freight).");
      return;
    }
    setRecipientFormLoading(true);
    setRecipientFormError("");

    try {
      if (editingRecipient) {
        const { error } = await supabase
          .from(TONNAGE_USERS_TABLE)
          .update({
            display_name: recipientFormName.trim() || email.split("@")[0],
            station: recipientFormStation.trim(),
            is_air: recipientFormIsAir,
            is_sea: recipientFormIsSea,
          })
          .eq("id", editingRecipient.id);
        if (error) throw error;
      } else {
        const existing = dbUsers.find(u => (u.email || "").toLowerCase() === email);
        if (existing) {
          const { error } = await supabase
            .from(TONNAGE_USERS_TABLE)
            .update({
              display_name: recipientFormName.trim() || existing.display_name || email.split("@")[0],
              station: recipientFormStation.trim(),
              is_air: recipientFormIsAir,
              is_sea: recipientFormIsSea,
            })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
          const { error } = await supabase
            .from(TONNAGE_USERS_TABLE)
            .insert({
              id: newId,
              email: email,
              display_name: recipientFormName.trim() || email.split("@")[0],
              station: recipientFormStation.trim(),
              is_air: recipientFormIsAir,
              is_sea: recipientFormIsSea,
            });
          if (error) throw error;
        }
      }
      setIsAddRecipientModalOpen(false);
      fetchDbUsers(supabase);
    } catch (err: any) {
      setRecipientFormError(err.message || "Failed to save recipient.");
    } finally {
      setRecipientFormLoading(false);
    }
  };

  // --- DYNAMIC STATIONS, BRANCHES & RECIPIENTS FROM SUPABASE ---
  const [stationsLoading, setStationsLoading] = useState(false);
  const [directoryStations, setDirectoryStations] = useState<StationInfo[]>([]);
  const [directoryBranches, setDirectoryBranches] = useState<BranchInfo[]>([]);
  const [directoryLocationError, setDirectoryLocationError] = useState("");
  const [stationsList, setStationsList] = useState<StationInfo[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("dgl_custom_stations");
        if (saved) {
          const parsed = JSON.parse(saved);
          const merged = [...DEFAULT_STATIONS];
          parsed.forEach((p: StationInfo) => {
            if (!merged.some(m => m.code === p.code)) merged.push(p);
          });
          return merged;
        }
      } catch (e) { }
    }
    return DEFAULT_STATIONS;
  });

  const [branchesList, setBranchesList] = useState<BranchInfo[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("dgl_custom_branches");
        if (saved) {
          const parsed = JSON.parse(saved);
          const merged = [...DEFAULT_BRANCH_OPTIONS];
          parsed.forEach((p: BranchInfo) => {
            if (!merged.some(m => m.code === p.code)) merged.push(p);
          });
          return merged;
        }
      } catch (e) { }
    }
    return DEFAULT_BRANCH_OPTIONS;
  });

  const fetchStationsAndBranches = useCallback(async (client?: any) => {
    const supabaseClient = client || supabase;
    if (!supabaseClient) return;
    setStationsLoading(true);
    setDirectoryLocationError("");
    try {
      // 1. Fetch Stations Table
      const { data: dbStations, error: sErr } = await supabaseClient
        .from("stations")
        .select("*")
        .eq("is_active", true)
        .order("code", { ascending: true });

      // 2. Fetch Branches Table
      const { data: dbBranches, error: bErr } = await supabaseClient
        .from("branches")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!sErr && !bErr && Array.isArray(dbStations) && Array.isArray(dbBranches)) {
        const locations = classifyRecipientLocations(dbStations, dbBranches);
        const formattedStations: StationInfo[] = locations.stations.map(s => {
          const isVnm = s.code === "VNM" || (s.country && s.country.toLowerCase().replace(/\s+/g, "") === "vietnam");
          const normCountry = isVnm ? "Viet Nam" : (s.country || s.name || s.code);
          return {
            code: s.code, name: s.name || s.code, country: normCountry,
            envVar: s.env_var || `RECIPIENTS_${s.code}`,
            matchCountries: Array.isArray(s.match_countries) ? s.match_countries : (normCountry ? [String(normCountry).toLowerCase()] : []),
            isCustom: false,
          };
        });
        const formattedBranches: BranchInfo[] = locations.branches.map(b => ({
          code: b.code, name: b.name || b.code, city: b.city || b.name,
          company_code: b.company_code, country: b.country, isCustom: false,
        }));
        setDirectoryStations(formattedStations);
        setDirectoryBranches(formattedBranches);
        setStationsList(formattedStations);
        setBranchesList(formattedBranches);
      } else {
        setDirectoryLocationError("Stations and branches could not be verified. Refresh to try again.");
      }

    } catch (err) {
      setDirectoryLocationError("Stations and branches could not be loaded. Refresh to try again.");
      console.warn("Could not dynamically load stations/branches (fallback active):", err);
    } finally {
      setStationsLoading(false);
    }
  }, [supabase]);

  // Initial load when Supabase client becomes ready
  useEffect(() => {
    if (supabase) {
      fetchDbUsers(supabase);
      fetchStationsAndBranches(supabase);
    }
  }, [supabase, fetchDbUsers, fetchStationsAndBranches]);

  // --- ORG USERS FROM AZURE AD ---
  const [orgUsers, setOrgUsers] = useState<any[]>([]);
  const [orgUsersByDept, setOrgUsersByDept] = useState<Record<string, any[]>>({});
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);
  const [orgUsersError, setOrgUsersError] = useState("");
  const [deptFilter, setDeptFilter] = useState("__all__");
  const [userSearch, setUserSearch] = useState("");

  const [stationFilterSearch, setStationFilterSearch] = useState("");
  const [stationFilterStatus, setStationFilterStatus] = useState<"all" | "configured" | "unconfigured">("all");
  const [branchFilterSearch, setBranchFilterSearch] = useState("");
  const [branchFilterStatus, setBranchFilterStatus] = useState<"all" | "configured" | "unconfigured">("all");

  // Add Station Modal state
  const [isAddStationModalOpen, setIsAddStationModalOpen] = useState(false);
  const [newStationCode, setNewStationCode] = useState("");
  const [newStationName, setNewStationName] = useState("");
  const [newStationCountry, setNewStationCountry] = useState("");
  const [newStationKeywords, setNewStationKeywords] = useState("");

  // Add Branch Modal state
  const [isAddBranchModalOpen, setIsAddBranchModalOpen] = useState(false);
  const [newBranchCode, setNewBranchCode] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCity, setNewBranchCity] = useState("");

  // Station-wise state
  const [stationSelectedEmails, setStationSelectedEmails] = useState<Record<string, string[]>>({});
  const [stationEmailLoading, setStationEmailLoading] = useState<Record<string, boolean>>({});
  const [stationEmailStatus, setStationEmailStatus] = useState<Record<string, string>>({});
  const [stationEmailSuccess, setStationEmailSuccess] = useState<Record<string, boolean | null>>({});
  const [expandedStation, setExpandedStation] = useState<Record<string, boolean>>({});
  const [adminTab, setAdminTab] = useState<"stations" | "branches" | "global">("stations");
  const [stationCustomEmailInput, setStationCustomEmailInput] = useState<Record<string, string>>({});
  const [stationUserSearch, setStationUserSearch] = useState<Record<string, string>>({});

  // Exact saved assignments own report membership. Legacy/default recipient
  // lists must never restore people removed from this location.
  useEffect(() => {
    const stationGroups = buildRecipientGroups(dbUsers.filter(user =>
      !DUMMY_EMAILS.includes(String(user.email || "").trim().toLowerCase())), transportMode);
    setStationSelectedEmails(previous => {
      const updated = { ...previous };
      for (const code of [...stationsList.map(station => station.code), ...branchesList.map(branch => branch.code), "OTHER", "GLOBAL"]) {
        const recipients = stationGroups[code.toUpperCase()] || [];
        updated[code] = recipients.filter(email => !DUMMY_EMAILS.includes(email.toLowerCase().trim()));
      }
      return updated;
    });
  }, [dbUsers, transportMode, stationsList, branchesList]);

  // --- SCHEDULER STATES ---
  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedulerTimezone, setSchedulerTimezone] = useState("Asia/Colombo");
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleFrequencyFilter, setScheduleFrequencyFilter] = useState("ALL");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState("ALL");
  const [scheduleScopeTab, setScheduleScopeTab] = useState<"all" | "station" | "branch" | "global">("station");
  const [scheduleStationFilter, setScheduleStationFilter] = useState("");
  const [scheduleBranchFilter, setScheduleBranchFilter] = useState("");
  const [schedulePersonFilter, setSchedulePersonFilter] = useState("");
  const [schedReportLevel, setSchedReportLevel] = useState<"station" | "branch">("station");
  const [schedSelectedStations, setSchedSelectedStations] = useState<string[]>([]);
  const [schedSelectedBranches, setSchedSelectedBranches] = useState<string[]>([]);
  const [schedRecipientMode, setSchedRecipientMode] = useState<"groups" | "person">("groups");
  const [schedPersonEmail, setSchedPersonEmail] = useState("");
  const [schedPersonSearch, setSchedPersonSearch] = useState("");
  const [schedSections, setSchedSections] = useState({include_weekly_visual: true, include_weekly_ledger: true, include_monthly_visual: true, include_monthly_ledger: true});
  const [schedSelectedRecipientSources, setSchedSelectedRecipientSources] = useState<string[]>([]);
  const [isSchedStationDropdownOpen, setIsSchedStationDropdownOpen] = useState(false);
  const [isSchedBranchDropdownOpen, setIsSchedBranchDropdownOpen] = useState(false);
  const [isSchedRecipientSourceDropdownOpen, setIsSchedRecipientSourceDropdownOpen] = useState(false);
  const [schedRecipientSourceSearch, setSchedRecipientSourceSearch] = useState("");
  const [schedRecipientSourceCategory, setSchedRecipientSourceCategory] = useState<"all" | "station" | "branch">("all");
  const [schedStationSearch, setSchedStationSearch] = useState("");
  const [schedBranchSearch, setSchedBranchSearch] = useState("");

  const [schedFrequency, setSchedFrequency] = useState<"weekly" | "monthly" | "daily">("weekly");
  const [schedDayOfWeek, setSchedDayOfWeek] = useState<number>(0); // 0=Monday
  const [schedWeeklyType, setSchedWeeklyType] = useState<"day_of_week" | "month_cycle">("day_of_week");
  const [schedWeeklyMonthCycleDay, setSchedWeeklyMonthCycleDay] = useState<number>(8); // 8, 15, or 22
  const [schedDayOfMonth, setSchedDayOfMonth] = useState<number>(1);
  const [schedTime, setSchedTime] = useState("08:00");
  const [schedRecipients, setSchedRecipients] = useState("");
  const [schedIsCreating, setSchedIsCreating] = useState(false);
  const [schedStatusMessage, setSchedStatusMessage] = useState("");
  const [schedStatusSuccess, setSchedStatusSuccess] = useState<boolean | null>(null);
  const [schedActiveTab, setSchedActiveTab] = useState<"list" | "create">("list");
  const [schedStartDate, setSchedStartDate] = useState("");
  const [schedEndDate, setSchedEndDate] = useState("");
  const scheduleRecipients = schedRecipientMode === "person" ? schedPersonEmail : schedRecipients;
  const schedPeople = dbUsers.filter(user => transportMode === "SEA" ? user.is_sea === true : user.is_air !== false);

  const handleScheduleForPerson = (user: any, locationCode?: string) => {
    const assignments = recipientAssignmentCodes(user.station);
    const code = locationCode || assignments.find(assignment =>
      stationsList.some(station => station.code === assignment) || branchesList.some(branch => branch.code === assignment));
    const isBranch = branchesList.some(branch => branch.code === code);
    setSchedRecipientMode("person");
    setSchedPersonEmail(String(user.email || "").trim().toLowerCase());
    setSchedPersonSearch("");
    setSchedSelectedRecipientSources([]);
    setSchedRecipients("");
    setSchedReportLevel(isBranch ? "branch" : "station");
    setSchedSelectedBranches(isBranch && code ? [code] : []);
    setSchedSelectedStations(!isBranch && code && stationsList.some(station => station.code === code) ? [code] : []);
    setSchedStatusMessage("");
    setSchedFrequency("weekly");
    setSchedWeeklyType("day_of_week");
    setSchedDayOfWeek(0);
    setSchedDayOfMonth(1);
    setSchedTime("08:00");
    setSchedSections({include_weekly_visual: true, include_weekly_ledger: true, include_monthly_visual: true, include_monthly_ledger: true});
    setSchedStartDate("");
    setSchedEndDate("");
    setIsSchedStationDropdownOpen(false);
    setIsSchedBranchDropdownOpen(false);
    setSchedActiveTab("create");
    setActiveSection("email-scheduling");
  };

  // Helper to re-aggregate recipients whenever selected sources change
  const syncRecipientsFromSources = (sources: string[]) => {
    const emailsSet = new Set<string>();
    sources.forEach(src => {
      const list = stationSelectedEmails[src] || [];
      list.forEach(e => {
        const clean = (e || "").trim().toLowerCase();
        if (clean && !DUMMY_EMAILS.includes(clean)) {
          emailsSet.add(clean);
        }
      });
    });
    setSchedRecipients(Array.from(emailsSet).join(", "));
  };

  const handleToggleRecipientSource = (sourceCode: string) => {
    setSchedSelectedRecipientSources(prev => {
      const next = prev.includes(sourceCode)
        ? prev.filter(x => x !== sourceCode)
        : [...prev, sourceCode];
      syncRecipientsFromSources(next);
      return next;
    });
  };

  const handleSelectAllRecipientStations = () => {
    const allStationCodes = stationsList.map(s => s.code);
    if ((stationSelectedEmails["OTHER"] || []).length > 0) allStationCodes.push("OTHER");
    setSchedSelectedRecipientSources(prev => {
      const set = new Set([...prev, ...allStationCodes]);
      const next = Array.from(set);
      syncRecipientsFromSources(next);
      return next;
    });
  };

  const handleSelectAllRecipientBranches = () => {
    const allBranchCodes = branchesList.map(b => b.code);
    setSchedSelectedRecipientSources(prev => {
      const set = new Set([...prev, ...allBranchCodes]);
      const next = Array.from(set);
      syncRecipientsFromSources(next);
      return next;
    });
  };

  const handleClearRecipientSources = () => {
    setSchedSelectedRecipientSources([]);
    setSchedRecipients("");
  };

  // Helper to quickly load recipients matching currently selected target stations or branches
  const handleLoadRecipientsForSelectedTargets = () => {
    const targets = schedReportLevel === "branch" ? schedSelectedBranches : schedSelectedStations;
    const targetCodes = targets.includes("Global")
      ? stationsList.map(s => s.code)
      : targets;
    setSchedSelectedRecipientSources(targetCodes);
    syncRecipientsFromSources(targetCodes);
  };

  const fetchSchedules = useCallback(async (supabaseClient?: any) => {
    const client = supabaseClient || supabase;
    setSchedulerLoading(true);
    try {
      let authHeader = "";
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session?.access_token) {
          authHeader = `Bearer ${session.access_token}`;
        }
      }
      const res = await fetch(`${API}/api/schedules?transport_mode=${transportMode}`, {
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { "Authorization": authHeader } : {}),
        }
      });
      if (!res.ok) {
        console.error("fetchSchedules HTTP error:", res.status, await res.text());
        return;
      }
      const d = await res.json();
      if (d.status === "success") {
        setSchedules((d.data || []).filter((schedule: any) => (schedule.filters?.transport_mode || "AIR") === transportMode));
      } else {
        console.error("fetchSchedules API error:", d.detail || d);
      }
    } catch (e) {
      console.error("Failed to fetch schedules", e);
    } finally {
      setSchedulerLoading(false);
    }
  }, [supabase, transportMode]);

  const handleCreateSchedule = async () => {
    const emails = Array.from(new Set(scheduleRecipients.split(",").map(email => email.trim().toLowerCase()).filter(Boolean)));
    if (schedRecipientMode === "person" && !schedPeople.some(user => user.email.toLowerCase() === schedPersonEmail)) {
      setSchedStatusMessage(`Select a directory recipient with ${transportMode} reports enabled.`);
      setSchedStatusSuccess(false);
      return;
    }
    if (emails.length === 0 || emails.some(email => !isReportEmail(email))) {
      setSchedStatusMessage("Please select at least one valid recipient email.");
      setSchedStatusSuccess(false);
      return;
    }
    const targets = schedReportLevel === "branch" ? schedSelectedBranches : schedSelectedStations;
    if (targets.length === 0 || targets.some(code => !(schedReportLevel === "branch" ? branchesList : stationsList).some(location => location.code === code))) {
      setSchedStatusMessage(`Please select a configured target ${schedReportLevel}.`);
      setSchedStatusSuccess(false);
      return;
    }
    if (!schedTime || !Object.values(schedSections).some(Boolean)) {
      setSchedStatusMessage("Select a send time and at least one report section.");
      setSchedStatusSuccess(false);
      return;
    }
    if (Boolean(schedStartDate) !== Boolean(schedEndDate) || (schedStartDate && schedStartDate > schedEndDate)) {
      setSchedStatusMessage("Choose both dates, with the start date on or before the end date.");
      setSchedStatusSuccess(false);
      return;
    }

    setSchedIsCreating(true);
    setSchedStatusMessage("");
    setSchedStatusSuccess(null);

    try {
      const authHeaders = await getAuthHeaders();
      let createdCount = 0;
      let errorMessages: string[] = [];

      if (schedReportLevel === "branch") {
        const branchesToProcess = schedSelectedBranches;

        for (const branchCode of branchesToProcess) {
          const branchInfo = branchesList.find(b => b.code === branchCode);
          const filters: any = {
            transport_mode: transportMode,
            mode: "standard",
            ...schedSections,
            recipient_mode: schedRecipientMode,
            use_fixed_dates: Boolean(schedStartDate && schedEndDate),
            max_data_rows: 100,
            report_level: "branch",
            branch: branchCode,
            country: (branchInfo as any)?.country || "India",
            company_code: (branchInfo as any)?.company_code || "IND",
          };
          if (schedStartDate) filters.start_date = schedStartDate;
          if (schedEndDate) filters.end_date = schedEndDate;

          const res = await fetch(`${API}/api/schedules`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              recipient_email: emails.join(", "),
              frequency: schedFrequency,
              day_of_week: schedFrequency === "weekly" ? (schedWeeklyType === "month_cycle" ? null : schedDayOfWeek) : null,
              day_of_month: schedFrequency === "monthly"
                ? schedDayOfMonth
                : (schedFrequency === "weekly" && schedWeeklyType === "month_cycle" ? schedWeeklyMonthCycleDay : null),
              time_of_day: schedTime,
              filters: filters,
              is_active: true,
            }),
          });
          const data = await res.json();
          if (res.ok && data.status === "success") {
            createdCount++;
          } else {
            errorMessages.push(`Branch ${branchCode}: ${data.detail || "Failed"}`);
          }
        }

        if (createdCount > 0) {
          setSchedStatusMessage(`Saved ${createdCount} branch schedule${createdCount > 1 ? "s" : ""}.${errorMessages.length ? ` Failed: ${errorMessages.join("; ")}` : ""}`);
          setSchedStatusSuccess(errorMessages.length === 0);
          setSchedRecipients("");
          setSchedSelectedRecipientSources([]);
          setSchedStartDate("");
          setSchedEndDate("");
          fetchSchedules(supabase);
        } else {
          setSchedStatusMessage(errorMessages.join("; ") || "Failed to configure schedule.");
          setSchedStatusSuccess(false);
        }
      } else {
        const stationsToProcess = schedSelectedStations;

        if (stationsToProcess.length === 0) {
          setSchedStatusMessage("Please select at least one target station.");
          setSchedStatusSuccess(false);
          setSchedIsCreating(false);
          return;
        }

        for (const stationCode of stationsToProcess) {
          const stObj = stationsList.find(s => s.code === stationCode);
          let targetCountry = stObj?.country || "India";
          if (stationCode === "VNM" || (targetCountry && targetCountry.toLowerCase().replace(/\s+/g, "") === "vietnam")) {
            targetCountry = "Viet Nam";
          }
          const filters: any = {
            transport_mode: transportMode,
            mode: "standard",
            ...schedSections,
            recipient_mode: schedRecipientMode,
            use_fixed_dates: Boolean(schedStartDate && schedEndDate),
            max_data_rows: 100,
            report_level: "station",
            country: targetCountry,
            company_code: stObj?.code || stationCode,
          };
          if (schedStartDate) filters.start_date = schedStartDate;
          if (schedEndDate) filters.end_date = schedEndDate;

          const res = await fetch(`${API}/api/schedules`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              recipient_email: emails.join(", "),
              frequency: schedFrequency,
              day_of_week: schedFrequency === "weekly" ? (schedWeeklyType === "month_cycle" ? null : schedDayOfWeek) : null,
              day_of_month: schedFrequency === "monthly"
                ? schedDayOfMonth
                : (schedFrequency === "weekly" && schedWeeklyType === "month_cycle" ? schedWeeklyMonthCycleDay : null),
              time_of_day: schedTime,
              filters: filters,
              is_active: true,
            }),
          });
          const data = await res.json();
          if (res.ok && data.status === "success") {
            createdCount++;
          } else {
            errorMessages.push(`Station ${stationCode}: ${data.detail || "Failed"}`);
          }
        }

        if (createdCount > 0) {
          setSchedStatusMessage(`Saved ${createdCount} station schedule${createdCount > 1 ? "s" : ""}.${errorMessages.length ? ` Failed: ${errorMessages.join("; ")}` : ""}`);
          setSchedStatusSuccess(errorMessages.length === 0);
          setSchedRecipients("");
          setSchedSelectedRecipientSources([]);
          setSchedStartDate("");
          setSchedEndDate("");
          fetchSchedules(supabase);
        } else {
          setSchedStatusMessage(errorMessages.join("; ") || "Failed to configure schedule.");
          setSchedStatusSuccess(false);
        }
      }
    } catch (e: any) {
      setSchedStatusMessage(`Error transmitting scheduling request: ${e.message || e}`);
      setSchedStatusSuccess(false);
    } finally {
      setSchedIsCreating(false);
    }
  };

  const handleToggleSchedule = async (scheduleId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API}/api/schedules/${scheduleId}/toggle`, {
        method: "POST",
        headers: {
          "Authorization": authHeaders.Authorization
        }
      });
      const data = await res.json();
      if (data.status === "success") {
        fetchSchedules(supabase);
      } else {
        alert(data.detail || "Could not toggle schedule status.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to toggle schedule.");
    }
  };

  const handleRunScheduleNow = async (scheduleId: string) => {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API}/api/schedules/${scheduleId}/run`, {
        method: "POST",
        headers: {
          "Authorization": authHeaders.Authorization
        }
      });
      const data = await res.json();
      alert(data.message || "Manual run initiated.");
    } catch (e) {
      console.error(e);
      alert("Failed to run schedule manually.");
    }
  };

  // Delete Schedule Modal State (Supports single and bulk deletion)
  const [schedulesToDelete, setSchedulesToDelete] = useState<{ id: string; stationLabel?: string; triggerDesc?: string; recipientCount?: number }[] | null>(null);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);
  const [scheduleDeleteError, setScheduleDeleteError] = useState<string | null>(null);

  const handleDeleteSchedule = (scheduleId: string, stationLabel?: string, triggerDesc?: string, recipientCount?: number) => {
    setScheduleDeleteError(null);
    setSchedulesToDelete([{ id: scheduleId, stationLabel, triggerDesc, recipientCount }]);
  };

  const handleBulkDeleteSchedules = () => {
    if (selectedScheduleIds.length === 0) return;
    const toDelete = schedules
      .filter((s) => selectedScheduleIds.includes(s.id))
      .map((s) => {
        const filters = s.filters || {};
        const stationLabel = resolveScheduleScope(filters, stationsList, branchesList).label;

        let triggerDesc = "";
        if (s.frequency === "weekly") {
          if (s.day_of_month) {
            triggerDesc = `Weekly on the ${getOrdinal(s.day_of_month)} at ${s.time_of_day}`;
          } else {
            const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
            triggerDesc = `Weekly on ${days[s.day_of_week] || "Monday"} at ${s.time_of_day}`;
          }
        } else if (s.frequency === "monthly") {
          if (s.day_of_month && s.day_of_month > 1) {
            triggerDesc = `Weekly (Cycle) on the ${getOrdinal(s.day_of_month)} at ${s.time_of_day}`;
          } else {
            triggerDesc = `Monthly on the ${getOrdinal(s.day_of_month || 1)} at ${s.time_of_day}`;
          }
        } else {
          triggerDesc = `Daily at ${s.time_of_day}`;
        }
        const recipientCount = (s.recipient_email || "").split(",").map((r: string) => r.trim()).filter(Boolean).length;
        return { id: s.id, stationLabel, triggerDesc, recipientCount };
      });

    setScheduleDeleteError(null);
    setSchedulesToDelete(toDelete);
  };

  const handleConfirmDeleteSchedule = async () => {
    if (!schedulesToDelete || schedulesToDelete.length === 0) return;
    setIsDeletingSchedule(true);
    setScheduleDeleteError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const idsToDelete = schedulesToDelete.map((s) => s.id);

      let res;
      if (idsToDelete.length === 1) {
        res = await fetch(`${API}/api/schedules/${idsToDelete[0]}`, {
          method: "DELETE",
          headers: {
            "Authorization": authHeaders.Authorization
          }
        });
      } else {
        res = await fetch(`${API}/api/schedules/batch-delete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeaders.Authorization
          },
          body: JSON.stringify({ schedule_ids: idsToDelete })
        });
      }

      const data = await res.json();
      if (data.status === "success") {
        setSelectedScheduleIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
        setSchedulesToDelete(null);
        fetchSchedules(supabase);
      } else {
        setScheduleDeleteError(data.detail || data.message || "Could not delete schedule(s).");
      }
    } catch (e) {
      console.error(e);
      setScheduleDeleteError("Failed to delete schedule(s). Please check server connection.");
    } finally {
      setIsDeletingSchedule(false);
    }
  };

  const fetchOrgUsers = useCallback(async () => {
    if (orgUsers.length > 0) return; // already loaded
    setOrgUsersLoading(true);
    setOrgUsersError("");
    try {
      const res = await fetch(`${API}/api/org-users`);
      const d = await res.json();
      if (d.status === "success") {
        setOrgUsers(d.users || []);
        setOrgUsersByDept(d.byDepartment || {});
        // Merge org user emails into availableEmails (deduplicate)
        const emails = (d.users || []).map((u: any) => u.email).filter(Boolean);
        setAvailableEmails((prev) => {
          const combined = prev.concat(emails).filter((v, i, a) => a.indexOf(v) === i);
          return combined;
        });
      } else {
        setOrgUsersError(d.detail || "Failed to load org users");
      }
    } catch (e: any) {
      setOrgUsersError("Could not connect to API. Check that the server is running.");
    } finally {
      setOrgUsersLoading(false);
    }
  }, [orgUsers.length]);

  // Fetch org users, exact assignments, and schedules for recipient management.
  useEffect(() => {
    if ((activeSection === "admin" || activeSection === "email-scheduling" || activeSection === "users") && supabase) {
      fetchOrgUsers();
      fetchSchedules(supabase);
      fetchDbUsers(supabase);
    }
  }, [activeSection, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dashboardMode === "custom-sql" && supabase) {
      fetchSqlRecipientUsers(supabase);
      fetchOrgUsers();
    }
  }, [dashboardMode, supabase, fetchSqlRecipientUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  const sqlRecipientOptions = (() => {
    const people = new Map<string, ReportRecipient>();
    const add = (email: string, name?: string) => {
      const normalized = (email || "").trim().toLowerCase();
      if (isReportEmail(normalized) && !DUMMY_EMAILS.includes(normalized)) people.set(normalized, {email: normalized, name: name || normalized});
    };
    availableEmails.forEach(email => add(email));
    dbUsers.forEach(user => add(user.email, user.display_name));
    sqlRecipientUsers.forEach(user => add(user.email, user.name));
    orgUsers.forEach(user => add(user.email, user.displayName));
    return Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const [standardRecords, setStandardRecords] = useState<any[]>([]);
  const [standardWeeklyData, setStandardWeeklyData] = useState<any[]>([]);
  const [standardMonthlyData, setStandardMonthlyData] = useState<any[]>([]);
  const [standardKpi, setStandardKpi] = useState<any>({});
  const [standardSectorCarrierData, setStandardSectorCarrierData] = useState<any[]>([]);

  // Loading & Email Status
  const [loading, setLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [emailSuccess, setEmailSuccess] = useState<boolean | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // PDF Section selection for sending (before print preview)
  const [pdfSections, setPdfSections] = useState({
    weeklyVisual: true,
    weeklyLedger: true,
    monthlyVisual: true,
    monthlyLedger: true,
    seaSectorDistribution: true,
  });

  const [showSectionSelector, setShowSectionSelector] = useState(false);

  // --- BRANCH OPTIONS & SQL QUERY GENERATORS (Uses Supabase dynamic lists)
  const BRANCH_OPTIONS = branchesList;

  const getStationwiseSqlTemplate = (country = "India", companyCode = "IND", sDate = "2026-06-01", eDate = "2026-06-07") => {
    let targetCountry = country;
    if (companyCode === "VNM" || (targetCountry && targetCountry.toLowerCase().replace(/\s+/g, "") === "vietnam")) {
      targetCountry = "Viet Nam";
    }
    return buildFreightQuery(`-- Station-wise Report Query Template
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
WHERE vt.ConLoadPortCountryName = '${targetCountry}'
    AND vt.ETD >= '${sDate}'
    AND vt.ETD <= '${eDate}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = '${companyCode}'
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1,
         vt.ConsolTransportMode, vt.ETD, 
         COALESCE(vt.RealLoadPortCountryName, 'N/A'),
         COALESCE(vt.RealLoadPortCity, 'N/A'),
         COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
         COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC;`, transportMode);
  };

  const getBranchwiseSqlTemplate = (country = "India", companyCode = "IND", branch = "BLR", sDate = "2026-06-01", eDate = "2026-06-07") => {
    let targetCountry = country;
    if (companyCode === "VNM" || (targetCountry && targetCountry.toLowerCase().replace(/\s+/g, "") === "vietnam")) {
      targetCountry = "Viet Nam";
    }
    return buildFreightQuery(`-- Branch-wise Report Query Template (${branch})
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
WHERE vt.ConLoadPortCountryName = '${targetCountry}'
    AND vt.ETD >= '${sDate}'
    AND vt.ETD <= '${eDate}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = '${companyCode}'
    AND vs.Branch = '${branch}'
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
ORDER BY vt.ETD DESC, vs.Branch, ROUND(SUM(vs.Revenue_USD), 2) DESC;`, transportMode);
  };

  // Section level report types (Station-wise vs Branch-wise)
  const [weeklyReportLevel, setWeeklyReportLevel] = useState<"station" | "branch">("station");
  const [weeklyBranch, setWeeklyBranch] = useState("BLR");
  const [weeklyStation, setWeeklyStation] = useState("IND");

  const [monthlyReportLevel, setMonthlyReportLevel] = useState<"station" | "branch">("station");
  const [monthlyBranch, setMonthlyBranch] = useState("BLR");
  const [monthlyStation, setMonthlyStation] = useState("IND");


  // --- SQL SANDBOX CONSOLE STATES ---
  // Weekly SQL States
  const [isWeeklySqlConsoleOpen, setIsWeeklySqlConsoleOpen] = useState(false);
  const [weeklySqlText, setWeeklySqlText] = useState(getStationwiseSqlTemplate("India", "IND", defaultDateRange.start, defaultDateRange.end));

  const [weeklySqlRecords, setWeeklySqlRecords] = useState<any[]>([]);
  const [weeklySqlWeeklyData, setWeeklySqlWeeklyData] = useState<any[]>([]);
  const [weeklySqlMonthlyData, setWeeklySqlMonthlyData] = useState<any[]>([]);
  const [weeklySqlKpi, setWeeklySqlKpi] = useState<any>({});
  const [weeklySqlSectorCarrierData, setWeeklySqlSectorCarrierData] = useState<any[]>([]);
  const [weeklySqlError, setWeeklySqlError] = useState("");
  const [weeklySqlExecutionStatus, setWeeklySqlExecutionStatus] = useState("");
  const [weeklySqlIsRunning, setWeeklySqlIsRunning] = useState(false);
  const weeklySqlAbortRef = useRef<AbortController | null>(null);

  // Monthly SQL States
  const [isMonthlySqlConsoleOpen, setIsMonthlySqlConsoleOpen] = useState(false);
  const [monthlySqlText, setMonthlySqlText] = useState(getStationwiseSqlTemplate("India", "IND", defaultDateRange.start, defaultDateRange.end));

  const [monthlySqlRecords, setMonthlySqlRecords] = useState<any[]>([]);
  const [monthlySqlWeeklyData, setMonthlySqlWeeklyData] = useState<any[]>([]);
  const [monthlySqlMonthlyData, setMonthlySqlMonthlyData] = useState<any[]>([]);
  const [monthlySqlKpi, setMonthlySqlKpi] = useState<any>({});
  const [monthlySqlSectorCarrierData, setMonthlySqlSectorCarrierData] = useState<any[]>([]);
  const [monthlySqlError, setMonthlySqlError] = useState("");
  const [monthlySqlExecutionStatus, setMonthlySqlExecutionStatus] = useState("");
  const [monthlySqlIsRunning, setMonthlySqlIsRunning] = useState(false);
  const monthlySqlAbortRef = useRef<AbortController | null>(null);

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

  const stopWeeklyCustomSqlQuery = () => {
    if (weeklySqlAbortRef.current) {
      weeklySqlAbortRef.current.abort();
      weeklySqlAbortRef.current = null;
    }
    setWeeklySqlIsRunning(false);
    setLoading(false);
    setWeeklySqlExecutionStatus("⛔ Query execution stopped by user.");
  };

  const runWeeklyCustomSqlQuery = async (overrideSql?: string) => {
    setLastExecutedSql(prev => ({...prev, weekly: ""}));
    const activeSql = (overrideSql || weeklySqlText).trim();
    if (!activeSql) {
      setWeeklySqlError("SQL query cannot be empty. Please write a query and try again.");
      return;
    }

    const abortController = new AbortController();
    weeklySqlAbortRef.current = abortController;

    setWeeklySqlIsRunning(true);
    setWeeklySqlExecutionStatus("Executing custom SQL query against SQL Server...");
    setWeeklySqlError("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/custom-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: activeSql, transport_mode: transportMode, include_sea_sectors: isSea }),
        signal: abortController.signal,
      });

      const d = await res.json();

      if (res.ok && d.status === "success") {
        const records = d.data || [];
        if (!Array.isArray(records)) {
          setWeeklySqlError("Invalid response format: Expected array of records.");
          setWeeklySqlExecutionStatus("");
          setLoading(false);
          setWeeklySqlIsRunning(false);
          return;
        }

        setWeeklySqlRecords(records);
        setLastExecutedSql(prev => ({...prev, weekly: (isSea && d.effectiveQuery ? d.effectiveQuery : activeSql).trim()}));
        if (isSea && d.effectiveQuery) setWeeklySqlText(d.effectiveQuery);

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

        setWeeklySqlKpi({
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

        setWeeklySqlWeeklyData(parseWeeklyData(records));
        setWeeklySqlMonthlyData(parseMonthlyData(records));
        setWeeklySqlExecutionStatus(`✓ Query executed successfully! Returned ${records.length} rows.`);

        // Resolve sector carrier distribution for custom sql
        try {
          if (isSea) return; // Sea summaries come from the consol records above.
          const secParams = new URLSearchParams({ transport_mode: transportMode, custom_sql: activeSql });
          const secRes = await fetch(`${API}/api/sector-carrier-distribution?${secParams}`);
          const secData = await secRes.json();
          if (secData.status === "success") {
            setWeeklySqlSectorCarrierData(secData.data);
          }
        } catch (secErr) {
          console.error("Failed to fetch sector carrier distribution for custom SQL", secErr);
        }
      } else {
        const errorMessage = d.detail || d.error || "Database query failed to execute. Please check your SQL syntax.";
        setWeeklySqlError(errorMessage);
        setWeeklySqlExecutionStatus("");
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      const errorMessage = e.message || "Could not connect to database endpoint. Please ensure the backend API is running.";
      setWeeklySqlError(`Connection Error: ${errorMessage}`);
      setWeeklySqlExecutionStatus("");
    } finally {
      weeklySqlAbortRef.current = null;
      setLoading(false);
      setWeeklySqlIsRunning(false);
    }
  };

  const stopMonthlyCustomSqlQuery = () => {
    if (monthlySqlAbortRef.current) {
      monthlySqlAbortRef.current.abort();
      monthlySqlAbortRef.current = null;
    }
    setMonthlySqlIsRunning(false);
    setLoading(false);
    setMonthlySqlExecutionStatus("⛔ Query execution stopped by user.");
  };

  const runMonthlyCustomSqlQuery = async (overrideSql?: string) => {
    setLastExecutedSql(prev => ({...prev, monthly: ""}));
    const activeSql = (overrideSql || monthlySqlText).trim();
    if (!activeSql) {
      setMonthlySqlError("SQL query cannot be empty. Please write a query and try again.");
      return;
    }

    const abortController = new AbortController();
    monthlySqlAbortRef.current = abortController;

    setMonthlySqlIsRunning(true);
    setMonthlySqlExecutionStatus("Executing custom SQL query against SQL Server...");
    setMonthlySqlError("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/custom-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: activeSql, transport_mode: transportMode, include_sea_sectors: isSea }),
        signal: abortController.signal,
      });

      const d = await res.json();

      if (res.ok && d.status === "success") {
        const records = d.data || [];
        if (!Array.isArray(records)) {
          setMonthlySqlError("Invalid response format: Expected array of records.");
          setMonthlySqlExecutionStatus("");
          setLoading(false);
          setMonthlySqlIsRunning(false);
          return;
        }

        setMonthlySqlRecords(records);
        setLastExecutedSql(prev => ({...prev, monthly: (isSea && d.effectiveQuery ? d.effectiveQuery : activeSql).trim()}));
        if (isSea && d.effectiveQuery) setMonthlySqlText(d.effectiveQuery);

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

        setMonthlySqlKpi({
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

        setMonthlySqlWeeklyData(parseWeeklyData(records));
        setMonthlySqlMonthlyData(parseMonthlyData(records));
        setMonthlySqlExecutionStatus(`✓ Query executed successfully! Returned ${records.length} rows.`);

        // Resolve sector carrier distribution for custom sql
        try {
          if (isSea) return; // Sea summaries come from the consol records above.
          const secParams = new URLSearchParams({ transport_mode: transportMode, custom_sql: activeSql });
          const secRes = await fetch(`${API}/api/sector-carrier-distribution?${secParams}`);
          const secData = await secRes.json();
          if (secData.status === "success") {
            setMonthlySqlSectorCarrierData(secData.data);
          }
        } catch (secErr) {
          console.error("Failed to fetch sector carrier distribution for custom SQL", secErr);
        }
      } else {
        const errorMessage = d.detail || d.error || "Database query failed to execute. Please check your SQL syntax.";
        setMonthlySqlError(errorMessage);
        setMonthlySqlExecutionStatus("");
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      const errorMessage = e.message || "Could not connect to database endpoint. Please ensure the backend API is running.";
      setMonthlySqlError(`Connection Error: ${errorMessage}`);
      setMonthlySqlExecutionStatus("");
    } finally {
      monthlySqlAbortRef.current = null;
      setLoading(false);
      setMonthlySqlIsRunning(false);
    }
  };

  const companyCodeParam = selectedCompanies.length === 0 ? "" : selectedCompanies.join(",");
  const branchParam = selectedBranches.length === 0 ? "" : selectedBranches.join(",");
  const countryParam = selectedCountries.length === 0 ? "" : selectedCountries.join(",");
  const originCityParam = selectedOriginCities.length === 0 ? "" : selectedOriginCities.join(",");
  const destinationCountryParam = selectedDestCountries.length === 0 ? "" : selectedDestCountries.join(",");
  const destinationCityParam = selectedDestCities.length === 0 ? "" : selectedDestCities.join(",");
  const airlineParam = selectedAirlines.length === 0 ? "" : selectedAirlines.join(",");

  // Dynamically load options for filters
  const fetchFilterOptions = useCallback(async () => {
    if (dashboardMode !== "standard") return;
    try {
      const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
      const [cRes, aRes, ccRes, dcRes] = await Promise.all([
        fetch(`${API}/api/countries?${params}`),
        fetch(`${API}/api/airlines?${params}${countryParam ? `&country=${encodeURIComponent(countryParam)}` : ""}`),
        fetch(`${API}/api/company-codes?${params}`),
        fetch(`${API}/api/destination-countries?${params}`),
      ]);
      const [cData, aData, ccData, dcData] = await Promise.all([
        cRes.json(), aRes.json(), ccRes.json(), dcRes.json()
      ]);
      if (cData.status === "success") setCountries(cData.data);
      if (aData.status === "success") setAirlines(aData.data);
      if (ccData.status === "success") setCompanyCodes(ccData.data);
      if (dcData.status === "success") setDestinationCountries(dcData.data);
    } catch (e) {
      console.error("Dropdown options failed", e);
    }
  }, [startDate, endDate, countryParam, dashboardMode]);

  // Main dynamic database fetch
  const fetchMainAnalytics = useCallback(async () => {
    if (dashboardMode !== "standard") return;
    setLoading(true);
    setAnalyticsError("");
    try {
      const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
      if (countryParam) params.append("country", countryParam);
      if (airlineParam) params.append("airline", airlineParam);
      if (companyCodeParam) params.append("company_code", companyCodeParam);
      if (originCityParam) params.append("origin_city", originCityParam);
      if (destinationCountryParam) params.append("destination_country", destinationCountryParam);
      if (destinationCityParam) params.append("destination_city", destinationCityParam);
      if (branchParam) params.append("branch", branchParam);

      const [dataRes, weekRes, monthRes, kpiRes, sectorRes] = await Promise.all([
        fetch(`${API}/api/data?${params}${isSea ? "&include_sea_sectors=true" : ""}`),
        isSea ? Promise.resolve({json: async () => ({status: "success", data: []})}) : fetch(`${API}/api/weekly?${params}`),
        isSea ? Promise.resolve({json: async () => ({status: "success", data: []})}) : fetch(`${API}/api/monthly?${params}`),
        isSea ? Promise.resolve({json: async () => ({status: "success", data: null})}) : fetch(`${API}/api/kpi?${params}`),
        isSea ? Promise.resolve({json: async () => ({status: "success", data: []})}) : fetch(`${API}/api/sector-carrier-distribution?${params}`),
      ]);
      const [d, w, m, k, sec] = await Promise.all([dataRes.json(), weekRes.json(), monthRes.json(), kpiRes.json(), sectorRes.json()]);
      const failed = [d, w, m, k].find(result => result.status !== "success");
      if (failed) throw new Error(failed.detail || "The freight data could not be loaded.");
      if (d.status === "success") setStandardRecords(d.data);
      if (w.status === "success") setStandardWeeklyData(w.data);
      if (m.status === "success") setStandardMonthlyData(m.data);
      if (k.status === "success") setStandardKpi(k.data);
      if (sec.status === "success") setStandardSectorCarrierData(sec.data);
    } catch (e) {
      console.error("Failed to sync database view", e);
      setAnalyticsError(e instanceof Error ? e.message : "The freight data could not be loaded.");
      setStandardRecords([]);
      setStandardWeeklyData([]);
      setStandardMonthlyData([]);
      setStandardKpi({});
      setStandardSectorCarrierData([]);
    }
    setLoading(false);
  }, [startDate, endDate, countryParam, airlineParam, companyCodeParam, originCityParam, destinationCountryParam, destinationCityParam, branchParam, dashboardMode]);

  useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);

  useEffect(() => {
    if (dashboardMode === "standard") {
      fetchMainAnalytics();
    }
  }, [dashboardMode, fetchMainAnalytics]);

  // Cascading updates only when in standard filter mode
  useEffect(() => {
    if (dashboardMode !== "standard") return;
    const updateCascadingCarriers = async () => {
      try {
        const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
        if (countryParam) params.append("country", countryParam);
        const res = await fetch(`${API}/api/airlines?${params}`);
        const d = await res.json();
        if (d.status === "success") {
          setAirlines(d.data);
          setSelectedAirlines((prev) => prev.filter((a) => d.data.includes(a)));
        }
      } catch (e) { }
    };
    updateCascadingCarriers();
  }, [selectedCountries, startDate, endDate, countryParam, dashboardMode]);

  useEffect(() => {
    if (dashboardMode !== "standard") return;
    const updateCities = async () => {
      try {
        const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
        if (countryParam) params.append("country", countryParam);
        const res = await fetch(`${API}/api/origin-cities?${params}`);
        const d = await res.json();
        if (d.status === "success") {
          setOriginCities(d.data);
          setSelectedOriginCities((prev) => prev.filter((c) => d.data.includes(c)));
        }
      } catch (e) { }
    };
    updateCities();
  }, [selectedCountries, startDate, endDate, countryParam, dashboardMode]);

  useEffect(() => {
    if (dashboardMode !== "standard") return;
    const updateCities = async () => {
      try {
        const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
        if (destinationCountryParam) params.append("country", destinationCountryParam);
        const res = await fetch(`${API}/api/destination-cities?${params}`);
        const d = await res.json();
        if (d.status === "success") {
          setDestinationCities(d.data);
          setSelectedDestCities((prev) => prev.filter((c) => d.data.includes(c)));
        }
      } catch (e) { }
    };
    updateCities();
  }, [selectedDestCountries, startDate, endDate, destinationCountryParam, dashboardMode]);

  useEffect(() => {
    if (dashboardMode !== "standard") return;
    const updateCountries = async () => {
      try {
        const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
        if (companyCodeParam) params.append("company_code", companyCodeParam);
        const res = await fetch(`${API}/api/countries?${params}`);
        const d = await res.json();
        if (d.status === "success") {
          setCountries(d.data);
          setSelectedCountries((prev) => prev.filter((c) => d.data.includes(c)));
        }
      } catch (e) { }
    };
    updateCountries();
  }, [selectedCompanies, startDate, endDate, companyCodeParam, dashboardMode]);

  useEffect(() => {
    if (dashboardMode !== "standard") return;
    const updateBranches = async () => {
      try {
        const params = new URLSearchParams({ transport_mode: transportMode });
        if (companyCodeParam) params.append("company_code", companyCodeParam);
        const res = await fetch(`${API}/api/branches?${params}`);
        const d = await res.json();
        if (d.status === "success") {
          setBranches(d.data);
          setSelectedBranches((prev) => prev.filter((b) => d.data.some((x: any) => x.code === b)));
        }
      } catch (e) {
        console.error("Failed to load branches", e);
      }
    };
    updateBranches();
  }, [selectedCompanies, startDate, endDate, companyCodeParam, dashboardMode]);


  // Trigger Playwright + graph PDF dispatch
  const handleSendEmail = async () => {
    if (activeRecipients.length === 0 || activeRecipients.some(email => !isReportEmail(email))) {
      setEmailStatus("Please select or add at least one recipient email.");
      setEmailSuccess(false);
      return false;
    }
    if (dashboardMode === "custom-sql" && !sqlReportCanSend) {
      setEmailStatus("Execute the current SQL query before sending this report.");
      setEmailSuccess(false);
      return false;
    }
    setEmailLoading(true);
    setEmailStatus("Rendering report layout & transmitting A4 Landscape PDF via Microsoft Graph...");
    setEmailSuccess(null);
    let sent = false;
    try {
      const emailString = activeRecipients.join(", ");

      // Build request body based on dashboard mode
      const requestBody: any = {
        transport_mode: transportMode,
        recipient_email: emailString,
        // Pass selected sections to reduce PDF size
        include_weekly_visual: pdfSections.weeklyVisual,
        include_weekly_ledger: pdfSections.weeklyLedger,
        include_monthly_visual: pdfSections.monthlyVisual,
        include_monthly_ledger: isSea || dashboardMode === "custom-sql" ? false : pdfSections.monthlyLedger,
        include_sea_sector_distribution: isSea && pdfSections.seaSectorDistribution,
        // Limit data rows to 100 to reduce email attachment size
        max_data_rows: 100,
        report_type: activeSection === "weekly-reports" || activeSection === "dashboard" ? "weekly" : "monthly",
      };

      // Add mode-specific fields
      if (dashboardMode === "custom-sql") {
        // Custom SQL mode - include the query
        requestBody.mode = "custom-sql";
        requestBody.custom_sql = activeSection === "weekly-reports" ? weeklySqlText : monthlySqlText;
        // Include context for metadata (subject and body construction)
        requestBody.start_date = startDate;
        requestBody.end_date = endDate;
        requestBody.country = countryParam || null;
        requestBody.company_code = companyCodeParam || null;
      } else {
        // Standard mode - include date range and filters
        requestBody.start_date = startDate;
        requestBody.end_date = endDate;
        requestBody.country = countryParam || null;
        requestBody.airline = airlineParam || null;
        requestBody.company_code = companyCodeParam || null;
        requestBody.origin_city = originCityParam || null;
        requestBody.destination_country = destinationCountryParam || null;
        requestBody.destination_city = destinationCityParam || null;
        requestBody.branch = branchParam || null;
      }

      const res = await fetch(`${API}/api/send-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = await res.json();
      if (!res.ok || result.status !== "success") throw new Error(result.detail || result.message || "Could not transmit PDF dashboard.");
      setEmailStatus(`Report sent to ${emailString}.`);
      setEmailSuccess(true);
      sent = true;
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "Could not transmit PDF dashboard.");
      setEmailSuccess(false);
    }
    setEmailLoading(false);
    return sent;
  };

  const handleSendStationEmail = async (stationCode: string, country: string) => {
    let targetCountry = country;
    if (stationCode === "VNM" || (targetCountry && targetCountry.toLowerCase().replace(/\s+/g, "") === "vietnam")) {
      targetCountry = "Viet Nam";
    }
    const emails = stationSelectedEmails[stationCode] || [];
    if (emails.length === 0) {
      setStationEmailStatus(prev => ({ ...prev, [stationCode]: "Please select at least one recipient." }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: false }));
      return;
    }
    setStationEmailLoading(prev => ({ ...prev, [stationCode]: true }));
    setStationEmailStatus(prev => ({ ...prev, [stationCode]: "Generating & transmitting report..." }));
    setStationEmailSuccess(prev => ({ ...prev, [stationCode]: null }));
    try {
      const emailString = emails.join(", ");
      // Format default SQL template dynamically with station parameters
      let formattedSql = "";
      if (stationCode === "OTHER") {
        const knownCompanies = stationsList.map(s => `'${s.code}'`).join(", ");
        formattedSql = buildFreightQuery(`
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
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.ETD >= '${startDate}'
    AND vt.ETD <= '${endDate}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company NOT IN (${knownCompanies})
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
        `, transportMode).trim();
      } else {
        formattedSql = buildFreightQuery(`
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
LEFT JOIN dbo.ChatData_ViewShipConsolLink vsc ON vsc.Link_ConsolNumber = vt.ConsoleNumber
LEFT JOIN dbo.ChatData_ViewRevandVolume_ShipmentDate vs ON vs.ShipmentNumber = vsc.Link_ShipmentNum
WHERE vt.ConLoadPortCountryName = '${targetCountry}'
    AND vt.ETD >= '${startDate}'
    AND vt.ETD <= '${endDate}'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = '${stationCode}'
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
        `, transportMode).trim();
      }

      const requestBody = {
        transport_mode: transportMode,
        recipient_email: emailString,
        mode: "custom-sql",
        custom_sql: formattedSql,
        include_weekly_visual: true,
        include_weekly_ledger: true,
        include_monthly_visual: true,
        include_monthly_ledger: true,
        max_data_rows: 100,
        country: country,
        company_code: stationCode,
        start_date: startDate,
        end_date: endDate,
      };

      const res = await fetch(`${API}/api/send-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = await res.json();
      if (!res.ok || result.status !== "success") throw new Error(result.detail || result.message || "Failed to send report.");
      setStationEmailStatus(prev => ({ ...prev, [stationCode]: result.message || "Report dispatch started." }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: true }));
    } catch (error) {
      setStationEmailStatus(prev => ({ ...prev, [stationCode]: error instanceof Error ? error.message : "Failed to send report." }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: false }));
    }
    setStationEmailLoading(prev => ({ ...prev, [stationCode]: false }));
  };

  const handleSendBranchEmail = async (branchCode: string, branchName: string) => {
    const emails = stationSelectedEmails[branchCode] || [];
    if (emails.length === 0) {
      setStationEmailStatus(prev => ({ ...prev, [branchCode]: "Please select at least one recipient." }));
      setStationEmailSuccess(prev => ({ ...prev, [branchCode]: false }));
      return;
    }
    setStationEmailLoading(prev => ({ ...prev, [branchCode]: true }));
    setStationEmailStatus(prev => ({ ...prev, [branchCode]: `Generating & transmitting ${branchCode} Branch report...` }));
    setStationEmailSuccess(prev => ({ ...prev, [branchCode]: null }));
    try {
      const emailString = emails.join(", ");
      const formattedSql = getBranchwiseSqlTemplate("India", "IND", branchCode, startDate, endDate);

      const requestBody = {
        transport_mode: transportMode,
        recipient_email: emailString,
        mode: "custom-sql",
        custom_sql: formattedSql,
        include_weekly_visual: true,
        include_weekly_ledger: true,
        include_monthly_visual: true,
        include_monthly_ledger: true,
        max_data_rows: 100,
        country: "India",
        company_code: "IND",
        branch: branchCode,
        report_level: "branch",
        start_date: startDate,
        end_date: endDate,
      };

      const res = await fetch(`${API}/api/send-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = await res.json();
      if (!res.ok || result.status !== "success") throw new Error(result.detail || result.message || "Failed to send branch report.");
      setStationEmailStatus(prev => ({ ...prev, [branchCode]: result.message || `${branchCode} Branch report dispatch started.` }));
      setStationEmailSuccess(prev => ({ ...prev, [branchCode]: true }));
    } catch (error) {
      setStationEmailStatus(prev => ({ ...prev, [branchCode]: error instanceof Error ? error.message : "Failed to send branch report." }));
      setStationEmailSuccess(prev => ({ ...prev, [branchCode]: false }));
    }
    setStationEmailLoading(prev => ({ ...prev, [branchCode]: false }));
  };

  const handleAddStationCustomEmail = (stationCode: string) => {
    const inputVal = (stationCustomEmailInput[stationCode] || "").trim();
    if (!inputVal) return;
    if (!inputVal.includes("@") || !inputVal.includes(".")) {
      alert("Please enter a valid email address.");
      return;
    }

    setStationSelectedEmails((prev) => {
      const current = prev[stationCode] || [];
      if (current.includes(inputVal)) return prev;
      return {
        ...prev,
        [stationCode]: [...current, inputVal],
      };
    });

    setStationCustomEmailInput((prev) => ({
      ...prev,
      [stationCode]: "",
    }));
  };

  const handleSaveStationRecipients = async (stationCode: string) => {
    if (!supabase) return;
    const emails = stationSelectedEmails[stationCode] || [];
    setStationEmailLoading(prev => ({ ...prev, [stationCode]: true }));
    setStationEmailStatus(prev => ({ ...prev, [stationCode]: "Saving recipients..." }));
    setStationEmailSuccess(prev => ({ ...prev, [stationCode]: null }));

    try {
      const isBranch = branchesList.some(b => b.code === stationCode);

      // Save directly into relational recipient tables
      try {
        if (isBranch) {
          await supabase.from("branch_recipients").delete().eq("branch_code", stationCode);
          if (emails.length > 0) {
            await supabase.from("branch_recipients").insert(
              emails.map(e => ({ branch_code: stationCode, email: e }))
            );
          }
        } else {
          await supabase.from("station_recipients").delete().eq("station_code", stationCode);
          if (emails.length > 0) {
            await supabase.from("station_recipients").insert(
              emails.map(e => ({ station_code: stationCode, email: e }))
            );
          }
        }
      } catch (recErr) {
        console.warn("Relational recipient save note (table may not exist yet):", recErr);
      }

      // Keep Tonnage user station assignments in sync.
      const currentDbUsers = dbUsers.filter(u => {
        if (!u.station) return false;
        const isRelevant = isSea ? (u.is_sea === true) : (u.is_air !== false);
        if (!isRelevant) return false;
        const stations = u.station.split(",").map((s: string) => s.trim()).filter(Boolean);
        return stations.includes(stationCode);
      });
      const currentDbEmails = currentDbUsers.map(u => u.email);
      const emailsToRemove = currentDbEmails.filter(e => !emails.includes(e));
      const emailsToUpsert = emails;

      // Update this location only; do not reconstruct assignments from stale UI lists.
      const getNewStationValue = (email: string, targetStation: string, removing: boolean) => {
        const existing = dbUsers.find(user => String(user.email || "").toLowerCase() === email.toLowerCase());
        return updateRecipientAssignment(existing?.station, targetStation, removing);
      };

      for (const email of emailsToRemove) {
        const newStationValue = getNewStationValue(email, stationCode, true);
        const displayName = orgUsers.find(u => u.email === email)?.displayName || email.split("@")[0];

        const { error } = await supabase
          .from(TONNAGE_USERS_TABLE)
          .update({ station: newStationValue, display_name: displayName })
          .eq("email", email);
        if (error) console.error("Error removing user from station:", error);
      }

      for (const email of emailsToUpsert) {
        const existingUser = dbUsers.find(u => u.email === email);
        const displayName = orgUsers.find(u => u.email === email)?.displayName || email.split("@")[0];
        const newStationValue = getNewStationValue(email, stationCode, false);

        if (existingUser) {
          const updatePayload: any = {
            station: newStationValue,
            display_name: displayName,
          };
          if (isSea) updatePayload.is_sea = true;
          else updatePayload.is_air = true;

          const { error } = await supabase
            .from(TONNAGE_USERS_TABLE)
            .update(updatePayload)
            .eq("email", email);
          if (error) throw error;
        } else {
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
          const { error } = await supabase
            .from(TONNAGE_USERS_TABLE)
            .insert({
              id: newId,
              email: email,
              display_name: displayName,
              station: newStationValue,
              is_air: !isSea,
              is_sea: isSea,
            });
          if (error) throw error;
        }
      }

      setStationEmailStatus(prev => ({ ...prev, [stationCode]: "Recipients saved successfully!" }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: true }));
      setTimeout(() => {
        setStationEmailStatus(prev => ({ ...prev, [stationCode]: "" }));
        setStationEmailSuccess(prev => ({ ...prev, [stationCode]: null }));
      }, 3000);

      fetchDbUsers(supabase);
      fetchStationsAndBranches(supabase);
    } catch (err: any) {
      console.error("Failed to save station recipients", err);
      setStationEmailStatus(prev => ({ ...prev, [stationCode]: `Error: ${err.message || "Failed to save"}` }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: false }));
    } finally {
      setStationEmailLoading(prev => ({ ...prev, [stationCode]: false }));
    }
  };

  const handleAddNewStation = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newStationCode.trim().toUpperCase();
    const name = newStationName.trim();
    const country = newStationCountry.trim();
    if (!code || !name) {
      alert("Please enter both a Station Code and Station Name.");
      return;
    }
    if (stationsList.some(s => s.code.toUpperCase() === code)) {
      alert(`Station with code "${code}" already exists.`);
      return;
    }
    const keywords = (newStationKeywords || country || name).toLowerCase().split(",").map(k => k.trim()).filter(Boolean);
    const newStation: StationInfo = {
      code,
      name,
      country: country || name,
      envVar: `RECIPIENTS_${code}`,
      matchCountries: keywords.length > 0 ? keywords : [country.toLowerCase()],
      isCustom: true,
    };
    const updated = [...stationsList, newStation];
    setStationsList(updated);

    if (supabase) {
      try {
        await supabase.from("stations").insert({
          code,
          name,
          country: country || name,
          env_var: `RECIPIENTS_${code}`,
          match_countries: keywords.length > 0 ? keywords : [country.toLowerCase()],
          is_active: true,
        });
      } catch (err) {
        console.warn("Could not insert station into Supabase table:", err);
      }
    }

    if (typeof window !== "undefined") {
      try {
        const customOnly = updated.filter(s => s.isCustom);
        localStorage.setItem("dgl_custom_stations", JSON.stringify(customOnly));
      } catch (e) { }
    }
    setNewStationCode("");
    setNewStationName("");
    setNewStationCountry("");
    setNewStationKeywords("");
    setIsAddStationModalOpen(false);
  };

  const handleRemoveStation = async (code: string) => {
    if (!confirm(`Are you sure you want to remove the station "${code}"?`)) return;
    const updated = stationsList.filter(s => s.code !== code);
    setStationsList(updated);

    if (supabase) {
      try {
        await supabase.from("stations").delete().eq("code", code);
        await supabase.from("station_recipients").delete().eq("station_code", code);
      } catch (err) {
        console.warn("Could not delete station from Supabase table:", err);
      }
    }

    if (typeof window !== "undefined") {
      try {
        const customOnly = updated.filter(s => s.isCustom);
        localStorage.setItem("dgl_custom_stations", JSON.stringify(customOnly));
      } catch (e) { }
    }
  };

  const handleAddNewBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newBranchCode.trim().toUpperCase();
    const name = newBranchName.trim();
    const city = newBranchCity.trim();
    if (!code || !name) {
      alert("Please enter both a Branch Code and Branch Name.");
      return;
    }
    if (branchesList.some(b => b.code.toUpperCase() === code)) {
      alert(`Branch with code "${code}" already exists.`);
      return;
    }
    const newBranch: BranchInfo = {
      code,
      name,
      city: city || name,
      isCustom: true,
    };
    const updated = [...branchesList, newBranch];
    setBranchesList(updated);

    if (supabase) {
      try {
        await supabase.from("branches").insert({
          code,
          name,
          city: city || name,
          is_active: true,
        });
      } catch (err) {
        console.warn("Could not insert branch into Supabase table:", err);
      }
    }

    if (typeof window !== "undefined") {
      try {
        const customOnly = updated.filter(b => b.isCustom);
        localStorage.setItem("dgl_custom_branches", JSON.stringify(customOnly));
      } catch (e) { }
    }
    setNewBranchCode("");
    setNewBranchName("");
    setNewBranchCity("");
    setIsAddBranchModalOpen(false);
  };

  const handleRemoveBranch = async (code: string) => {
    if (!confirm(`Are you sure you want to remove the branch "${code}"?`)) return;
    const updated = branchesList.filter(b => b.code !== code);
    setBranchesList(updated);

    if (supabase) {
      try {
        await supabase.from("branches").delete().eq("code", code);
        await supabase.from("branch_recipients").delete().eq("branch_code", code);
      } catch (err) {
        console.warn("Could not delete branch from Supabase table:", err);
      }
    }

    if (typeof window !== "undefined") {
      try {
        const customOnly = updated.filter(b => b.isCustom);
        localStorage.setItem("dgl_custom_branches", JSON.stringify(customOnly));
      } catch (e) { }
    }
  };

  // Intercepting the "Send Stats" button to trigger the new verification step
  const handleSendStatsClick = () => {
    if (activeRecipients.length === 0) {
      alert("Please select or add at least one recipient email address first.");
      return;
    }
    // Show section selector so user can customize PDF before sending
    setShowSectionSelector(true);
  };

  // --- DYNAMIC DATA RESOLUTION (SHADOWING STANDARD VARIABLES FOR CHARTS) ---
  const data = activeSection === "dashboard"
    ? standardRecords
    : activeSection === "weekly-reports"
      ? weeklySqlRecords
      : monthlySqlRecords;

  const currentSql = activeSection === "weekly-reports" ? weeklySqlText : monthlySqlText;
  const sqlReportCanSend = Boolean(lastExecutedSql[sqlReportKey] && lastExecutedSql[sqlReportKey] === currentSql.trim())
    && !(activeSection === "weekly-reports" ? weeklySqlIsRunning : monthlySqlIsRunning);

  const weeklyData = activeSection === "dashboard"
    ? standardWeeklyData
    : activeSection === "weekly-reports"
      ? weeklySqlWeeklyData
      : monthlySqlWeeklyData;

  const monthlyData = activeSection === "dashboard"
    ? standardMonthlyData
    : activeSection === "weekly-reports"
      ? weeklySqlMonthlyData
      : monthlySqlMonthlyData;

  const kpi = activeSection === "dashboard"
    ? standardKpi
    : activeSection === "weekly-reports"
      ? weeklySqlKpi
      : monthlySqlKpi;

  const sectorCarrierData = activeSection === "dashboard"
    ? standardSectorCarrierData
    : activeSection === "weekly-reports"
      ? weeklySqlSectorCarrierData
      : monthlySqlSectorCarrierData;

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

  const sectorChartData = getSectorChartData();
  const sectorChartMaximum = sectorChartData.reduce((sum, sector) => sum + sector.tonnage, 0) || 1;

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
      Australia: 0,
      South_Africa: 0,
      Pacific_Islands: 0,
      Others: 0
    });

    rows.push({
      ...convertRow(grandTotalCombined),
      isGrandTotal: true
    } as any);

    return rows;
  };

  // --- DYNAMIC SQL CONSOLE STATES ---
  const isSqlConsoleOpen = activeSection === "weekly-reports" ? isWeeklySqlConsoleOpen : isMonthlySqlConsoleOpen;
  const setIsSqlConsoleOpen = activeSection === "weekly-reports" ? setIsWeeklySqlConsoleOpen : setIsMonthlySqlConsoleOpen;
  const customSqlText = activeSection === "weekly-reports" ? weeklySqlText : monthlySqlText;
  const setCustomSqlText = activeSection === "weekly-reports" ? setWeeklySqlText : setMonthlySqlText;
  const sqlIsRunning = activeSection === "weekly-reports" ? weeklySqlIsRunning : monthlySqlIsRunning;
  const runCustomSqlQuery = activeSection === "weekly-reports" ? runWeeklyCustomSqlQuery : runMonthlyCustomSqlQuery;
  const stopCustomSqlQuery = activeSection === "weekly-reports" ? stopWeeklyCustomSqlQuery : stopMonthlyCustomSqlQuery;
  const sqlError = activeSection === "weekly-reports" ? weeklySqlError : monthlySqlError;
  const sqlExecutionStatus = activeSection === "weekly-reports" ? weeklySqlExecutionStatus : monthlySqlExecutionStatus;

  // Process data for Doughnut distribution (top 4 cities + others)
  const getDoughnutData = () => {
    const grouped = data.reduce((acc: any, curr: any) => {
      const cityName = curr.Origin_City || curr.Origin_Country || "Unknown Hub";
      acc[cityName] = (acc[cityName] || 0) + (curr.Total_Revenue || 0);
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

  // Process data for Airline Carrier wise tonnage (Top 10 overall, or highlight selected ones)
  const getAirlineWiseData = () => {
    const aggregated = data.reduce((acc: any, curr: any) => {
      const carrier = curr.Airline ?? curr.AirlineName1 ?? curr.carrier ?? "Unknown Carrier";
      const ton = Number(curr.Total_Tonnage ?? curr.Tonnage_Chargeable ?? curr.Air_ChargebleWeight ?? curr.tonnage ?? 0);
      acc[carrier] = (acc[carrier] || 0) + ton;
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
      const ton = Number(curr.Total_Tonnage ?? curr.Tonnage_Chargeable ?? curr.Air_ChargebleWeight ?? curr.tonnage ?? 0);
      acc[carrier] = (acc[carrier] || 0) + ton;
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

  // Process day-by-day stacked airline tonnage share
  const getDailyStackedAirlineData = () => {
    const topAirlines = getAirlineWiseData().map(a => a.name);
    const dayMap: { [key: string]: { date_label: string; sortKey: string;[key: string]: any } } = {};

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

    return Object.values(dayMap)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  const dailyStackedAirlineData = getDailyStackedAirlineData();
  const top10Airlines = getAirlineWiseData();
  const totalTop10Tonnage = top10Airlines.reduce((sum, item) => sum + item.tonnage, 0);
  const top10AirlinesNames = top10Airlines.map(a => a.name);

  // Process week-by-week stacked airline tonnage share (used in Monthly Reports tab)
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

    return Object.values(weekMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  const weeklyStackedAirlineData = getWeeklyStackedAirlineData();

  const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const value = payload.value;

    if (activeSection === "monthly-reports") {
      const index = weeklyStackedAirlineData.findIndex(item => item.week_label === value);
      if (index !== -1) {
        const getOrdinal = (n: number) => {
          const s = ["th", "st", "nd", "rd"];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };
        const monthNum = weeklyStackedAirlineData[index].month || 1;
        const monthStr = String(monthNum).padStart(2, '0');
        const subLabel = `${getOrdinal(index + 1)} week/${monthStr}`;
        return (
          <g transform={`translate(${x},${y})`}>
            <text
              x={0}
              y={0}
              dy={10}
              fill="#4A5568"
              fontSize={8.5}
              fontWeight="bold"
              textAnchor="middle"
            >
              {value}
            </text>
            <text
              x={0}
              y={11}
              dy={10}
              fill="#718096"
              fontSize={7.5}
              fontWeight="normal"
              textAnchor="middle"
            >
              {subLabel}
            </text>
          </g>
        );
      }
    }

    const isRotated = dailyStackedAirlineData.length > 8;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={10}
          fill="#4A5568"
          fontSize={8.5}
          fontWeight="bold"
          textAnchor={isRotated ? "end" : "middle"}
          transform={isRotated ? "rotate(-35)" : undefined}
        >
          {value}
        </text>
      </g>
    );
  };

  // Airline × Week stacked data — each row = one airline, each column = a week period
  const getAirlineWeeklyStackData = () => {
    const topAirlines = getAirlineWiseData().slice(0, 10).map(a => a.name);
    const weekSet = new Map<string, string>(); // sortKey → label
    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const { year: yr, week: wn, sortKey: sk } = freightIsoWeek(date, transportMode);
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
      const { year: yr, week: wn, sortKey: sk } = freightIsoWeek(date, transportMode);
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
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const { year: yr, week: wn, sortKey: sk } = freightIsoWeek(date, transportMode);
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

  // Build day-level tonnage series from raw SQL rows (ETD date) — used in SQL Sandbox mode
  const getDailyTonnageData = () => {
    const dayMap: { [key: string]: { date_label: string; Total_Tonnage: number; Total_Revenue: number; Total_Shipments: number } } = {};
    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = freightEtdDate(r, transportMode);
      if (isNaN(date.getTime())) return;
      const { year, month, day, weekday } = freightDayParts(date, transportMode);
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const label = `${dayNames[weekday]} ${day}/${month}`;
      if (!dayMap[dateStr]) {
        dayMap[dateStr] = { date_label: label, Total_Tonnage: 0, Total_Revenue: 0, Total_Shipments: 0 };
      }
      dayMap[dateStr].Total_Tonnage += Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0);
      dayMap[dateStr].Total_Revenue += Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0);
      dayMap[dateStr].Total_Shipments += Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1);
    });
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  };

  const dailyTonnageData = getDailyTonnageData();


  // Process data for stacked trial outcomes (Converted vs Cancelled) using different weight bands
  const stackedWeightBars = weeklyData.slice(-14).map((item) => {
    const total = item.Total_Shipments ?? 0;
    const heavyClass = Math.round(total * 0.72);
    const lightClass = total - heavyClass;
    return {
      week: item.week_label || `W${item.Week}`,
      Converted: heavyClass,
      Cancelled: lightClass
    };
  });

  // Construct print-view query params for preview window
  const getPrintViewUrl = () => {
    if (dashboardMode === "custom-sql") {
      const params = new URLSearchParams({ transport_mode: transportMode,
        mode: "custom-sql",
        include_weekly_visual: pdfSections.weeklyVisual.toString(),
        include_weekly_ledger: pdfSections.weeklyLedger.toString(),
        include_monthly_visual: pdfSections.monthlyVisual.toString(),
        include_monthly_ledger: "false",
        include_sea_sector_distribution: (isSea && pdfSections.seaSectorDistribution).toString(),
        max_data_rows: "100",
        report_type: activeSection === "weekly-reports" ? "weekly" : "monthly",
      });
      if (countryParam) params.append("country", countryParam);
      if (companyCodeParam) params.append("company_code", companyCodeParam);
      if (branchParam) params.append("branch", branchParam);
      if (cachedQueryId) {
        params.append("query_id", cachedQueryId);
      } else {
        params.append("custom_sql", activeSection === "weekly-reports" ? weeklySqlText : monthlySqlText);
      }
      return `/print-view?${params.toString()}`;
    }
    const params = new URLSearchParams({ transport_mode: transportMode, start_date: startDate, end_date: endDate });
    if (countryParam) params.append("country", countryParam);
    if (airlineParam) params.append("airline", airlineParam);
    if (companyCodeParam) params.append("company_code", companyCodeParam);
    if (originCityParam) params.append("origin_city", originCityParam);
    if (destinationCountryParam) params.append("destination_country", destinationCountryParam);
    if (destinationCityParam) params.append("destination_city", destinationCityParam);
    if (branchParam) params.append("branch", branchParam);
    // Add section selections and row limit
    params.append("include_weekly_visual", pdfSections.weeklyVisual.toString());
    params.append("include_weekly_ledger", pdfSections.weeklyLedger.toString());
    params.append("include_monthly_visual", pdfSections.monthlyVisual.toString());
    params.append("include_monthly_ledger", isSea ? "false" : pdfSections.monthlyLedger.toString());
    params.append("include_sea_sector_distribution", (isSea && pdfSections.seaSectorDistribution).toString());
    params.append("max_data_rows", "100");
    params.append("report_type", activeSection === "dashboard" ? "weekly" : "monthly");
    return `/print-view?${params.toString()}`;
  };

  const getSelectedCompanyNames = () => {
    if (selectedCompanies.length === 0) return "All Companies";
    const names = selectedCompanies.map(code => {
      const match = companyCodes.find(c => c.code === code);
      if (!match) return code;
      return match.name
        .replace("Dart Global Logistics", "DGL")
        .replace("DGL SUPPLY CHAIN SOLUTIONS", "DGL SCS")
        .replace(" (PVT) LTD", "")
        .replace(" PVT LTD", "")
        .replace(" LTD", "");
    });
    return names.join(", ");
  };

  // ── Admin panel state
  const [schedulePlaceholder, setSchedulePlaceholder] = useState("weekly");

  // ── Users page state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserStation, setNewUserStation] = useState("Global");
  const [dbUserSearch, setDbUserSearch] = useState("");
  const [dbUserStationFilter, setDbUserStationFilter] = useState("ALL");
  const [recipientDirectoryTab, setRecipientDirectoryTab] = useState<"stations" | "branches">("stations");
  const showRecipientBranches = recipientDirectoryTab === "branches";
  const directoryBranchParents = useMemo(() => new Map(directoryBranches.map(branch => {
    const parent = branch.company_code || (branch.country
      ? directoryStations.find(station => station.country.toLowerCase() === branch.country!.toLowerCase())?.code
      : "IND");
    return [branch.code.toUpperCase(), (parent || "").toUpperCase()];
  })), [directoryBranches, directoryStations]);
  const selectedDirectoryBranches = useMemo(() => directoryBranches.filter(branch =>
    directoryBranchParents.get(branch.code.toUpperCase()) === dbUserStationFilter.toUpperCase()
  ), [directoryBranches, directoryBranchParents, dbUserStationFilter]);
  const preferredBranchStation = directoryStations.find(station =>
    directoryBranches.some(branch => directoryBranchParents.get(branch.code.toUpperCase()) === station.code.toUpperCase())
  )?.code || directoryStations[0]?.code || "ALL";
  const formDirectoryBranches = directoryBranches.filter(branch =>
    directoryBranchParents.get(branch.code.toUpperCase()) ===
      (directoryBranchParents.get(recipientFormStation.toUpperCase()) || recipientFormStation.toUpperCase())
  );

  const selectRecipientStation = (code: string) => setDbUserStationFilter(code);
  const selectRecipientDirectoryTab = (tab: "stations" | "branches") => {
    setRecipientDirectoryTab(tab);
    setDbUserStationFilter(tab === "stations" ? "ALL" : preferredBranchStation);
    setDbUserSearch("");
  };

  useEffect(() => {
    const validStation = directoryStations.some(station => station.code === dbUserStationFilter);
    if ((dbUserStationFilter !== "ALL" && !validStation) || (showRecipientBranches && dbUserStationFilter === "ALL")) {
      setDbUserStationFilter(showRecipientBranches ? preferredBranchStation : "ALL");
    }
  }, [directoryStations, dbUserStationFilter, showRecipientBranches, preferredBranchStation]);

  const scopedDirectoryUsers = useMemo(() => dbUsers.filter(user => {
    const query = dbUserSearch.trim().toLowerCase();
    if (query && ![user.display_name, user.email, user.station].some(value =>
      String(value || "").toLowerCase().includes(query))) return false;
    const assignments = recipientAssignmentCodes(user.station);
    if (showRecipientBranches) {
      return selectedDirectoryBranches.some(branch => assignments.includes(branch.code.toUpperCase()));
    }
    const stationAssignments = assignments.filter(code => !directoryBranchParents.has(code));
    if (stationAssignments.length === 0) return false;
    if (dbUserStationFilter !== "ALL" && !stationAssignments.includes(dbUserStationFilter.toUpperCase())) return false;
    return true;
  }), [dbUsers, dbUserSearch, dbUserStationFilter, showRecipientBranches, selectedDirectoryBranches, directoryBranchParents]);

  const visibleDirectoryUsers = useMemo(() => scopedDirectoryUsers.filter(user =>
    dbUserFreightFilter === "AIR" ? user.is_air !== false :
    dbUserFreightFilter === "SEA" ? user.is_sea === true : true
  ), [scopedDirectoryUsers, dbUserFreightFilter]);

  // Pre-calculated summary of users per branch for Recipients Directory
  const branchUserSummary = useMemo(() => {
    const summary: Record<string, { directUsers: any[]; globalUsers: any[]; allUsers: any[] }> = {};
    const freightFiltered = dbUsers.filter(u => {
      if (dbUserFreightFilter === "AIR" && u.is_air === false) return false;
      if (dbUserFreightFilter === "SEA" && u.is_sea !== true) return false;
      return true;
    });

    const globalUsers = freightFiltered.filter(u => {
      const stations = (u.station || "").split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      return stations.includes("GLOBAL");
    });

    selectedDirectoryBranches.forEach(b => {
      const codeUpper = b.code.toUpperCase();
      const direct = freightFiltered.filter(u => {
        const stations = (u.station || "").split(",").map((s: string) => s.trim().toUpperCase()).filter(Boolean);
        return stations.includes(codeUpper);
      });
      const directEmails = new Set(direct.map(u => (u.email || "").toLowerCase()));
      const combined = [...direct, ...globalUsers.filter(u => !directEmails.has((u.email || "").toLowerCase()))];
      summary[b.code] = {
        directUsers: direct,
        globalUsers: globalUsers,
        allUsers: combined,
      };
    });

    return summary;
  }, [dbUsers, selectedDirectoryBranches, dbUserFreightFilter]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-10 h-10 text-[#3182CE] animate-spin" />
          <p className="text-sm font-medium text-slate-500">Checking credentials...</p>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-[#E2E8F0] shadow-xl rounded-2xl p-8 flex flex-col items-center space-y-6 animate-in fade-in-0 duration-200">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="bg-[#EBF8FF] p-4 rounded-full border border-[#BEE3F8] mb-2">
              <ShieldCheck className="w-12 h-12 text-[#3182CE]" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{freightText("DGL Tonnage Dashboard", transportMode)}</h2>
            <p className="text-xs text-slate-400 font-medium">Administrator Sign In Required</p>
          </div>

          <form onSubmit={handleEmailPasswordLogin} className="w-full space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
              <Input
                type="email"
                placeholder="admin@dartglobal.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                className="h-10 text-xs bg-slate-50 border-[#E2E8F0] rounded-xl text-slate-700 focus:bg-white"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                className="h-10 text-xs bg-slate-50 border-[#E2E8F0] rounded-xl text-slate-700 focus:bg-white"
              />
            </div>

            {loginError && (
              <p className="text-[11px] text-red-500 font-semibold bg-red-50 p-2.5 rounded-lg border border-red-100">
                ⚠️ {loginError}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-[#3182CE] hover:bg-[#2B6CB0] text-white rounded-xl transition-all shadow-md font-bold text-sm"
            >
              Sign In
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!isAdminVerified) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-[#FED7D7] shadow-xl rounded-2xl p-8 flex flex-col items-center text-center space-y-6">
          <div className="bg-[#FFF5F5] p-4 rounded-full border border-[#FEB2B2]">
            <X className="w-12 h-12 text-[#E53E3E]" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Access Denied</h2>
            <p className="text-sm text-slate-400 mt-2 font-medium">
              The email <span className="text-slate-700 font-semibold">{session.user.email}</span> is not registered in the administrator database.
            </p>
          </div>

          <div className="w-full border-t border-slate-100 my-2" />

          <Button
            onClick={handleLogout}
            className="w-full h-11 bg-[#E53E3E] hover:bg-[#C53030] text-white rounded-xl transition-all shadow-md font-bold text-sm"
          >
            Sign Out & Try Another Account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">

      {/* ── CLEAN TOP HEADER BAR ── */}
      <div className="bg-white border-b border-[#E2E8F0] shadow-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleSidebar}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="p-1.5 -ml-1.5 mr-0.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 shrink-0"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-5 h-5 text-slate-600" />
              ) : (
                <PanelLeftClose className="w-5 h-5 text-slate-600" />
              )}
            </button>
            <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain shrink-0" />
            <h1 className="text-lg font-bold text-[#1A202C] tracking-tight">{freightText("DGL Tonnage Analysis", transportMode)}</h1>
            <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded-full bg-[#EDF2F7] border border-[#E2E8F0]">{freightText("\n              Tonnage Dashboard\n            ", transportMode)}</span>
          </div>

          {/* Header right: active section badge + quick actions */}
          <div className="flex items-center gap-3">
            {/* Active session email & logout */}
            {session && (
              <div className="hidden lg:flex items-center gap-2 border-r border-[#E2E8F0] pr-3 mr-1 text-[11px] text-slate-500 font-semibold">
                <span>{session.user.email}</span>
                <button
                  onClick={handleLogout}
                  className="text-red-500 hover:text-red-700 transition-colors font-bold uppercase tracking-wider text-[9px] bg-red-50 px-2 py-0.5 rounded border border-red-200"
                >
                  Sign Out
                </button>
              </div>
            )}

            {session && (
              <div className="lg:hidden flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="h-8 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 font-bold border-red-200"
                >
                  Logout
                </Button>
              </div>
            )}

            {/* Active section indicator */}
            <span className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 font-medium px-2.5 py-1 rounded-full bg-[#EDF2F7] border border-[#E2E8F0]">
              {activeSection === "dashboard" && <><LayoutDashboard className="w-3 h-3" /> Dashboard</>}
              {activeSection === "weekly-reports" && <><BarChart2 className="w-3 h-3 text-amber-600" /> Weekly Reports</>}
              {activeSection === "monthly-reports" && <><Calendar className="w-3 h-3 text-emerald-600" /> Monthly Reports</>}
              {activeSection === "admin" && <><ShieldCheck className="w-3 h-3 text-[#3182CE]" /> Admin Panel</>}
              {activeSection === "email-scheduling" && <><Clock className="w-3 h-3 text-violet-500" /> Email Scheduling</>}
            </span>

            {/* Quick Admin shortcut (shown on non-admin sections) */}
            {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
              <Button
                onClick={() => setActiveSection("admin")}
                className="h-8 px-3 bg-white hover:bg-slate-50 border border-[#CBD5E0] text-slate-700 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Send className="w-3.5 h-3.5 text-slate-500" />
                Send Report
              </Button>
            )}

            {/* PDF Live Preview */}
            {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
              <Button
                onClick={openPdfPreview}
                className="h-8 px-3.5 bg-white hover:bg-slate-50 border border-[#CBD5E0] text-slate-700 text-xs font-bold rounded-md flex items-center gap-1.5 transition-all shadow-sm"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                PDF Preview
              </Button>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={fetchMainAnalytics}
              disabled={loading}
              className="h-8 w-8 border-[#CBD5E0] hover:bg-slate-50 text-slate-500 rounded-md"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

        </div>
      </div>

      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Freight analysis" className="inline-flex rounded-xl bg-slate-100 p-1 gap-1">
            {(["AIR", "SEA"] as TransportMode[]).map(mode => {
              const Icon = mode === "SEA" ? Ship : Plane;
              return <button key={mode} role="tab" data-mode={mode} id={`freight-tab-${transportMode}-${mode}`} aria-controls={`freight-panel-${mode}`} aria-selected={transportMode === mode} tabIndex={transportMode === mode ? 0 : -1}
                onClick={() => onModeChange(mode)}
                onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "AIR" : event.key === "End" ? "SEA" : mode === "AIR" ? "SEA" : "AIR"; onModeChange(next); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[role="tabpanel"]:not([hidden]) [data-mode="${next}"]`)?.focus()); } }}
                className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold transition-all ${transportMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                <Icon className={`h-4 w-4 ${mode === "SEA" ? "text-teal-600" : "text-blue-600"}`} />{mode === "SEA" ? "Sea Freight" : "Air Freight"}
              </button>;
            })}
          </div>
          <p className="text-xs text-slate-500">{isSea ? "Shipping lines · FCL TEUs · LCL m³" : "Airlines · Chargeable weight · Revenue"}</p>
        </div>
      </div>

      {/* ── SIDEBAR + MAIN LAYOUT ── */}
      <div className="flex" style={{ minHeight: "calc(100vh - 64px)" }}>

        {/* ── LEFT SIDEBAR ── */}
        <nav
          className={`sidebar-nav ${isSidebarCollapsed ? "collapsed" : ""}`}
          aria-label="Sidebar navigation"
        >
          {/* Header with collapse/expand toggle */}
          <div className={`pb-3 border-b border-[#EDF2F7] mb-2 flex items-center ${isSidebarCollapsed ? "justify-center px-2" : "justify-between px-4"}`}>
            {!isSidebarCollapsed && (
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest select-none">Navigation</p>
            )}
            <button
              type="button"
              onClick={toggleSidebar}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          </div>

          {!isSidebarCollapsed ? (
            <span className="sidebar-section-label">Main</span>
          ) : (
            <div className="my-1.5 mx-3 border-t border-slate-100" />
          )}

          <button
            onClick={() => setActiveSection("dashboard")}
            title="Dashboard"
            aria-label="Dashboard"
            className={`sidebar-nav-item ${activeSection === "dashboard" ? "active" : ""}`}
          >
            <LayoutDashboard className="nav-icon" />
            {!isSidebarCollapsed && <span>Dashboard</span>}
          </button>

          <button
            onClick={() => {
              setActiveSection("weekly-reports");
              setIsWeeklySqlConsoleOpen(true);
            }}
            title="Weekly Reports"
            aria-label="Weekly Reports"
            className={`sidebar-nav-item ${activeSection === "weekly-reports" ? "active" : ""}`}
          >
            <BarChart2 className="nav-icon" />
            {!isSidebarCollapsed && <span>Weekly Reports</span>}
          </button>

          <button
            onClick={() => {
              setActiveSection("monthly-reports");
              setIsMonthlySqlConsoleOpen(true);
            }}
            title="Monthly Reports"
            aria-label="Monthly Reports"
            className={`sidebar-nav-item ${activeSection === "monthly-reports" ? "active" : ""}`}
          >
            <Calendar className="nav-icon" />
            {!isSidebarCollapsed && <span>Monthly Reports</span>}
          </button>

          {!isSidebarCollapsed ? (
            <span className="sidebar-section-label" style={{ marginTop: 12 }}>System</span>
          ) : (
            <div className="my-2 mx-3 border-t border-slate-100" />
          )}

          <button
            onClick={() => setActiveSection("admin")}
            title="Admin Panel"
            aria-label="Admin Panel"
            className={`sidebar-nav-item ${activeSection === "admin" ? "active" : ""}`}
          >
            <ShieldCheck className="nav-icon" />
            {!isSidebarCollapsed && <span>Admin Panel</span>}
          </button>

          <button
            onClick={() => setActiveSection("email-scheduling")}
            title="Email Scheduling"
            aria-label="Email Scheduling"
            className={`sidebar-nav-item ${activeSection === "email-scheduling" ? "active" : ""}`}
          >
            <Clock className="nav-icon" />
            {!isSidebarCollapsed && <span>Email Scheduling</span>}
          </button>

          <button
            onClick={() => setActiveSection("users")}
            title="Users"
            aria-label="Users"
            className={`sidebar-nav-item ${activeSection === "users" ? "active" : ""}`}
          >
            <Users className="nav-icon" />
            {!isSidebarCollapsed && <span>Users</span>}
          </button>

          <div style={{ marginTop: "auto" }} className={`${isSidebarCollapsed ? "px-2" : "px-4"} pt-4 pb-2 border-t border-[#EDF2F7] flex flex-col items-center text-center`}>
            {!isSidebarCollapsed ? (
              <>
                <p className="text-[9px] text-slate-300 font-semibold">{freightText("DGL Tonnage Analysis", transportMode)}</p>
                <p className="text-[9px] text-slate-300">&copy; 2026 Dart Global Logistics</p>
              </>
            ) : (
              <button
                type="button"
                onClick={toggleSidebar}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </nav>

        {/* ── MAIN CONTENT AREA ── */}
        <div className="flex-1 min-w-0 pb-12">
          {analyticsError && activeSection === "dashboard" && (
            <div role="alert" className="mx-6 mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              Could not load {isSea ? "sea" : "air"} freight data: {analyticsError}
            </div>
          )}

          {/* ── FILTER UTILITIES STRIP ── */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
            <div className="w-full px-4 sm:px-6 lg:px-8 mt-6">
              <div className="bg-white rounded-xl p-5 border border-[#E2E8F0] shadow-sm space-y-4">

                {/* Section Header */}
                <div className="flex items-center pb-3 border-b border-[#EDF2F7]">
                  <div className="flex items-center gap-2">
                    {activeSection === "dashboard" ? (
                      <><Layers className="w-4 h-4 text-[#3182CE]" /><span className="text-xs font-bold text-slate-700">Standard Filters</span></>
                    ) : activeSection === "weekly-reports" ? (
                      <><Database className="w-4 h-4 text-amber-600" /><span className="text-xs font-bold text-slate-700">Insert SQL for Weekly Reports</span></>
                    ) : (
                      <><Database className="w-4 h-4 text-emerald-600" /><span className="text-xs font-bold text-slate-700">Insert SQL for Monthly Reports</span></>
                    )}
                  </div>
                </div>

                {dashboardMode === "standard" ? (
                  <>
                    {/* Row 1: Global Entity & Timeframe */}
                    <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-[#F1F5F9]">
                      {/* Start Date */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Date</span>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="h-8 w-40 text-xs bg-white border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                        />
                      </div>

                      {/* End Date */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">End Date</span>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="h-8 w-40 text-xs bg-white border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                        />
                      </div>

                      {/* Company Code */}
                      <MultiSelect
                        label="Company Code"
                        options={companyCodes}
                        selected={selectedCompanies}
                        onChange={setSelectedCompanies}
                        placeholder="All Companies"
                        isObject={true}
                        emoji="🏢"
                      />

                      {/* Branch */}
                      <MultiSelect
                        label="Branch"
                        options={branches}
                        selected={selectedBranches}
                        onChange={setSelectedBranches}
                        placeholder="All Branches"
                        isObject={true}
                        emoji="🏢"
                      />

                      {/* Airline Carrier */}
                      <MultiSelect
                        label={freightText("Airline Carrier", transportMode)}
                        wrapOptions={isSea}
                        options={airlines}
                        selected={selectedAirlines}
                        onChange={setSelectedAirlines}
                        placeholder="All Carriers"
                        emoji={isSea ? "🚢" : "✈️"}
                      />
                    </div>

                    {/* Row 2: Route Hierarchy */}
                    <div className="flex flex-wrap items-center gap-4">
                      {/* FROM (Origin Hub) Hierarchy */}
                      <div className="flex items-center gap-3 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                        <span className="text-[10px] font-extrabold text-[#3182CE] bg-[#EBF8FF] px-2 py-1 rounded uppercase tracking-wider shrink-0">From</span>

                        <MultiSelect
                          label="Country"
                          options={countries}
                          selected={selectedCountries}
                          onChange={setSelectedCountries}
                          placeholder="All Countries"
                          emoji="🌍"
                          widthClass="min-w-[190px]"
                        />

                        <MultiSelect
                          label="City"
                          options={originCities}
                          selected={selectedOriginCities}
                          onChange={setSelectedOriginCities}
                          placeholder="All Cities"
                          emoji="🏙️"
                          widthClass="min-w-[190px]"
                        />
                      </div>

                      {/* TO (Destination Hub) Hierarchy */}
                      <div className="flex items-center gap-3 bg-emerald-50/30 p-2 rounded-lg border border-emerald-100/50">
                        <span className="text-[10px] font-extrabold text-[#38A169] bg-[#E6FFFA] px-2 py-1 rounded uppercase tracking-wider shrink-0">To</span>

                        <MultiSelect
                          label="Country"
                          options={destinationCountries}
                          selected={selectedDestCountries}
                          onChange={setSelectedDestCountries}
                          placeholder="All Countries"
                          emoji="🌍"
                          widthClass="min-w-[190px]"
                        />

                        <MultiSelect
                          label="City"
                          options={destinationCities}
                          selected={selectedDestCities}
                          onChange={setSelectedDestCities}
                          placeholder="All Cities"
                          emoji="🏙️"
                          widthClass="min-w-[190px]"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Sub-tab Navigation & Controls for Stationwise vs Branchwise */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeSection === "weekly-reports") {
                              setWeeklyReportLevel("station");
                              const stObj = stationsList.find(s => s.code === weeklyStation) || stationsList[0] || { country: "India", code: "IND" };
                              setWeeklySqlText(getStationwiseSqlTemplate(stObj.country, stObj.code, startDate, endDate));
                            } else {
                              setMonthlyReportLevel("station");
                              const stObj = stationsList.find(s => s.code === monthlyStation) || stationsList[0] || { country: "India", code: "IND" };
                              setMonthlySqlText(getStationwiseSqlTemplate(stObj.country, stObj.code, startDate, endDate));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${(activeSection === "weekly-reports" ? weeklyReportLevel : monthlyReportLevel) === "station"
                            ? "bg-[#3182CE] text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                        >
                          Stationwise Reports
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const brObj = branchesList.find(b => b.code === (activeSection === "weekly-reports" ? weeklyBranch : monthlyBranch)) || branchesList[0] || { code: "BLR" };
                            if (activeSection === "weekly-reports") {
                              setWeeklyReportLevel("branch");
                              setWeeklySqlText(getBranchwiseSqlTemplate("India", "IND", brObj.code, startDate, endDate));
                            } else {
                              setMonthlyReportLevel("branch");
                              setMonthlySqlText(getBranchwiseSqlTemplate("India", "IND", brObj.code, startDate, endDate));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${(activeSection === "weekly-reports" ? weeklyReportLevel : monthlyReportLevel) === "branch"
                            ? "bg-[#3182CE] text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                        >
                          Branchwise Reports
                        </button>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Station Dropdown Selector (Active when Stationwise mode selected) */}
                        {(activeSection === "weekly-reports" ? weeklyReportLevel : monthlyReportLevel) === "station" && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Station:</span>
                            <select
                              value={activeSection === "weekly-reports" ? weeklyStation : monthlyStation}
                              onChange={(e) => {
                                const stCode = e.target.value;
                                const stObj = stationsList.find(s => s.code === stCode) || stationsList[0] || { country: "India", code: "IND" };
                                if (activeSection === "weekly-reports") {
                                  setWeeklyStation(stCode);
                                  setWeeklySqlText(getStationwiseSqlTemplate(stObj.country, stObj.code, startDate, endDate));
                                } else {
                                  setMonthlyStation(stCode);
                                  setMonthlySqlText(getStationwiseSqlTemplate(stObj.country, stObj.code, startDate, endDate));
                                }
                              }}
                              className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#3182CE]"
                            >
                              {stationsList.map((st) => (
                                <option key={st.code} value={st.code}>
                                  {st.name} ({st.code})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Branch Dropdown Selector (Active when Branchwise mode selected) */}
                        {(activeSection === "weekly-reports" ? weeklyReportLevel : monthlyReportLevel) === "branch" && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Branch:</span>
                            <select
                              value={activeSection === "weekly-reports" ? weeklyBranch : monthlyBranch}
                              onChange={(e) => {
                                const b = e.target.value;
                                if (activeSection === "weekly-reports") {
                                  setWeeklyBranch(b);
                                  setWeeklySqlText(getBranchwiseSqlTemplate("India", "IND", b, startDate, endDate));
                                } else {
                                  setMonthlyBranch(b);
                                  setMonthlySqlText(getBranchwiseSqlTemplate("India", "IND", b, startDate, endDate));
                                }
                              }}
                              className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#3182CE]"
                            >
                              {branchesList.map((br) => (
                                <option key={br.code} value={br.code}>{br.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Date Range Selectors */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start:</span>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-8 w-36 text-xs bg-white border-slate-300 rounded-lg text-slate-700 [color-scheme:light]"
                          />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">End:</span>
                          <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="h-8 w-36 text-xs bg-white border-slate-300 rounded-lg text-slate-700 [color-scheme:light]"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const isBranch = (activeSection === "weekly-reports" ? weeklyReportLevel : monthlyReportLevel) === "branch";
                              const b = activeSection === "weekly-reports" ? weeklyBranch : monthlyBranch;
                              const stCode = activeSection === "weekly-reports" ? weeklyStation : monthlyStation;
                              const stObj = stationsList.find(s => s.code === stCode) || stationsList[0] || { country: "India", code: "IND" };
                              const updatedSql = isBranch
                                ? getBranchwiseSqlTemplate("India", "IND", b, startDate, endDate)
                                : getStationwiseSqlTemplate(stObj.country, stObj.code, startDate, endDate);
                              if (activeSection === "weekly-reports") setWeeklySqlText(updatedSql);
                              else setMonthlySqlText(updatedSql);
                            }}
                            className="h-8 px-3 text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            Update Query Parameters
                          </Button>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (activeSection === "weekly-reports") {
                              setIsWeeklySqlConsoleOpen(!isWeeklySqlConsoleOpen);
                            } else {
                              setIsMonthlySqlConsoleOpen(!isMonthlySqlConsoleOpen);
                            }
                          }}
                          className="h-8 text-xs text-[#3182CE] hover:bg-[#EBF8FF] font-semibold ml-auto"
                        >
                          {(activeSection === "weekly-reports" ? isWeeklySqlConsoleOpen : isMonthlySqlConsoleOpen) ? "Collapse Editor" : "Expand Editor"}
                        </Button>
                      </div>
                    </div>

                    {(activeSection === "weekly-reports" ? isWeeklySqlConsoleOpen : isMonthlySqlConsoleOpen) && (
                      <div className="space-y-3">
                        <div className="relative border border-[#CBD5E0] rounded-lg overflow-hidden shadow-inner">
                          <textarea
                            value={activeSection === "weekly-reports" ? weeklySqlText : monthlySqlText}
                            onChange={(e) => {
                              if (activeSection === "weekly-reports") setWeeklySqlText(e.target.value);
                              else setMonthlySqlText(e.target.value);
                            }}
                            rows={12}
                            className="w-full p-4 bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#3182CE] resize-y"
                            placeholder="SELECT * FROM dbo.ChatData_ViewShipConsolTransport..."
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <Button
                            onClick={() => {
                              if (activeSection === "weekly-reports") runWeeklyCustomSqlQuery();
                              else runMonthlyCustomSqlQuery();
                            }}
                            disabled={activeSection === "weekly-reports" ? weeklySqlIsRunning : monthlySqlIsRunning}
                            className="h-8 px-4 bg-[#3182CE] hover:bg-[#2B6CB0] disabled:opacity-60 text-white text-xs font-bold rounded-md flex items-center gap-1.5 transition-all shadow"
                          >
                            {(activeSection === "weekly-reports" ? weeklySqlIsRunning : monthlySqlIsRunning) ? (
                              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Running...</span></>
                            ) : (
                              "▶ Execute Custom SQL"
                            )}
                          </Button>

                          {(activeSection === "weekly-reports" ? weeklySqlIsRunning : monthlySqlIsRunning) && (
                            <Button
                              onClick={() => {
                                if (activeSection === "weekly-reports") stopWeeklyCustomSqlQuery();
                                else stopMonthlyCustomSqlQuery();
                              }}
                              className="h-8 px-3.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-md flex items-center gap-1.5 transition-all shadow animate-in fade-in duration-150"
                            >
                              <span className="w-3 h-3 rounded-sm bg-white inline-block shrink-0" />
                              Stop Execution
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const isBranch = (activeSection === "weekly-reports" ? weeklyReportLevel : monthlyReportLevel) === "branch";
                              const b = activeSection === "weekly-reports" ? weeklyBranch : monthlyBranch;
                              const stCode = activeSection === "weekly-reports" ? weeklyStation : monthlyStation;
                              const stObj = stationsList.find(s => s.code === stCode) || stationsList[0] || { country: "India", code: "IND" };
                              const defaultSql = isBranch
                                ? getBranchwiseSqlTemplate("India", "IND", b, startDate, endDate)
                                : getStationwiseSqlTemplate(stObj.country, stObj.code, startDate, endDate);
                              if (activeSection === "weekly-reports") setWeeklySqlText(defaultSql);
                              else setMonthlySqlText(defaultSql);
                            }}
                            className="h-8 px-3 border-[#CBD5E0] text-slate-650 hover:bg-slate-50 text-xs font-medium rounded-md"
                          >
                            Reset Template
                          </Button>
                        </div>
                      </div>
                    )}

                    <ReportRecipientPicker key={`${transportMode}-${sqlReportKey}`}
                      people={sqlRecipientOptions} recipient={activeRecipients[0] || ""}
                      onChange={email => {
                        setSqlReportRecipients(prev => ({...prev, [sqlReportKey]: email ? [email] : []}));
                        setEmailStatus(""); setEmailSuccess(null);
                      }}
                      onSend={() => {setEmailStatus(""); setEmailSuccess(null); handleSendStatsClick();}}
                      loading={sqlRecipientUsersLoading || orgUsersLoading} directoryError={sqlRecipientUsersError}
                      canSend={sqlReportCanSend} sending={emailLoading}
                      reportLabel={`${transportMode === "SEA" ? "Sea" : "Air"} ${sqlReportKey === "weekly" ? "Weekly" : "Monthly"}`}
                    />

                    {/* Console logs & feedback */}
                    {(activeSection === "weekly-reports" ? weeklySqlExecutionStatus : monthlySqlExecutionStatus) && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 font-medium flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <span>{activeSection === "weekly-reports" ? weeklySqlExecutionStatus : monthlySqlExecutionStatus}</span>
                      </div>
                    )}

                    {(activeSection === "weekly-reports" ? weeklySqlError : monthlySqlError) && (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 text-xs text-rose-700 space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                          <span>⚠️ Database Query Error</span>
                        </p>
                        <p className="font-mono text-[10.5px] leading-relaxed break-all bg-white/70 p-2 rounded border border-rose-100">
                          {activeSection === "weekly-reports" ? weeklySqlError : monthlySqlError}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── SELECTED RECIPIENTS STRIP (Dashboard only) ── */}
          {activeSection === "dashboard" && selectedEmails.length > 0 && (
            <div className="w-full px-4 sm:px-6 lg:px-8 mt-3 animate-in fade-in-0 duration-200">
              <div className="flex flex-wrap items-center gap-2 p-2 bg-[#EBF8FF]/50 border border-[#BEE3F8]/60 rounded-lg shadow-sm">
                <span className="text-[10px] font-bold text-[#2B6CB0] uppercase tracking-wider px-1">Selected Recipients:</span>
                {selectedEmails.map((emailOption) => (
                  <Badge
                    key={emailOption}
                    className="bg-white hover:bg-slate-50 text-slate-700 border border-[#CBD5E0] font-semibold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm"
                  >
                    <span>{emailOption}</span>
                    <X
                      className="w-3 h-3 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                      onClick={() => setSelectedEmails(selectedEmails.filter((x) => x !== emailOption))}
                    />
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {/* Inline Feedback Alerts */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && emailStatus && (
            <div className="w-full px-4 sm:px-6 lg:px-8 mt-4">
              <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${emailSuccess === true ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
                <span>{emailStatus}</span>
                <button onClick={() => setEmailStatus("")} className="hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {/* ── ADMIN PANEL SECTION ── */}
          {activeSection === "admin" && (
            <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in-0 duration-200">

              {/* Admin Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-6">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <ShieldCheck className="w-5 h-5 text-[#3182CE]" />
                    <h2 className="text-xl font-extrabold text-[#1A202C] tracking-tight">Admin Panel</h2>
                  </div>
                  <p className="text-sm text-slate-400">Manage report recipients and email dispatch settings.</p>
                </div>

                {/* Date range selector for report dispatches */}
                <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm shrink-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Start Date</span>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-8 w-40 text-xs bg-slate-50 border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">End Date</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-8 w-40 text-xs bg-slate-50 border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-6">

                {/* ── LEFT COL: Recipients Management ── */}
                <div className="col-span-12 space-y-5">

                  {/* Admin Sub-Tabs */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5 mb-5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setAdminTab("stations")}
                        className={`pb-2 px-3 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${adminTab === "stations" ? "border-sky-500 text-sky-700 bg-sky-50/50 rounded-t-lg" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                      >
                        <Globe className="w-3.5 h-3.5 text-sky-500" />
                        <span>Station-wise Mailers</span>
                        <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-extrabold ${adminTab === "stations" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-500"}`}>
                          {stationsList.length}
                        </span>
                      </button>
                      <button
                        onClick={() => setAdminTab("branches")}
                        className={`pb-2 px-3 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${adminTab === "branches" ? "border-sky-500 text-sky-700 bg-sky-50/50 rounded-t-lg" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                      >
                        <Building2 className="w-3.5 h-3.5 text-sky-500" />
                        <span>Branch-wise Mailers</span>
                        <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-extrabold ${adminTab === "branches" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-500"}`}>
                          {branchesList.length}
                        </span>
                      </button>
                      <button
                        onClick={() => setAdminTab("global")}
                        className={`pb-2 px-3 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${adminTab === "global" ? "border-sky-500 text-sky-700 bg-sky-50/50 rounded-t-lg" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                      >
                        <Users className="w-3.5 h-3.5 text-sky-500" />
                        <span>Global Mailer</span>
                      </button>
                    </div>

                    {/* Action on the right */}
                    <div className="flex items-center gap-2">
                      {adminTab === "stations" && (
                        <Button
                          onClick={() => setIsAddStationModalOpen(true)}
                          className="h-7.5 px-3 bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold rounded-lg shadow-xs flex items-center gap-1 transition-all"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>Add Station</span>
                        </Button>
                      )}
                      {adminTab === "branches" && (
                        <Button
                          onClick={() => setIsAddBranchModalOpen(true)}
                          className="h-7.5 px-3 bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold rounded-lg shadow-xs flex items-center gap-1 transition-all"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>+ Add Branch</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {adminTab === "stations" ? (
                    <div className="space-y-4">
                      {/* Station Filter & Search Toolbar */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-sky-100 shadow-2xs">
                        <div className="relative flex-1 min-w-[220px]">
                          <Search className="w-3.5 h-3.5 text-sky-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <Input
                            placeholder="Search station by name, country, or code (e.g. CMB, IND, NYC)..."
                            value={stationFilterSearch}
                            onChange={(e) => setStationFilterSearch(e.target.value)}
                            className="pl-8 pr-3 h-8 bg-slate-50/80 border-slate-200 rounded-lg text-[11px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-sky-400"
                          />
                          {stationFilterSearch && (
                            <button
                              onClick={() => setStationFilterSearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-0.5 sm:pb-0">
                          <button
                            onClick={() => setStationFilterStatus("all")}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${stationFilterStatus === "all" ? "bg-sky-500 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            All ({stationsList.length})
                          </button>
                          <button
                            onClick={() => setStationFilterStatus("configured")}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${stationFilterStatus === "configured" ? "bg-amber-400 text-slate-900 shadow-2xs font-extrabold" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            Configured ({stationsList.filter(s => (stationSelectedEmails[s.code] || []).length > 0).length})
                          </button>
                          <button
                            onClick={() => setStationFilterStatus("unconfigured")}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${stationFilterStatus === "unconfigured" ? "bg-slate-700 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            Pending ({stationsList.filter(s => (stationSelectedEmails[s.code] || []).length === 0).length})
                          </button>
                        </div>
                      </div>

                      {/* 4 to 5 Boxes per Row Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">

                        {/* ── STATION CARDS ── */}
                        {stationsList
                          .filter((station) => {
                            const q = stationFilterSearch.toLowerCase().trim();
                            const matchesSearch = !q ||
                              station.name.toLowerCase().includes(q) ||
                              station.code.toLowerCase().includes(q) ||
                              station.country.toLowerCase().includes(q);

                            const recipientCount = (stationSelectedEmails[station.code] || []).length;
                            if (stationFilterStatus === "configured") return matchesSearch && recipientCount > 0;
                            if (stationFilterStatus === "unconfigured") return matchesSearch && recipientCount === 0;
                            return matchesSearch;
                          })
                          .map((station) => {
                            const selectedEmailsForStation = stationSelectedEmails[station.code] || [];
                            const isSending = stationEmailLoading[station.code] || false;
                            const statusMessage = stationEmailStatus[station.code] || "";
                            const sendSuccess = stationEmailSuccess[station.code];
                            const customInput = stationCustomEmailInput[station.code] || "";

                            const matchingOrgUsers = orgUsers.filter(u => getStationForUser(u, stationsList) === station.code);
                            const unaddedOrgUsers = matchingOrgUsers.filter(u => !selectedEmailsForStation.includes(u.email));

                            return (
                              <div
                                key={station.code}
                                data-station-recipient-code={station.code}
                                className="bg-white rounded-2xl border border-sky-100/90 hover:border-sky-300 hover:shadow-md transition-all duration-200 p-3.5 flex flex-col justify-between relative overflow-hidden group shadow-2xs"
                              >
                                <div>
                                  {/* Card Header */}
                                  <div className="flex items-start justify-between pb-2.5 border-b border-slate-100 mb-2.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-7 h-7 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                                        <Globe className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-slate-800 truncate leading-snug">
                                          {station.name}
                                        </h4>
                                        <div className="flex items-center gap-1 mt-0.5">
                                          <span className="text-[8.5px] font-extrabold text-sky-700 bg-sky-50 border border-sky-200/80 px-1.5 py-0.2 rounded uppercase">
                                            {station.code}
                                          </span>
                                          <span className="text-[9px] text-slate-400 truncate">
                                            {station.country}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      {selectedEmailsForStation.length > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[8.5px] font-bold text-amber-900 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-full shadow-2xs">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                          {selectedEmailsForStation.length} Active
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-0.5 text-[8.5px] font-medium text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                          0 Recipient
                                        </span>
                                      )}
                                      {station.isCustom && (
                                        <button
                                          onClick={() => handleRemoveStation(station.code)}
                                          title="Remove custom station"
                                          className="text-slate-300 hover:text-rose-500 p-0.5 transition-colors"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Search Active Directory Users */}
                                  <div className="relative mb-2">
                                    <Search className="w-2.5 h-2.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                    <Input
                                      placeholder={`Search AD for ${station.code}...`}
                                      value={stationUserSearch[station.code] || ""}
                                      onChange={(e) => setStationUserSearch(prev => ({ ...prev, [station.code]: e.target.value }))}
                                      className="h-7 pl-6 text-[10px] bg-slate-50/80 border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-sky-400"
                                    />
                                    {(stationUserSearch[station.code] || "").trim() && (
                                      <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-20 divide-y divide-slate-100">
                                        {orgUsers
                                          .filter((u) => {
                                            const query = (stationUserSearch[station.code] || "").toLowerCase().trim();
                                            return (u.displayName || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query);
                                          })
                                          .slice(0, 4)
                                          .map((u) => {
                                            const isSelected = selectedEmailsForStation.includes(u.email);
                                            return (
                                              <div
                                                key={u.email}
                                                onClick={() => {
                                                  if (!isSelected) {
                                                    setStationSelectedEmails(prev => ({
                                                      ...prev,
                                                      [station.code]: [...(prev[station.code] || []), u.email]
                                                    }));
                                                  }
                                                  setStationUserSearch(prev => ({ ...prev, [station.code]: "" }));
                                                }}
                                                className="p-1.5 text-[9.5px] hover:bg-sky-50 cursor-pointer flex justify-between items-center transition-colors"
                                              >
                                                <div className="truncate pr-1">
                                                  <p className="font-bold text-slate-700 truncate">{u.displayName}</p>
                                                  <p className="text-[8px] text-slate-400 truncate">{u.email}</p>
                                                </div>
                                                {isSelected ? (
                                                  <span className="text-[8px] text-emerald-600 font-bold">Added</span>
                                                ) : (
                                                  <span className="text-[8px] text-sky-600 font-bold bg-sky-50 px-1 py-0.2 rounded">+ Add</span>
                                                )}
                                              </div>
                                            );
                                          })}
                                      </div>
                                    )}
                                  </div>

                                  {/* Custom Email Input */}
                                  <div className="mb-2.5">
                                    <div className="flex gap-1">
                                      <div className="relative flex-1">
                                        <AtSign className="w-2.5 h-2.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                        <Input
                                          placeholder="Enter email..."
                                          value={customInput}
                                          onChange={(e) => setStationCustomEmailInput(prev => ({ ...prev, [station.code]: e.target.value }))}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              handleAddStationCustomEmail(station.code);
                                            }
                                          }}
                                          className="h-7 pl-6 text-[10px] bg-slate-50/80 border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:border-sky-400"
                                        />
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddStationCustomEmail(station.code)}
                                        className="h-7 px-2.5 bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-bold rounded-lg shrink-0"
                                      >
                                        + Add
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Recipient Chips */}
                                  {selectedEmailsForStation.length > 0 ? (
                                    <div className="mb-3">
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider">
                                          Recipients ({selectedEmailsForStation.length})
                                        </p>
                                        <button
                                          onClick={() => setStationSelectedEmails(prev => ({ ...prev, [station.code]: [] }))}
                                          className="text-[8px] text-slate-400 hover:text-rose-500"
                                        >
                                          Clear
                                        </button>
                                      </div>
                                      <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto p-1.5 border border-dashed border-sky-200/80 rounded-lg bg-sky-50/30">
                                        {selectedEmailsForStation.map((email) => (
                                          <Badge
                                            key={email}
                                            className="bg-white hover:bg-sky-50 text-slate-700 border border-sky-200 font-semibold text-[8px] px-1.5 py-0.2 rounded-md flex items-center gap-1 shadow-2xs"
                                          >
                                            <span className="truncate max-w-[95px]">{email}</span>
                                            <X
                                              className="w-2 h-2 text-slate-400 hover:text-rose-500 cursor-pointer shrink-0"
                                              onClick={() => setStationSelectedEmails(prev => ({
                                                ...prev,
                                                [station.code]: (prev[station.code] || []).filter(x => x !== email)
                                              }))}
                                            />
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mb-3 p-1.5 border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-center">
                                      <p className="text-[8.5px] text-slate-400 italic">No recipients added</p>
                                      {unaddedOrgUsers.length > 0 && (
                                        <button
                                          onClick={() => {
                                            setStationSelectedEmails(prev => ({
                                              ...prev,
                                              [station.code]: [...(prev[station.code] || []), ...unaddedOrgUsers.map(u => u.email)]
                                            }));
                                          }}
                                          className="mt-0.5 text-[8px] font-bold text-sky-600 hover:underline"
                                        >
                                          + Add {unaddedOrgUsers.length} AD users
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Card Bottom / Actions: Light Yellow & Light Blue */}
                                <div className="border-t border-slate-100 pt-2.5 mt-auto space-y-1.5">
                                  <Button
                                    onClick={() => handleSaveStationRecipients(station.code)}
                                    disabled={isSending}
                                    className="w-full h-7 bg-amber-300 hover:bg-amber-400 text-slate-900 font-bold text-[10px] rounded-lg flex items-center justify-center gap-1 shadow-2xs transition-all"
                                  >
                                    <Check className="w-2.5 h-2.5 text-slate-900" />
                                    Save Recipients
                                  </Button>
                                  <Button
                                    onClick={() => handleSendStationEmail(station.code, station.country)}
                                    disabled={selectedEmailsForStation.length === 0 || isSending}
                                    className="w-full h-7.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-[10.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                                  >
                                    {isSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <SendHorizontal className="w-3 h-3" />}
                                    Send {station.code} Report
                                  </Button>

                                  {statusMessage && (
                                    <div className={`p-1.5 rounded-lg text-[9px] leading-snug flex items-center justify-between ${sendSuccess === true ? "bg-amber-50 text-amber-900 border border-amber-200" : "bg-sky-50 text-sky-900 border border-sky-200"}`}>
                                      <span className="truncate pr-1">{statusMessage}</span>
                                      <button
                                        onClick={() => setStationEmailStatus(prev => ({ ...prev, [station.code]: "" }))}
                                        className="hover:opacity-70 text-slate-400 shrink-0"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                      </div>
                    </div>
                  ) : adminTab === "branches" ? (
                    <div className="space-y-4">
                      {/* Branch Filter & Search Toolbar */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-sky-100 shadow-2xs">
                        <div className="relative flex-1 min-w-[220px]">
                          <Search className="w-3.5 h-3.5 text-sky-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <Input
                            placeholder="Search branch by name, code, or city (e.g. BLR, Chennai, BOM)..."
                            value={branchFilterSearch}
                            onChange={(e) => setBranchFilterSearch(e.target.value)}
                            className="pl-8 pr-3 h-8 bg-slate-50/80 border-slate-200 rounded-lg text-[11px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-sky-400"
                          />
                          {branchFilterSearch && (
                            <button
                              onClick={() => setBranchFilterSearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0 overflow-x-auto pb-0.5 sm:pb-0">
                          <button
                            onClick={() => setBranchFilterStatus("all")}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${branchFilterStatus === "all" ? "bg-sky-500 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            All ({branchesList.length})
                          </button>
                          <button
                            onClick={() => setBranchFilterStatus("configured")}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${branchFilterStatus === "configured" ? "bg-amber-400 text-slate-900 shadow-2xs font-extrabold" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            Configured ({branchesList.filter(b => (stationSelectedEmails[b.code] || []).length > 0).length})
                          </button>
                          <button
                            onClick={() => setBranchFilterStatus("unconfigured")}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${branchFilterStatus === "unconfigured" ? "bg-slate-700 text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            Pending ({branchesList.filter(b => (stationSelectedEmails[b.code] || []).length === 0).length})
                          </button>
                        </div>
                      </div>

                      {/* 4 to 5 Boxes per Row Branch Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                        {branchesList
                          .filter((branch) => {
                            const q = branchFilterSearch.toLowerCase().trim();
                            const matchesSearch = !q ||
                              branch.name.toLowerCase().includes(q) ||
                              branch.code.toLowerCase().includes(q) ||
                              (branch.city || "").toLowerCase().includes(q);

                            const recipientCount = (stationSelectedEmails[branch.code] || []).length;
                            if (branchFilterStatus === "configured") return matchesSearch && recipientCount > 0;
                            if (branchFilterStatus === "unconfigured") return matchesSearch && recipientCount === 0;
                            return matchesSearch;
                          })
                          .map((branch) => {
                            const selectedEmailsForBranch = stationSelectedEmails[branch.code] || [];
                            const isSending = stationEmailLoading[branch.code] || false;
                            const statusMessage = stationEmailStatus[branch.code] || "";
                            const sendSuccess = stationEmailSuccess[branch.code];
                            const customInput = stationCustomEmailInput[branch.code] || "";

                            return (
                              <div
                                key={branch.code}
                                data-branch-recipient-code={branch.code}
                                className="bg-white rounded-2xl border border-sky-100/90 hover:border-sky-300 hover:shadow-md transition-all duration-200 p-3.5 flex flex-col justify-between relative overflow-hidden group shadow-2xs"
                              >
                                <div>
                                  {/* Branch Card Header */}
                                  <div className="flex items-start justify-between pb-2.5 border-b border-slate-100 mb-2.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-7 h-7 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                                        <Building2 className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-slate-800 truncate leading-snug">
                                          {branch.name}
                                        </h4>
                                        <span className="text-[8.5px] font-extrabold text-sky-700 bg-sky-50 border border-sky-200/80 px-1.5 py-0.2 rounded uppercase">
                                          {branch.code} Branch
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      {selectedEmailsForBranch.length > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[8.5px] font-bold text-amber-900 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-full shadow-2xs">
                                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                          {selectedEmailsForBranch.length} Active
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center text-[8.5px] font-medium text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                          0 Recipient
                                        </span>
                                      )}
                                      {branch.isCustom && (
                                        <button
                                          onClick={() => handleRemoveBranch(branch.code)}
                                          title="Remove custom branch"
                                          className="text-slate-300 hover:text-rose-500 p-0.5 transition-colors"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Search AD Users */}
                                  <div className="relative mb-2">
                                    <Search className="w-2.5 h-2.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                    <Input
                                      placeholder={`Search AD for ${branch.code}...`}
                                      value={stationUserSearch[branch.code] || ""}
                                      onChange={(e) => setStationUserSearch(prev => ({ ...prev, [branch.code]: e.target.value }))}
                                      className="h-7 pl-6 text-[10px] bg-slate-50/80 border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-sky-400"
                                    />
                                    {(stationUserSearch[branch.code] || "").trim() && (
                                      <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-20 divide-y divide-slate-100">
                                        {orgUsers
                                          .filter((u) => {
                                            const query = (stationUserSearch[branch.code] || "").toLowerCase().trim();
                                            return (u.displayName || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query);
                                          })
                                          .slice(0, 4)
                                          .map((u) => {
                                            const isSelected = selectedEmailsForBranch.includes(u.email);
                                            return (
                                              <div
                                                key={u.email}
                                                onClick={() => {
                                                  if (!isSelected) {
                                                    setStationSelectedEmails(prev => ({
                                                      ...prev,
                                                      [branch.code]: [...(prev[branch.code] || []), u.email]
                                                    }));
                                                  }
                                                  setStationUserSearch(prev => ({ ...prev, [branch.code]: "" }));
                                                }}
                                                className="p-1.5 text-[9.5px] hover:bg-sky-50 cursor-pointer flex justify-between items-center transition-colors"
                                              >
                                                <div className="truncate pr-1">
                                                  <p className="font-bold text-slate-700 truncate">{u.displayName}</p>
                                                  <p className="text-[8px] text-slate-400 truncate">{u.email}</p>
                                                </div>
                                                {isSelected ? (
                                                  <span className="text-[8px] text-emerald-600 font-bold">Added</span>
                                                ) : (
                                                  <span className="text-[8px] text-sky-600 font-bold bg-sky-50 px-1 py-0.2 rounded">+ Add</span>
                                                )}
                                              </div>
                                            );
                                          })}
                                      </div>
                                    )}
                                  </div>

                                  {/* Custom Email Input */}
                                  <div className="mb-2.5">
                                    <div className="flex gap-1">
                                      <div className="relative flex-1">
                                        <AtSign className="w-2.5 h-2.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                                        <Input
                                          placeholder="Enter email..."
                                          value={customInput}
                                          onChange={(e) => setStationCustomEmailInput(prev => ({ ...prev, [branch.code]: e.target.value }))}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              handleAddStationCustomEmail(branch.code);
                                            }
                                          }}
                                          className="h-7 pl-6 text-[10px] bg-slate-50/80 border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:border-sky-400"
                                        />
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddStationCustomEmail(branch.code)}
                                        className="h-7 px-2.5 bg-sky-500 hover:bg-sky-600 text-white text-[10px] font-bold rounded-lg shrink-0"
                                      >
                                        + Add
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Recipients Badges */}
                                  {selectedEmailsForBranch.length > 0 && (
                                    <div className="mb-3">
                                      <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto p-1.5 border border-dashed border-sky-200/80 rounded-lg bg-sky-50/30">
                                        {selectedEmailsForBranch.map((email) => (
                                          <Badge
                                            key={email}
                                            className="bg-white hover:bg-sky-50 text-slate-700 border border-sky-200 font-semibold text-[8px] px-1.5 py-0.2 rounded-md flex items-center gap-1 shadow-2xs"
                                          >
                                            <span className="truncate max-w-[95px]">{email}</span>
                                            <X
                                              className="w-2 h-2 text-slate-400 hover:text-rose-500 cursor-pointer shrink-0"
                                              onClick={() => setStationSelectedEmails(prev => ({
                                                ...prev,
                                                [branch.code]: (prev[branch.code] || []).filter(x => x !== email)
                                              }))}
                                            />
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Branch Card Footer */}
                                <div className="border-t border-slate-100 pt-2.5 mt-auto space-y-1.5">
                                  <Button
                                    onClick={() => handleSaveStationRecipients(branch.code)}
                                    disabled={isSending}
                                    className="w-full h-7 bg-amber-300 hover:bg-amber-400 text-slate-900 font-bold text-[10px] rounded-lg flex items-center justify-center gap-1 shadow-2xs transition-all"
                                  >
                                    <Check className="w-2.5 h-2.5 text-slate-900" />
                                    Save Recipients
                                  </Button>
                                  <Button
                                    onClick={() => handleSendBranchEmail(branch.code, branch.name)}
                                    disabled={selectedEmailsForBranch.length === 0 || isSending}
                                    className="w-full h-7.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-[10.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-2xs transition-all"
                                  >
                                    {isSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <SendHorizontal className="w-3 h-3" />}
                                    Send {branch.code} Report
                                  </Button>

                                  {statusMessage && (
                                    <div className={`p-1.5 rounded-lg text-[9px] leading-snug flex items-center justify-between ${sendSuccess === true ? "bg-amber-50 text-amber-900 border border-amber-200" : "bg-sky-50 text-sky-900 border border-sky-200"}`}>
                                      <span className="truncate pr-1">{statusMessage}</span>
                                      <button
                                        onClick={() => setStationEmailStatus(prev => ({ ...prev, [branch.code]: "" }))}
                                        className="hover:opacity-70 text-slate-400 shrink-0"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Recipients List Card (Original Global) */}
                      <div className="admin-card p-6">
                        {/* Card Header */}
                        <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#EDF2F7]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-[#EBF8FF] flex items-center justify-center">
                              <Users className="w-4 h-4 text-[#3182CE]" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-[#1A202C]">Organisation Users</h3>
                              <p className="text-[10.5px] text-slate-400">
                                {orgUsersLoading ? "Fetching from Azure AD..." : orgUsers.length > 0 ? `${orgUsers.length} users · ${Object.keys(orgUsersByDept).length} departments` : "From Azure Active Directory"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {orgUsers.length > 0 && (
                              <Badge variant="outline" className="border-[#BEE3F8] text-[#3182CE] bg-[#EBF8FF] text-[10px] font-bold">
                                {selectedEmails.length} Selected
                              </Badge>
                            )}
                            <button
                              onClick={() => { setOrgUsers([]); fetchOrgUsers(); }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              title="Refresh users"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${orgUsersLoading ? "animate-spin" : ""}`} />
                            </button>
                          </div>
                        </div>

                        {/* Loading state */}
                        {orgUsersLoading && (
                          <div className="py-10 flex flex-col items-center gap-3 text-slate-400">
                            <RefreshCw className="w-6 h-6 animate-spin text-[#3182CE]" />
                            <p className="text-xs font-medium">Fetching users from Azure AD...</p>
                          </div>
                        )}

                        {/* Error state — with permission guidance */}
                        {!orgUsersLoading && orgUsersError && (
                          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-2">
                            <p className="font-bold flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Azure AD Error</p>
                            <p className="leading-relaxed">{orgUsersError}</p>
                            {orgUsersError.includes("Insufficient privileges") || orgUsersError.includes("Authorization") ? (
                              <div className="mt-2 p-3 bg-white border border-rose-100 rounded-lg space-y-1">
                                <p className="font-bold text-rose-800">🔐 Missing Permission: Grant <code>User.Read.All</code></p>
                                <ol className="list-decimal ml-4 space-y-0.5 text-rose-700 leading-relaxed">
                                  <li>Go to Azure Portal → App Registrations</li>
                                  <li>Select your app → API permissions</li>
                                  <li>Add <strong>Microsoft Graph → Application → User.Read.All</strong></li>
                                  <li>Click <strong>"Grant admin consent"</strong></li>
                                </ol>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* Users loaded */}
                        {!orgUsersLoading && orgUsers.length > 0 && (
                          <>
                            {/* Search + Department filter */}
                            <div className="space-y-3 mb-4">
                              <Input
                                placeholder="Search by name or email..."
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                className="h-8 text-xs bg-white border-[#CBD5E0] rounded-lg text-slate-700"
                              />
                              {/* Department filter chips */}
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  onClick={() => setDeptFilter("__all__")}
                                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${deptFilter === "__all__" ? "bg-[#3182CE] text-white border-[#3182CE]" : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"}`}
                                >
                                  All ({orgUsers.length})
                                </button>
                                {Object.entries(orgUsersByDept).map(([dept, users]) => (
                                  <button
                                    key={dept}
                                    onClick={() => setDeptFilter(dept)}
                                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${deptFilter === dept ? "bg-[#3182CE] text-white border-[#3182CE]" : "bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300"}`}
                                  >
                                    {dept} ({users.length})
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* User list */}
                            <div className="space-y-2 max-h-72 overflow-y-auto mb-5 pr-1">
                              {(deptFilter === "__all__" ? orgUsers : (orgUsersByDept[deptFilter] || []))
                                .filter((u: any) => {
                                  if (!userSearch) return true;
                                  const q = userSearch.toLowerCase();
                                  return (u.displayName || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
                                })
                                .map((u: any) => {
                                  const isSelected = selectedEmails.includes(u.email);
                                  return (
                                    <div
                                      key={u.email}
                                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? "bg-[#EBF8FF] border-[#BEE3F8]" : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white"}`}
                                      onClick={() => {
                                        if (isSelected) {
                                          setSelectedEmails(selectedEmails.filter((x) => x !== u.email));
                                        } else {
                                          setSelectedEmails([...selectedEmails, u.email]);
                                        }
                                      }}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? "bg-[#3182CE] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>
                                          {(u.displayName || u.email).charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                          <p className={`text-xs font-semibold truncate ${isSelected ? "text-[#2B6CB0]" : "text-slate-700"}`}>
                                            {u.displayName || u.email}
                                          </p>
                                          <p className="text-[10px] text-slate-400 truncate">{u.email}</p>
                                          {(u.jobTitle || u.department) && (
                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                              {u.jobTitle && <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{u.jobTitle}</span>}
                                              {u.department && <span className="text-[9px] font-semibold text-[#3182CE] bg-[#EBF8FF] px-1.5 py-0.5 rounded-full">{u.department}</span>}
                                              {u.officeLocation && <span className="text-[9px] text-slate-400">📍 {u.officeLocation}</span>}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 transition-all ${isSelected ? "border-[#3182CE] bg-[#3182CE]" : "border-slate-300"}`}>
                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>

                            {/* Bulk actions */}
                            <div className="flex gap-2 mb-4 border-t border-[#EDF2F7] pt-4">
                              <button
                                onClick={() => {
                                  const visible = (deptFilter === "__all__" ? orgUsers : (orgUsersByDept[deptFilter] || []))
                                    .filter((u: any) => !userSearch || (u.displayName || "").toLowerCase().includes(userSearch.toLowerCase()) || (u.email || "").toLowerCase().includes(userSearch.toLowerCase()))
                                    .map((u: any) => u.email).filter(Boolean);
                                  setSelectedEmails((prev) => prev.concat(visible).filter((v, i, a) => a.indexOf(v) === i));
                                }}
                                className="text-[10px] font-bold text-[#3182CE] hover:text-[#2B6CB0] px-3 py-1.5 rounded-lg border border-[#BEE3F8] bg-[#EBF8FF] hover:bg-[#BEE3F8]/50 transition-all"
                              >
                                Select All Visible
                              </button>
                              <button
                                onClick={() => setSelectedEmails([])}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all"
                              >
                                Clear All
                              </button>
                            </div>
                          </>
                        )}

                        {/* Fallback: no org users yet — show static list */}
                        {!orgUsersLoading && orgUsers.length === 0 && !orgUsersError && (
                          <div className="space-y-2 mb-5">
                            {availableEmails.length === 0 ? (
                              <div className="py-8 flex flex-col items-center gap-2 text-slate-400">
                                <Users className="w-8 h-8 opacity-30" />
                                <p className="text-xs">No recipients configured. Add one below.</p>
                              </div>
                            ) : (
                              availableEmails.map((email) => {
                                const isSelected = selectedEmails.includes(email);
                                return (
                                  <div
                                    key={email}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? "bg-[#EBF8FF] border-[#BEE3F8]" : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white"}`}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedEmails(selectedEmails.filter((x) => x !== email));
                                      } else {
                                        setSelectedEmails([...selectedEmails, email]);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isSelected ? "bg-[#3182CE] text-white" : "bg-white border border-slate-200 text-slate-500"}`}>
                                        {email.charAt(0).toUpperCase()}
                                      </div>
                                      <p className={`text-xs font-semibold ${isSelected ? "text-[#2B6CB0]" : "text-slate-700"}`}>{email}</p>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-[#3182CE] bg-[#3182CE]" : "border-slate-300"}`}>
                                      {isSelected && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}

                      </div>
                    </>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* ── EMAIL SCHEDULING SECTION ── */}
          {activeSection === "email-scheduling" && (
            <div data-email-scheduling className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6 animate-in fade-in-0 duration-200">

              {/* Email Scheduling Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <h2 className="text-xl font-extrabold text-[#1A202C] tracking-tight">Email Scheduling</h2>
                  </div>
                  <p className="text-sm text-slate-400">{freightText("Automate and schedule periodic tonnage report dispatches.", transportMode)}</p>
                </div>
              </div>

              {/* Tab Navigation for Scheduling */}
              <div className="flex border-b border-slate-200 mb-2">
                <button
                  onClick={() => setSchedActiveTab("list")}
                  className={`pb-2.5 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${schedActiveTab === "list" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Active Schedules
                </button>
                <button
                  onClick={() => setSchedActiveTab("create")}
                  className={`pb-2.5 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${schedActiveTab === "create" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Configure New Schedule
                </button>
              </div>

              <div className="grid grid-cols-12 gap-6">
                {/* ── LEFT COL: Configure New Schedule Form ── */}
                {schedActiveTab === "create" && (
                  <div className="col-span-12">
                    <div data-schedule-config className="admin-card p-6 bg-white border border-slate-200 rounded-xl shadow-sm relative overflow-visible">
                      <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-[#EDF2F7]">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Plus className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#1A202C]">Configure New Schedule</h3>
                          <p className="text-[10.5px] text-slate-400">Add a new automated dispatch schedule</p>
                        </div>
                      </div>

                      <div className="space-y-4 text-xs">
                        <div className="space-y-3 rounded-xl border border-blue-100 bg-[#f8fbff] p-3">
                          <div className="flex gap-2" role="group" aria-label="Schedule recipients">
                            {([['groups', 'Location groups'], ['person', 'One person']] as const).map(([mode, label]) => (
                              <button key={mode} type="button" aria-pressed={schedRecipientMode === mode}
                                onClick={() => {setSchedRecipientMode(mode); setSchedStatusMessage("");}}
                                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${schedRecipientMode === mode ? 'border-blue-200 bg-[#d3e3fd] text-[#174ea6]' : 'border-blue-100 bg-white text-slate-600'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                          {schedRecipientMode === "person" && <div className="space-y-2">
                            <label htmlFor={`schedule-person-${transportMode}`} className="block text-xs font-semibold text-slate-700">Recipient</label>
                            <Input aria-label="Search schedule recipient" placeholder="Search recipients by name or email" value={schedPersonSearch} onChange={event => setSchedPersonSearch(event.target.value)} className="h-9 bg-white border-blue-100 text-xs" />
                            <select id={`schedule-person-${transportMode}`} value={schedPersonEmail}
                              onChange={event => setSchedPersonEmail(event.target.value)} className="w-full h-9 rounded-lg border border-blue-100 bg-white px-2 text-xs text-slate-700">
                              <option value="">Select one recipient</option>
                              {schedPersonEmail && !schedPeople.some(user => user.email.toLowerCase() === schedPersonEmail) && <option value={schedPersonEmail}>{schedPersonEmail} (reports disabled)</option>}
                              {schedPeople.filter(user => user.email.toLowerCase() === schedPersonEmail || `${user.display_name} ${user.email}`.toLowerCase().includes(schedPersonSearch.toLowerCase())).map(user => (
                                <option key={user.id} value={user.email.toLowerCase()}>{user.display_name || user.email} · {user.email}</option>
                              ))}
                            </select>
                            {schedPersonEmail && !schedPeople.some(user => user.email.toLowerCase() === schedPersonEmail) && <p className="text-xs text-amber-700">This recipient has {transportMode} reports turned off in the directory. Enable their freight preference to select them.</p>}
                            <p className="text-[11px] text-slate-500">Only the selected person receives this schedule. Choose their report scope and timing below.</p>
                          </div>}
                        </div>
                        {/* Report Level: Stationwise vs Branchwise */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Report Level</label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSchedReportLevel("station")}
                              aria-pressed={schedReportLevel === "station"}
                              className={`flex-1 py-1.5 rounded-lg border text-center font-bold text-xs transition-colors ${schedReportLevel === "station" ? "bg-[#3182CE]/10 border-[#3182CE] text-[#3182CE]" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}
                            >
                               Stationwise
                            </button>
                            <button
                              type="button"
                              onClick={() => setSchedReportLevel("branch")}
                              aria-pressed={schedReportLevel === "branch"}
                              className={`flex-1 py-1.5 rounded-lg border text-center font-bold text-xs transition-colors ${schedReportLevel === "branch" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}
                            >
                               Branchwise
                            </button>
                          </div>
                        </div>

                        {/* Target Selection with Multi-Select Capability */}
                        {schedReportLevel === "branch" ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Target Branches ({schedSelectedBranches.length} selected)
                              </label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSchedSelectedBranches(branchesList.map(b => b.code))}
                                  className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800"
                                >
                                  Select All
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setSchedSelectedBranches([])}
                                  className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            <div className="relative">
                              <button
                                type="button"
                                aria-label="Target branches"
                                onClick={() => setIsSchedBranchDropdownOpen(!isSchedBranchDropdownOpen)}
                                className="w-full min-h-[36px] px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-lg text-slate-700 text-xs font-semibold flex items-center justify-between transition-colors text-left"
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-blue-600"></span>
                                  {schedSelectedBranches.length === 0 ? (
                                    <span className="text-slate-400 italic">No branch selected</span>
                                  ) : schedSelectedBranches.length === branchesList.length ? (
                                    <span className="font-bold text-blue-700">All Branches ({branchesList.length})</span>
                                  ) : (
                                    <span className="font-semibold text-slate-700">
                                      {schedSelectedBranches.length} Branch{schedSelectedBranches.length > 1 ? "es" : ""}: {schedSelectedBranches.join(", ")}
                                    </span>
                                  )}
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isSchedBranchDropdownOpen ? "rotate-180" : ""}`} />
                              </button>

                              {isSchedBranchDropdownOpen && (
                                <div className="absolute left-0 top-full mt-1.5 w-full bg-white border border-blue-200 rounded-xl shadow-xl z-50 p-2.5 text-slate-800 animate-in fade-in-0 duration-150 space-y-2">
                                  <Input
                                    type="text"
                                    placeholder="Search branches..."
                                    value={schedBranchSearch}
                                    onChange={(e) => setSchedBranchSearch(e.target.value)}
                                    className="h-7 text-xs bg-slate-50 border-slate-200"
                                  />
                                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                    {branchesList
                                      .filter(b => b.name.toLowerCase().includes(schedBranchSearch.toLowerCase()) || b.code.toLowerCase().includes(schedBranchSearch.toLowerCase()))
                                      .map((br) => {
                                        const isChecked = schedSelectedBranches.includes(br.code);
                                        return (
                                          <div
                                            key={br.code}
                                            onClick={() => {
                                              setSchedSelectedBranches(prev =>
                                                prev.includes(br.code) ? prev.filter(c => c !== br.code) : [...prev, br.code]
                                              );
                                            }}
                                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${isChecked ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50 text-slate-700"}`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => { }}
                                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                              />
                                              <span>{br.name}</span>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500">{br.code}</Badge>
                                          </div>
                                        );
                                      })}
                                  </div>
                                  <div className="flex justify-end pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => setIsSchedBranchDropdownOpen(false)}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded-md"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Target Stations ({schedSelectedStations.length === stationsList.length && stationsList.length > 0 ? "All Stations Selected" : `${schedSelectedStations.length} selected`})
                              </label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSchedSelectedStations(stationsList.map(s => s.code))}
                                  className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800"
                                >
                                  Select All
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setSchedSelectedStations([])}
                                  className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setIsSchedStationDropdownOpen(!isSchedStationDropdownOpen)}
                                aria-label="Target stations"
                                className="w-full min-h-[36px] px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-lg text-slate-700 text-xs font-semibold flex items-center justify-between transition-colors text-left"
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-blue-600"></span>
                                  {schedSelectedStations.length === 0 ? (
                                    <span className="text-slate-400 italic">No station selected</span>
                                  ) : schedSelectedStations.length === stationsList.length ? (
                                    <span className="font-bold text-blue-700">All Stations Selected ({stationsList.length})</span>
                                  ) : (
                                    <span className="font-semibold text-slate-700">
                                      {schedSelectedStations.length} Station{schedSelectedStations.length > 1 ? "s" : ""}: {schedSelectedStations.join(", ")}
                                    </span>
                                  )}
                                </div>
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isSchedStationDropdownOpen ? "rotate-180" : ""}`} />
                              </button>

                              {isSchedStationDropdownOpen && (
                                <div className="absolute left-0 top-full mt-1.5 w-full bg-white border border-blue-200 rounded-xl shadow-xl z-50 p-2.5 text-slate-800 animate-in fade-in-0 duration-150 space-y-2">
                                  <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Quick Actions</span>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSchedSelectedStations(stationsList.map(s => s.code))}
                                        className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800"
                                      >
                                        Select All
                                      </button>
                                      <span className="text-slate-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => setSchedSelectedStations([])}
                                        className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600"
                                      >
                                        Clear All
                                      </button>
                                    </div>
                                  </div>

                                  <Input
                                    type="text"
                                    placeholder="Search stations..."
                                    value={schedStationSearch}
                                    onChange={(e) => setSchedStationSearch(e.target.value)}
                                    className="h-7 text-xs bg-slate-50 border-slate-200"
                                  />
                                  <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                                    {/* Select All Checkbox Option */}
                                    <div
                                      onClick={() => {
                                        if (schedSelectedStations.length === stationsList.length) {
                                          setSchedSelectedStations([]);
                                        } else {
                                          setSchedSelectedStations(stationsList.map(s => s.code));
                                        }
                                      }}
                                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${schedSelectedStations.length === stationsList.length && stationsList.length > 0 ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50 text-slate-700"}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={schedSelectedStations.length === stationsList.length && stationsList.length > 0}
                                          onChange={() => { }}
                                          className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                        />
                                        <span> Select All Stations ({stationsList.length})</span>
                                      </div>
                                      <Badge variant="outline" className="text-[9px] border-blue-200 text-blue-700 bg-blue-50">All</Badge>
                                    </div>

                                    <div className="border-t border-slate-100 my-1" />

                                    {/* Individual Stations */}
                                    {stationsList
                                      .filter(s => s.name.toLowerCase().includes(schedStationSearch.toLowerCase()) || s.code.toLowerCase().includes(schedStationSearch.toLowerCase()))
                                      .map((st) => {
                                        const isChecked = schedSelectedStations.includes(st.code);
                                        return (
                                          <div
                                            key={st.code}
                                            onClick={() => {
                                              setSchedSelectedStations(prev =>
                                                prev.includes(st.code) ? prev.filter(c => c !== st.code) : [...prev, st.code]
                                              );
                                            }}
                                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${isChecked ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50 text-slate-700"}`}
                                          >
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => { }}
                                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                              />
                                              <span>{st.name}</span>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500">{st.code}</Badge>
                                          </div>
                                        );
                                      })}
                                  </div>
                                  <div className="flex justify-end pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => setIsSchedStationDropdownOpen(false)}
                                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded-md"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Frequency */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Frequency</label>
                          <div className="flex gap-2">
                            {["weekly", "monthly", "daily"].map((freq) => (
                              <button
                                key={freq}
                                type="button"
                                onClick={() => setSchedFrequency(freq as any)}
                                className={`flex-1 py-1.5 rounded-lg border text-center font-bold capitalize transition-colors ${schedFrequency === freq ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}
                              >
                                {freq}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Day selection based on frequency */}
                        {schedFrequency === "weekly" && (
                          <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Weekly Schedule Type</label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSchedWeeklyType("day_of_week")}
                                className={`flex-1 py-1 px-2 rounded border text-xs font-semibold transition-colors ${schedWeeklyType === "day_of_week" ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                              >
                                Day of Week (Mon–Sun)
                              </button>
                              <button
                                type="button"
                                onClick={() => setSchedWeeklyType("month_cycle")}
                                className={`flex-1 py-1 px-2 rounded border text-xs font-semibold transition-colors ${schedWeeklyType === "month_cycle" ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                              >
                                Month Cycle (8th, 15th, 22nd)
                              </button>
                            </div>

                            {schedWeeklyType === "day_of_week" ? (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Day of Week</label>
                                <select
                                  value={schedDayOfWeek}
                                  aria-label="Schedule day of week"
                                  onChange={(e) => setSchedDayOfWeek(parseInt(e.target.value))}
                                  className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                                >
                                  <option value={0}>Monday</option>
                                  <option value={1}>Tuesday</option>
                                  <option value={2}>Wednesday</option>
                                  <option value={3}>Thursday</option>
                                  <option value={4}>Friday</option>
                                  <option value={5}>Saturday</option>
                                  <option value={6}>Sunday</option>
                                </select>
                              </div>
                            ) : (
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Month Cycle Day</label>
                                <select
                                  value={schedWeeklyMonthCycleDay}
                                  aria-label="Schedule month cycle day"
                                  onChange={(e) => setSchedWeeklyMonthCycleDay(parseInt(e.target.value))}
                                  className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                                >
                                  <option value={8}>8th of every month (1st–7th day cumulative weekly data: 7 days)</option>
                                  <option value={15}>15th of every month (1st–14th day cumulative weekly data: 14 days)</option>
                                  <option value={22}>22nd of every month (1st–21st day cumulative weekly data: 21 days)</option>
                                </select>
                                <p className="text-[10px] text-slate-500 mt-1.5 flex items-start gap-1.5 bg-blue-50/70 text-blue-800 p-2 rounded-md border border-blue-100 font-medium">
                                  <span className="text-xs shrink-0"></span>
                                  <span>
                                    {schedWeeklyMonthCycleDay === 8 && "Runs on the 8th: Sends a Weekly Report with Day-by-Day Stack covering the 1st through 7th (7 days)."}
                                    {schedWeeklyMonthCycleDay === 15 && "Runs on the 15th: Sends a Weekly Report with Day-by-Day Stack covering the 1st through 14th (14 days cumulative)."}
                                    {schedWeeklyMonthCycleDay === 22 && "Runs on the 22nd: Sends a Weekly Report with Day-by-Day Stack covering the 1st through 21st (21 days cumulative)."}
                                  </span>
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {schedFrequency === "monthly" && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Day of Month</label>
                              <span className="text-[9.5px] font-bold text-blue-600">
                                {schedDayOfMonth === 1 ? "Whole previous month report" : `1st – ${getOrdinal(schedDayOfMonth - 1)} completed days`}
                              </span>
                            </div>
                            <select
                              value={schedDayOfMonth}
                              aria-label="Schedule day of month"
                              onChange={(e) => setSchedDayOfMonth(parseInt(e.target.value))}
                              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                            >
                              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                <option key={day} value={day}>
                                  {getMonthlyDayOptionLabel(day)}
                                </option>
                              ))}
                            </select>
                            <p className="text-[10px] text-slate-500 mt-1.5 flex items-start gap-1.5 bg-blue-50/70 text-blue-800 p-2 rounded-md border border-blue-100 font-medium">
                              <span className="text-xs shrink-0"></span>
                              <span>
                                {schedDayOfMonth === 1
                                  ? "Configured for the 1st: Sends the Monthly Report covering the full previous calendar month (e.g. Aug 1st to Aug 31st when sent on Sep 1st) with day-by-day data."
                                  : `Configured for the ${getOrdinal(schedDayOfMonth)}: Sends a Weekly Report covering cumulative day-by-day data from the 1st up to the ${getOrdinal(schedDayOfMonth - 1)} (e.g. 1st–7th on the 8th, 1st–14th on the 15th, 1st–21st on the 22nd).`}
                              </span>
                            </p>
                          </div>
                        )}

                        {/* Time */}
                        <fieldset className="rounded-xl border border-blue-100 bg-[#f8fbff] p-3">
                          <legend className="px-1 text-xs font-semibold text-slate-700">Report sections</legend>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {([['include_weekly_visual', 'Weekly charts'], ['include_weekly_ledger', 'Weekly ledger'], ['include_monthly_visual', 'Monthly charts'], ['include_monthly_ledger', 'Monthly ledger']] as const).map(([key, label]) => (
                              <label key={key} className="flex items-center gap-2 text-xs text-slate-700">
                                <input type="checkbox" checked={schedSections[key]} onChange={event => setSchedSections(previous => ({...previous, [key]: event.target.checked}))} />{label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Send Time (24h · {schedulerTimezone})</label>
                          <Input
                            type="time"
                            aria-label="Schedule send time"
                            value={schedTime}
                            onChange={(e) => setSchedTime(e.target.value)}
                            className="h-8 bg-slate-50 border-[#E2E8F0] rounded-lg text-slate-700 [color-scheme:light] font-semibold"
                          />
                        </div>

                        {/* Custom date range (Optional) */}
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Custom Date Range (Optional)</span>
                            <span className="text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Overrides Relative Period</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-450 uppercase tracking-wider mb-1">Start Date</label>
                              <Input
                                type="date"
                                aria-label="Schedule start date"
                                value={schedStartDate}
                                onChange={(e) => setSchedStartDate(e.target.value)}
                                className="h-8 text-xs bg-white border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-455 uppercase tracking-wider mb-1">End Date</label>
                              <Input
                                type="date"
                                aria-label="Schedule end date"
                                value={schedEndDate}
                                onChange={(e) => setSchedEndDate(e.target.value)}
                                className="h-8 text-xs bg-white border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Multiple Recipients Selection from Stations & Branches */}
                        {schedRecipientMode === "groups" && <div className="space-y-2 p-3 bg-slate-50/80 border border-slate-200 rounded-xl">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-blue-600" />
                              Select Stations / Branches to Load Recipients ({schedSelectedRecipientSources.length} selected)
                            </label>
                            <button
                              type="button"
                              onClick={handleLoadRecipientsForSelectedTargets}
                              className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                              title="Load recipients matching the currently selected Target stations or branches above"
                            >
                               Match Target Selection
                            </button>
                          </div>

                          {/* Quick Actions & Filters */}
                          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-200/60">
                            <div className="flex items-center gap-1">
                              {(["all", "station", "branch"] as const).map((cat) => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => setSchedRecipientSourceCategory(cat)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize transition-colors ${schedRecipientSourceCategory === cat ? "bg-blue-600 text-white shadow-xs" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
                                >
                                  {cat === "all" ? "All Sources" : cat === "station" ? `Stations (${stationsList.length})` : `Branches (${branchesList.length})`}
                                </button>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleSelectAllRecipientStations}
                                className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800"
                              >
                                + All Stations
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={handleSelectAllRecipientBranches}
                                className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800"
                              >
                                + All Branches
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={handleClearRecipientSources}
                                className="text-[9.5px] font-bold text-slate-400 hover:text-slate-600"
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          <Input
                            type="text"
                            placeholder="🔍 Filter stations or branches by name or code..."
                            value={schedRecipientSourceSearch}
                            onChange={(e) => setSchedRecipientSourceSearch(e.target.value)}
                            className="h-7 text-xs bg-white border-slate-200"
                          />

                          {/* Scrollable List Container */}
                          <div className="max-h-48 overflow-y-auto space-y-1.5 p-1.5 bg-white border border-slate-200 rounded-lg shadow-inner divide-y divide-slate-100">
                            {/* Stations Section */}
                            {(schedRecipientSourceCategory === "all" || schedRecipientSourceCategory === "station") && (
                              <div className="space-y-0.5 pt-0.5 first:pt-0">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">Stations (National)</p>
                                {stationsList
                                  .filter(s => s.name.toLowerCase().includes(schedRecipientSourceSearch.toLowerCase()) || s.code.toLowerCase().includes(schedRecipientSourceSearch.toLowerCase()))
                                  .map((s) => {
                                    const count = (stationSelectedEmails[s.code] || []).length;
                                    const isChecked = schedSelectedRecipientSources.includes(s.code);
                                    return (
                                      <div
                                        key={s.code}
                                        onClick={() => handleToggleRecipientSource(s.code)}
                                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${isChecked ? "bg-blue-50 text-blue-900 font-bold border border-blue-200" : "hover:bg-slate-50 text-slate-700 border border-transparent"}`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => { }}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                          />
                                          <span> {s.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-400">{s.code}</Badge>
                                          <Badge variant="outline" className={`text-[9px] ${count > 0 ? "border-blue-200 text-blue-700 bg-blue-50 font-bold" : "border-slate-200 text-slate-400 font-normal"}`}>
                                            {count} users
                                          </Badge>
                                        </div>
                                      </div>
                                    );
                                  })}

                                {/* Corporate / OTHER */}
                                <div
                                  onClick={() => handleToggleRecipientSource("OTHER")}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${schedSelectedRecipientSources.includes("OTHER") ? "bg-blue-50 text-blue-900 font-bold border border-blue-200" : "hover:bg-slate-50 text-slate-700 border border-transparent"}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={schedSelectedRecipientSources.includes("OTHER")}
                                      onChange={() => { }}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                    />
                                    <span> Corporate / OTHER</span>
                                  </div>
                                  <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-500">
                                    {(stationSelectedEmails["OTHER"] || []).length} users
                                  </Badge>
                                </div>
                              </div>
                            )}

                            {/* Branches Section */}
                            {(schedRecipientSourceCategory === "all" || schedRecipientSourceCategory === "branch") && branchesList.length > 0 && (
                              <div className="space-y-0.5 pt-1.5 first:pt-0">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">Branches (Offices)</p>
                                {branchesList
                                  .filter(b => b.name.toLowerCase().includes(schedRecipientSourceSearch.toLowerCase()) || b.code.toLowerCase().includes(schedRecipientSourceSearch.toLowerCase()))
                                  .map((b) => {
                                    const count = (stationSelectedEmails[b.code] || []).length;
                                    const isChecked = schedSelectedRecipientSources.includes(b.code);
                                    return (
                                      <div
                                        key={b.code}
                                        onClick={() => handleToggleRecipientSource(b.code)}
                                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${isChecked ? "bg-blue-50 text-blue-900 font-bold border border-blue-200" : "hover:bg-slate-50 text-slate-700 border border-transparent"}`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => { }}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                          />
                                          <span> {b.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Badge variant="outline" className="text-[9px] border-slate-200 text-slate-400">{b.code}</Badge>
                                          <Badge variant="outline" className={`text-[9px] ${count > 0 ? "border-blue-200 text-blue-700 bg-blue-50 font-bold" : "border-slate-200 text-slate-400 font-normal"}`}>
                                            {count} users
                                          </Badge>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        </div>}

                        {/* Visual Loaded Recipients List */}
                        {scheduleRecipients.split(",").map(r => r.trim()).filter(Boolean).length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Selected Recipients ({scheduleRecipients.split(",").map(r => r.trim()).filter(Boolean).length} emails)
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSchedRecipients("");
                                  setSchedPersonEmail("");
                                  setSchedSelectedRecipientSources([]);
                                }}
                                className="text-[9.5px] font-bold text-rose-500 hover:text-rose-700"
                              >
                                Clear Emails
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1 p-2 border border-dashed border-slate-200 rounded-lg bg-slate-50 max-h-32 overflow-y-auto shadow-inner">
                              {scheduleRecipients
                                .split(",")
                                .map(r => r.trim())
                                .filter(Boolean)
                                .map((email) => (
                                  <Badge
                                    key={email}
                                    className="bg-white hover:bg-slate-50 text-slate-750 border border-[#CBD5E0] font-semibold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm"
                                  >
                                    <span className="truncate max-w-[180px]">{email}</span>
                                    <X
                                      className="w-2.5 h-2.5 text-slate-400 hover:text-slate-650 cursor-pointer shrink-0"
                                      onClick={() => {
                                        const remaining = scheduleRecipients
                                          .split(",")
                                          .map(r => r.trim())
                                          .filter(x => x && x !== email);
                                        if (schedRecipientMode === "person") setSchedPersonEmail("");
                                        else setSchedRecipients(remaining.join(", "));
                                      }}
                                    />
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Feedback status banner */}
                        {schedStatusMessage && (
                          <div className={`p-2 rounded-lg text-[10px] font-bold border ${schedStatusSuccess ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                            {schedStatusMessage}
                            {schedStatusSuccess && <button type="button" className="ml-3 underline" onClick={() => {setSchedActiveTab("list"); setScheduleScopeTab(schedReportLevel); setScheduleStationFilter(""); setScheduleBranchFilter(""); setSchedulePersonFilter(schedRecipientMode === "person" ? schedPersonEmail : "");}}>View schedules</button>}
                          </div>
                        )}

                        {/* Submit */}
                        <Button
                          onClick={handleCreateSchedule}
                          disabled={schedIsCreating}
                          className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
                        >
                          {schedIsCreating ? "Saving Schedule..." : "Save Schedule"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── RIGHT COL: Active Schedules Table ── */}
                {schedActiveTab === "list" && (() => {
                  const scopeFor = (schedule: any) => resolveScheduleScope(schedule.filters || {}, stationsList, branchesList);
                  const scheduleScopes = schedules.map(scopeFor);
                  const stationCodes = Array.from(new Set([...stationsList.map(station => station.code), ...scheduleScopes.map(scope => scope.stationCode).filter(Boolean)])).sort();
                  const branchCodes = Array.from(new Set([
                    ...branchesList.filter(branch => !scheduleStationFilter || branch.company_code === scheduleStationFilter).map(branch => branch.code),
                    ...scheduleScopes.filter(scope => scope.kind === "branch" && (!scheduleStationFilter || scope.stationCode === scheduleStationFilter)).map(scope => scope.code),
                  ])).sort();
                  const personEmails = Array.from(new Set(schedules.flatMap(schedule => String(schedule.recipient_email || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean)))).sort();
                  const filteredSchedules = schedules.filter((s) => {
                    const scope = scopeFor(s);
                    if (scheduleScopeTab !== "all" && scope.kind !== scheduleScopeTab) return false;
                    if (scheduleStationFilter && scope.stationCode !== scheduleStationFilter) return false;
                    if (scheduleBranchFilter && scope.code !== scheduleBranchFilter) return false;
                    if (schedulePersonFilter && !String(s.recipient_email || "").split(",").some(email => email.trim().toLowerCase() === schedulePersonFilter)) return false;
                    // Search query match
                    const searchQ = scheduleSearch.toLowerCase().trim();
                    if (searchQ) {
                      const filters = s.filters || {};
                      const country = (filters.country || "").toLowerCase();
                      const company = (filters.company_code || "").toLowerCase();
                      const branch = scope.label.toLowerCase();
                      const recipients = (s.recipient_email || "").toLowerCase();
                      const recipientNames = dbUsers.filter(user => recipients.split(",").map((email: string) => email.trim()).includes(user.email.toLowerCase())).map(user => user.display_name || "").join(" ").toLowerCase();
                      const freq = (s.frequency || "").toLowerCase();
                      const time = (s.time_of_day || "").toLowerCase();
                      const matches = country.includes(searchQ) ||
                        company.includes(searchQ) ||
                        branch.includes(searchQ) ||
                        recipients.includes(searchQ) ||
                        recipientNames.includes(searchQ) ||
                        freq.includes(searchQ) ||
                        time.includes(searchQ);
                      if (!matches) return false;
                    }

                    // Frequency filter
                    if (scheduleFrequencyFilter !== "ALL" && s.frequency !== scheduleFrequencyFilter) {
                      return false;
                    }

                    // Status filter
                    if (scheduleStatusFilter === "ACTIVE" && !s.is_active) return false;
                    if (scheduleStatusFilter === "PAUSED" && s.is_active) return false;

                    return true;
                  });

                  const isAllFilteredSelected = filteredSchedules.length > 0 && filteredSchedules.every(s => selectedScheduleIds.includes(s.id));
                  const isSomeFilteredSelected = filteredSchedules.some(s => selectedScheduleIds.includes(s.id));

                  return (
                    <div className="col-span-12">
                      <div data-schedule-list className="admin-card p-6 bg-white border border-slate-200 rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[450px]">
                        <div>
                          {/* Header Toolbar */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-[#EDF2F7]">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                                <Clock className="w-4 h-4 text-blue-500" />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-[#1A202C]">Active Schedules</h3>
                                <p className="text-[10.5px] text-slate-400">Configured reports · Send times in {schedulerTimezone}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="border-blue-200 text-blue-750 bg-blue-50 text-[10px] font-bold">
                                {schedules.length} configured
                              </Badge>
                              <button
                                onClick={() => fetchSchedules(supabase)}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                title="Refresh schedules"
                              >
                                <RefreshCw className={`w-4 h-4 ${schedulerLoading ? "animate-spin" : ""}`} />
                              </button>
                            </div>
                          </div>

                          <div role="tablist" aria-label="Schedule report scopes" className="flex flex-wrap gap-1 rounded-xl border border-blue-100 bg-[#f8fbff] p-1 mb-3 w-fit">
                            {([['station', 'Stations'], ['branch', 'Branches'], ['global', 'Global'], ['all', 'All schedules']] as const).map(([kind, label]) => (
                              <button key={kind} type="button" role="tab" aria-selected={scheduleScopeTab === kind}
                                onClick={() => {setScheduleScopeTab(kind); setScheduleStationFilter(""); setScheduleBranchFilter(""); setSelectedScheduleIds([]);}}
                                className={`rounded-lg px-3 py-2 text-xs font-semibold ${scheduleScopeTab === kind ? 'bg-[#d3e3fd] text-[#174ea6]' : 'text-slate-600 hover:bg-blue-50'}`}>
                                {label} <span className="ml-1 text-[10px]">{kind === "all" ? schedules.length : scheduleScopes.filter(scope => scope.kind === kind).length}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {scheduleScopeTab !== "global" && <select aria-label="Schedule station" value={scheduleStationFilter}
                              onChange={event => {setScheduleStationFilter(event.target.value); setScheduleBranchFilter(""); setSelectedScheduleIds([]);}}
                              className="h-9 rounded-lg border border-blue-100 bg-white px-3 text-xs text-slate-700">
                              <option value="">All stations</option>
                              {stationCodes.map(code => <option key={code} value={code}>{stationsList.find(station => station.code === code)?.name || code} ({code})</option>)}
                            </select>}
                            {scheduleScopeTab === "branch" && <select aria-label="Schedule branch" value={scheduleBranchFilter}
                              onChange={event => {setScheduleBranchFilter(event.target.value); setSelectedScheduleIds([]);}}
                              className="h-9 rounded-lg border border-blue-100 bg-white px-3 text-xs text-slate-700">
                              <option value="">All branches</option>
                              {branchCodes.map(code => <option key={code} value={code}>{branchesList.find(branch => branch.code === code)?.name || code} ({code})</option>)}
                            </select>}
                            <select aria-label="Schedule recipient" value={schedulePersonFilter} onChange={event => {setSchedulePersonFilter(event.target.value); setSelectedScheduleIds([]);}}
                              className="h-9 max-w-full rounded-lg border border-blue-100 bg-white px-3 text-xs text-slate-700">
                              <option value="">All recipients</option>
                              {personEmails.map(email => <option key={email} value={email}>{dbUsers.find(user => user.email.toLowerCase() === email)?.display_name || email} · {email}</option>)}
                            </select>
                          </div>
                          {/* Search, Filter & Quick Action Bar */}
                          <div className="flex flex-col sm:flex-row gap-3 mb-4">
                            <div className="relative flex-1">
                              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <Input
                                aria-label="Search schedules"
                                placeholder="Search by country, station, branch, email..."
                                value={scheduleSearch}
                                onChange={(e) => setScheduleSearch(e.target.value)}
                                className="h-9 pl-8 text-xs bg-white border-[#CBD5E0] rounded-lg text-slate-700 w-full"
                              />
                            </div>

                            <select
                              aria-label="Schedule frequency filter"
                              value={scheduleFrequencyFilter}
                              onChange={(e) => setScheduleFrequencyFilter(e.target.value)}
                              className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-40"
                            >
                              <option value="ALL">All Frequencies</option>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>

                            <select
                              aria-label="Schedule status filter"
                              value={scheduleStatusFilter}
                              onChange={(e) => setScheduleStatusFilter(e.target.value)}
                              className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-36"
                            >
                              <option value="ALL">All Statuses</option>
                              <option value="ACTIVE">Active Only</option>
                              <option value="PAUSED">Paused Only</option>
                            </select>
                          </div>

                          {/* Multi-Selection Bulk Action Toolbar */}
                          {selectedScheduleIds.length > 0 && (
                            <div className="mb-4 p-3 bg-rose-50/90 border border-rose-200 rounded-xl flex items-center justify-between flex-wrap gap-2 animate-in fade-in-0 duration-150">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                                  {selectedScheduleIds.length}
                                </span>
                                <span className="text-xs font-bold text-rose-900">
                                  {selectedScheduleIds.length} schedule{selectedScheduleIds.length > 1 ? "s" : ""} selected
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setSelectedScheduleIds([])}
                                  className="h-7 px-2.5 text-[10.5px] font-bold text-slate-600 bg-white border-slate-200 hover:bg-slate-50"
                                >
                                  Clear Selection
                                </Button>
                                <Button
                                  type="button"
                                  onClick={handleBulkDeleteSchedules}
                                  className="h-7 px-3 text-[10.5px] font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5 shadow-sm shadow-rose-500/20"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete Selected ({selectedScheduleIds.length})
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Table Container */}
                          <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-xl">
                            {schedulerLoading ? (
                              <div className="p-6 space-y-3">
                                <Skeleton className="h-10 w-full bg-slate-50" />
                                <Skeleton className="h-10 w-full bg-slate-50" />
                                <Skeleton className="h-10 w-full bg-slate-50" />
                              </div>
                            ) : schedules.length === 0 ? (
                              <div className="text-center py-14 bg-slate-50 rounded-xl">
                                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs text-slate-500 font-bold">No schedules configured yet.</p>
                                <p className="text-[10.5px] text-slate-400 mt-1">Configure automated reporting schedules using the "Configure New Schedule" tab.</p>
                              </div>
                            ) : filteredSchedules.length === 0 ? (
                              <div className="text-center py-12 bg-slate-50 rounded-xl">
                                <Filter className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs text-slate-500 font-bold">No schedules match your search filters.</p>
                                <button
                                  type="button"
                                  onClick={() => { setScheduleSearch(""); setScheduleFrequencyFilter("ALL"); setScheduleStatusFilter("ALL"); setScheduleScopeTab("all"); setScheduleStationFilter(""); setScheduleBranchFilter(""); setSchedulePersonFilter(""); }}
                                  className="text-[10.5px] text-blue-600 font-bold hover:underline mt-1"
                                >
                                  Clear All Filters
                                </button>
                              </div>
                            ) : (
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-[#E2E8F0] text-slate-500 uppercase font-bold text-[9.5px] tracking-wider bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm">
                                    <th className="p-3 text-center w-10">
                                      <input
                                        type="checkbox"
                                        checked={isAllFilteredSelected}
                                        ref={(el) => {
                                          if (el) el.indeterminate = !isAllFilteredSelected && isSomeFilteredSelected;
                                        }}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedScheduleIds(Array.from(new Set([...selectedScheduleIds, ...filteredSchedules.map(s => s.id)])));
                                          } else {
                                            const filteredIds = new Set(filteredSchedules.map(s => s.id));
                                            setSelectedScheduleIds(selectedScheduleIds.filter(id => !filteredIds.has(id)));
                                          }
                                        }}
                                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        title={isAllFilteredSelected ? "Deselect all" : "Select all visible"}
                                      />
                                    </th>
                                    <th className="px-4 py-3">Report Scope</th>
                                    <th className="px-4 py-3">Frequency & Trigger</th>
                                    <th className="px-4 py-3">Date Range</th>
                                    <th className="px-4 py-3">Recipients</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#F1F5F9] bg-white">
                                  {filteredSchedules.map((s) => {
                                    const filters = s.filters || {};
                                    const countryClean = cleanCountryName(filters.country);
                                    const scope = scopeFor(s);
                                    const isBranch = scope.kind === "branch";
                                    const isStation = scope.kind === "station";
                                    const stationLabel = scope.label;

                                    let triggerDesc = "";
                                    const isMonthCycleWeekly = (s.frequency === "weekly" && !!s.day_of_month) || (s.frequency === "monthly" && !!s.day_of_month && s.day_of_month > 1);
                                    if (isMonthCycleWeekly) {
                                      triggerDesc = `Weekly on the ${getOrdinal(s.day_of_month)} at ${s.time_of_day}`;
                                    } else if (s.frequency === "weekly") {
                                      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                                      triggerDesc = `Weekly on ${days[s.day_of_week] || "Monday"} at ${s.time_of_day}`;
                                    } else if (s.frequency === "monthly") {
                                      triggerDesc = `Monthly on the ${getOrdinal(s.day_of_month || 1)} at ${s.time_of_day}`;
                                    } else {
                                      triggerDesc = `Daily at ${s.time_of_day}`;
                                    }

                                    const recipientList = (s.recipient_email || "").split(",").map((r: string) => r.trim()).filter(Boolean);
                                    const isSelected = selectedScheduleIds.includes(s.id);

                                    return (
                                      <tr
                                        key={s.id}
                                        data-schedule-id={s.id}
                                        className={`transition-colors hover:bg-slate-50/70 ${isSelected ? "bg-blue-50/40 font-medium" : ""}`}
                                      >
                                        {/* Row Checkbox */}
                                        <td className="p-3 text-center">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {
                                              setSelectedScheduleIds((prev) =>
                                                prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                                              );
                                            }}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                          />
                                        </td>

                                        {/* Report Scope / Target */}
                                        <td className="px-4 py-3">
                                          <div className="flex items-center gap-2">
                                            {isBranch ? (
                                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold shrink-0">
                                                {scope.code}
                                              </Badge>
                                            ) : isStation ? (
                                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold shrink-0">
                                                {scope.code}
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold shrink-0">
                                                Global
                                              </Badge>
                                            )}
                                            <div>
                                              <div className="font-bold text-slate-800 text-xs">{stationLabel}</div>
                                              {filters.country && countryClean && isBranch && (
                                                <div className="text-[10px] text-slate-400">{countryClean}</div>
                                              )}
                                            </div>
                                          </div>
                                        </td>

                                        {/* Frequency & Trigger */}
                                        <td className="px-4 py-3">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <Badge
                                              variant="outline"
                                              className={`text-[9.5px] font-bold uppercase tracking-wider ${s.frequency === "daily"
                                                  ? "bg-sky-50 text-sky-700 border-sky-200"
                                                  : isMonthCycleWeekly
                                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                                    : s.frequency === "monthly"
                                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                                      : "bg-blue-50 text-blue-700 border-blue-200"
                                                }`}
                                            >
                                              {isMonthCycleWeekly ? "weekly" : s.frequency}
                                            </Badge>
                                            <span className="text-[11px] font-semibold text-slate-700">{triggerDesc}</span>
                                          </div>
                                        </td>

                                        {/* Date Range */}
                                        <td className="px-4 py-3">
                                          {filters.use_fixed_dates && filters.start_date && filters.end_date ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                              <Calendar className="w-3 h-3 text-slate-500" />
                                              {filters.start_date} → {filters.end_date}
                                            </span>
                                          ) : (
                                            <span className="text-[10px] text-slate-400 font-medium italic">
                                              Calculated at each run

                                            </span>
                                          )}
                                        </td>

                                        {/* Recipients */}
                                        <td className="px-4 py-3">
                                          <div className="space-y-1">
                                            {filters.recipient_mode === "person" && <p className="text-[10px] font-semibold text-blue-700">Individual schedule</p>}
                                            <div className="flex items-center gap-1.5">
                                              <Badge className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9.5px] font-bold border border-slate-200 px-1.5 py-0 rounded">
                                                <Users className="w-2.5 h-2.5 mr-1" />
                                                {recipientList.length} recipient{recipientList.length !== 1 ? "s" : ""}
                                              </Badge>
                                            </div>
                                            <p
                                              className="text-[10px] text-slate-500 truncate max-w-[200px]"
                                              title={s.recipient_email}
                                            >
                                              {s.recipient_email}
                                            </p>
                                          </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3 text-center">
                                          <span
                                            className={`inline-flex items-center gap-1 text-[9.5px] font-black px-2 py-0.5 rounded-full uppercase border ${s.is_active
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : "bg-slate-100 text-slate-500 border-slate-200"
                                              }`}
                                          >
                                            <span
                                              className={`w-1.5 h-1.5 rounded-full ${s.is_active ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                                                }`}
                                            />
                                            {s.is_active ? "Active" : "Paused"}
                                          </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3 text-right">
                                          <div className="flex items-center justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => handleRunScheduleNow(s.id)}
                                              className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                              title="Run Report Now"
                                            >
                                              <Play className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleToggleSchedule(s.id)}
                                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${s.is_active
                                                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                                }`}
                                              title={s.is_active ? "Pause automated schedule" : "Activate schedule"}
                                            >
                                              {s.is_active ? "Pause" : "Activate"}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSchedule(s.id, stationLabel, triggerDesc, recipientList.length)}
                                              className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100 transition-colors"
                                              title="Delete Schedule"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── USERS SECTION ── */}
          {activeSection === "users" && (
            <div className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in-0 duration-200">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#d3e3fd] pb-4 mb-6">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">

                    <h2 className="text-xl font-semibold text-[#1A202C] tracking-tight">System Users & Recipients</h2>
                  </div>
                  <p className="text-sm text-slate-400">View and manage recipients filtered by station and freight mode (Air & Sea), stored in the database.</p>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-6">
                {/* Users List (Full Width) */}
                <div className="col-span-12 space-y-4">
                  <div data-recipients-directory className="p-5 bg-white border border-[#d3e3fd] rounded-2xl shadow-sm">
                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-between items-center pb-4 border-b border-[#d3e3fd] mb-4">
                      <div className="flex items-center gap-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[#1A202C]">Recipients Directory</h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e8f0fe] text-slate-600 border border-[#d3e3fd]">
                              {dbUsers.length} total
                            </span>
                          </div>
                          <p className="text-[10.5px] text-slate-400">Manage recipient details, branch assignments and freight preferences</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleOpenAddRecipient(dbUserStationFilter === "ALL" ? undefined : dbUserStationFilter)}
                          className="h-8 px-4 text-xs bg-[#1a73e8] hover:bg-[#1557b0] text-white font-semibold rounded-full"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Recipient</span>
                        </Button>
                        <button
                          onClick={() => { fetchDbUsers(supabase); fetchStationsAndBranches(supabase); }}
                          className="p-1.5 rounded-lg hover:bg-[#e8f0fe] text-slate-400 hover:text-slate-600 transition-colors"
                          title="Refresh list"
                        >
                          <RefreshCw className={`w-4 h-4 ${dbUsersLoading ? "animate-spin" : ""}`} />
                        </button>
                      </div>
                    </div>

                    <Tabs value={recipientDirectoryTab} onValueChange={value => selectRecipientDirectoryTab(value as "stations" | "branches")} className="w-full">
                      <TabsList aria-label="Recipient directory sections" className="h-auto rounded-full border border-[#d3e3fd] bg-[#e8f0fe] p-1">
                        <TabsTrigger value="stations" className="rounded-full px-5 py-2 text-xs font-semibold text-[#1a73e8] data-[state=active]:bg-[#d3e3fd] data-[state=active]:text-[#174ea6] data-[state=active]:shadow-none">Stations</TabsTrigger>
                        <TabsTrigger value="branches" className="rounded-full px-5 py-2 text-xs font-semibold text-[#1a73e8] data-[state=active]:bg-[#d3e3fd] data-[state=active]:text-[#174ea6] data-[state=active]:shadow-none">Branches</TabsTrigger>
                      </TabsList>
                      <TabsContent value={recipientDirectoryTab} className="mt-5">
                    {!showRecipientBranches && (
                    <nav aria-label="Recipient stations" className="mb-5 flex flex-wrap gap-2 border-b border-[#d3e3fd] pb-4">
                      <button
                        type="button"
                        aria-pressed={dbUserStationFilter === "ALL"}
                        onClick={() => selectRecipientStation("ALL")}
                        className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${dbUserStationFilter === "ALL"
                          ? "border-[#aecbfa] bg-[#d3e3fd] text-[#174ea6]"
                          : "border-[#d3e3fd] bg-white text-[#1a73e8] hover:bg-[#e8f0fe]"}`}
                      >
                        All Stations
                      </button>
                      {directoryStations.map(station => (
                        <button
                          key={station.code}
                          type="button"
                          aria-pressed={dbUserStationFilter === station.code}
                          onClick={() => selectRecipientStation(station.code)}
                          title={station.name}
                          className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${dbUserStationFilter === station.code
                            ? "border-[#aecbfa] bg-[#d3e3fd] text-[#174ea6]"
                            : "border-[#d3e3fd] bg-white text-[#1a73e8] hover:bg-[#e8f0fe]"}`}
                        >
                          {station.name} ({station.code})
                        </button>
                      ))}
                    </nav>
                    )}
                    {showRecipientBranches && (
                      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#d3e3fd] bg-[#f8fbff] p-3">
                        <label htmlFor={`recipient-branch-station-${transportMode}`} className="text-xs font-semibold text-[#174ea6]">Station</label>
                        <select id={`recipient-branch-station-${transportMode}`} aria-label="Branch station" value={dbUserStationFilter}
                          onChange={event => selectRecipientStation(event.target.value)}
                          className="h-9 min-w-48 rounded-lg border border-[#d3e3fd] bg-white px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#aecbfa]">
                          {directoryStations.length === 0 && <option value="ALL">No stations available</option>}
                          {directoryStations.map(station => <option key={station.code} value={station.code}>{station.name} ({station.code})</option>)}
                        </select>
                        <span className="text-xs text-slate-500">Branches for the selected station</span>
                      </div>
                    )}
                    {directoryLocationError && <p role="status" className="mb-4 text-xs text-slate-600">{directoryLocationError}</p>}
                    {stationsLoading && <p role="status" className="mb-4 text-xs text-[#1a73e8]">Loading stations and branches...</p>}
                    {!stationsLoading && !directoryLocationError && directoryStations.length === 0 && (
                      <p className="mb-4 text-xs text-slate-600">No active stations are configured.</p>
                    )}

                    {/* Freight Mode Selector Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="inline-flex p-1 bg-[#e8f0fe] rounded-lg border border-[#d3e3fd]">
                        <button
                          type="button"
                          onClick={() => setDbUserFreightFilter("ALL")}
                          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                            dbUserFreightFilter === "ALL"
                              ? "bg-white text-slate-800 shadow-sm"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >

                          <span>All Recipients</span>
                          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-[#d3e3fd]/70 text-slate-700">
                            {scopedDirectoryUsers.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDbUserFreightFilter("AIR")}
                          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                            dbUserFreightFilter === "AIR"
                              ? "bg-[#d3e3fd] text-[#174ea6] shadow-sm"
                              : "text-slate-500 hover:text-slate-600"
                          }`}
                        >

                          <span>Air Freight</span>
                          <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                            dbUserFreightFilter === "AIR" ? "bg-[#d3e3fd] text-[#174ea6]" : "bg-[#d3e3fd]/70 text-slate-700"
                          }`}>
                            {scopedDirectoryUsers.filter(u => u.is_air !== false).length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDbUserFreightFilter("SEA")}
                          className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                            dbUserFreightFilter === "SEA"
                              ? "bg-[#d3e3fd] text-[#174ea6] shadow-sm"
                              : "text-slate-500 hover:text-slate-600"
                          }`}
                        >

                          <span>Sea Freight</span>
                          <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                            dbUserFreightFilter === "SEA" ? "bg-[#d3e3fd] text-[#174ea6]" : "bg-[#d3e3fd]/70 text-slate-700"
                          }`}>
                            {scopedDirectoryUsers.filter(u => u.is_sea === true).length}
                          </span>
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-400 font-medium">
                        Set Air and Sea preferences for recipient selection.
                      </div>
                    </div>

                    {/* Search and Dropdowns Filter Bar */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-3">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          aria-label="Search recipients"
                          placeholder="Search by name, email, station or branch"
                          value={dbUserSearch}
                          onChange={(e) => setDbUserSearch(e.target.value)}
                          className="h-9 pl-9 text-xs bg-white border-[#d3e3fd] rounded-lg text-slate-700"
                        />
                        {dbUserSearch && (
                          <button
                            onClick={() => setDbUserSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Reset Filters button */}
                      {(dbUserSearch.trim() !== "" || (!showRecipientBranches && dbUserStationFilter !== "ALL")) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!showRecipientBranches) selectRecipientStation("ALL");
                            setDbUserSearch("");
                          }}
                          className="h-9 px-3 text-xs font-bold text-slate-600 bg-[#f8fbff] hover:bg-[#e8f0fe] border border-[#d3e3fd] rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                          title="Reset all filters"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>

                    {/* ── VIEW MODE: BRANCH DIRECTORY (CARDS VIEW) ── */}
                    {showRecipientBranches && (
                      <div className="space-y-4">
                        {!stationsLoading && selectedDirectoryBranches.length === 0 && (
                          <p className="rounded-xl border border-[#d3e3fd] bg-[#f8fbff] p-5 text-sm text-slate-600">No active branches are configured for this station.</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {selectedDirectoryBranches
                            .filter(b => {
                              const q = dbUserSearch.toLowerCase().trim();
                              if (!q) return true;
                              const summary = branchUserSummary[b.code];
                              const matchBranch = b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || (b.city || "").toLowerCase().includes(q);
                              const matchUser = summary?.directUsers?.some(u => (u.display_name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
                              return matchBranch || matchUser;
                            })
                            .map((branch) => {
                              const summary = branchUserSummary[branch.code];
                              const directUsers = summary?.directUsers || [];
                              const globalUsers = summary?.globalUsers || [];

                              return (
                                <div
                                  key={branch.code}
                                  data-directory-branch-code={branch.code}
                                  className="bg-white rounded-xl border border-[#d3e3fd] p-4 flex flex-col justify-between"
                                >
                                  <div>
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between pb-3 border-b border-[#d3e3fd] mb-3">
                                      <div className="flex items-center gap-2.5">
                                        <div>
                                          <h4 className="text-xs font-bold text-slate-800 leading-snug">
                                            {branch.name}
                                          </h4>
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            <span className="text-[9px] font-semibold text-slate-700 bg-[#f8fbff] border border-[#d3e3fd] px-1.5 py-0.2 rounded uppercase">
                                              {branch.code}
                                            </span>
                                            {branch.city && (
                                              <span className="text-[10px] text-slate-400">{branch.city}</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                                          directUsers.length > 0
                                            ? "bg-[#e8f0fe] text-slate-800 border border-[#d3e3fd]"
                                            : "bg-[#e8f0fe] text-slate-500"
                                        }`}>
                                          {directUsers.length} {directUsers.length === 1 ? "user" : "users"}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleOpenAddRecipient(branch.code)}
                                          className="h-8 px-4 text-xs bg-[#1a73e8] hover:bg-[#1557b0] text-white font-semibold rounded-full"
                                          title={`Add Recipient to ${branch.code}`}
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Users List for this Branch */}
                                    <div className="space-y-2 mb-3">
                                      {directUsers.length > 0 ? (
                                        directUsers.map((u) => (
                                          <div
                                            key={u.id}
                                            data-recipient-id={u.id}
                                            className="p-2 rounded-lg bg-[#f8fbff]/80 border border-[#d3e3fd] flex items-center justify-between gap-2 hover:bg-[#f8fbff]/40 transition-colors"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <div className="w-6 h-6 rounded-full bg-[#e8f0fe] text-slate-800 border border-[#d3e3fd] flex items-center justify-center text-[9.5px] font-bold shrink-0">
                                                {((u.display_name || u.email || "U").slice(0, 2)).toUpperCase()}
                                              </div>
                                              <div className="min-w-0">
                                                <p className="text-[11px] font-bold text-slate-800 truncate">
                                                  {u.display_name || u.email.split("@")[0]}
                                                </p>
                                                <p className="text-[10px] text-slate-400 truncate">
                                                  {u.email}
                                                </p>
                                              </div>
                                            </div>

                                            {/* Preferences & Actions */}
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              <button
                                                type="button"
                                                aria-pressed={u.is_air !== false}
                                                onClick={() => handleToggleFreightMode(u.id, "is_air", u.is_air ?? true)}
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer ${
                                                  u.is_air !== false
                                                    ? "bg-[#e8f0fe] text-slate-700"
                                                    : "bg-[#d3e3fd]/60 text-slate-400"
                                                }`}
                                                title={u.is_air !== false ? "Air Freight: Subscribed" : "Air Freight: Off"}
                                              >

                                                <span>Air</span>
                                              </button>
                                              <button
                                                type="button"
                                                aria-pressed={u.is_sea === true}
                                                onClick={() => handleToggleFreightMode(u.id, "is_sea", u.is_sea ?? false)}
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer ${
                                                  u.is_sea === true
                                                    ? "bg-[#e8f0fe] text-slate-700"
                                                    : "bg-[#d3e3fd]/60 text-slate-400"
                                                }`}
                                                title={u.is_sea === true ? "Sea Freight: Subscribed" : "Sea Freight: Off"}
                                              >

                                                <span>Sea</span>
                                              </button>
                                              <button type="button" onClick={() => handleScheduleForPerson(u, branch.code)} title="Schedule report"
                                                className="p-1 rounded text-slate-500 hover:text-blue-700 hover:bg-white">
                                                <Clock className="w-3 h-3" />
                                              </button>
                                              <button
                                                onClick={() => handleOpenEditRecipient(u)}
                                                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-white"
                                                title="Edit"
                                              >
                                                <Pencil className="w-3 h-3" />
                                              </button>
                                              <button
                                                onClick={async () => {
                                                  if (!confirm(`Are you sure you want to delete ${u.email}?`)) return;
                                                  try {
                                                    const { error } = await supabase
                                                      .from(TONNAGE_USERS_TABLE)
                                                      .delete()
                                                      .eq("id", u.id);
                                                    if (error) throw error;
                                                    fetchDbUsers(supabase);
                                                  } catch (err: any) {
                                                    alert(err.message || "Failed to delete user.");
                                                  }
                                                }}
                                                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-white"
                                                title="Delete"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="py-4 px-3 rounded-lg border border-dashed border-[#d3e3fd] text-center">
                                          <p className="text-[11px] text-slate-400 italic mb-2">No recipients directly assigned to this branch.</p>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleOpenAddRecipient(branch.code)}
                                            className="h-8 px-4 text-xs bg-[#1a73e8] hover:bg-[#1557b0] text-white font-semibold rounded-full"
                                          >
                                            <Plus className="w-3.5 h-3.5 mr-1" />
                                            Assign Recipient
                                          </Button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Global recipient note */}
                                    {globalUsers.length > 0 && (
                                      <p className="text-[10px] text-slate-400 flex items-center gap-1 pt-2 border-t border-[#d3e3fd]">

                                        <span>+ {globalUsers.length} global recipients are available for report selection</span>
                                      </p>
                                    )}
                                  </div>

                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* ── VIEW MODE: TABLE DIRECTORY ── */}
                    {!showRecipientBranches && (
                      <div className="overflow-x-auto max-h-[520px]">
                        {dbUsersLoading ? (
                          <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                            <RefreshCw className="w-6 h-6 animate-spin text-slate-600" />
                            <p className="text-xs font-medium">Fetching database users...</p>
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-[#d3e3fd] text-slate-400 uppercase font-bold text-[10px] tracking-wider bg-[#f8fbff]/50 sticky top-0 z-10 backdrop-blur-xs">
                                <th className="px-4 py-3">Recipient</th>
                                <th className="px-4 py-3">Email Address</th>
                                <th className="px-4 py-3">Station</th>
                                <th className="px-4 py-3">Freight Reports</th>
                                <th className="px-4 py-3">Created At</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#d3e3fd]">
                              {visibleDirectoryUsers.map((u) => {
                                  const stations = (u.station || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                                  const initialLetters = ((u.display_name || u.email || "U").slice(0, 2)).toUpperCase();

                                  return (
                                    <tr key={u.id} className="hover:bg-[#f8fbff]/70 transition-colors">
                                      {/* Recipient Name & Branch Scope Tag */}
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border bg-[#e8f0fe] text-[#174ea6] border-[#d3e3fd]">
                                            {initialLetters}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="font-bold text-slate-800 text-xs truncate">
                                                {u.display_name || "—"}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 sm:hidden block truncate">
                                              {u.email}
                                            </span>
                                          </div>
                                        </div>
                                      </td>

                                      {/* Email Address */}
                                      <td className="px-4 py-3 font-medium text-slate-600">
                                        {u.email}
                                      </td>

                                      <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                          {recipientAssignmentCodes(u.station).filter(code => !directoryBranchParents.has(code)).map(code => (
                                            <span key={code} title={directoryStations.find(station => station.code.toUpperCase() === code)?.name || code}
                                              className="rounded-full border border-[#d3e3fd] bg-[#f8fbff] px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                                              {code === "GLOBAL" ? "Global" : code}
                                            </span>
                                          ))}
                                        </div>
                                      </td>

                                      {/* Freight Preferences (Air & Sea toggles) */}
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {/* Air Freight Mode Chip */}
                                          <button
                                            type="button"
                                            aria-pressed={u.is_air !== false}
                                                onClick={() => handleToggleFreightMode(u.id, "is_air", u.is_air ?? true)}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                              u.is_air !== false
                                                ? "bg-[#f8fbff] text-slate-700 border border-[#d3e3fd] hover:bg-[#e8f0fe] "
                                                : "bg-[#f8fbff] text-slate-400 border border-dashed border-[#d3e3fd] hover:bg-[#e8f0fe] hover:text-slate-600"
                                            }`}
                                            title={u.is_air !== false ? "Click to disable Air Freight reports" : "Click to enable Air Freight reports"}
                                          >

                                            <span>Air</span>
                                            {u.is_air !== false ? (
                                              <Check className="w-2.5 h-2.5 text-slate-600 stroke-[3]" />
                                            ) : (
                                              <span className="text-[9px] text-slate-400 font-normal">Off</span>
                                            )}
                                          </button>

                                          {/* Sea Freight Mode Chip */}
                                          <button
                                            type="button"
                                            aria-pressed={u.is_sea === true}
                                                onClick={() => handleToggleFreightMode(u.id, "is_sea", u.is_sea ?? false)}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                              u.is_sea === true
                                                ? "bg-[#f8fbff] text-slate-700 border border-[#d3e3fd] hover:bg-[#e8f0fe] "
                                                : "bg-[#f8fbff] text-slate-400 border border-dashed border-[#d3e3fd] hover:bg-[#e8f0fe] hover:text-slate-600"
                                            }`}
                                            title={u.is_sea === true ? "Click to disable Sea Freight reports" : "Click to enable Sea Freight reports"}
                                          >

                                            <span>Sea</span>
                                            {u.is_sea === true ? (
                                              <Check className="w-2.5 h-2.5 text-slate-600 stroke-[3]" />
                                            ) : (
                                              <span className="text-[9px] text-slate-400 font-normal">Off</span>
                                            )}
                                          </button>
                                        </div>
                                      </td>

                                      <td className="px-4 py-3 text-slate-400 tabular-nums">
                                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                                      </td>

                                      <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <button type="button" onClick={() => handleScheduleForPerson(u, dbUserStationFilter !== "ALL" ? dbUserStationFilter : undefined)} title="Schedule report"
                                            className="p-1 rounded hover:bg-[#f8fbff] text-slate-500 hover:text-blue-700 transition-colors">
                                            <Clock className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleOpenEditRecipient(u)}
                                            className="p-1 rounded hover:bg-[#f8fbff] text-slate-400 hover:text-slate-600 transition-colors"
                                            title="Edit Recipient"
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={async () => {
                                              if (!confirm(`Are you sure you want to delete ${u.email}?`)) return;
                                              try {
                                                const { error } = await supabase
                                                  .from(TONNAGE_USERS_TABLE)
                                                  .delete()
                                                  .eq("id", u.id);
                                                if (error) throw error;
                                                fetchDbUsers(supabase);
                                              } catch (err: any) {
                                                alert(err.message || "Failed to delete user.");
                                              }
                                            }}
                                            className="p-1 rounded hover:bg-[#f8fbff] text-slate-500 hover:text-slate-600 transition-colors"
                                            title="Delete Recipient"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}

                              {dbUsers.length > 0 && visibleDirectoryUsers.length === 0 && (
                                <tr><td colSpan={6} className="py-12 text-center text-xs text-slate-500">No recipients matching your active filter criteria.</td></tr>
                              )}

                              {dbUsers.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="text-center py-12 text-slate-400 font-medium italic">
                                    No database users configured.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              </div>

              {/* ── ADD / EDIT RECIPIENT MODAL ── */}
              {isAddRecipientModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in-0 duration-150">
                  <div role="dialog" aria-modal="true" aria-label={editingRecipient ? "Edit Recipient" : "Add New Recipient"} className="bg-white rounded-xl shadow-lg border border-[#d3e3fd] max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
                    {/* Modal Header */}
                    <div className="px-6 py-4 border-b border-[#d3e3fd] flex items-center justify-between bg-[#f8fbff]/50">
                      <div className="flex items-center gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800">
                            {editingRecipient ? "Edit Recipient" : "Add New Recipient"}
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Configure station and freight report preferences
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setIsAddRecipientModalOpen(false)}
                        className="p-1 rounded-lg hover:bg-[#e8f0fe] text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Modal Form */}
                    <form onSubmit={handleSaveRecipient} className="p-6 space-y-4">
                      {recipientFormError && (
                        <div className="p-2.5 rounded-lg bg-[#f8fbff] border border-[#d3e3fd] text-slate-700 text-xs flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{recipientFormError}</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Email Address <span className="text-slate-500">*</span>
                        </label>
                        <Input
                          type="email"
                          value={recipientFormEmail}
                          onChange={(e) => setRecipientFormEmail(e.target.value)}
                          disabled={!!editingRecipient}
                          placeholder="recipient@dartglobal.com"
                          className="h-9 text-xs"
                          required
                        />
                        {editingRecipient && (
                          <p className="text-[10px] text-slate-400 mt-1">Email address cannot be changed.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Display Name
                        </label>
                        <Input
                          type="text"
                          value={recipientFormName}
                          onChange={(e) => setRecipientFormName(e.target.value)}
                          placeholder="e.g. Nimal Perera"
                          className="h-9 text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Station Assignment
                        </label>
                        <select
                          value={recipientFormStation}
                          onChange={(e) => setRecipientFormStation(e.target.value)}
                          className="w-full h-9 px-3 bg-white border border-[#d3e3fd] rounded-lg text-slate-700 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#aecbfa]"
                        >
                          {recipientFormStation && !["Global", "OTHER"].includes(recipientFormStation) &&
                            !directoryStations.some(s => s.code === recipientFormStation) &&
                            !directoryBranches.some(b => b.code === recipientFormStation) && (
                              <option value={recipientFormStation}>Current assignments: {recipientFormStation}</option>
                            )}
                          <optgroup label="Global & Corporate">
                            <option value="">Unassigned</option>
                            <option value="Global">Global (All Stations & Branches)</option>
                            <option value="OTHER">Corporate / Other</option>
                          </optgroup>
                          <optgroup label="National Stations">
                            {directoryStations.map((s) => (
                              <option key={s.code} value={s.code}>
                                {s.name} ({s.code})
                              </option>
                            ))}
                          </optgroup>
                          {formDirectoryBranches.length > 0 && (
                          <optgroup label="City Branches">
                            {formDirectoryBranches.map((b) => (
                              <option key={b.code} value={b.code}>
                                Branch: {b.name} ({b.code})
                              </option>
                            ))}
                          </optgroup>
                          )}
                        </select>
                        {(() => {
                          const branchMatch = directoryBranches.find(b => b.code.toUpperCase() === recipientFormStation.toUpperCase());
                          if (branchMatch) {
                            const existingInBranch = dbUsers.filter(u => {
                              const st = (u.station || "").split(",").map((s: string) => s.trim().toUpperCase());
                              return st.includes(branchMatch.code.toUpperCase());
                            });
                            return (
                              <div className="mt-2 p-2.5 rounded-lg bg-[#f8fbff] border border-[#d3e3fd] text-[11px] text-slate-900">
                                <div className="flex items-center gap-1.5 font-bold mb-1">

                                  <span>Branch: {branchMatch.name}</span>
                                  <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-[#d3e3fd]/80 text-slate-800 font-semibold ml-auto">
                                    {existingInBranch.length} {existingInBranch.length === 1 ? "user" : "users"} assigned
                                  </span>
                                </div>
                                <p className="mb-1 text-[10px] text-slate-600">This assignment is for branch reports only. Station reports require a separate station assignment.</p>
                                {existingInBranch.length > 0 ? (
                                  <p className="text-[10px] text-slate-700">
                                    <strong className="font-semibold">Current recipients:</strong> {existingInBranch.map(u => u.display_name || u.email).join(", ")}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-600 italic">No recipients currently assigned to this branch.</p>
                                )}
                              </div>
                            );
                          }
                          return (
                            <p className="text-[10px] text-slate-400 mt-1">
                              Choose 'Global' to receive company-wide reports, or select a specific national station or city branch.
                            </p>
                          );
                        })()}
                      </div>

                      {/* Freight Preferences (Air & Sea checkboxes) */}
                      <div className="pt-2 border-t border-[#d3e3fd]">
                        <label className="block text-xs font-bold text-slate-800 mb-2">
                          Freight Report Preferences
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2.5 p-2 rounded-lg border border-[#d3e3fd] hover:bg-[#f8fbff] cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={recipientFormIsAir}
                              onChange={(e) => setRecipientFormIsAir(e.target.checked)}
                              className="w-4 h-4 rounded text-slate-600 focus:ring-[#aecbfa]"
                            />
                            <div className="flex-1">
                              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">

                                Air Freight Reports
                              </span>
                              <span className="text-[10.5px] text-slate-400 block">
                                Weekly & Monthly Air Freight Tonnage & Financial Reports
                              </span>
                            </div>
                          </label>

                          <label className="flex items-center gap-2.5 p-2 rounded-lg border border-[#d3e3fd] hover:bg-[#f8fbff] cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              checked={recipientFormIsSea}
                              onChange={(e) => setRecipientFormIsSea(e.target.checked)}
                              className="w-4 h-4 rounded text-slate-600 focus:ring-[#aecbfa]"
                            />
                            <div className="flex-1">
                              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">

                                Sea Freight Reports
                              </span>
                              <span className="text-[10.5px] text-slate-400 block">
                                Weekly & Monthly Sea Freight Consol & TEU Performance Reports
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Modal Actions */}
                      <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#d3e3fd]">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsAddRecipientModalOpen(false)}
                          className="text-xs"
                          disabled={recipientFormLoading}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          className="h-8 px-4 text-xs bg-[#1a73e8] hover:bg-[#1557b0] text-white font-semibold rounded-full"
                          disabled={recipientFormLoading}
                        >
                          {recipientFormLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <Check className="w-3.5 h-3.5 mr-1" />
                          )}
                          {editingRecipient ? "Save Changes" : "Add Recipient"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {isSea && !["admin", "email-scheduling", "users"].includes(activeSection) && (
            <div className="w-full px-4 sm:px-6 lg:px-8 mt-6"><SeaConsolReport records={data} loading={loading}
              dateRange={`${startDate} to ${endDate}`} station={getSelectedCompanyNames()} viewMode={dashboardMode}
              reportType={activeSection === "monthly-reports" ? "monthly" : "weekly"} /></div>
          )}
          {!isSea && <>
          {/* ── FOUR FINANCIAL & OPERATIONAL KPI CARDS ROW (Dashboard + Weekly/Monthly Reports) ── */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
            <div className="w-full px-4 sm:px-6 lg:px-8 mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* Card 1: Revenue */}
              <div className="saas-card p-5 bg-white flex flex-col justify-center h-28 relative overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue</p>
                {loading ? (
                  <Skeleton className="h-8 w-28 mt-2 bg-slate-100" />
                ) : (
                  <h3 className="text-2xl font-extrabold text-[#2D3748] tracking-tight mt-1">
                    {formatCurrency(kpi.Total_Revenue)}
                  </h3>
                )}
              </div>

              {/* Card 2: Total Tonnage */}
              <div className="saas-card p-5 bg-white flex flex-col justify-center h-28 relative overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{freightText("Total Tonnage", transportMode)}</p>
                {loading ? (
                  <Skeleton className="h-8 w-28 mt-2 bg-slate-100" />
                ) : (
                  <h3 className="text-2xl font-extrabold text-[#2D3748] tracking-tight mt-1">
                    {formatNumber(kpi.Total_Tonnage)}{freightText(" kg\n                  ", transportMode)}</h3>
                )}
              </div>

              {/* Card 3: No of Shipments */}
              <div className="saas-card p-5 bg-white flex flex-col justify-center h-28 relative overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No of Shipments</p>
                {loading ? (
                  <Skeleton className="h-8 w-28 mt-2 bg-slate-100" />
                ) : (
                  <h3 className="text-2xl font-extrabold text-[#2D3748] tracking-tight mt-1">
                    {formatNumber(kpi.Total_Shipments)}
                  </h3>
                )}
              </div>

              {/* Card 4: No of Masters */}
              <div className="saas-card p-5 bg-white flex flex-col justify-center h-28 relative overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No of Masters</p>
                {loading ? (
                  <Skeleton className="h-8 w-28 mt-2 bg-slate-100" />
                ) : (
                  <h3 className="text-2xl font-extrabold text-[#2D3748] tracking-tight mt-1">
                    {formatNumber(kpi.Total_Masters ?? kpi.Number_of_Masters ?? kpi.Weekly_Total_Masters ?? kpi.Unique_Masters)}
                  </h3>
                )}
              </div>

            </div>
          )}


          {/* ── MAIN DASHBOARD CANVAS (DIVIDED SEPARATELY FOR WEEKLY & MONTHLY) ── */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
            <div className="w-full px-4 sm:px-6 lg:px-8 mt-6 space-y-12">

              {/* ── CHAPTER 1: WEEKLY OPERATIONAL PERFORMANCE ── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
                  <span className="h-5 w-1.5 bg-[#4299E1] rounded-full animate-pulse" />
                  <h2 className="text-base font-bold text-[#1A202C]">Weekly Operational Performance</h2>
                  <span className="text-[10px] text-[#4299E1] bg-[#EBF8FF] font-semibold px-2 py-0.5 rounded-full border border-[#BEE3F8]">
                    {getSelectedCompanyNames()}
                  </span>
                </div>

                <div className="grid grid-cols-12 gap-6">
                  {/* Left side: Tonnage Flow or Top 10 Airlines Tonnage Share Box — 8-cols in both standard & SQL modes */}
                  {dashboardMode === "standard" ? (
                    /* Standard mode: Tonnage Flow (weekly cargo revenue trend) */
                    <div className="col-span-12 lg:col-span-8 saas-card p-6 bg-white relative">
                      <div className="flex items-center justify-between mb-4 border-b border-[#F1F5F9] pb-4">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{freightText("Tonnage Flow", transportMode)}</p>
                          <h2 className="text-lg font-bold text-[#1A202C] mt-0.5">Cargo Revenue Trend - Weekly</h2>
                        </div>
                        <span className="text-xs font-bold text-[#4299E1] px-2 py-0.5 rounded-full bg-[#EBF8FF] border border-[#BEE3F8]">
                          Weekly aggregation
                        </span>
                      </div>

                      <div className="h-80 w-full">
                        {loading ? (
                          <div className="h-full flex items-center justify-center">
                            <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={weeklyData} margin={{ top: 15, right: 10, left: 10, bottom: 15 }}>
                              <defs>
                                <linearGradient id={`visitorAreaGrad-${transportMode}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#4299E1" stopOpacity={0.25} />
                                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                              <XAxis
                                dataKey="week_label"
                                tick={{ fontSize: 10, fill: "#718096", fontWeight: 500 }}
                                axisLine={{ stroke: "#E2E8F0" }}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: "#718096", fontWeight: 500 }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                              />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const rawData = payload[0].payload;
                                  return (
                                    <div className="bg-white border border-[#CBD5E0] shadow-xl p-3.5 rounded-lg text-xs space-y-1.5 min-w-[180px]">
                                      <p className="font-bold text-slate-800 border-b border-[#F1F5F9] pb-1 mb-1">{label}</p>
                                      <div className="flex justify-between items-center gap-4">
                                        <span className="text-slate-500 font-medium flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-[#4299E1]" /> Revenue
                                        </span>
                                        <span className="text-slate-800 font-extrabold">{formatCurrency(rawData.Total_Revenue)}</span>
                                      </div>
                                      <div className="flex justify-between items-center gap-4">
                                        <span className="text-slate-500 font-medium flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-[#3182CE]" />{freightText(" Tonnage\n                                        ", transportMode)}</span>
                                        <span className="text-[#3182CE] font-bold">{formatNumber(rawData.Total_Tonnage)}{freightText(" kg", transportMode)}</span>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="Total_Revenue"
                                name="Revenue"
                                stroke="#3182CE"
                                strokeWidth={2.5}
                                fill={`url(#visitorAreaGrad-${transportMode})`}
                                dot={{ fill: "#3182CE", r: 4, stroke: "#FFFFFF", strokeWidth: 1.5 }}
                                activeDot={{ r: 6, fill: "#3182CE", stroke: "#FFFFFF", strokeWidth: 2 }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Custom SQL Mode: Replace with Top 10 Airlines Tonnage Share box */
                    <div className="col-span-12 lg:col-span-8 saas-card p-6 bg-white flex flex-col justify-between min-h-[350px]">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest text-[#4299E1]">{freightText("Airlines Share", transportMode)}</p>
                          <h4 className="text-sm font-bold text-slate-800 mt-0.5">{freightText("Top 10 Airlines Tonnage Share", transportMode)}</h4>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${activeSection === "monthly-reports"
                          ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                          : "text-indigo-600 bg-indigo-50 border-indigo-100"
                          }`}>
                          {activeSection === "monthly-reports" ? "Week-by-Week Stack" : "Day-by-Day Stack"}
                        </span>
                      </div>

                      <div className="h-64 w-full mt-2">
                        {(() => {
                          const chartData = activeSection === "monthly-reports" ? weeklyStackedAirlineData : dailyStackedAirlineData;
                          const xKey = activeSection === "monthly-reports" ? "week_label" : "date_label";
                          return loading ? (
                            <Skeleton className="h-full w-full rounded bg-slate-150 animate-pulse" />
                          ) : chartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-slate-400">
                              No carrier data available
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={chartData}
                                margin={{ top: 25, right: 10, left: 10, bottom: activeSection === "monthly-reports" ? 35 : (chartData.length > 10 ? 40 : 20) }}
                              >
                                <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} horizontal={true} />
                                <XAxis
                                  dataKey={xKey}
                                  type="category"
                                  height={activeSection === "monthly-reports" ? 35 : undefined}
                                  tick={<CustomXAxisTick />}
                                  axisLine={{ stroke: "#E2E8F0" }}
                                  tickLine={false}
                                  interval={chartData.length > 14 ? Math.floor(chartData.length / 14) : 0}
                                />
                                <YAxis
                                  type="number"
                                  tick={{ fontSize: 8, fill: "#A0AEC0" }}
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(v) => isSea ? formatNumber(v) : `${(v / 1000).toFixed(0)}k`}
                                  width={36}
                                />
                                <Tooltip
                                  contentStyle={{ fontSize: "10px", borderRadius: "6px" }}
                                  formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} ${isSea ? "TEU" : "kg"}`, name]}
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
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>

                      {/* Legends Grid (2-column layout for 10 items) */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4 max-h-[120px] overflow-y-auto pr-1">
                        {top10Airlines.map((entry, idx) => {
                          const pct = totalTop10Tonnage > 0 ? ((entry.tonnage / totalTop10Tonnage) * 100).toFixed(1) : "0.0";
                          return (
                            <div key={entry.name} className="flex items-center justify-between text-[10px] text-slate-655 border-b border-slate-50 pb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getAirlineColor(entry.name, idx) }} />
                                <span className="font-semibold text-slate-700 truncate max-w-[110px]" title={entry.name}>
                                  {entry.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 text-right">
                                <span className="font-bold text-[#2D3748] tabular-nums">{formatNumber(entry.tonnage)}{freightText(" kg", transportMode)}</span>
                                <span className="text-slate-400 font-medium">({pct}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/*
                  ========================================================================
                  COMMENTED OUT: Tonnage Flow - Daily Tonnage & Revenue (Custom SQL Mode)
                  ========================================================================
                  
                  dailyTonnageData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                      <span className="text-3xl">📅</span>
                      <p className="text-xs font-medium text-center">No daily data available.<br />Ensure your SQL query returns an <code className="bg-slate-100 px-1 rounded">ETD</code> date column.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyTonnageData} margin={{ top: 15, right: 48, left: 10, bottom: dailyTonnageData.length > 10 ? 30 : 15 }}>
                        <defs>
                          <linearGradient id={`dailyTonnageGrad-${transportMode}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4299E1" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id={`dailyRevenueGrad-${transportMode}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#48BB78" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                        <XAxis
                          dataKey="date_label"
                          tick={{ fontSize: 9, fill: "#718096", fontWeight: 500 }}
                          axisLine={{ stroke: "#E2E8F0" }}
                          tickLine={false}
                          interval={dailyTonnageData.length > 14 ? Math.floor(dailyTonnageData.length / 14) : 0}
                          angle={dailyTonnageData.length > 10 ? -30 : 0}
                          textAnchor={dailyTonnageData.length > 10 ? "end" : "middle"}
                        />
                        <YAxis
                          yAxisId="tonnage"
                          tick={{ fontSize: 9, fill: "#4299E1" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${(v / sectorDivisor).toFixed(isSea ? 2 : 1)}${isSea ? " TEU" : "t"}`}
                          width={42}
                        />
                        <YAxis
                          yAxisId="revenue"
                          orientation="right"
                          tick={{ fontSize: 9, fill: "#48BB78" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                          width={46}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            return (
                              <div className="bg-white border border-[#CBD5E0] shadow-xl p-3.5 rounded-lg text-xs space-y-1.5 min-w-[190px]">
                                <p className="font-bold text-slate-800 border-b border-[#F1F5F9] pb-1 mb-1">{label}</p>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-slate-500 font-medium flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#4299E1]" /> Tonnage
                                  </span>
                                  <span className="text-[#3182CE] font-extrabold">{formatNumber(d?.Total_Tonnage)} {isSea ? "TEU" : "kg"}</span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-slate-500 font-medium flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-[#48BB78]" /> Revenue
                                  </span>
                                  <span className="text-emerald-600 font-bold">{formatCurrency(d?.Total_Revenue)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                  <span className="text-slate-500 font-medium">Shipments</span>
                                  <span className="text-slate-700 font-semibold">{formatNumber(d?.Total_Shipments)}</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Area
                          yAxisId="tonnage"
                          type="monotone"
                          dataKey="Total_Tonnage"
                          name="Tonnage"
                          stroke="#3182CE"
                          strokeWidth={2.5}
                          fill={`url(#dailyTonnageGrad-${transportMode})`}
                          dot={{ fill: "#3182CE", r: 3, stroke: "#FFFFFF", strokeWidth: 1.5 }}
                          activeDot={{ r: 5, fill: "#3182CE", stroke: "#FFFFFF", strokeWidth: 2 }}
                        />
                        <Area
                          yAxisId="revenue"
                          type="monotone"
                          dataKey="Total_Revenue"
                          name="Revenue"
                          stroke="#48BB78"
                          strokeWidth={2}
                          fill={`url(#dailyRevenueGrad-${transportMode})`}
                          dot={{ fill: "#48BB78", r: 3, stroke: "#FFFFFF", strokeWidth: 1.5 }}
                          activeDot={{ r: 5, fill: "#48BB78", stroke: "#FFFFFF", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                */}
                    </div>
                  )}

                  {/* Airline Carrier Tonnage pie chart (col-span-4) — visible on the right of Tonnage Flow in standard & custom-sql modes */}
                  <div className="col-span-12 lg:col-span-4 saas-card p-6 bg-white min-h-[350px] flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest text-[#4299E1]">{freightText("Airline Carrier Tonnage", transportMode)}</p>
                      {selectedAirlines.length > 0 && (
                        <Badge variant="outline" className="border-blue-200 text-blue-600 bg-blue-50/50 text-[8px] font-bold px-1.5 py-0.5">
                          Selection Active
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-1">{freightText("Airline Tonnage Share", transportMode)}</h4>
                      <p className="text-[10.5px] text-slate-400 leading-tight">
                        {selectedAirlines.length > 0 ? freightText("Showing selected carrier weights", transportMode) : freightText("Showing carrier distribution by weight", transportMode)}
                      </p>
                    </div>

                    <div className="relative h-40 flex items-center justify-center my-3 shrink-0">
                      {loading ? (
                        <Skeleton className="h-24 w-24 rounded-full bg-slate-100 animate-pulse" />
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={airlinePieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={48}
                                outerRadius={64}
                                paddingAngle={3}
                                dataKey="value"
                              >
                                {airlinePieData.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={entry.name === "Others" ? "#718096" : getAirlineColor(entry.name, index)} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute text-center flex flex-col justify-center items-center">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{freightText("Total Weight", transportMode)}</span>
                            <span className="text-[9px] font-extrabold text-[#2D3748] tracking-tight mt-0.5">
                              {formatNumber(kpi.Total_Tonnage)}{freightText(" kg\n                            ", transportMode)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Doughnut Legends list */}
                    <div className="space-y-2 max-h-[120px] overflow-y-auto">
                      {airlinePieData.map((entry: any, idx: number) => (
                        <div key={entry.name} className="flex items-start justify-between text-xs text-slate-655 gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: entry.name === "Others" ? "#718096" : getAirlineColor(entry.name, idx) }} />
                            <span className="font-semibold text-slate-700 leading-snug">{entry.name}</span>
                          </div>
                          <span className="font-bold text-[#2D3748] tabular-nums shrink-0 mt-0.5">{formatNumber(entry.value)}{freightText(" kg", transportMode)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── SQL Sandbox mode: Airline Weekly Stack + Trade Routes Pie Chart row ── */}
                {dashboardMode === "custom-sql" && (
                  <div className="grid grid-cols-12 gap-6 mt-6">

                    {/* NEW: Airline Tonnage by Week — Horizontal Stacked Bar (col-span-12) */}
                    <div className="col-span-12 saas-card p-6 bg-white flex flex-col min-h-[380px]">
                      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-widest text-[#4299E1]">{freightText("Airline Breakdown", transportMode)}</p>
                          <h4 className="text-sm font-bold text-slate-800 mt-0.5">{freightText("Airline Tonnage by Week Period", transportMode)}</h4>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                          {airlineWeeklyStackData.length}{freightText(" Airlines · ", transportMode)}{weekStackLabels.length} Weeks
                        </span>
                      </div>

                      <div className="flex-1 min-h-[240px]">
                        {loading ? (
                          <Skeleton className="h-full w-full rounded bg-slate-100 animate-pulse" />
                        ) : airlineWeeklyStackData.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-6">{freightText("\n                            No airline data — ensure your SQL returns an ", transportMode)}<code className="bg-slate-100 px-1 rounded mx-1">{freightText("Airline", transportMode)}</code> and <code className="bg-slate-100 px-1 rounded">ETD</code> column.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height={Math.max(240, airlineWeeklyStackData.length * 34 + 20)}>
                            <BarChart
                              data={airlineWeeklyStackData}
                              layout="vertical"
                              margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={true} horizontal={false} />
                              <XAxis
                                type="number"
                                tick={{ fontSize: 8, fill: "#A0AEC0" }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => isSea ? formatNumber(v) : `${(v / 1000).toFixed(0)}k`}
                              />
                              <YAxis
                                dataKey="airline"
                                type="category"
                                tick={{ fontSize: 8, fill: "#4A5568", fontWeight: 600 }}
                                axisLine={{ stroke: "#E2E8F0" }}
                                tickLine={false}
                                width={140}
                              />
                              <Tooltip
                                contentStyle={{ fontSize: "10px", borderRadius: "6px", maxWidth: "240px" }}
                                formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} ${isSea ? "TEU" : "kg"}`, name]}
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
                        )}
                      </div>


                      {/* Airline color legend */}
                      {airlineWeeklyStackData.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-slate-100">
                          {airlineWeeklyStackData.map((row: any) => (
                            <div key={row.airline} className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: getAirlineColor(row.airline, row.colorIdx) }} />
                              <span className="text-[10px] font-medium text-slate-655" title={row.airline}>
                                {row.airline}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Trade Routes Pie Chart — Top 5 + Others (col-span-12) */}
                    <div className="col-span-12 saas-card p-6 bg-white flex flex-col min-h-[480px]">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#F1F5F9] shrink-0">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Route Distribution</p>
                          <h4 className="text-sm font-bold text-slate-800 mt-0.5">{freightText("Trade Routes by Tonnage (Top 5)", transportMode)}</h4>
                        </div>
                        <span className="text-xs font-bold text-[#4299E1] px-2 py-0.5 rounded-full bg-[#EBF8FF] border border-[#BEE3F8] shrink-0">
                          {tradeRouteData.length} Routes
                        </span>
                      </div>

                      {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                          <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                        </div>
                      ) : tradeRouteData.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-xs text-slate-400 text-center px-4">No route data available. Ensure your SQL returns Origin/Destination columns.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col flex-1 min-h-0 gap-3">
                          {/* Pie Chart — contained height */}
                          <div className="relative w-full" style={{ height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                                <Pie
                                  data={tradeRouteData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius="48%"
                                  outerRadius="82%"
                                  paddingAngle={3}
                                  dataKey="value"
                                >
                                  {tradeRouteData.map((entry, index) => (
                                    <Cell key={`tr-cell-${index}`} fill={entry.isOthers ? "#718096" : PIE_COLORS[index % PIE_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const item = payload[0]?.payload;
                                    const total = tradeRouteData.reduce((s, r) => s + r.value, 0);
                                    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                                    const color = item.isOthers ? "#718096" : PIE_COLORS[tradeRouteData.findIndex(r => r.name === item.name) % PIE_COLORS.length];
                                    return (
                                      <div className="bg-white border border-[#CBD5E0] shadow-xl rounded-lg p-3 text-xs min-w-[180px] max-w-[240px]">
                                        <div className="flex items-start gap-2 mb-2 pb-1.5 border-b border-slate-100">
                                          <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: color }} />
                                          {item.isOthers ? (
                                            <span className="font-bold text-slate-800 leading-tight">Others</span>
                                          ) : (
                                            <div className="flex flex-col min-w-0">
                                              <span className="font-bold text-slate-800 leading-tight">{item.originCity} → {item.destCity}</span>
                                              <span className="text-[10px] text-slate-400 mt-0.5">{item.originCountry} → {item.destCountry}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          <div className="flex justify-between items-center gap-4">
                                            <span className="text-slate-500">{freightText("Tonnage", transportMode)}</span>
                                            <span className="font-extrabold text-[#2D3748] tabular-nums">{Number(item.value).toLocaleString()}{freightText(" kg", transportMode)}</span>
                                          </div>
                                          <div className="flex justify-between items-center gap-4">
                                            <span className="text-slate-500">Share</span>
                                            <span className="font-bold tabular-nums" style={{ color }}>{pct}%</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            {/* Centre label */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
                              <span className="text-sm font-extrabold text-[#2D3748] mt-0.5">
                                {formatNumber(tradeRouteData.reduce((s, r) => s + r.value, 0))}{freightText(" kg\n                              ", transportMode)}</span>
                            </div>
                          </div>

                          {/* Legend — grid layout for full-width card */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mt-4">
                            {tradeRouteData.map((entry, idx) => {
                              const total = tradeRouteData.reduce((s, r) => s + r.value, 0);
                              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
                              return (
                                <div key={entry.name} className="flex items-start gap-2.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                                    style={{ backgroundColor: entry.isOthers ? "#718096" : PIE_COLORS[idx % PIE_COLORS.length] }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-1">
                                      {entry.isOthers ? (
                                        <span className="text-[11px] font-semibold text-slate-700 truncate">Others</span>
                                      ) : (
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-[11px] font-bold text-slate-700 truncate" title={`${entry.originCity} → ${entry.destCity}`}>
                                            {entry.originCity} → {entry.destCity}
                                          </span>
                                          <span className="text-[9px] font-medium text-slate-400 truncate" title={`${entry.originCountry} → ${entry.destCountry}`}>
                                            {entry.originCountry} → {entry.destCountry}
                                          </span>
                                        </div>
                                      )}
                                      <span className="text-[11px] font-bold text-slate-800 tabular-nums shrink-0">{formatNumber(entry.value)}{freightText(" kg", transportMode)}</span>
                                    </div>
                                    <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${pct}%`, backgroundColor: entry.isOthers ? "#718096" : PIE_COLORS[idx % PIE_COLORS.length] }}
                                      />
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-9 text-right mt-0.5">{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                )}


                {/* Full-width: Top 10 Trade Routes Summary Table */}
                <div className="saas-card bg-white p-6 mt-6">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                    <div>
                      <h4 className="text-sm font-bold text-[#1A202C]">Trade Route Performance Summary — Top 10</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{freightText("Aggregated by origin & destination · ranked by chargeable tonnage", transportMode)}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
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
                          <div className="py-14 flex flex-col items-center gap-2 text-slate-400">
                            <span className="text-3xl">🗺️</span>
                            <p className="text-xs font-medium text-center">No trade route data available.<br />Ensure your query returns <code className="bg-slate-100 px-1 rounded">Origin_Country</code>, <code className="bg-slate-100 px-1 rounded">Destination_Country</code>, and revenue columns.</p>
                          </div>
                        );
                      }

                      return (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[10px] tracking-wider bg-slate-50/70">
                              <th className="px-3 py-3 w-8">#</th>
                              <th className="px-3 py-3">Origin Country</th>
                              <th className="px-3 py-3">Origin City</th>
                              <th className="px-3 py-3">Destination Country</th>
                              <th className="px-3 py-3">Destination City</th>
                              <th className="px-3 py-3 text-right">{freightText("Tonnage (kg)", transportMode)}</th>
                              <th className="px-3 py-3 text-right">No of Masters</th>
                              <th className="px-3 py-3 text-right">Shipments</th>
                              <th className="px-3 py-3 text-right">Shipment Revenue (USD)</th>
                              {/* <th className="px-3 py-3 text-right">Shipment Cost</th> */}
                              {/* <th className="px-3 py-3 text-right">Gross Profit (USD)</th> */}
                              {/* <th className="px-3 py-3 text-right">GP Margin</th> */}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9]">
                            {rows.map((row, i) => {
                              const isOthers = row.originCountry.startsWith("Others");
                              const gpMargin = row.revenue > 0 ? ((row.revenue + row.cost) / row.revenue * 100) : 0;
                              const totalTonnage = grandTotal.tonnage;
                              const pct = totalTonnage > 0 ? (row.tonnage / totalTonnage * 100) : 0;
                              const color = getCountryColor(row.originCountry);
                              const bgClass = isOthers ? "bg-slate-50/50 italic" : getDestBgColorClass(row.destCountry);
                              const rowMasters = row.mastersSet?.size > 0 ? row.mastersSet.size : row.numericMasters;

                              // Extract solid hex color from bgClass (e.g. "bg-[#EBF8FF]/50" -> "#EBF8FF")
                              const bgMatch = bgClass.match(/bg-\[([^\]]+)\]/);
                              const solidBgColor = bgMatch ? bgMatch[1].split('/')[0] : (bgClass.includes("bg-slate") ? "#F1F5F9" : "#CBD5E0");

                              return (
                                <tr
                                  key={i}
                                  className={`hover:bg-slate-50/60 transition-colors ${bgClass}`}
                                >
                                  <td className="px-3 py-3 text-slate-400 font-bold tabular-nums">
                                    {isOthers ? "—" : (
                                      <span
                                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-extrabold text-slate-800 border border-slate-300"
                                        style={{ backgroundColor: solidBgColor }}
                                      >
                                        {i + 1}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className={`font-bold ${isOthers ? "text-slate-400" : "text-[#2D3748]"}`}>
                                        {row.originCountry}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-slate-600 font-medium">{row.originCity}</td>
                                  <td className="px-3 py-3 text-slate-600 font-medium">{row.destCountry}</td>
                                  <td className="px-3 py-3 text-slate-600 font-medium">{row.destCity}</td>
                                  <td className="px-3 py-3 text-right tabular-nums">
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="font-bold text-[#319795]">{formatNumber(row.tonnage)}{freightText(" kg", transportMode)}</span>
                                      <div className="h-1 rounded-full bg-slate-100 w-16 overflow-hidden">
                                        <div
                                          className="h-full rounded-full"
                                          style={{ width: `${pct}%`, backgroundColor: color }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-700 tabular-nums">{formatNumber(rowMasters)}</td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-700 tabular-nums">{formatNumber(row.shipments)}</td>
                                  <td className="px-3 py-3 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                  {/* <td className="px-3 py-3 text-right font-semibold text-slate-500 tabular-nums">{formatCurrency(row.cost)}</td> */}
                                  {/* <td className="px-3 py-3 text-right font-bold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td> */}
                                  {/* <td className="px-3 py-3 text-right tabular-nums">
                                    <span className={`font-bold text-[10px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                      {gpMargin.toFixed(1)}%
                                    </span>
                                  </td> */}
                                </tr>
                              );
                            })}
                          </tbody>
                          {/* Grand Total Footer */}
                          <tfoot>
                            <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80 font-extrabold text-xs">
                              <td className="px-3 py-3 text-slate-500" colSpan={2}>TOTAL</td>
                              <td className="px-3 py-3" />
                              <td className="px-3 py-3" />
                              <td className="px-3 py-3" />
                              <td className="px-3 py-3 text-right text-[#319795] tabular-nums">{formatNumber(grandTotal.tonnage)}{freightText(" kg", transportMode)}</td>
                              <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.masters)}</td>
                              <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                              <td className="px-3 py-3 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                              {/* <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td> */}
                              {/* <td className="px-3 py-3 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td> */}
                              {/* <td className="px-3 py-3 text-right">
                                <span className="font-bold text-slate-600 text-[10px]">
                                  {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                                </span>
                              </td> */}
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* ── CHAPTER 2: MONTHLY STRATEGIC ANALYSIS (Standard mode only — SQL Sandbox sends weekly reports) ── */}
              {dashboardMode !== "custom-sql" && (
                <div className="space-y-4 pt-4 border-t border-[#E2E8F0]">
                  <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
                    <span className="h-5 w-1.5 bg-[#319795] rounded-full animate-pulse" />
                    <h2 className="text-base font-bold text-[#1A202C]">Monthly Strategic Analysis & Contribution</h2>
                    <span className="text-[10px] text-[#319795] bg-[#E6FFFA] font-semibold px-2 py-0.5 rounded-full border border-[#B2F5EA]">
                      {getSelectedCompanyNames()}
                    </span>
                  </div>

                  <div className="grid grid-cols-12 gap-6">
                    {/* Left side (col-span-8): Monthly Revenue Trend Area Chart */}
                    <div className="col-span-12 lg:col-span-8 saas-card p-6 bg-white relative">
                      <div className="flex items-center justify-between mb-4 border-b border-[#F1F5F9] pb-4">
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{freightText("Tonnage Flow", transportMode)}</p>
                          <h2 className="text-lg font-bold text-[#1A202C] mt-0.5">Cargo Revenue Trend - Monthly</h2>
                        </div>
                        <span className="text-xs font-bold text-[#319795] px-2 py-0.5 rounded-full bg-[#E6FFFA] border border-[#B2F5EA]">
                          Monthly aggregation
                        </span>
                      </div>

                      <div className="h-80 w-full">
                        {loading ? (
                          <div className="h-full flex items-center justify-center">
                            <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthlyData} margin={{ top: 15, right: 10, left: 10, bottom: 15 }}>
                              <defs>
                                <linearGradient id={`monthlyAreaGrad-${transportMode}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#319795" stopOpacity={0.25} />
                                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                              <XAxis
                                dataKey="month_label"
                                tick={{ fontSize: 10, fill: "#718096", fontWeight: 500 }}
                                axisLine={{ stroke: "#E2E8F0" }}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: "#718096", fontWeight: 500 }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                              />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const rawData = payload[0].payload;
                                  return (
                                    <div className="bg-white border border-[#CBD5E0] shadow-xl p-3.5 rounded-lg text-xs space-y-1.5 min-w-[180px]">
                                      <p className="font-bold text-slate-800 border-b border-[#F1F5F9] pb-1 mb-1">{label}</p>
                                      <div className="flex justify-between items-center gap-4">
                                        <span className="text-slate-500 font-medium flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-[#319795]" /> Revenue
                                        </span>
                                        <span className="text-slate-800 font-extrabold">{formatCurrency(rawData.Total_Revenue)}</span>
                                      </div>
                                      <div className="flex justify-between items-center gap-4">
                                        <span className="text-slate-500 font-medium flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-teal-600" />{freightText(" Tonnage\n                                        ", transportMode)}</span>
                                        <span className="text-teal-600 font-bold">{formatNumber(rawData.Total_Tonnage)}{freightText(" kg", transportMode)}</span>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="Total_Revenue"
                                name="Revenue"
                                stroke="#319795"
                                strokeWidth={2.5}
                                fill={`url(#monthlyAreaGrad-${transportMode})`}
                                dot={{ fill: "#319795", r: 4, stroke: "#FFFFFF", strokeWidth: 1.5 }}
                                activeDot={{ r: 6, fill: "#319795", stroke: "#FFFFFF", strokeWidth: 2 }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* Right side (col-span-4): Enterprise Revenue by Origin (Doughnut Chart) */}
                    <div className="col-span-12 lg:col-span-4 saas-card p-6 bg-white min-h-[350px] flex flex-col justify-between">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">City Breakdown</p>
                        <div className="border-b border-[#F1F5F9] pb-2 mb-2" />
                        <h4 className="text-sm font-bold text-slate-800">Revenue by Origin City</h4>
                      </div>

                      <div className="relative h-40 flex items-center justify-center my-3 shrink-0">
                        {loading ? (
                          <Skeleton className="h-24 w-24 rounded-full bg-slate-100" />
                        ) : (
                          <>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={doughnutData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={48}
                                  outerRadius={64}
                                  paddingAngle={3}
                                  dataKey="value"
                                >
                                  {doughnutData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.name === "Others" ? "#718096" : PIE_COLORS[index % PIE_COLORS.length]} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute text-center flex flex-col justify-center items-center">
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
                              <span className="text-[10px] font-extrabold text-[#2D3748] tracking-tight mt-0.5">
                                {formatCurrency(kpi.Total_Revenue).slice(0, 7)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Doughnut Legends list */}
                      <div className="space-y-2 max-h-[140px] overflow-y-auto">
                        {doughnutData.slice(0, 4).map((entry, idx) => (
                          <div key={entry.name} className="flex items-center justify-between text-xs text-slate-655">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.name === "Others" ? "#718096" : PIE_COLORS[idx % PIE_COLORS.length] }} />
                              <span className="font-semibold text-slate-700 truncate max-w-[120px]">{entry.name}</span>
                            </div>
                            <span className="font-bold text-[#2D3748]">{formatCurrency(entry.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Full-width: Monthly Tonnage & Financial Summary Table */}
                  <div className="saas-card bg-white p-6">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                      <div>
                        <h4 className="text-sm font-bold text-[#1A202C]">{freightText("Monthly Tonnage & Financial Summary Table", transportMode)}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Dynamic monthly aggregations filtered by selected date range</p>
                      </div>
                      <Badge variant="outline" className="border-[#E2E8F0] text-[#319795] font-semibold px-2 py-0.5">
                        Monthly Financial Metrics
                      </Badge>
                    </div>

                    <div className="overflow-x-auto max-h-[300px]">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[10px] tracking-wider bg-slate-50/55">
                            <th className="px-4 py-2.5">Year</th>
                            <th className="px-4 py-2.5">Month</th>
                            <th className="px-4 py-2.5 text-right">Revenue (USD)</th>
                            <th className="px-4 py-2.5 text-right">{freightText("Tonnage", transportMode)}</th>
                            <th className="px-4 py-2.5 text-right">Shipments</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1F5F9]">
                          {monthlyData.map((row: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 font-bold text-slate-500">{row.Year}</td>
                              <td className="px-4 py-3 font-semibold text-[#2D3748]">{row.month_label ? row.month_label.split(" '")[0] : "—"}</td>
                              <td className="px-4 py-3 text-right font-bold text-[#319795] tabular-nums">
                                {row.Total_Revenue != null ? formatCurrency(row.Total_Revenue) : "$0"}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600 font-semibold tabular-nums">
                                {row.Total_Tonnage != null ? freightText(`${formatNumber(row.Total_Tonnage)} ${isSea ? "TEU" : "kg"}`, transportMode) : freightText("0 kg", transportMode)}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-500 font-semibold tabular-nums">
                                {row.Total_Shipments != null ? formatNumber(row.Total_Shipments) : "0"}
                              </td>
                            </tr>
                          ))}
                          {monthlyData.length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-12 text-slate-400 font-medium">
                                No monthly records match selected date range
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── CHAPTER 3: SECTOR CARRIER & GEOGRAPHICAL DISTRIBUTION ── */}
              <div className="space-y-4 pt-4 border-t border-[#E2E8F0]">
                <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
                  <span className="h-5 w-1.5 bg-violet-600 rounded-full animate-pulse" />
                  <h2 className="text-base font-bold text-[#1A202C]">{freightText("Sector-wise Carrier & Geographical Tonnage Performance", transportMode)}</h2>
                  <span className="text-[10px] text-violet-700 bg-violet-50 font-semibold px-2 py-0.5 rounded-full border border-violet-100">
                    Carrier & Sector Performance
                  </span>
                </div>

                <div className="grid grid-cols-12 gap-6">
                  {/* Left Chart (Col-span-12 or 8) */}
                  <div data-geographical-chart="air" className="col-span-12 lg:col-span-8 saas-card p-6 bg-white relative flex flex-col justify-between min-h-[350px]">
                    <div className="flex items-center justify-between mb-4 border-b border-[#F1F5F9] pb-4">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Geographical contribution</p>
                        <h2 className="text-lg font-bold text-[#1A202C] mt-0.5">{freightText("Air Exports - Geographical Tonnage Contribution", transportMode)}</h2>
                      </div>
                      <span className="text-xs font-bold text-violet-600 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100">{freightText("\n                        Tons vs Contribution %\n                      ", transportMode)}</span>
                    </div>

                    <div className="h-80 w-full">
                      {loading ? (
                        <div className="h-full flex items-center justify-center">
                          <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                        </div>
                      ) : sectorCarrierData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                          No sector data available. Try running a query.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={sectorChartData} margin={{ top: 30, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#718096", fontWeight: 600 }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                            <YAxis yAxisId="left" domain={[0, sectorChartMaximum]} ticks={[0, 0.25, 0.5, 0.75, 1].map(share => share * sectorChartMaximum)} allowDataOverflow tick={{ fontSize: 10, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toLocaleString("en-US", {maximumFractionDigits: 3})} ${isSea ? "TEU" : "t"}`} width={65} />
                            <YAxis yAxisId="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} orientation="right" tick={{ fontSize: 10, fill: "#E53E3E" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={40} />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="bg-white border border-[#CBD5E0] shadow-xl p-3 rounded-lg text-xs space-y-1">
                                    <p className="font-bold text-slate-800 border-b border-[#F1F5F9] pb-1 mb-1">{label}</p>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-slate-500 font-medium">{freightText("Tonnage:", transportMode)}</span>
                                      <span className="text-blue-600 font-bold">{Number(payload[0].value).toLocaleString("en-US", {maximumFractionDigits: 3})}{freightText(" Tons", transportMode)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-slate-500 font-medium">Contribution:</span>
                                      <span className="text-[#E53E3E] font-bold">{Number(payload[1].value).toFixed(1)}%</span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Bar yAxisId="left" dataKey="tonnage" fill="#3182CE" radius={[4, 4, 0, 0]} barSize={40} name={freightText("Tonnage (Tons)", transportMode)} />
                            <Line yAxisId="right" type="monotone" dataKey="contribution" stroke="#E53E3E" strokeWidth={2.5} dot={{ fill: "#E53E3E", r: 4 }} activeDot={{ r: 6 }} name="Contribution %">
                              <LabelList dataKey="contribution" position="top" formatter={(v: number) => `${v.toFixed(1)}%`} style={{ fontSize: 10, fill: "#E53E3E", fontWeight: 700 }} />
                            </Line>
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Summary Box (Col-span-4) */}
                  <div className="col-span-12 lg:col-span-4 saas-card p-6 bg-white flex flex-col justify-between min-h-[350px]">
                    <div className="flex items-center justify-between mb-4 border-b border-[#F1F5F9] pb-4">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Geographical Summary</p>
                        <h2 className="text-lg font-bold text-[#1A202C] mt-0.5">Top Sectors</h2>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-center space-y-4">
                      {sectorCarrierData.length === 0 ? (
                        <div className="text-center text-slate-400 text-sm">
                          No sector data available.
                        </div>
                      ) : (
                        getSectorChartData().sort((a, b) => b.tonnage - a.tonnage).slice(0, 4).map((sector, index) => (
                          <div key={sector.name} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-700">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: index === 0 ? "#3182CE" : index === 1 ? "#4299E1" : index === 2 ? "#63B3ED" : "#90CDF4" }} />
                                {sector.name}
                              </span>
                              <span>{sector.tonnage.toLocaleString("en-US", {maximumFractionDigits: 3})}{freightText(" Tons (", transportMode)}{sector.contribution.toFixed(1)}%)</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${sector.contribution}%`, backgroundColor: index === 0 ? "#3182CE" : index === 1 ? "#4299E1" : index === 2 ? "#63B3ED" : "#90CDF4" }} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Full Width: Top 20 Carrier Sector-wise distribution Table */}
                  <div className="col-span-12 saas-card bg-white p-6">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                      <div>
                        <h4 className="text-sm font-bold text-[#1A202C]">{freightText("TOP 20 AIR CARRIERS & Total Tonnage - Sector wise (Tons)", transportMode)}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{freightText("Tonnage contribution broken down by carrier and sector (Rounded to nearest Ton)", transportMode)}</p>
                      </div>
                      <Badge variant="outline" className="border-[#E2E8F0] text-violet-700 bg-violet-50 font-semibold px-2 py-0.5">
                        Sector-wise Distribution
                      </Badge>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-slate-500 uppercase font-bold text-[9px] tracking-wider bg-slate-50/50 sticky top-0 z-10">
                            <th rowSpan={2} className="px-2 py-2 first:rounded-l-md border-r border-[#E2E8F0] align-middle text-center">SL</th>
                            <th rowSpan={2} className="px-2 py-2 border-r border-[#E2E8F0] align-middle">CARRIER NAME</th>
                            <th colSpan={2} className="px-2 py-1 text-center bg-slate-100/80 border-b border-r border-[#E2E8F0] text-slate-700 font-extrabold">{freightText("TONNAGE (Tons)", transportMode)}</th>
                            <th colSpan={14} className="px-2 py-1 text-center text-slate-700 font-extrabold border-b border-[#E2E8F0]">{freightText("GEOGRAPHICAL SECTOR TONNAGE (Tons)", transportMode)}</th>
                          </tr>
                          <tr className="border-b border-[#E2E8F0] text-slate-500 uppercase font-bold text-[9px] tracking-wider bg-slate-50/50 sticky top-[28px] z-10">
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
                          {sectorCarrierData.length === 0 ? (
                            <tr>
                              <td colSpan={18} className="text-center py-12 text-slate-400 font-medium">
                                No carrier sector records available
                              </td>
                            </tr>
                          ) : (
                            getSectorTableRows().map((row: any, i: number) => {
                              const isTotal = row.isGrandTotal;
                              const isOthers = row.isOthersRow;
                              return (
                                <tr key={i} className={`${isTotal ? "font-extrabold bg-slate-100 border-t-2 border-slate-350" : isOthers ? "font-bold bg-slate-50/50" : "hover:bg-slate-50/30 text-slate-700"}`}>
                                  <td className="px-2 py-1.5 text-slate-400 font-semibold">{isTotal ? "" : isOthers ? "" : i + 1}</td>
                                  <td className="px-2 py-1.5 font-bold whitespace-normal break-words" title={row.name}>{row.name}</td>
                                  <td className={`px-2 py-1.5 text-right tabular-nums font-semibold text-blue-600 ${isTotal ? "bg-blue-100/50" : "bg-blue-50/20"}`}>{formatTonnage(row.exp)}</td>
                                  <td className={`px-2 py-1.5 text-right tabular-nums font-black ${isTotal ? "bg-slate-200" : "bg-slate-100 text-slate-800"}`}>{formatTonnage(row.total)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.europe)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.usa)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.northAmericaOther)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.centralAmerica)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.southAmerica)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.middleEast)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.southEastAsia)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.indiaSubContinent)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.northernAsia)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.africa)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.southAfrica)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.australia)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.pacificIslands)}</td>
                                  <td className="px-1 py-1.5 text-right tabular-nums">{formatTonnage(row.others)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
              <div className="saas-card bg-white p-6">
                {/* Full-width: Top 10 Airlines Summary Table */}
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                  <div>
                    <h4 className="text-sm font-bold text-[#1A202C]">{freightText("Airline Performance Summary — Top 10", transportMode)}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">{freightText("Aggregated by airline · ranked by chargeable tonnage", transportMode)}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {(() => {
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
                        <div className="py-14 flex flex-col items-center gap-2 text-slate-400">
                          <span className="text-3xl">✈️</span>
                          <p className="text-xs font-medium text-center">{freightText("No airline data available.", transportMode)}<br />Run a SQL query that returns <code className="bg-slate-100 px-1 rounded">{freightText("Airline", transportMode)}</code>, <code className="bg-slate-100 px-1 rounded">Revenue_USD</code> columns.</p>
                        </div>
                      );
                    }

                    return (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[10px] tracking-wider bg-slate-50/70">
                            <th className="px-3 py-3 w-8">#</th>
                            <th className="px-3 py-3">{freightText("Airline", transportMode)}</th>
                            <th className="px-3 py-3 text-right">{freightText("Tonnage (kg)", transportMode)}</th>
                            <th className="px-3 py-3 text-right">No of Masters</th>
                            <th className="px-3 py-3 text-right">Shipments</th>
                            <th className="px-3 py-3 text-right">Shipment Revenue (USD)</th>
                            {/* <th className="px-3 py-3 text-right">Shipment Cost (USD)</th> */}
                            {/* <th className="px-3 py-3 text-right">Gross Profit (USD)</th> */}
                            {/* <th className="px-3 py-3 text-right">GP Margin</th> */}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1F5F9]">
                          {rows.map((row, i) => {
                            const isOthers = row.airline.startsWith("Others");
                            const gpMargin = row.revenue > 0 ? ((row.revenue + row.cost) / row.revenue * 100) : 0;
                            const totalTonnage = grandTotal.tonnage;
                            const pct = totalTonnage > 0 ? (row.tonnage / totalTonnage * 100) : 0;
                            const sortedRoutes = (Object.values(row.routes || {}) as any[]).sort((a, b) => b.tonnage - a.tonnage);
                            const rowMasters = row.mastersSet?.size > 0 ? row.mastersSet.size : row.numericMasters;

                            return (
                              <Fragment key={i}>
                                <tr
                                  className={`hover:bg-slate-50/60 transition-colors ${isOthers ? "bg-slate-50/50 italic" : ""}`}
                                >
                                  <td className="px-3 py-3 text-slate-400 font-bold tabular-nums">
                                    {isOthers ? "—" : (
                                      <span
                                        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-extrabold text-white"
                                        style={{ backgroundColor: getAirlineColor(row.airline, i) }}
                                      >
                                        {i + 1}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-2 select-none">
                                      <span className={`font-bold ${isOthers ? "text-slate-400" : "text-[#2D3748]"}`}>
                                        {row.airline}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-right tabular-nums">
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="font-bold text-[#3182CE]">{formatNumber(row.tonnage)}{freightText(" kg", transportMode)}</span>
                                      <div className="h-1 rounded-full bg-slate-100 w-16 overflow-hidden">
                                        <div
                                          className="h-full rounded-full"
                                          style={{ width: `${pct}%`, backgroundColor: getAirlineColor(row.airline, i) }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-700 tabular-nums">{formatNumber(rowMasters)}</td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-700 tabular-nums">{formatNumber(row.shipments)}</td>
                                  <td className="px-3 py-3 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                  {/* <td className="px-3 py-3 text-right font-semibold text-slate-500 tabular-nums">{formatCurrency(row.cost)}</td> */}
                                  {/* <td className="px-3 py-3 text-right font-bold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td> */}
                                  {/* <td className="px-3 py-3 text-right tabular-nums">
                                      <span className={`font-bold text-[10px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                        {gpMargin.toFixed(1)}%
                                      </span>
                                    </td> */}
                                </tr>
                                {sortedRoutes.length > 0 && (
                                  sortedRoutes.map((route, rIdx) => {
                                    const routeGpMargin = route.revenue > 0 ? ((route.revenue + route.cost) / route.revenue * 100) : 0;
                                    const routeMasters = route.mastersSet?.size > 0 ? route.mastersSet.size : route.numericMasters;
                                    return (
                                      <tr key={`${i}-route-${rIdx}`} className="bg-[#EBF8FF]/50 text-slate-950 text-[11px] border-l-4 border-blue-300 hover:bg-[#EBF8FF]/70 transition-colors">
                                        <td className="px-3 py-1 text-center text-[8px] text-blue-400 font-bold"></td>
                                        <td className="px-3 py-2 pl-8">
                                          <span className="font-semibold text-slate-950">{route.originCity} → {route.destCity}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-bold">{formatNumber(route.tonnage)}{freightText(" kg", transportMode)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-semibold">{formatNumber(routeMasters)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-semibold">{formatNumber(route.shipments)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-bold">{formatCurrency(route.revenue)}</td>
                                        {/* <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-semibold">{formatCurrency(route.cost)}</td> */}
                                        {/* <td className="px-3 py-2 text-right tabular-nums font-extrabold text-slate-950">{formatCurrency(route.revenue + route.cost)}</td> */}
                                        {/* <td className="px-3 py-2 text-right tabular-nums">
                                            <span className="font-extrabold text-slate-950">
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
                        </tbody>
                        {/* Grand Total Footer */}
                        <tfoot>
                          <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80 font-extrabold text-xs">
                            <td className="px-3 py-3 text-slate-500" colSpan={2}>TOTAL</td>
                            <td className="px-3 py-3 text-right text-[#3182CE] tabular-nums">{formatNumber(grandTotal.tonnage)}{freightText(" kg", transportMode)}</td>
                            <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.masters)}</td>
                            <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                            <td className="px-3 py-3 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                            {/* <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td> */}
                            {/* <td className="px-3 py-3 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td> */}
                            {/* <td className="px-3 py-3 text-right">
                                <span className="font-bold text-slate-600 text-[10px]">
                                  {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                                </span>
                              </td> */}
                          </tr>
                        </tfoot>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          </>}

        </div>{/* end main content area */}
      </div>{/* end sidebar+main flex */}

      {/* ── ADD STATION MODAL ── */}
      {isAddStationModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#070b19]/60 backdrop-blur-md p-4 sm:p-6 animate-in fade-in-0 duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col border border-sky-100 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-500 via-blue-600 to-sky-600 px-5 py-3.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-xs font-extrabold tracking-tight">Add Operational Station</h3>
                  <p className="text-[9.5px] text-sky-100">Register a new global station for automated reports</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddStationModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/20 text-sky-100 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleAddNewStation} className="p-5 space-y-3.5">
              <div>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Station Code *
                </label>
                <Input
                  required
                  maxLength={6}
                  placeholder="e.g. DXB"
                  value={newStationCode}
                  onChange={(e) => setNewStationCode(e.target.value.toUpperCase())}
                  className="h-8 uppercase text-xs font-mono font-bold bg-slate-50 border-slate-200 rounded-lg focus:bg-white focus:border-sky-400"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Station Display Name *
                </label>
                <Input
                  required
                  placeholder="e.g. Dubai (United Arab Emirates)"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  className="h-8 text-xs bg-slate-50 border-slate-200 rounded-lg focus:bg-white focus:border-sky-400"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Country Name
                </label>
                <Input
                  placeholder="e.g. United Arab Emirates"
                  value={newStationCountry}
                  onChange={(e) => setNewStationCountry(e.target.value)}
                  className="h-8 text-xs bg-slate-50 border-slate-200 rounded-lg focus:bg-white focus:border-sky-400"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Azure AD Matching Keywords
                </label>
                <Input
                  placeholder="e.g. dubai, dxb, uae (comma separated)"
                  value={newStationKeywords}
                  onChange={(e) => setNewStationKeywords(e.target.value)}
                  className="h-8 text-xs bg-slate-50 border-slate-200 rounded-lg focus:bg-white focus:border-sky-400"
                />
                <p className="text-[8.5px] text-slate-400 mt-1">
                  Used to automatically group Azure Active Directory users into this station.
                </p>
              </div>

              {/* Footer */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddStationModalOpen(false)}
                  className="h-8 px-3 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-8 px-4 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-lg shadow-xs transition-all"
                >
                  Add Station
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD BRANCH MODAL ── */}
      {isAddBranchModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#070b19]/60 backdrop-blur-md p-4 sm:p-6 animate-in fade-in-0 duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col border border-sky-100 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-sky-500 via-blue-600 to-sky-600 px-5 py-3.5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold tracking-tight">Add Branch Office</h3>
                  <p className="text-[9.5px] text-sky-100">Register a new branch for station report breakdowns</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddBranchModalOpen(false)}
                className="p-1 rounded-full hover:bg-white/20 text-sky-100 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleAddNewBranch} className="p-5 space-y-3.5">
              <div>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Branch Code *
                </label>
                <Input
                  required
                  maxLength={6}
                  placeholder="e.g. HYD"
                  value={newBranchCode}
                  onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                  className="h-8 uppercase text-xs font-mono font-bold bg-slate-50 border-slate-200 rounded-lg focus:bg-white focus:border-sky-400"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Branch Display Name *
                </label>
                <Input
                  required
                  placeholder="e.g. Hyderabad (HYD)"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="h-8 text-xs bg-slate-50 border-slate-200 rounded-lg focus:bg-white focus:border-sky-400"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  City / Location
                </label>
                <Input
                  placeholder="e.g. Hyderabad"
                  value={newBranchCity}
                  onChange={(e) => setNewBranchCity(e.target.value)}
                  className="h-8 text-xs bg-slate-50 border-slate-200 rounded-lg focus:bg-white focus:border-sky-400"
                />
              </div>

              {/* Footer */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddBranchModalOpen(false)}
                  className="h-8 px-3 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-8 px-4 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold rounded-lg shadow-xs transition-all"
                >
                  Add Branch
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SECTION SELECTOR MODAL (Before PDF Preview) ── */}
      {showSectionSelector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070b19]/60 backdrop-blur-md p-6">
          <div className="bg-white w-[600px] rounded-2xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-[#4299E1]" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Select PDF Report Sections</h3>
                  <p className="text-xs text-slate-500 mt-1">Unselect sections you don't need to reduce email size</p>
                </div>
              </div>
              <button
                onClick={() => setShowSectionSelector(false)}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-6 space-y-4">
              <p className="text-xs text-slate-600"><span className="font-semibold">Send to:</span> {activeRecipients.join(", ")}</p>
              <div className="grid grid-cols-1 gap-3">
                {/* Weekly Visual */}
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setPdfSections({ ...pdfSections, weeklyVisual: !pdfSections.weeklyVisual })}>
                  <input
                    type="checkbox"
                    checked={pdfSections.weeklyVisual}
                    onChange={(e) => {
                      e.stopPropagation();
                      setPdfSections({ ...pdfSections, weeklyVisual: !pdfSections.weeklyVisual });
                    }}
                    className="w-5 h-5 rounded border-slate-300 text-[#4299E1] cursor-pointer"
                  />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {isSea ? "Weekly Operational Performance" : dashboardMode === "custom-sql" ? "Weekly Operational Performance" : "Weekly Revenue Trend Chart"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isSea ? "Shipping-line share and daily FCL TEU charts" : dashboardMode === "custom-sql"
                        ? freightText("Operational charts including Top 10 Airlines share, Weekly tonnage period and Trade routes", transportMode)
                        : freightText("Area chart showing weekly revenue flow and airline metrics", transportMode)}
                    </p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">
                    {dashboardMode === "custom-sql" ? "Visuals" : "Chart"}
                  </span>
                </div>

                {/* Weekly Ledger */}
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setPdfSections({ ...pdfSections, weeklyLedger: !pdfSections.weeklyLedger })}>
                  <input
                    type="checkbox"
                    checked={pdfSections.weeklyLedger}
                    onChange={(e) => {
                      e.stopPropagation();
                      setPdfSections({ ...pdfSections, weeklyLedger: !pdfSections.weeklyLedger });
                    }}
                    className="w-5 h-5 rounded border-slate-300 text-[#4299E1] cursor-pointer"
                  />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {isSea ? "Shipping Line Consol Summary" : dashboardMode === "custom-sql" ? freightText("Airline Performance Summary — Top 10", transportMode) : "Weekly Carrier Metrics Table"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isSea ? "Consols, FCL TEUs, LCL volume and revenue by shipping line" : dashboardMode === "custom-sql"
                        ? freightText("Top 10 airlines tonnage, shipments, revenue, cost, and margin summary table", transportMode)
                        : "Detailed breakdown of carrier metrics by week"}
                    </p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-semibold">Table</span>
                </div>

                {/* Monthly Visual */}
                <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setPdfSections({ ...pdfSections, monthlyVisual: !pdfSections.monthlyVisual })}>
                  <input
                    type="checkbox"
                    checked={pdfSections.monthlyVisual}
                    onChange={(e) => {
                      e.stopPropagation();
                      setPdfSections({ ...pdfSections, monthlyVisual: !pdfSections.monthlyVisual });
                    }}
                    className="w-5 h-5 rounded border-slate-300 text-[#4299E1] cursor-pointer"
                  />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {isSea ? "Trade Route Consol Summary" : dashboardMode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Financial Summary Chart"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isSea ? "Top 5 FCL TEU and LCL volume pie charts, plus Top 10 routes and Others" : dashboardMode === "custom-sql"
                        ? freightText("Top 10 trade routes tonnage, shipments, revenue, cost, and margin summary table", transportMode)
                        : "Pie chart showing revenue distribution by company"}
                    </p>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-semibold">
                    {dashboardMode === "custom-sql" ? "Table" : "Chart"}
                  </span>
                </div>

                {/* Monthly Ledger */}
                {(!isSea && dashboardMode !== "custom-sql") && (
                  <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setPdfSections({ ...pdfSections, monthlyLedger: !pdfSections.monthlyLedger })}>
                    <input
                      type="checkbox"
                      checked={pdfSections.monthlyLedger}
                      onChange={(e) => {
                        e.stopPropagation();
                        setPdfSections({ ...pdfSections, monthlyLedger: !pdfSections.monthlyLedger });
                      }}
                      className="w-5 h-5 rounded border-slate-300 text-[#4299E1] cursor-pointer"
                    />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-slate-800">{isSea ? "Consol Ledger" : "Monthly Financial Summary Table"}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{isSea ? "One row per consol with FCL TEUs, LCL volume and revenue" : freightText("Monthly revenue, tonnage, and shipment metrics", transportMode)}</p>
                    </div>
                    <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded font-semibold">Table</span>
                  </div>
                )}
              </div>

              {isSea && <label className="mt-3 flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={pdfSections.seaSectorDistribution}
                  onChange={() => setPdfSections({...pdfSections, seaSectorDistribution: !pdfSections.seaSectorDistribution})}
                  className="w-5 h-5 rounded border-slate-300 text-blue-600" />
                <div><h4 className="text-sm font-semibold text-slate-800">Top 20 Shipping Lines - Sector wise</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Separate FCL / LCL geographical contribution charts and sector tables</p></div>
              </label>}

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <p className="font-semibold flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> Email Size Optimization
                </p>
                <p className="mt-1.5 leading-relaxed">
                  Unselecting sections will reduce the PDF file size. Emails also include a separate Consol Ledger Excel with all fetched records, without the PDF row limit.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>
                  Sections selected: {isSea
                    ? `${[pdfSections.weeklyVisual, pdfSections.weeklyLedger, pdfSections.monthlyVisual, pdfSections.seaSectorDistribution].filter(Boolean).length} / 4`
                    : dashboardMode === "custom-sql" ? `${[pdfSections.weeklyVisual, pdfSections.weeklyLedger, pdfSections.monthlyVisual].filter(Boolean).length} / 3`
                    : `${[pdfSections.weeklyVisual, pdfSections.weeklyLedger, pdfSections.monthlyVisual, pdfSections.monthlyLedger].filter(Boolean).length} / 4`
                  }
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setShowSectionSelector(false)}
                  className="h-8 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setShowSectionSelector(false);
                    openPdfPreview();
                  }}
                  className="h-8 px-4 bg-[#4299E1] hover:bg-[#3182CE] text-white text-xs font-semibold rounded-md flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview PDF
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── PREMIUM MODAL PDF PREVIEW WINDOW ── */}
      {showPdfPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070b19]/60 backdrop-blur-md p-6">
          <div className="bg-white w-[1220px] max-h-[92vh] rounded-2xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#4299E1]" /> {dashboardMode === "custom-sql" ? "Premium SQL Sandbox PDF Report Preview" : "Landscape PDF Report Preview"}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-400">Sending to:</span>
                    {activeRecipients.map((e) => (
                      <span key={e} className="bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-semibold text-[9px] shadow-sm">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Dynamic Inline Status Feedback inside the Modal Header */}
                {emailStatus && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${emailSuccess === true ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                    emailSuccess === false ? "bg-rose-50 text-rose-600 border border-rose-200" :
                      "bg-blue-50 text-blue-600 border border-blue-200 animate-pulse"
                    }`}>
                    {emailLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                    {emailSuccess === true && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                    {emailStatus.length > 32 ? emailStatus.slice(0, 32) + "..." : emailStatus}
                  </span>
                )}

                {/* Clean "Confirm & Send Email" button inside preview header when recipient is active */}
                {activeRecipients.length > 0 && !emailSuccess && (
                  <Button
                    onClick={async () => {
                      const generation = previewGeneration.current;
                      const sent = await handleSendEmail();
                      // Auto-close modal after 2.5 seconds on successful send
                      if (sent && previewGeneration.current === generation) previewCloseTimer.current = setTimeout(() => {
                        if (previewGeneration.current === generation) setShowPdfPreview(false);
                      }, 2500);
                    }}
                    disabled={emailLoading || (dashboardMode === "custom-sql" && !sqlReportCanSend)}
                    className="h-8 px-3.5 bg-[#4299E1] hover:bg-[#3182CE] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all shadow-md"
                  >
                    {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Confirm & Send to ({activeRecipients.length})
                  </Button>
                )}

                <Button
                  onClick={() => {
                    const iframe = document.getElementById(`pdf-iframe-${transportMode}`) as HTMLIFrameElement;
                    if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.print();
                    }
                  }}
                  className="h-8 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-md flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  Print Document
                </Button>
                <button
                  onClick={() => {
                    // Reset status when closing
                    previewGeneration.current += 1;
                    if (previewCloseTimer.current) clearTimeout(previewCloseTimer.current);
                    setEmailStatus("");
                    setEmailSuccess(null);
                    setShowPdfPreview(false);
                  }}
                  aria-label="Close PDF preview"
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Iframe displaying the dedicated print-view URL dynamically with all filters */}
            <div className="flex-1 bg-slate-100 p-6 flex justify-center overflow-y-auto">
              <div className="bg-white shadow-lg rounded-md border border-slate-200 overflow-hidden w-[1125px] h-[1620px] flex-shrink-0 origin-top transform scale-[0.8] lg:scale-[0.88] xl:scale-[0.95]">
                <iframe
                  id={`pdf-iframe-${transportMode}`}
                  key={getPrintViewUrl()}
                  src={getPrintViewUrl()}
                  className="w-full h-full border-none"
                  title="PDF Live Snapshot Preview"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>A4 Dimensions (Landscape): 1123px × 794px</span>
              <span>Dart Global Logistics PDF Engine</span>
            </div>

          </div>
        </div>
      )}

      {/* ── DELETE SCHEDULE CONFIRMATION MODAL ── */}
      {schedulesToDelete && schedulesToDelete.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/65 backdrop-blur-md animate-in fade-in-0 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 sm:p-8 text-slate-800 animate-in zoom-in-95 duration-200 relative overflow-hidden">
            {/* Top Warning Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-red-500 to-amber-500" />

            {/* Header & Close */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 text-rose-600 shadow-sm">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                    {schedulesToDelete.length > 1
                      ? `Delete ${schedulesToDelete.length} Automated Schedules?`
                      : "Delete Automated Schedule?"}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Permanent action for email subscriptions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSchedulesToDelete(null); setScheduleDeleteError(null); }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mt-4 leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
              {schedulesToDelete.length > 1
                ? freightText(`Are you sure you want to permanently delete these ${schedulesToDelete.length} schedules? Automated tonnage report emails will no longer be dispatched for these configurations.`, transportMode)
                : freightText("Are you sure you want to delete this schedule? Automated tonnage report emails will no longer be dispatched for this configuration.", transportMode)}
            </p>

            {/* Schedules list preview */}
            <div className="mt-4 max-h-48 overflow-y-auto space-y-2 pr-1">
              {schedulesToDelete.map((item, idx) => (
                <div key={item.id || idx} className="p-3 bg-rose-50/40 border border-rose-100 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span className="flex items-center gap-1.5 text-slate-900 font-extrabold truncate max-w-[280px]">
                      <span>📍</span> {cleanCountryName(item.stationLabel || "Schedule")}
                    </span>
                    <span className="text-[9.5px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-extrabold uppercase border border-rose-200 shrink-0">
                      To Be Deleted
                    </span>
                  </div>
                  {item.triggerDesc && (
                    <div className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5 pt-0.5">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{item.triggerDesc}</span>
                      {item.recipientCount != null && item.recipientCount > 0 && (
                        <span className="text-slate-400 ml-auto">({item.recipientCount} recipient{item.recipientCount > 1 ? "s" : ""})</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {scheduleDeleteError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{scheduleDeleteError}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-7 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingSchedule}
                onClick={() => { setSchedulesToDelete(null); setScheduleDeleteError(null); }}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingSchedule}
                onClick={handleConfirmDeleteSchedule}
                className="px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-md shadow-rose-600/20 hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isDeletingSchedule ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {schedulesToDelete.length > 1
                        ? `Yes, Delete ${schedulesToDelete.length} Schedules`
                        : "Yes, Delete Schedule"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/** Keep each workspace mounted after its first visit to preserve independent work. */
export default function Dashboard() {
  const [transportMode, setTransportMode] = useState<TransportMode>("AIR");
  const [visitedSea, setVisitedSea] = useState(false);
  const switchMode = (mode: TransportMode) => {
    if (mode === "SEA") setVisitedSea(true);
    setTransportMode(mode);
  };
  return <>
    <div id="freight-panel-AIR" role="tabpanel" aria-labelledby="freight-tab-AIR-AIR" hidden={transportMode !== "AIR"}>
      <FreightDashboard transportMode="AIR" onModeChange={switchMode} />
    </div>
    {visitedSea && <div id="freight-panel-SEA" role="tabpanel" aria-labelledby="freight-tab-SEA-SEA" hidden={transportMode !== "SEA"}>
      <FreightDashboard transportMode="SEA" onModeChange={switchMode} />
    </div>}
  </>;
}
