"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Line, LabelList, ComposedChart
} from "recharts";
import {
  Calendar, Globe, Plane, RefreshCw, Send, X, ArrowUpRight, ArrowDownRight, Layers, FileText, Printer, CheckCircle,
  Users, Check, ChevronDown, Plus, Settings, Eye, Info, LayoutDashboard, BarChart2, ShieldCheck,
  Mail, Clock, UserCheck, Trash2, Bell, Database, Lock, ChevronRight, Play
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createClient } from "@supabase/supabase-js";

// In production: frontend & backend share the same Cloud Run host → use relative URLs.
// In local dev: Next.js runs on :3000, backend on :8000 → use absolute localhost URL.
const API = process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? ""   // Empty string = relative URL (same host as the page)
    : (typeof window !== "undefined" && (window.location.port === "3000" || window.location.port === "3001")
      ? "http://localhost:8000"
      : ""));


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

// Customized Pie Chart Colors matching user's image
const PIE_COLORS = ["#4299E1", "#81E6D9", "#CBD5E0", "#5A67D8", "#ED64A6"];
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
  flag: string;
}

const STATIONS: StationInfo[] = [
  { code: "CMB", country: "Sri Lanka", name: "Colombo (Sri Lanka)", envVar: "RECIPIENTS_CMB", matchCountries: ["sri lanka"], flag: "🇱🇰" },
  { code: "IND", country: "India", name: "India", envVar: "RECIPIENTS_IND", matchCountries: ["india"], flag: "🇮🇳" },
  { code: "VNM", country: "Viet Nam", name: "Viet Nam", envVar: "RECIPIENTS_VNM", matchCountries: ["viet nam", "vietnam"], flag: "🇻🇳" },
  { code: "DAC", country: "Bangladesh", name: "Bangladesh", envVar: "RECIPIENTS_DAC", matchCountries: ["bangladesh"], flag: "🇧🇩" },
  { code: "PKI", country: "Pakistan", name: "Pakistan", envVar: "RECIPIENTS_PKI", matchCountries: ["pakistan"], flag: "🇵🇰" },
  { code: "NYC", country: "United States", name: "United States", envVar: "RECIPIENTS_NYC", matchCountries: ["united states", "usa", "us", "new york"], flag: "🇺🇸" },
];

const getStationForUser = (user: any) => {
  const userCountry = (user.country || "").toLowerCase().trim();
  const userOffice = (user.officeLocation || "").toLowerCase().trim();
  const userEmail = (user.email || "").toLowerCase().trim();

  // Try country first
  for (const station of STATIONS) {
    if (station.matchCountries.some(c => userCountry.includes(c))) {
      return station.code;
    }
  }

  // Try officeLocation
  for (const station of STATIONS) {
    if (station.matchCountries.some(c => userOffice.includes(c)) || userOffice.includes(station.code.toLowerCase())) {
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




// Premium Multi-Select Dropdown Component
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
  isObject = false,
  emoji = "🔍",
  widthClass = "min-w-[150px]"
}: {
  label: string;
  options: any[];
  selected: string[];
  onChange: (val: string[]) => void;
  placeholder: string;
  isObject?: boolean;
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
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#3182CE] focus:ring-[#3182CE] pointer-events-none"
                  />
                  <span className="truncate">
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


export default function Dashboard() {
  const formatTonnage = (val: number | null | undefined) => {
    if (val == null || val === 0) return "-";
    return val.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  };
  // Sidebar active section
  const [activeSection, setActiveSection] = useState<"dashboard" | "weekly-reports" | "monthly-reports" | "admin" | "email-scheduling" | "users">("dashboard");

  // --- AUTH GATE STATES ---
  const [supabase, setSupabase] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdminVerified, setIsAdminVerified] = useState(false);

  useEffect(() => {
    // Helper to boot the Supabase client with given credentials
    const bootSupabase = (url: string, key: string) => {
      const client = createClient(url, key);
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
      .then(({ supabaseUrl, supabaseAnonKey }) => {
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

  // Filter States
  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-07");

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
  const [availableEmails, setAvailableEmails] = useState<string[]>([]);
  const [customEmailInput, setCustomEmailInput] = useState("");
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);

  // Modal preview state
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [cachedQueryId, setCachedQueryId] = useState<string | null>(null);

  const openPdfPreview = async () => {
    if (dashboardMode === "custom-sql") {
      setLoading(true);
      try {
        const activeSql = activeSection === "weekly-reports" ? weeklySqlText : monthlySqlText;
        const res = await fetch(`${API}/api/cache-query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: activeSql }),
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
        }
      }
    } catch (e) {
      console.error("Recipients fetch failed", e);
    }
  }, []);

  useEffect(() => { fetchRecipients(); }, [fetchRecipients]);

  // --- DB USERS FROM SUPABASE ---
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [dbUsersLoading, setDbUsersLoading] = useState(false);

  const fetchDbUsers = useCallback(async (client?: any) => {
    const supabaseClient = client || supabase;
    if (!supabaseClient) return;
    setDbUsersLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Error fetching db users:", error);
      } else {
        setDbUsers(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch db users:", err);
    } finally {
      setDbUsersLoading(false);
    }
  }, [supabase]);
  // --- ORG USERS FROM AZURE AD ---
  const [orgUsers, setOrgUsers] = useState<any[]>([]);
  const [orgUsersByDept, setOrgUsersByDept] = useState<Record<string, any[]>>({});
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);
  const [orgUsersError, setOrgUsersError] = useState("");
  const [deptFilter, setDeptFilter] = useState("__all__");
  const [userSearch, setUserSearch] = useState("");

  // Station-wise state
  const [stationSelectedEmails, setStationSelectedEmails] = useState<Record<string, string[]>>({});
  const [stationDefaultRecipients, setStationDefaultRecipients] = useState<Record<string, string[]>>({});
  const [stationEmailLoading, setStationEmailLoading] = useState<Record<string, boolean>>({});
  const [stationEmailStatus, setStationEmailStatus] = useState<Record<string, string>>({});
  const [stationEmailSuccess, setStationEmailSuccess] = useState<Record<string, boolean | null>>({});
  const [expandedStation, setExpandedStation] = useState<Record<string, boolean>>({});
  const [adminTab, setAdminTab] = useState<"stations" | "global">("stations");
  const [stationCustomEmailInput, setStationCustomEmailInput] = useState<Record<string, string>>({});
  const [stationUserSearch, setStationUserSearch] = useState<Record<string, string>>({});

  // Synchronize database users to station selected emails
  useEffect(() => {
    setStationSelectedEmails((prev) => {
      const updated = { ...prev };
      const stationGroups: Record<string, string[]> = {};
      dbUsers.forEach((u) => {
        if (u.station) {
          const stations = u.station.split(",").map((s: string) => s.trim()).filter(Boolean);
          stations.forEach((stationCode: string) => {
            if (!stationGroups[stationCode]) {
              stationGroups[stationCode] = [];
            }
            if (!stationGroups[stationCode].includes(u.email)) {
              stationGroups[stationCode].push(u.email);
            }
          });
        }
      });

      STATIONS.forEach((s) => {
        if (stationGroups[s.code]) {
          updated[s.code] = stationGroups[s.code];
        } else if (dbUsers.length > 0) {
          updated[s.code] = [];
        } else {
          updated[s.code] = stationDefaultRecipients[s.code] || [];
        }
      });

      if (stationGroups["OTHER"]) {
        updated["OTHER"] = stationGroups["OTHER"];
      } else {
        updated["OTHER"] = [];
      }

      return updated;
    });
  }, [dbUsers, stationDefaultRecipients]);

  // --- SCHEDULER STATES ---
  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [schedStation, setSchedStation] = useState("Global");
  const [schedFrequency, setSchedFrequency] = useState<"weekly" | "monthly" | "daily">("weekly");
  const [schedDayOfWeek, setSchedDayOfWeek] = useState<number>(0); // 0=Monday
  const [schedDayOfMonth, setSchedDayOfMonth] = useState<number>(1);
  const [schedTime, setSchedTime] = useState("08:00");
  const [schedRecipients, setSchedRecipients] = useState("");
  const [schedIsCreating, setSchedIsCreating] = useState(false);
  const [schedStatusMessage, setSchedStatusMessage] = useState("");
  const [schedStatusSuccess, setSchedStatusSuccess] = useState<boolean | null>(null);
  const [schedActiveTab, setSchedActiveTab] = useState<"list" | "create">("list");
  const [schedStartDate, setSchedStartDate] = useState("");
  const [schedEndDate, setSchedEndDate] = useState("");

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
      const res = await fetch(`${API}/api/schedules`, {
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
        setSchedules(d.data || []);
      } else {
        console.error("fetchSchedules API error:", d.detail || d);
      }
    } catch (e) {
      console.error("Failed to fetch schedules", e);
    } finally {
      setSchedulerLoading(false);
    }
  }, [supabase]);

  const handleCreateSchedule = async () => {
    if (!schedRecipients.trim()) {
      setSchedStatusMessage("Please enter at least one recipient email.");
      setSchedStatusSuccess(false);
      return;
    }

    // Map station name to filters
    let filters: any = {
      mode: "standard",
      include_weekly_visual: true,
      include_weekly_ledger: true,
      include_monthly_visual: true,
      include_monthly_ledger: true,
      max_data_rows: 100,
    };

    if (schedStation !== "Global") {
      const stationMap: Record<string, { code: string; country: string }> = {
        "CMB": { code: "CMB", country: "Sri Lanka" },
        "IND": { code: "IND", country: "India" },
        "VNM": { code: "VNM", country: "Viet Nam" },
        "DAC": { code: "DAC", country: "Bangladesh" },
        "PKI": { code: "PKI", country: "Pakistan" },
        "NYC": { code: "NYC", country: "United States" },
      };
      const info = stationMap[schedStation];
      if (info) {
        filters.country = info.country;
        filters.company_code = info.code;
      }
    }

    if (schedStartDate) filters.start_date = schedStartDate;
    if (schedEndDate) filters.end_date = schedEndDate;

    setSchedIsCreating(true);
    setSchedStatusMessage("");
    setSchedStatusSuccess(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API}/api/schedules`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          recipient_email: schedRecipients,
          frequency: schedFrequency,
          day_of_week: schedFrequency === "weekly" ? schedDayOfWeek : null,
          day_of_month: schedFrequency === "monthly" ? schedDayOfMonth : null,
          time_of_day: schedTime,
          filters: filters,
          is_active: true,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setSchedStatusMessage("Schedule configured successfully!");
        setSchedStatusSuccess(true);
        setSchedRecipients("");
        setSchedStartDate("");
        setSchedEndDate("");
        // Pass the live supabase client so fetchSchedules always has a fresh token
        fetchSchedules(supabase);
      } else {
        setSchedStatusMessage(data.detail || "Failed to save schedule configuration.");
        setSchedStatusSuccess(false);
      }
    } catch (e) {
      setSchedStatusMessage("Error transmitting scheduling request.");
      setSchedStatusSuccess(false);
    }
    setSchedIsCreating(false);
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

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API}/api/schedules/${scheduleId}`, {
        method: "DELETE",
        headers: {
          "Authorization": authHeaders.Authorization
        }
      });
      const data = await res.json();
      if (data.status === "success") {
        fetchSchedules(supabase);
      } else {
        alert(data.detail || "Could not delete schedule.");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to delete schedule.");
    }
  };

  const fetchStationRecipients = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/station-recipients`);
      const d = await res.json();
      if (d.status === "success") {
        setStationDefaultRecipients(d.data);
        // Also initialize selection state for each station with its default recipients
        setStationSelectedEmails((prev) => {
          const updated = { ...prev };
          Object.entries(d.data).forEach(([code, emails]) => {
            if (!updated[code]) {
              updated[code] = emails as string[];
            }
          });
          return updated;
        });
      }
    } catch (e) {
      console.error("Failed to fetch station recipients", e);
    }
  }, []);


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

  // Fetch org users, station recipients, and schedules when admin/email-scheduling/users section is activated
  useEffect(() => {
    if ((activeSection === "admin" || activeSection === "email-scheduling" || activeSection === "users") && supabase) {
      fetchOrgUsers();
      fetchStationRecipients();
      fetchSchedules(supabase);
      fetchDbUsers(supabase);
    }
  }, [activeSection, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  const [standardRecords, setStandardRecords] = useState<any[]>([]);
  const [standardWeeklyData, setStandardWeeklyData] = useState<any[]>([]);
  const [standardMonthlyData, setStandardMonthlyData] = useState<any[]>([]);
  const [standardKpi, setStandardKpi] = useState<any>({});
  const [standardSectorCarrierData, setStandardSectorCarrierData] = useState<any[]>([]);

  // Loading & Email Status
  const [loading, setLoading] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [emailSuccess, setEmailSuccess] = useState<boolean | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // PDF Section selection for sending (before print preview)
  const [pdfSections, setPdfSections] = useState({
    weeklyVisual: true,
    weeklyLedger: true,
    monthlyVisual: true,
    monthlyLedger: true,
  });

  const [showSectionSelector, setShowSectionSelector] = useState(false);

  // --- SQL SANDBOX CONSOLE STATES ---
  // Weekly SQL States
  const [isWeeklySqlConsoleOpen, setIsWeeklySqlConsoleOpen] = useState(false);
  const [weeklySqlText, setWeeklySqlText] = useState(`-- Write your own SQL query here!
-- Pre-populated default Vietnam - Turkish Airline Air Cargo report
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
WHERE vt.ConLoadPortCountryName = 'Viet Nam'
    AND vt.ETD >= '2026-06-01'
    AND vt.ETD <= '2026-06-07'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = 'VNM'
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1,
         vt.ConsolTransportMode, vt.ETD, 
         COALESCE(vt.RealLoadPortCountryName, 'N/A'),
         COALESCE(vt.RealLoadPortCity, 'N/A'),
         COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
         COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC`);

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
  const [monthlySqlText, setMonthlySqlText] = useState(`-- Write your own Monthly SQL query here!
-- Pre-populated default Vietnam - Cargo Monthly Performance Rollup
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
WHERE vt.ConLoadPortCountryName = 'Viet Nam'
    AND vt.ETD >= '2026-05-01'
    AND vt.ETD <= '2026-06-01'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = 'VNM'
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1,
         vt.ConsolTransportMode, vt.ETD, 
         COALESCE(vt.RealLoadPortCountryName, 'N/A'),
         COALESCE(vt.RealLoadPortCity, 'N/A'),
         COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
         COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC`);

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
        const date = new Date(etdVal);
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
        const date = new Date(etdVal);
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
        body: JSON.stringify({ query: activeSql }),
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

        const totalTonnage = records.reduce((sum: number, r: any) => sum + Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0), 0);
        const totalRevenue = records.reduce((sum: number, r: any) => sum + Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0), 0);
        const totalCost = records.reduce((sum: number, r: any) => sum + Number(r.Total_Cost ?? r.Cost_USD ?? r.cost ?? 0), 0);
        const totalProfit = records.reduce((sum: number, r: any) => sum + Number(r.Total_Profit ?? r.Profit_USD ?? r.profit ?? 0), 0);
        const gpMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        const totalShipments = records.reduce((sum: number, r: any) => sum + Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1), 0);

        const airlinesSet = new Set(records.map((r: any) => r.Airline ?? r.AirlineName1 ?? r.carrier).filter(Boolean));
        const countriesSet = new Set(records.map((r: any) => r.Origin_Country ?? r.ConLoadPortCountryName ?? r.country).filter(Boolean));

        setWeeklySqlKpi({
          Total_Tonnage: totalTonnage,
          Total_Revenue: totalRevenue,
          Total_Cost: totalCost,
          Total_Profit: totalProfit,
          GP_Margin: gpMargin,
          Total_Shipments: totalShipments,
          Unique_Airlines: airlinesSet.size,
          Unique_Countries: countriesSet.size,
        });

        setWeeklySqlWeeklyData(parseWeeklyData(records));
        setWeeklySqlMonthlyData(parseMonthlyData(records));
        setWeeklySqlExecutionStatus(`✓ Query executed successfully! Returned ${records.length} rows.`);

        // Resolve sector carrier distribution for custom sql
        try {
          const secParams = new URLSearchParams({ custom_sql: activeSql });
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
        body: JSON.stringify({ query: activeSql }),
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

        const totalTonnage = records.reduce((sum: number, r: any) => sum + Number(r.Total_Tonnage ?? r.Tonnage_Chargeable ?? r.Air_ChargebleWeight ?? r.tonnage ?? 0), 0);
        const totalRevenue = records.reduce((sum: number, r: any) => sum + Number(r.Total_Revenue ?? r.Revenue_USD ?? r.revenue ?? 0), 0);
        const totalCost = records.reduce((sum: number, r: any) => sum + Number(r.Total_Cost ?? r.Cost_USD ?? r.cost ?? 0), 0);
        const totalProfit = records.reduce((sum: number, r: any) => sum + Number(r.Total_Profit ?? r.Profit_USD ?? r.profit ?? 0), 0);
        const gpMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        const totalShipments = records.reduce((sum: number, r: any) => sum + Number(r.Total_Shipments ?? r.ShipmentCount ?? r.Shipments ?? 1), 0);

        const airlinesSet = new Set(records.map((r: any) => r.Airline ?? r.AirlineName1 ?? r.carrier).filter(Boolean));
        const countriesSet = new Set(records.map((r: any) => r.Origin_Country ?? r.ConLoadPortCountryName ?? r.country).filter(Boolean));

        setMonthlySqlKpi({
          Total_Tonnage: totalTonnage,
          Total_Revenue: totalRevenue,
          Total_Cost: totalCost,
          Total_Profit: totalProfit,
          GP_Margin: gpMargin,
          Total_Shipments: totalShipments,
          Unique_Airlines: airlinesSet.size,
          Unique_Countries: countriesSet.size,
        });

        setMonthlySqlWeeklyData(parseWeeklyData(records));
        setMonthlySqlMonthlyData(parseMonthlyData(records));
        setMonthlySqlExecutionStatus(`✓ Query executed successfully! Returned ${records.length} rows.`);

        // Resolve sector carrier distribution for custom sql
        try {
          const secParams = new URLSearchParams({ custom_sql: activeSql });
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
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
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
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (countryParam) params.append("country", countryParam);
      if (airlineParam) params.append("airline", airlineParam);
      if (companyCodeParam) params.append("company_code", companyCodeParam);
      if (originCityParam) params.append("origin_city", originCityParam);
      if (destinationCountryParam) params.append("destination_country", destinationCountryParam);
      if (destinationCityParam) params.append("destination_city", destinationCityParam);
      if (branchParam) params.append("branch", branchParam);

      const [dataRes, weekRes, monthRes, kpiRes, sectorRes] = await Promise.all([
        fetch(`${API}/api/data?${params}`),
        fetch(`${API}/api/weekly?${params}`),
        fetch(`${API}/api/monthly?${params}`),
        fetch(`${API}/api/kpi?${params}`),
        fetch(`${API}/api/sector-carrier-distribution?${params}`),
      ]);
      const [d, w, m, k, sec] = await Promise.all([dataRes.json(), weekRes.json(), monthRes.json(), kpiRes.json(), sectorRes.json()]);
      if (d.status === "success") setStandardRecords(d.data);
      if (w.status === "success") setStandardWeeklyData(w.data);
      if (m.status === "success") setStandardMonthlyData(m.data);
      if (k.status === "success") setStandardKpi(k.data);
      if (sec.status === "success") setStandardSectorCarrierData(sec.data);
    } catch (e) {
      console.error("Failed to sync database view", e);
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
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
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
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
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
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
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
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
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
        const params = new URLSearchParams();
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
    if (selectedEmails.length === 0) {
      setEmailStatus("Please select or add at least one recipient email.");
      setEmailSuccess(false);
      return;
    }
    setEmailLoading(true);
    setEmailStatus("Rendering report layout & transmitting A4 Landscape PDF via Microsoft Graph...");
    setEmailSuccess(null);
    try {
      const emailString = selectedEmails.join(", ");

      // Build request body based on dashboard mode
      const requestBody: any = {
        recipient_email: emailString,
        // Pass selected sections to reduce PDF size
        include_weekly_visual: pdfSections.weeklyVisual,
        include_weekly_ledger: pdfSections.weeklyLedger,
        include_monthly_visual: pdfSections.monthlyVisual,
        include_monthly_ledger: dashboardMode === "custom-sql" ? false : pdfSections.monthlyLedger,
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
      setEmailStatus(result.message || "Executive stats report successfully sent.");
      setEmailSuccess(true);
    } catch {
      setEmailStatus("Could not transmit PDF dashboard.");
      setEmailSuccess(false);
    }
    setEmailLoading(false);
  };

  const handleSendStationEmail = async (stationCode: string, country: string) => {
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
        const knownCompanies = STATIONS.map(s => `'${s.code}'`).join(", ");
        formattedSql = `
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
        `.trim();
      } else {
        formattedSql = `
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
WHERE vt.ConLoadPortCountryName = '${country}'
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
        `.trim();
      }

      const requestBody = {
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
      setStationEmailStatus(prev => ({ ...prev, [stationCode]: result.message || "Report dispatch started." }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: true }));
    } catch {
      setStationEmailStatus(prev => ({ ...prev, [stationCode]: "Failed to send report." }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: false }));
    }
    setStationEmailLoading(prev => ({ ...prev, [stationCode]: false }));
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
      const currentDbUsers = dbUsers.filter(u => {
        if (!u.station) return false;
        const stations = u.station.split(",").map((s: string) => s.trim()).filter(Boolean);
        return stations.includes(stationCode);
      });
      const currentDbEmails = currentDbUsers.map(u => u.email);
      const emailsToRemove = currentDbEmails.filter(e => !emails.includes(e));
      const emailsToUpsert = emails;

      // Helper to compute the combined station string for a given email
      const getNewStationValue = (email: string, targetStation: string, removing: boolean) => {
        const stations: string[] = [];

        STATIONS.forEach(s => {
          const isTarget = s.code === targetStation;
          const isSelected = (stationSelectedEmails[s.code] || []).includes(email);
          if (isTarget) {
            if (!removing) {
              stations.push(s.code);
            }
          } else {
            if (isSelected) {
              stations.push(s.code);
            }
          }
        });

        const isTargetOther = targetStation === "OTHER";
        const isSelectedOther = (stationSelectedEmails["OTHER"] || []).includes(email);
        if (isTargetOther) {
          if (!removing) {
            stations.push("OTHER");
          }
        } else {
          if (isSelectedOther) {
            stations.push("OTHER");
          }
        }

        return stations.length > 0 ? stations.join(", ") : "Global";
      };

      for (const email of emailsToRemove) {
        const newStationValue = getNewStationValue(email, stationCode, true);
        const displayName = orgUsers.find(u => u.email === email)?.displayName || email.split("@")[0];

        const { error } = await supabase
          .from("users")
          .update({ station: newStationValue, display_name: displayName })
          .eq("email", email);
        if (error) console.error("Error removing user from station:", error);
      }

      for (const email of emailsToUpsert) {
        const existingUser = dbUsers.find(u => u.email === email);
        const displayName = orgUsers.find(u => u.email === email)?.displayName || email.split("@")[0];
        const newStationValue = getNewStationValue(email, stationCode, false);

        if (existingUser) {
          const { error } = await supabase
            .from("users")
            .update({ station: newStationValue, display_name: displayName })
            .eq("email", email);
          if (error) throw error;
        } else {
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
          const { error } = await supabase
            .from("users")
            .insert({
              id: newId,
              email: email,
              display_name: displayName,
              station: newStationValue
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
    } catch (err: any) {
      console.error("Failed to save station recipients", err);
      setStationEmailStatus(prev => ({ ...prev, [stationCode]: `Error: ${err.message || "Failed to save"}` }));
      setStationEmailSuccess(prev => ({ ...prev, [stationCode]: false }));
    } finally {
      setStationEmailLoading(prev => ({ ...prev, [stationCode]: false }));
    }
  };

  // Intercepting the "Send Stats" button to trigger the new verification step
  const handleSendStatsClick = () => {
    if (selectedEmails.length === 0) {
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
      { name: "Europe", tonnage: Number((tEurope / 1000).toFixed(3)), contribution: pct(tEurope) },
      { name: "USA", tonnage: Number((tUSA / 1000).toFixed(3)), contribution: pct(tUSA) },
      { name: "S.East Asia", tonnage: Number((tSEAsia / 1000).toFixed(3)), contribution: pct(tSEAsia) },
      { name: "Africa", tonnage: Number((tAfrica / 1000).toFixed(3)), contribution: pct(tAfrica) },
      { name: "India & Sub Cont.", tonnage: Number((tIndiaSub / 1000).toFixed(3)), contribution: pct(tIndiaSub) },
      { name: "Mid East", tonnage: Number((tMidEast / 1000).toFixed(3)), contribution: pct(tMidEast) },
      { name: "Australia", tonnage: Number((tAustralia / 1000).toFixed(3)), contribution: pct(tAustralia) },
      { name: "Other Sectors", tonnage: Number((tOthers / 1000).toFixed(3)), contribution: pct(tOthers) },
    ];
  };

  const getSectorTableRows = () => {
    const sorted = [...sectorCarrierData].sort((a, b) => b.Total_Tons - a.Total_Tons);
    const top20 = sorted.slice(0, 20);
    const others = sorted.slice(20);

    const convertRow = (r: any) => ({
      name: r.Airline || "Unknown Carrier",
      exp: Number((r.Air_Exp_Tong / 1000).toFixed(3)),
      imp: Number((r.Air_Imp_Tong / 1000).toFixed(3)),
      total: Number((r.Total_Tons / 1000).toFixed(3)),
      europe: Number((r.Europe / 1000).toFixed(3)),
      usa: Number((r.USA / 1000).toFixed(3)),
      northAmericaOther: Number((r.North_America_Other / 1000).toFixed(3)),
      centralAmerica: Number((r.Central_America / 1000).toFixed(3)),
      southAmerica: Number((r.South_America / 1000).toFixed(3)),
      middleEast: Number((r.Middle_East / 1000).toFixed(3)),
      southEastAsia: Number((r.South_East_Asia / 1000).toFixed(3)),
      indiaSubContinent: Number((r.India_Sub_Continent / 1000).toFixed(3)),
      northernAsia: Number((r.Northern_Asia / 1000).toFixed(3)),
      africa: Number((r.Africa / 1000).toFixed(3)),
      southAfrica: Number((r.South_Africa / 1000).toFixed(3)),
      australia: Number((r.Australia / 1000).toFixed(3)),
      pacificIslands: Number((r.Pacific_Islands / 1000).toFixed(3)),
      others: Number((r.Others / 1000).toFixed(3))
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
      const date = new Date(etdVal);
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
        const date = new Date(etdVal);
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

  // Build day-level tonnage series from raw SQL rows (ETD date) — used in SQL Sandbox mode
  const getDailyTonnageData = () => {
    const dayMap: { [key: string]: { date_label: string; Total_Tonnage: number; Total_Revenue: number; Total_Shipments: number } } = {};
    data.forEach((r: any) => {
      const etdVal = r.ETD ?? r.etd ?? r.etd_date;
      if (!etdVal) return;
      const date = new Date(etdVal);
      if (isNaN(date.getTime())) return;
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; // YYYY-MM-DD key for sorting
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const label = `${dayNames[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
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
      const params = new URLSearchParams({
        mode: "custom-sql",
        include_weekly_visual: pdfSections.weeklyVisual.toString(),
        include_weekly_ledger: pdfSections.weeklyLedger.toString(),
        include_monthly_visual: pdfSections.monthlyVisual.toString(),
        include_monthly_ledger: "false",
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
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
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
    params.append("include_monthly_ledger", pdfSections.monthlyLedger.toString());
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
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">DGL Tonnage Dashboard</h2>
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
            <img src="/images/Dart_Logo_new.webp" alt="DGL Logo" className="h-8 w-auto rounded object-contain shrink-0" />
            <h1 className="text-lg font-bold text-[#1A202C] tracking-tight">DGL Tonnage Analysis</h1>
            <span className="text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded-full bg-[#EDF2F7] border border-[#E2E8F0]">
              Tonnage Dashboard
            </span>
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

      {/* ── SIDEBAR + MAIN LAYOUT ── */}
      <div className="flex" style={{ minHeight: "calc(100vh - 64px)" }}>

        {/* ── LEFT SIDEBAR ── */}
        <nav className="sidebar-nav">
          <div className="px-4 pb-3 border-b border-[#EDF2F7] mb-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Navigation</p>
          </div>

          <span className="sidebar-section-label">Main</span>

          <button
            onClick={() => setActiveSection("dashboard")}
            className={`sidebar-nav-item ${activeSection === "dashboard" ? "active" : ""}`}
          >
            <LayoutDashboard className="nav-icon" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => {
              setActiveSection("weekly-reports");
              setIsWeeklySqlConsoleOpen(true);
            }}
            className={`sidebar-nav-item ${activeSection === "weekly-reports" ? "active" : ""}`}
          >
            <BarChart2 className="nav-icon" />
            <span>Weekly Reports</span>
          </button>

          <button
            onClick={() => {
              setActiveSection("monthly-reports");
              setIsMonthlySqlConsoleOpen(true);
            }}
            className={`sidebar-nav-item ${activeSection === "monthly-reports" ? "active" : ""}`}
          >
            <Calendar className="nav-icon" />
            <span>Monthly Reports</span>
          </button>

          <span className="sidebar-section-label" style={{ marginTop: 12 }}>System</span>

          <button
            onClick={() => setActiveSection("admin")}
            className={`sidebar-nav-item ${activeSection === "admin" ? "active" : ""}`}
          >
            <ShieldCheck className="nav-icon" />
            <span>Admin Panel</span>
          </button>

          <button
            onClick={() => setActiveSection("email-scheduling")}
            className={`sidebar-nav-item ${activeSection === "email-scheduling" ? "active" : ""}`}
          >
            <Clock className="nav-icon" />
            <span>Email Scheduling</span>
          </button>

          <button
            onClick={() => setActiveSection("users")}
            className={`sidebar-nav-item ${activeSection === "users" ? "active" : ""}`}
          >
            <Users className="nav-icon" />
            <span>Users</span>
          </button>

          <div style={{ marginTop: "auto" }} className="px-4 pt-4 pb-2 border-t border-[#EDF2F7]">
            <p className="text-[9px] text-slate-300 font-semibold">DGL Tonnage Analysis</p>
            <p className="text-[9px] text-slate-300">&copy; 2026 Dart Global Logistics</p>
          </div>
        </nav>

        {/* ── MAIN CONTENT AREA ── */}
        <div className="flex-1 min-w-0 pb-12">

          {/* ── FILTER UTILITIES STRIP ── */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
            <div className="max-w-[1380px] mx-auto px-6 mt-6">
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
                        label="Airline Carrier"
                        options={airlines}
                        selected={selectedAirlines}
                        onChange={setSelectedAirlines}
                        placeholder="All Carriers"
                        emoji="✈️"
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
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSqlConsoleOpen(!isSqlConsoleOpen)}
                        className="h-7 text-xs text-[#3182CE] hover:bg-[#EBF8FF] font-semibold"
                      >
                        {isSqlConsoleOpen ? "Collapse Editor" : "Expand Editor"}
                      </Button>
                    </div>

                    {isSqlConsoleOpen && (
                      <div className="space-y-3">
                        <div className="relative border border-[#CBD5E0] rounded-lg overflow-hidden shadow-inner">
                          <textarea
                            value={customSqlText}
                            onChange={(e) => setCustomSqlText(e.target.value)}
                            rows={12}
                            className="w-full p-4 bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#3182CE] resize-y"
                            placeholder="SELECT * FROM dbo.ChatData_ViewShipConsolTransport..."
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <Button
                            onClick={() => runCustomSqlQuery()}
                            disabled={sqlIsRunning}
                            className="h-8 px-4 bg-[#3182CE] hover:bg-[#2B6CB0] disabled:opacity-60 text-white text-xs font-bold rounded-md flex items-center gap-1.5 transition-all shadow"
                          >
                            {sqlIsRunning ? (
                              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Running...</span></>
                            ) : (
                              "▶ Execute Custom SQL"
                            )}
                          </Button>

                          {/* Stop Execution button — only shown while a query is running */}
                          {sqlIsRunning && (
                            <Button
                              onClick={stopCustomSqlQuery}
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
                              if (activeSection === "weekly-reports") {
                                setCustomSqlText(`-- Write your own SQL query here!
-- Pre-populated default Vietnam - Turkish Airline Air Cargo report
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
WHERE vt.ConLoadPortCountryName = 'Viet Nam'
    AND vt.ETD >= '2026-06-01'
    AND vt.ETD <= '2026-06-07'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = 'VNM'
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1,
         vt.ConsolTransportMode, vt.ETD, 
         COALESCE(vt.RealLoadPortCountryName, 'N/A'),
         COALESCE(vt.RealLoadPortCity, 'N/A'),
         COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
         COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC`);
                              } else {
                                setCustomSqlText(`-- Write your own Monthly SQL query here!
-- Pre-populated default Vietnam - Cargo Monthly Performance Rollup
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
WHERE vt.ConLoadPortCountryName = 'Viet Nam'
    AND vt.ETD >= '2025-06-01'
    AND vt.ETD <= '2026-05-21'
    AND vt.TransportMode = 'AIR'
    AND vs.Company = 'VNM'
GROUP BY vt.ConsoleNumber, vt.MasterBillNum, vt.AirlineName1,
         vt.ConsolTransportMode, vt.ETD, 
         COALESCE(vt.RealLoadPortCountryName, 'N/A'),
         COALESCE(vt.RealLoadPortCity, 'N/A'),
         COALESCE(vt.RealDisChargePortCountryName, 'N/A'),
         COALESCE(vt.RealDisChargePortCity, 'N/A')
ORDER BY vt.ETD DESC, ROUND(SUM(vs.Revenue_USD), 2) DESC`);
                              }
                            }}
                            className="h-8 px-3 border-[#CBD5E0] text-slate-650 hover:bg-slate-50 text-xs font-medium rounded-md"
                          >
                            Reset Template
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Console logs & feedback */}
                    {sqlExecutionStatus && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 font-medium flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <span>{sqlExecutionStatus}</span>
                      </div>
                    )}

                    {sqlError && (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 text-xs text-rose-700 space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                          <span>⚠️ Database Query Error</span>
                        </p>
                        <p className="font-mono text-[10.5px] leading-relaxed break-all bg-white/70 p-2 rounded border border-rose-100">
                          {sqlError}
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── SELECTED RECIPIENTS STRIP (Dashboard only) ── */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && selectedEmails.length > 0 && (
            <div className="max-w-[1380px] mx-auto px-6 mt-3 animate-in fade-in-0 duration-200">
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
            <div className="max-w-[1380px] mx-auto px-6 mt-4">
              <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${emailSuccess === true ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
                <span>{emailStatus}</span>
                <button onClick={() => setEmailStatus("")} className="hover:opacity-70"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}

          {/* ── ADMIN PANEL SECTION ── */}
          {activeSection === "admin" && (
            <div className="max-w-[1380px] mx-auto px-6 py-8 space-y-8 animate-in fade-in-0 duration-200">

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
                <div className="col-span-12 space-y-6">

                  {/* Admin Sub-Tabs */}
                  <div className="flex border-b border-slate-200 mb-4">
                    <button
                      onClick={() => setAdminTab("stations")}
                      className={`pb-2.5 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${adminTab === "stations" ? "border-[#3182CE] text-[#3182CE]" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Station-wise Mailers
                    </button>
                    <button
                      onClick={() => setAdminTab("global")}
                      className={`pb-2.5 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${adminTab === "global" ? "border-[#3182CE] text-[#3182CE]" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      Global Mailer
                    </button>
                  </div>

                  {adminTab === "stations" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {STATIONS.map((station) => {
                        const stationUsers = orgUsers.filter(u => getStationForUser(u) === station.code);
                        const selectedEmailsForStation = stationSelectedEmails[station.code] || [];
                        const isSending = stationEmailLoading[station.code] || false;
                        const statusMessage = stationEmailStatus[station.code] || "";
                        const sendSuccess = stationEmailSuccess[station.code];
                        const showUsers = expandedStation[station.code] || false;
                        const customInput = stationCustomEmailInput[station.code] || "";

                        return (
                          <div key={station.code} className="admin-card p-5 flex flex-col justify-between border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                            <div>
                              <div className="flex items-center justify-between pb-3 border-b border-[#EDF2F7] mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{station.flag}</span>
                                  <div>
                                    <h4 className="text-xs font-bold text-[#1A202C]">{station.name}</h4>
                                    <span className="text-[9px] font-extrabold text-[#3182CE] bg-[#EBF8FF] px-1.5 py-0.5 rounded uppercase">{station.code}</span>
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-400 font-semibold bg-slate-50 px-2 py-0.5 rounded border">
                                  {selectedEmailsForStation.length} Recipient(s)
                                </span>
                              </div>

                              {/* Search AD Users to Add */}
                              <div className="relative mb-3">
                                <Input
                                  placeholder="Search users to add..."
                                  value={stationUserSearch[station.code] || ""}
                                  onChange={(e) => setStationUserSearch(prev => ({ ...prev, [station.code]: e.target.value }))}
                                  className="h-8 text-[10px] bg-slate-50 border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400"
                                />
                                {(stationUserSearch[station.code] || "").trim() && (
                                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10 divide-y divide-slate-100">
                                    {orgUsers
                                      .filter((u) => {
                                        const query = (stationUserSearch[station.code] || "").toLowerCase().trim();
                                        return (u.displayName || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query);
                                      })
                                      .slice(0, 5)
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
                                            className="p-2 text-[10px] hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                                          >
                                            <div className="truncate pr-2">
                                              <p className="font-semibold text-slate-700 truncate">{u.displayName}</p>
                                              <p className="text-[8px] text-slate-400 truncate">{u.email}</p>
                                            </div>
                                            {isSelected && <span className="text-[8px] text-[#3182CE] font-bold">Added</span>}
                                          </div>
                                        );
                                      })}
                                    {orgUsers.filter((u) => {
                                      const query = (stationUserSearch[station.code] || "").toLowerCase().trim();
                                      return (u.displayName || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query);
                                    }).length === 0 && (
                                        <p className="p-2 text-[9px] text-slate-400 italic">No matching users found</p>
                                      )}
                                  </div>
                                )}
                              </div>

                              {/* Recipient summary / badge cloud */}
                              {selectedEmailsForStation.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Recipients List</p>
                                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 border border-dashed border-slate-200 rounded-lg bg-slate-50">
                                    {selectedEmailsForStation.map((email) => (
                                      <Badge
                                        key={email}
                                        className="bg-white hover:bg-slate-50 text-slate-750 border border-[#CBD5E0] font-semibold text-[8px] px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm"
                                      >
                                        <span className="truncate max-w-[100px]">{email}</span>
                                        <X
                                          className="w-2 h-2 text-slate-400 hover:text-slate-605 cursor-pointer shrink-0"
                                          onClick={() => setStationSelectedEmails(prev => ({
                                            ...prev,
                                            [station.code]: (prev[station.code] || []).filter(x => x !== email)
                                          }))}
                                        />
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Card Bottom / Sending controls */}
                            <div className="border-t border-[#EDF2F7] pt-3 mt-auto">
                              <div className="flex gap-2 mb-2">
                                <Button
                                  onClick={() => handleSaveStationRecipients(station.code)}
                                  disabled={isSending}
                                  className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow"
                                >
                                  Save Recipients
                                </Button>
                              </div>
                              <Button
                                onClick={() => handleSendStationEmail(station.code, station.country)}
                                disabled={selectedEmailsForStation.length === 0 || isSending}
                                className="w-full h-8 bg-[#3182CE] hover:bg-[#2B6CB0] disabled:opacity-50 text-white text-[10.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow"
                              >
                                {isSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Send {station.code} Report
                              </Button>

                              {statusMessage && (
                                <div className={`mt-2 p-1.5 rounded text-[9.5px] leading-snug flex items-center justify-between ${sendSuccess === true ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-blue-50 text-blue-800 border border-blue-100"}`}>
                                  <span className="truncate pr-1">{statusMessage}</span>
                                  <button
                                    onClick={() => setStationEmailStatus(prev => ({ ...prev, [station.code]: "" }))}
                                    className="hover:opacity-70 text-slate-400 shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Other / Corporate card */}
                      {(() => {
                        const otherUsers = orgUsers.filter(u => getStationForUser(u) === "OTHER");
                        const stationCode = "OTHER";
                        const selectedEmailsForStation = stationSelectedEmails[stationCode] || [];
                        const showUsers = expandedStation[stationCode] || false;
                        const customInput = stationCustomEmailInput[stationCode] || "";
                        const isSending = stationEmailLoading[stationCode] || false;
                        const statusMessage = stationEmailStatus[stationCode] || "";
                        const sendSuccess = stationEmailSuccess[stationCode];

                        return (
                          <div className="admin-card p-5 flex flex-col justify-between border border-slate-200 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200">
                            <div>
                              <div className="flex items-center justify-between pb-3 border-b border-[#EDF2F7] mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">🏢</span>
                                  <div>
                                    <h4 className="text-xs font-bold text-[#1A202C]">Other / Corporate</h4>
                                    <span className="text-[9px] font-extrabold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">OTHER</span>
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-400 font-semibold bg-slate-50 px-2 py-0.5 rounded border">
                                  {selectedEmailsForStation.length} Recipient(s)
                                </span>
                              </div>

                              {/* Search AD Users to Add */}
                              <div className="relative mb-3">
                                <Input
                                  placeholder="Search users to add..."
                                  value={stationUserSearch[stationCode] || ""}
                                  onChange={(e) => setStationUserSearch(prev => ({ ...prev, [stationCode]: e.target.value }))}
                                  className="h-8 text-[10px] bg-slate-50 border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400"
                                />
                                {(stationUserSearch[stationCode] || "").trim() && (
                                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-10 divide-y divide-slate-100">
                                    {orgUsers
                                      .filter((u) => {
                                        const query = (stationUserSearch[stationCode] || "").toLowerCase().trim();
                                        return (u.displayName || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query);
                                      })
                                      .slice(0, 5)
                                      .map((u) => {
                                        const isSelected = selectedEmailsForStation.includes(u.email);
                                        return (
                                          <div
                                            key={u.email}
                                            onClick={() => {
                                              if (!isSelected) {
                                                setStationSelectedEmails(prev => ({
                                                  ...prev,
                                                  [stationCode]: [...(prev[stationCode] || []), u.email]
                                                }));
                                              }
                                              setStationUserSearch(prev => ({ ...prev, [stationCode]: "" }));
                                            }}
                                            className="p-2 text-[10px] hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                                          >
                                            <div className="truncate pr-2">
                                              <p className="font-semibold text-slate-700 truncate">{u.displayName}</p>
                                              <p className="text-[8px] text-slate-400 truncate">{u.email}</p>
                                            </div>
                                            {isSelected && <span className="text-[8px] text-[#3182CE] font-bold">Added</span>}
                                          </div>
                                        );
                                      })}
                                    {orgUsers.filter((u) => {
                                      const query = (stationUserSearch[stationCode] || "").toLowerCase().trim();
                                      return (u.displayName || "").toLowerCase().includes(query) || (u.email || "").toLowerCase().includes(query);
                                    }).length === 0 && (
                                        <p className="p-2 text-[9px] text-slate-400 italic">No matching users found</p>
                                      )}
                                  </div>
                                )}
                              </div>

                              {selectedEmailsForStation.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Recipients List</p>
                                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1.5 border border-dashed border-slate-200 rounded-lg bg-slate-50">
                                    {selectedEmailsForStation.map((email) => (
                                      <Badge
                                        key={email}
                                        className="bg-white hover:bg-slate-50 text-slate-750 border border-[#CBD5E0] font-semibold text-[8px] px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm"
                                      >
                                        <span className="truncate max-w-[100px]">{email}</span>
                                        <X
                                          className="w-2 h-2 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                                          onClick={() => setStationSelectedEmails(prev => ({
                                            ...prev,
                                            [stationCode]: (prev[stationCode] || []).filter(x => x !== email)
                                          }))}
                                        />
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="border-t border-[#EDF2F7] pt-3 mt-auto">
                              <p className="text-[8.5px] text-slate-400 italic mb-2">Note: Corporate reports are generated without country/station filters.</p>
                              <div className="flex gap-2 mb-2">
                                <Button
                                  onClick={() => handleSaveStationRecipients("OTHER")}
                                  disabled={isSending}
                                  className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow"
                                >
                                  Save Recipients
                                </Button>
                              </div>
                              <Button
                                onClick={() => handleSendStationEmail("OTHER", "")}
                                disabled={selectedEmailsForStation.length === 0 || isSending}
                                className="w-full h-8 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 text-white text-[10.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow"
                              >
                                {isSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Send Corporate Report
                              </Button>

                              {statusMessage && (
                                <div className={`mt-2 p-1.5 rounded text-[9.5px] leading-snug flex items-center justify-between ${sendSuccess === true ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-blue-50 text-blue-800 border border-blue-100"}`}>
                                  <span className="truncate pr-1">{statusMessage}</span>
                                  <button
                                    onClick={() => setStationEmailStatus(prev => ({ ...prev, [stationCode]: "" }))}
                                    className="hover:opacity-70 text-slate-400 shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
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
            <div className="max-w-[1380px] mx-auto px-6 py-8 space-y-6 animate-in fade-in-0 duration-200">

              {/* Email Scheduling Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <Clock className="w-5 h-5 text-violet-600" />
                    <h2 className="text-xl font-extrabold text-[#1A202C] tracking-tight">Email Scheduling</h2>
                  </div>
                  <p className="text-sm text-slate-400">Automate and schedule periodic tonnage report dispatches.</p>
                </div>
              </div>

              {/* Tab Navigation for Scheduling */}
              <div className="flex border-b border-slate-200 mb-2">
                <button
                  onClick={() => setSchedActiveTab("list")}
                  className={`pb-2.5 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${schedActiveTab === "list" ? "border-violet-600 text-violet-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Active Schedules
                </button>
                <button
                  onClick={() => setSchedActiveTab("create")}
                  className={`pb-2.5 px-4 font-bold text-xs border-b-2 transition-all flex items-center gap-1.5 ${schedActiveTab === "create" ? "border-violet-600 text-violet-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Configure New Schedule
                </button>
              </div>

              <div className="grid grid-cols-12 gap-6">
                {/* ── LEFT COL: Configure New Schedule Form ── */}
                {schedActiveTab === "create" && (
                  <div className="col-span-12">
                    <div className="admin-card p-6 bg-white border border-slate-200 rounded-xl shadow-sm relative overflow-hidden">
                      <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-[#EDF2F7]">
                        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                          <Plus className="w-4 h-4 text-violet-500" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#1A202C]">Configure New Schedule</h3>
                          <p className="text-[10.5px] text-slate-400">Add a new automated dispatch schedule</p>
                        </div>
                      </div>

                      <div className="space-y-4 text-xs">
                        {/* Station filter mapping */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Target Station</label>
                          <select
                            value={schedStation}
                            onChange={(e) => setSchedStation(e.target.value)}
                            className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500"
                          >
                            <option value="Global">Global (All Stations)</option>
                            <option value="CMB">Sri Lanka (CMB)</option>
                            <option value="IND">India (IND)</option>
                            <option value="VNM">Viet Nam (VNM)</option>
                            <option value="DAC">Bangladesh (DAC)</option>
                            <option value="PKI">Pakistan (PKI)</option>
                            <option value="NYC">United States (NYC)</option>
                          </select>
                        </div>

                        {/* Frequency */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Frequency</label>
                          <div className="flex gap-2">
                            {["weekly", "monthly", "daily"].map((freq) => (
                              <button
                                key={freq}
                                type="button"
                                onClick={() => setSchedFrequency(freq as any)}
                                className={`flex-1 py-1.5 rounded-lg border text-center font-bold capitalize transition-colors ${schedFrequency === freq ? "bg-violet-50 border-violet-200 text-violet-800" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"}`}
                              >
                                {freq}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Day selection based on frequency */}
                        {schedFrequency === "weekly" && (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Day of Week</label>
                            <select
                              value={schedDayOfWeek}
                              onChange={(e) => setSchedDayOfWeek(parseInt(e.target.value))}
                              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500"
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
                        )}

                        {schedFrequency === "monthly" && (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Day of Month</label>
                            <select
                              value={schedDayOfMonth}
                              onChange={(e) => setSchedDayOfMonth(parseInt(e.target.value))}
                              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-violet-500"
                            >
                              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                                <option key={day} value={day}>Day {day}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Time */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Send Time (24h Local)</label>
                          <Input
                            type="time"
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
                                value={schedStartDate}
                                onChange={(e) => setSchedStartDate(e.target.value)}
                                className="h-8 text-xs bg-white border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-455 uppercase tracking-wider mb-1">End Date</label>
                              <Input
                                type="date"
                                value={schedEndDate}
                                onChange={(e) => setSchedEndDate(e.target.value)}
                                className="h-8 text-xs bg-white border-[#E2E8F0] rounded-md text-slate-700 [color-scheme:light]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Recipients Selection */}
                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Select Station to Load Recipients
                          </label>
                          <select
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) {
                                const emails = stationSelectedEmails[val] || [];
                                setSchedRecipients(emails.join(", "));
                              } else {
                                setSchedRecipients("");
                              }
                            }}
                            defaultValue=""
                            className="w-full h-9 bg-slate-50 border border-[#E2E8F0] rounded-lg text-slate-700 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-violet-500 font-semibold cursor-pointer transition-colors hover:bg-slate-100/80"
                          >
                            <option value="">-- Choose a Station --</option>
                            {STATIONS.map((s) => {
                              const count = (stationSelectedEmails[s.code] || []).length;
                              return (
                                <option key={s.code} value={s.code}>
                                  {s.name} ({count} users)
                                </option>
                              );
                            })}
                            <option value="OTHER">Corporate/OTHER ({(stationSelectedEmails["OTHER"] || []).length} users)</option>
                          </select>

                          {/* Visual Recipients List */}
                          {schedRecipients.split(",").map(r => r.trim()).filter(Boolean).length > 0 && (
                            <div className="space-y-1.5 mt-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loaded Recipients</p>
                              <div className="flex flex-wrap gap-1 p-2 border border-dashed border-slate-200 rounded-lg bg-slate-50 max-h-32 overflow-y-auto shadow-inner">
                                {schedRecipients
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
                                          const remaining = schedRecipients
                                            .split(",")
                                            .map(r => r.trim())
                                            .filter(x => x && x !== email);
                                          setSchedRecipients(remaining.join(", "));
                                        }}
                                      />
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Feedback status banner */}
                        {schedStatusMessage && (
                          <div className={`p-2 rounded-lg text-[10px] font-bold border ${schedStatusSuccess ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                            {schedStatusMessage}
                          </div>
                        )}

                        {/* Submit */}
                        <Button
                          onClick={handleCreateSchedule}
                          disabled={schedIsCreating}
                          className="w-full h-9 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
                        >
                          {schedIsCreating ? "Saving Schedule..." : "Save Schedule"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── RIGHT COL: Active Schedules List ── */}
                {schedActiveTab === "list" && (
                  <div className="col-span-12">
                    <div className="admin-card p-6 bg-white border border-slate-200 rounded-xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[400px]">
                      <div>
                        <div className="flex items-center justify-between mb-5 pb-4 border-b border-[#EDF2F7]">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                              <Clock className="w-4 h-4 text-violet-500" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-[#1A202C]">Active Schedules</h3>
                              <p className="text-[10.5px] text-slate-400">Currently configured periodic mailers</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="border-violet-200 text-violet-750 bg-violet-50 text-[10px] font-bold">
                            {schedules.length} configured
                          </Badge>
                        </div>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {schedulerLoading ? (
                            <div className="flex flex-col gap-2">
                              <Skeleton className="h-20 w-full bg-slate-50" />
                              <Skeleton className="h-20 w-full bg-slate-50" />
                            </div>
                          ) : schedules.length === 0 ? (
                            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              <p className="text-xs text-slate-400 font-medium italic">No schedules configured yet.</p>
                              <p className="text-[10.5px] text-slate-400 mt-1">Configure one using the form on the left.</p>
                            </div>
                          ) : (
                            schedules.map((s) => {
                              const filters = s.filters || {};
                              const stationLabel = filters.company_code ? `${filters.country} (${filters.company_code})` : "Global (All)";

                              let triggerDesc = "";
                              if (s.frequency === "weekly") {
                                const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                                triggerDesc = `Weekly on ${days[s.day_of_week] || "Monday"} at ${s.time_of_day}`;
                              } else if (s.frequency === "monthly") {
                                triggerDesc = `Monthly on day ${s.day_of_month} at ${s.time_of_day}`;
                              } else {
                                triggerDesc = `Daily at ${s.time_of_day}`;
                              }

                              return (
                                <div key={s.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100/50 transition-colors flex flex-col justify-between gap-3">
                                  <div className="flex justify-between items-start gap-2">
                                    <div>
                                      <h4 className="text-xs font-bold text-slate-800">{stationLabel}</h4>
                                      <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{triggerDesc}</p>
                                      {filters.start_date && filters.end_date && (
                                        <div className="text-[9px] font-bold text-violet-600 mt-1 flex items-center gap-1">
                                          📅 Range: {filters.start_date} to {filters.end_date}
                                        </div>
                                      )}
                                    </div>
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase ${s.is_active ? "text-emerald-700 bg-emerald-100" : "text-slate-500 bg-slate-200"}`}>
                                      {s.is_active ? "Active" : "Paused"}
                                    </span>
                                  </div>

                                  <div className="text-[9.5px] text-slate-450 bg-white border border-slate-200/60 p-2 rounded-lg max-h-16 overflow-y-auto">
                                    <span className="font-bold text-slate-500">Recipients:</span> {s.recipient_email}
                                  </div>

                                  <div className="flex justify-between items-center border-t border-slate-200/60 pt-2 mt-1">
                                    <button
                                      onClick={() => handleToggleSchedule(s.id)}
                                      className={`text-[9.5px] font-bold px-2 py-1 rounded transition-colors ${s.is_active ? "text-amber-700 bg-amber-50 hover:bg-amber-100" : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"}`}
                                    >
                                      {s.is_active ? "Pause" : "Activate"}
                                    </button>

                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleRunScheduleNow(s.id)}
                                        className="p-1 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                        title="Run Schedule Now"
                                      >
                                        <Play className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteSchedule(s.id)}
                                        className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── USERS SECTION ── */}
          {activeSection === "users" && (
            <div className="max-w-[1380px] mx-auto px-6 py-8 space-y-8 animate-in fade-in-0 duration-200">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-6">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <Users className="w-5 h-5 text-[#3182CE]" />
                    <h2 className="text-xl font-extrabold text-[#1A202C] tracking-tight">System Users & Recipients</h2>
                  </div>
                  <p className="text-sm text-slate-400">View and manage recipients filtered by station, stored in the database.</p>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-6">
                {/* Users List (Full Width) */}
                <div className="col-span-12 space-y-4">
                  <div className="admin-card p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-between items-center pb-4 border-b border-[#EDF2F7] mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                          <Users className="w-4 h-4 text-teal-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#1A202C]">Recipients List</h3>
                          <p className="text-[10.5px] text-slate-400">Manage saved recipients in the database</p>
                        </div>
                      </div>
                      <button
                        onClick={() => fetchDbUsers(supabase)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-655 transition-colors"
                        title="Refresh list"
                      >
                        <RefreshCw className={`w-4 h-4 ${dbUsersLoading ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    {/* Search and Filter */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                      <Input
                        placeholder="Search by name or email..."
                        value={dbUserSearch}
                        onChange={(e) => setDbUserSearch(e.target.value)}
                        className="h-9 text-xs bg-white border-[#CBD5E0] rounded-lg text-slate-700 flex-1"
                      />
                      <select
                        value={dbUserStationFilter}
                        onChange={(e) => setDbUserStationFilter(e.target.value)}
                        className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-slate-700 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                      >
                        <option value="ALL">All Stations</option>
                        <option value="Global">Global</option>
                        {STATIONS.map((s) => (
                          <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                        ))}
                        <option value="OTHER">Corporate / Other</option>
                      </select>
                    </div>

                    {/* Datatable */}
                    <div className="overflow-x-auto max-h-[450px]">
                      {dbUsersLoading ? (
                        <div className="py-12 flex flex-col items-center gap-3 text-slate-400">
                          <RefreshCw className="w-6 h-6 animate-spin text-[#3182CE]" />
                          <p className="text-xs font-medium">Fetching database users...</p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[10px] tracking-wider bg-slate-50/50">
                              <th className="px-4 py-3">Display Name</th>
                              <th className="px-4 py-3">Email Address</th>
                              <th className="px-4 py-3">Station</th>
                              <th className="px-4 py-3">Created At</th>
                              <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9]">
                            {dbUsers
                              .filter((u) => {
                                // Search filter
                                const searchQ = dbUserSearch.toLowerCase().trim();
                                const nameMatch = (u.display_name || "").toLowerCase().includes(searchQ);
                                const emailMatch = (u.email || "").toLowerCase().includes(searchQ);
                                if (searchQ && !nameMatch && !emailMatch) return false;

                                // Station filter
                                if (dbUserStationFilter !== "ALL") {
                                  const stations = (u.station || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                                  if (!stations.includes(dbUserStationFilter)) return false;
                                }
                                return true;
                              })
                              .map((u) => (
                                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-slate-700">{u.display_name || "—"}</td>
                                  <td className="px-4 py-3 font-medium text-slate-500">{u.email}</td>
                                  <td className="px-4 py-3">
                                    <Badge className="bg-[#EBF8FF] text-[#2B6CB0] border border-[#BEE3F8] font-bold text-[9px] px-2 py-0.5 rounded-full uppercase">
                                      {u.station || "Global"}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-slate-400 tabular-nums">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={async () => {
                                        if (!confirm(`Are you sure you want to delete ${u.email}?`)) return;
                                        try {
                                          const { error } = await supabase
                                            .from("users")
                                            .delete()
                                            .eq("id", u.id);
                                          if (error) throw error;
                                          fetchDbUsers(supabase);
                                        } catch (err: any) {
                                          alert(err.message || "Failed to delete user.");
                                        }
                                      }}
                                      className="p-1 rounded hover:bg-rose-50 text-rose-500 hover:text-rose-600 transition-colors"
                                      title="Delete Recipient"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            {dbUsers.length === 0 && (
                              <tr>
                                <td colSpan={5} className="text-center py-12 text-slate-400 font-medium italic">
                                  No database users configured.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── FOUR FINANCIAL KPI CARDS ROW (Dashboard + Weekly Reports only) ── */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
            <div className="max-w-[1380px] mx-auto px-6 mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

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

              {/* Card 2: Cost */}
              <div className="saas-card p-5 bg-white flex flex-col justify-center h-28 relative overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cost</p>
                {loading ? (
                  <Skeleton className="h-8 w-28 mt-2 bg-slate-100" />
                ) : (
                  <h3 className="text-2xl font-extrabold text-[#2D3748] tracking-tight mt-1">
                    {formatCurrency(kpi.Total_Cost)}
                  </h3>
                )}
              </div>

              {/* Card 3: Profit */}
              <div className="saas-card p-5 bg-white flex flex-col justify-center h-28 relative overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Profit</p>
                {loading ? (
                  <Skeleton className="h-8 w-28 mt-2 bg-slate-100" />
                ) : (
                  <h3 className="text-2xl font-extrabold text-[#2D3748] tracking-tight mt-1">
                    {formatCurrency(kpi.Total_Profit)}
                  </h3>
                )}
              </div>

              {/* Card 4: Total Tonnage */}
              <div className="saas-card p-5 bg-white flex flex-col justify-center h-28 relative overflow-hidden">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Tonnage</p>
                {loading ? (
                  <Skeleton className="h-8 w-28 mt-2 bg-slate-100" />
                ) : (
                  <h3 className="text-2xl font-extrabold text-[#2D3748] tracking-tight mt-1">
                    {formatNumber(kpi.Total_Tonnage)} kg
                  </h3>
                )}
              </div>
            </div>
          )}

          {/* ── MAIN DASHBOARD CANVAS (DIVIDED SEPARATELY FOR WEEKLY & MONTHLY) ── */}
          {activeSection !== "admin" && activeSection !== "email-scheduling" && activeSection !== "users" && (
            <div className="max-w-[1380px] mx-auto px-6 mt-6 space-y-12">

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
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tonnage Flow</p>
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
                                <linearGradient id="visitorAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
                                          <span className="w-2 h-2 rounded-full bg-[#3182CE]" /> Tonnage
                                        </span>
                                        <span className="text-[#3182CE] font-bold">{formatNumber(rawData.Total_Tonnage)} kg</span>
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
                                fill="url(#visitorAreaGrad)"
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
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest text-[#4299E1]">Airlines Share</p>
                          <h4 className="text-sm font-bold text-slate-800 mt-0.5">Top 10 Airlines Tonnage Share</h4>
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
                                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                  width={36}
                                />
                                <Tooltip
                                  contentStyle={{ fontSize: "10px", borderRadius: "6px" }}
                                  formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} kg`, name]}
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
                                <span className="font-bold text-[#2D3748] tabular-nums">{formatNumber(entry.tonnage)} kg</span>
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
                          <linearGradient id="dailyTonnageGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4299E1" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="dailyRevenueGrad" x1="0" y1="0" x2="0" y2="1">
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
                          tickFormatter={(v) => `${(v / 1000).toFixed(1)}t`}
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
                                  <span className="text-[#3182CE] font-extrabold">{formatNumber(d?.Total_Tonnage)} kg</span>
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
                          fill="url(#dailyTonnageGrad)"
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
                          fill="url(#dailyRevenueGrad)"
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
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest text-[#4299E1]">Airline Carrier Tonnage</p>
                      {selectedAirlines.length > 0 && (
                        <Badge variant="outline" className="border-blue-200 text-blue-600 bg-blue-50/50 text-[8px] font-bold px-1.5 py-0.5">
                          Selection Active
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 mb-1">Airline Tonnage Share</h4>
                      <p className="text-[10.5px] text-slate-400 leading-tight">
                        {selectedAirlines.length > 0 ? "Showing selected carrier weights" : "Showing carrier distribution by weight"}
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
                                  <Cell key={`cell-${index}`} fill={entry.name === "Others" ? "#CBD5E0" : getAirlineColor(entry.name, index)} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute text-center flex flex-col justify-center items-center">
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Total Weight</span>
                            <span className="text-[9px] font-extrabold text-[#2D3748] tracking-tight mt-0.5">
                              {formatNumber(kpi.Total_Tonnage)} kg
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Doughnut Legends list */}
                    <div className="space-y-2 max-h-[120px] overflow-y-auto">
                      {airlinePieData.map((entry: any, idx: number) => (
                        <div key={entry.name} className="flex items-center justify-between text-xs text-slate-655">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.name === "Others" ? "#CBD5E0" : getAirlineColor(entry.name, idx) }} />
                            <span className="font-semibold text-slate-700 truncate max-w-[120px]">{entry.name}</span>
                          </div>
                          <span className="font-bold text-[#2D3748] tabular-nums shrink-0">{formatNumber(entry.value)} kg</span>
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
                          <p className="text-[11px] font-bold uppercase tracking-widest text-[#4299E1]">Airline Breakdown</p>
                          <h4 className="text-sm font-bold text-slate-800 mt-0.5">Airline Tonnage by Week Period</h4>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                          {airlineWeeklyStackData.length} Airlines · {weekStackLabels.length} Weeks
                        </span>
                      </div>

                      <div className="flex-1 min-h-[240px]">
                        {loading ? (
                          <Skeleton className="h-full w-full rounded bg-slate-100 animate-pulse" />
                        ) : airlineWeeklyStackData.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-slate-400 text-center px-6">
                            No airline data — ensure your SQL returns an <code className="bg-slate-100 px-1 rounded mx-1">Airline</code> and <code className="bg-slate-100 px-1 rounded">ETD</code> column.
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
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
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
                                formatter={(value: any, name: any) => [`${Number(value).toLocaleString()} kg`, name]}
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
                          <h4 className="text-sm font-bold text-slate-800 mt-0.5">Trade Routes by Tonnage (Top 5)</h4>
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
                                    <Cell key={`tr-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const item = payload[0]?.payload;
                                    const total = tradeRouteData.reduce((s, r) => s + r.value, 0);
                                    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                                    const color = PIE_COLORS[tradeRouteData.findIndex(r => r.name === item.name) % PIE_COLORS.length];
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
                                            <span className="text-slate-500">Tonnage</span>
                                            <span className="font-extrabold text-[#2D3748] tabular-nums">{Number(item.value).toLocaleString()} kg</span>
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
                                {formatNumber(tradeRouteData.reduce((s, r) => s + r.value, 0))} kg
                              </span>
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
                                    style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
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
                                      <span className="text-[11px] font-bold text-slate-800 tabular-nums shrink-0">{formatNumber(entry.value)} kg</span>
                                    </div>
                                    <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
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


                {/* Full-width: Top 10 Airlines Summary Table */}
                <div className="saas-card bg-white p-6">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                    <div>
                      <h4 className="text-sm font-bold text-[#1A202C]">Airline Performance Summary — Top 10</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Aggregated by airline · ranked by chargeable tonnage</p>
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
                          routes: {
                            [routeKey: string]: {
                              originCity: string;
                              destCity: string;
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
                            const routeKey = `${rt.originCity} → ${rt.destCity}`;
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
                          <div className="py-14 flex flex-col items-center gap-2 text-slate-400">
                            <span className="text-3xl">✈️</span>
                            <p className="text-xs font-medium text-center">No airline data available.<br />Run a SQL query that returns <code className="bg-slate-100 px-1 rounded">Airline</code>, <code className="bg-slate-100 px-1 rounded">Revenue_USD</code> columns.</p>
                          </div>
                        );
                      }

                      return (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-[#E2E8F0] text-slate-400 uppercase font-bold text-[10px] tracking-wider bg-slate-50/70">
                              <th className="px-3 py-3 w-8">#</th>
                              <th className="px-3 py-3">Airline</th>
                              <th className="px-3 py-3 text-right">Tonnage (kg)</th>
                              <th className="px-3 py-3 text-right">Shipments</th>
                              <th className="px-3 py-3 text-right">Shipment Revenue (USD)</th>
                              <th className="px-3 py-3 text-right">Shipment Cost (USD)</th>
                              <th className="px-3 py-3 text-right">Gross Profit (USD)</th>
                              <th className="px-3 py-3 text-right">GP Margin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F1F5F9]">
                            {rows.map((row, i) => {
                              const isOthers = row.airline.startsWith("Others");
                              const gpMargin = row.revenue > 0 ? ((row.revenue + row.cost) / row.revenue * 100) : 0;
                              const totalTonnage = grandTotal.tonnage;
                              const pct = totalTonnage > 0 ? (row.tonnage / totalTonnage * 100) : 0;
                              const sortedRoutes = (Object.values(row.routes || {}) as any[]).sort((a, b) => b.tonnage - a.tonnage);

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
                                        <span className="font-bold text-[#3182CE]">{formatNumber(row.tonnage)} kg</span>
                                        <div className="h-1 rounded-full bg-slate-100 w-16 overflow-hidden">
                                          <div
                                            className="h-full rounded-full"
                                            style={{ width: `${pct}%`, backgroundColor: getAirlineColor(row.airline, i) }}
                                          />
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold text-slate-700 tabular-nums">{formatNumber(row.shipments)}</td>
                                    <td className="px-3 py-3 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                    <td className="px-3 py-3 text-right font-semibold text-slate-500 tabular-nums">{formatCurrency(row.cost)}</td>
                                    <td className="px-3 py-3 text-right font-bold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td>
                                    <td className="px-3 py-3 text-right tabular-nums">
                                      <span className={`font-bold text-[10px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                        {gpMargin.toFixed(1)}%
                                      </span>
                                    </td>
                                  </tr>
                                  {sortedRoutes.length > 0 && (
                                    sortedRoutes.map((route, rIdx) => {
                                      const routeGpMargin = route.revenue > 0 ? ((route.revenue + route.cost) / route.revenue * 100) : 0;
                                      return (
                                        <tr key={`${i}-route-${rIdx}`} className="bg-[#EBF8FF]/50 text-slate-950 text-[11px] border-l-4 border-blue-300 hover:bg-[#EBF8FF]/70 transition-colors">
                                          <td className="px-3 py-1 text-center text-[8px] text-blue-400 font-bold"></td>
                                          <td className="px-3 py-2 pl-8">
                                            <span className="font-semibold text-slate-950">{route.originCity} → {route.destCity}</span>
                                          </td>
                                          <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-bold">{formatNumber(route.tonnage)} kg</td>
                                          <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-semibold">{formatNumber(route.shipments)}</td>
                                          <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-bold">{formatCurrency(route.revenue)}</td>
                                          <td className="px-3 py-2 text-right tabular-nums text-slate-950 font-semibold">{formatCurrency(route.cost)}</td>
                                          <td className="px-3 py-2 text-right tabular-nums font-extrabold text-slate-950">{formatCurrency(route.revenue + route.cost)}</td>
                                          <td className="px-3 py-2 text-right tabular-nums">
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
                          </tbody>
                          {/* Grand Total Footer */}
                          <tfoot>
                            <tr className="border-t-2 border-[#E2E8F0] bg-slate-50/80 font-extrabold text-xs">
                              <td className="px-3 py-3 text-slate-500" colSpan={2}>TOTAL</td>
                              <td className="px-3 py-3 text-right text-[#3182CE] tabular-nums">{formatNumber(grandTotal.tonnage)} kg</td>
                              <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                              <td className="px-3 py-3 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                              <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td>
                              <td className="px-3 py-3 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td>
                              <td className="px-3 py-3 text-right">
                                <span className="font-bold text-slate-600 text-[10px]">
                                  {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      );
                    })()}
                  </div>
                </div>

                {/* Full-width: Top 10 Trade Routes Summary Table */}
                <div className="saas-card bg-white p-6 mt-6">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
                    <div>
                      <h4 className="text-sm font-bold text-[#1A202C]">Trade Route Performance Summary — Top 10</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Aggregated by origin &amp; destination · ranked by chargeable tonnage</p>
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
                              <th className="px-3 py-3 text-right">Tonnage (kg)</th>
                              <th className="px-3 py-3 text-right">Shipments</th>
                              <th className="px-3 py-3 text-right">Shipment Revenue (USD)</th>
                              <th className="px-3 py-3 text-right">Shipment Cost</th>
                              <th className="px-3 py-3 text-right">Gross Profit (USD)</th>
                              <th className="px-3 py-3 text-right">GP Margin</th>
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
                                      <span className="font-bold text-[#319795]">{formatNumber(row.tonnage)} kg</span>
                                      <div className="h-1 rounded-full bg-slate-100 w-16 overflow-hidden">
                                        <div
                                          className="h-full rounded-full"
                                          style={{ width: `${pct}%`, backgroundColor: color }}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-700 tabular-nums">{formatNumber(row.shipments)}</td>
                                  <td className="px-3 py-3 text-right font-bold text-emerald-600 tabular-nums">{formatCurrency(row.revenue)}</td>
                                  <td className="px-3 py-3 text-right font-semibold text-slate-500 tabular-nums">{formatCurrency(row.cost)}</td>
                                  <td className="px-3 py-3 text-right font-bold text-[#2D3748] tabular-nums">{formatCurrency(row.revenue + row.cost)}</td>
                                  <td className="px-3 py-3 text-right tabular-nums">
                                    <span className={`font-bold text-[10px] ${gpMargin >= 20 ? "text-emerald-600" : gpMargin >= 10 ? "text-amber-600" : "text-rose-500"}`}>
                                      {gpMargin.toFixed(1)}%
                                    </span>
                                  </td>
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
                              <td className="px-3 py-3 text-right text-[#319795] tabular-nums">{formatNumber(grandTotal.tonnage)} kg</td>
                              <td className="px-3 py-3 text-right text-slate-700 tabular-nums">{formatNumber(grandTotal.shipments)}</td>
                              <td className="px-3 py-3 text-right text-emerald-600 tabular-nums">{formatCurrency(grandTotal.revenue)}</td>
                              <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{formatCurrency(grandTotal.cost)}</td>
                              <td className="px-3 py-3 text-right text-[#2D3748] tabular-nums">{formatCurrency(grandTotal.revenue + grandTotal.cost)}</td>
                              <td className="px-3 py-3 text-right">
                                <span className="font-bold text-slate-600 text-[10px]">
                                  {grandTotal.revenue > 0 ? ((grandTotal.revenue + grandTotal.cost) / grandTotal.revenue * 100).toFixed(1) : "0.0"}%
                                </span>
                              </td>
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
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tonnage Flow</p>
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
                                <linearGradient id="monthlyAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
                                          <span className="w-2 h-2 rounded-full bg-teal-600" /> Tonnage
                                        </span>
                                        <span className="text-teal-600 font-bold">{formatNumber(rawData.Total_Tonnage)} kg</span>
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
                                fill="url(#monthlyAreaGrad)"
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
                                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
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
                        <h4 className="text-sm font-bold text-[#1A202C]">Monthly Tonnage & Financial Summary Table</h4>
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
                            <th className="px-4 py-2.5 text-right">Tonnage</th>
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
                                {row.Total_Tonnage != null ? `${formatNumber(row.Total_Tonnage)} kg` : "0 kg"}
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
                  <h2 className="text-base font-bold text-[#1A202C]">Sector-wise Carrier & Geographical Tonnage Performance</h2>
                  <span className="text-[10px] text-violet-700 bg-violet-50 font-semibold px-2 py-0.5 rounded-full border border-violet-100">
                    Carrier & Sector Performance
                  </span>
                </div>

                <div className="grid grid-cols-12 gap-6">
                  {/* Left Chart (Col-span-12 or 8) */}
                  <div className="col-span-12 lg:col-span-8 saas-card p-6 bg-white relative flex flex-col justify-between min-h-[350px]">
                    <div className="flex items-center justify-between mb-4 border-b border-[#F1F5F9] pb-4">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Geographical contribution</p>
                        <h2 className="text-lg font-bold text-[#1A202C] mt-0.5">Air Exports - Geographical Tonnage Contribution</h2>
                      </div>
                      <span className="text-xs font-bold text-violet-600 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100">
                        Tons vs Contribution %
                      </span>
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
                          <ComposedChart data={getSectorChartData()} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EDF2F7" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#718096", fontWeight: 600 }} axisLine={{ stroke: "#E2E8F0" }} tickLine={false} />
                            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} t`} width={45} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#718096" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={35} />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                  <div className="bg-white border border-[#CBD5E0] shadow-xl p-3 rounded-lg text-xs space-y-1">
                                    <p className="font-bold text-slate-800 border-b border-[#F1F5F9] pb-1 mb-1">{label}</p>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-slate-500 font-medium">Tonnage:</span>
                                      <span className="text-blue-600 font-bold">{payload[0].value} Tons</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-slate-500 font-medium">Contribution:</span>
                                      <span className="text-[#E53E3E] font-bold">{Number(payload[1].value).toFixed(1)}%</span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Bar yAxisId="left" dataKey="tonnage" fill="#3182CE" radius={[4, 4, 0, 0]} barSize={40} name="Tonnage (Tons)" />
                            <Line yAxisId="right" type="monotone" dataKey="contribution" stroke="#E53E3E" strokeWidth={2.5} dot={{ fill: "#E53E3E", r: 4 }} activeDot={{ r: 6 }} name="Contribution %">
                              <LabelList dataKey="contribution" position="top" formatter={(v: number) => `${v.toFixed(0)}%`} style={{ fontSize: 10, fill: "#E53E3E", fontWeight: 700 }} />
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
                              <span>{sector.tonnage} Tons ({sector.contribution.toFixed(1)}%)</span>
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
                        <h4 className="text-sm font-bold text-[#1A202C]">TOP 20 AIR CARRIERS & Total Tonnage - Sector wise (Tons)</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Tonnage contribution broken down by carrier and sector (Rounded to nearest Ton)</p>
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
                            <th colSpan={2} className="px-2 py-1 text-center bg-slate-100/80 border-b border-r border-[#E2E8F0] text-slate-700 font-extrabold">TONNAGE (Tons)</th>
                            <th colSpan={14} className="px-2 py-1 text-center text-slate-700 font-extrabold border-b border-[#E2E8F0]">GEOGRAPHICAL SECTOR TONNAGE (Tons)</th>
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
                                  <td className="px-2 py-1.5 font-bold truncate max-w-[150px]" title={row.name}>{row.name}</td>
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
            </div>
          )}
        </div>{/* end main content area */}
      </div>{/* end sidebar+main flex */}

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
                      {dashboardMode === "custom-sql" ? "Weekly Operational Performance" : "Weekly Revenue Trend Chart"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dashboardMode === "custom-sql"
                        ? "Operational charts including Top 10 Airlines share, Weekly tonnage period and Trade routes"
                        : "Area chart showing weekly revenue flow and airline metrics"}
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
                      {dashboardMode === "custom-sql" ? "Airline Performance Summary — Top 10" : "Weekly Carrier Metrics Table"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dashboardMode === "custom-sql"
                        ? "Top 10 airlines tonnage, shipments, revenue, cost, and margin summary table"
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
                      {dashboardMode === "custom-sql" ? "Trade Route Performance Summary — Top 10" : "Monthly Financial Summary Chart"}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dashboardMode === "custom-sql"
                        ? "Top 10 trade routes tonnage, shipments, revenue, cost, and margin summary table"
                        : "Pie chart showing revenue distribution by company"}
                    </p>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-semibold">
                    {dashboardMode === "custom-sql" ? "Table" : "Chart"}
                  </span>
                </div>

                {/* Monthly Ledger */}
                {dashboardMode !== "custom-sql" && (
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
                      <h4 className="text-sm font-semibold text-slate-800">Monthly Financial Summary Table</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Monthly revenue, tonnage, and shipment metrics</p>
                    </div>
                    <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded font-semibold">Table</span>
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <p className="font-semibold flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> Email Size Optimization
                </p>
                <p className="mt-1.5 leading-relaxed">
                  Unselecting sections will reduce the PDF file size. The report is limited to 100 data rows to ensure it stays within email size limits.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>
                  Sections selected: {dashboardMode === "custom-sql"
                    ? `${[pdfSections.weeklyVisual, pdfSections.weeklyLedger, pdfSections.monthlyVisual].filter(Boolean).length} / 3`
                    : `${Object.values(pdfSections).filter(Boolean).length} / 4`
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
                    {selectedEmails.map((e) => (
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
                {selectedEmails.length > 0 && !emailSuccess && (
                  <Button
                    onClick={async () => {
                      await handleSendEmail();
                      // Auto-close modal after 2.5 seconds on successful send
                      setTimeout(() => {
                        setShowPdfPreview(false);
                      }, 2500);
                    }}
                    disabled={emailLoading}
                    className="h-8 px-3.5 bg-[#4299E1] hover:bg-[#3182CE] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all shadow-md"
                  >
                    {emailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Confirm & Send to ({selectedEmails.length})
                  </Button>
                )}

                <Button
                  onClick={() => {
                    const iframe = document.getElementById("pdf-iframe") as HTMLIFrameElement;
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
                    setEmailStatus("");
                    setEmailSuccess(null);
                    setShowPdfPreview(false);
                  }}
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
                  id="pdf-iframe"
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

    </div>
  );
}