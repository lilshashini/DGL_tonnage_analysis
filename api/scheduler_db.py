# api/scheduler_db.py
import os
import requests
from typing import List, Dict, Optional

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
TONNAGE_USERS_TABLE = "tonnage_users"

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_KEY environment variables are not set.")

def get_headers() -> dict:
    """Returns the authentication headers for Supabase API requests."""
    key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

def init_scheduler_db():
    """No-op. Supabase Postgres table is initialized in the cloud."""
    pass

def save_schedule(
    schedule_id: str,
    recipient_email: str,
    frequency: str,
    day_of_week: Optional[int],
    day_of_month: Optional[int],
    time_of_day: str,
    filters_dict: dict,
    is_active: int = 1,
    created_by: Optional[str] = None
):
    """Saves or updates a schedule config in the Supabase database."""
    headers = get_headers()
    payload = {
        "id": schedule_id,
        "recipient_email": recipient_email,
        "frequency": frequency,
        "day_of_week": day_of_week,
        "day_of_month": day_of_month,
        "time_of_day": time_of_day,
        "filters": filters_dict,
        "is_active": True if is_active else False
    }
    
    if created_by:
        payload["created_by"] = created_by

    # Check if the schedule already exists
    url = f"{SUPABASE_URL}/rest/v1/report_schedules?id=eq.{schedule_id}"
    try:
        check_resp = requests.get(url, headers=headers, timeout=10)
        if check_resp.status_code == 200 and len(check_resp.json()) > 0:
            # Update existing schedule
            patch_resp = requests.patch(url, headers=headers, json=payload, timeout=10)
            if not patch_resp.ok:
                print(f"Supabase PATCH failed ({patch_resp.status_code}): {patch_resp.text}")
            patch_resp.raise_for_status()
        else:
            # Create new schedule — ask Supabase to return the inserted row
            post_headers = {**headers, "Prefer": "return=representation"}
            post_url = f"{SUPABASE_URL}/rest/v1/report_schedules"
            post_resp = requests.post(post_url, headers=post_headers, json=payload, timeout=10)
            if not post_resp.ok:
                print(f"Supabase POST failed ({post_resp.status_code}): {post_resp.text}")
            post_resp.raise_for_status()
            print(f"Supabase: Schedule {schedule_id} created successfully.")
    except Exception as e:
        print(f"Supabase DB Error in save_schedule: {e}")
        raise e


def get_all_schedules() -> List[Dict]:
    """Retrieves all schedules in the Supabase database."""
    headers = get_headers()
    url = f"{SUPABASE_URL}/rest/v1/report_schedules?select=*"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        schedules = resp.json()
        
        # Ensure is_active is compatible (converting boolean to 1/0 for backward compatibility if needed)
        for s in schedules:
            s["is_active"] = 1 if s.get("is_active") else 0
            
        return schedules
    except Exception as e:
        print(f"Supabase DB Error in get_all_schedules: {e}")
        return []

def get_schedule(schedule_id: str) -> Optional[Dict]:
    """Retrieves a single schedule configuration by ID."""
    headers = get_headers()
    url = f"{SUPABASE_URL}/rest/v1/report_schedules?id=eq.{schedule_id}&select=*"
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data and len(data) > 0:
            s = data[0]
            s["is_active"] = 1 if s.get("is_active") else 0
            return s
        return None
    except Exception as e:
        print(f"Supabase DB Error in get_schedule {schedule_id}: {e}")
        return None

def delete_schedule(schedule_id: str):
    """Permanently deletes a schedule configuration."""
    headers = get_headers()
    url = f"{SUPABASE_URL}/rest/v1/report_schedules?id=eq.{schedule_id}"
    try:
        resp = requests.delete(url, headers=headers, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        print(f"Supabase DB Error in delete_schedule {schedule_id}: {e}")
        raise e

def update_schedule_status(schedule_id: str, is_active: int):
    """Toggles the active state of a schedule configuration."""
    headers = get_headers()
    url = f"{SUPABASE_URL}/rest/v1/report_schedules?id=eq.{schedule_id}"
    payload = {
        "is_active": True if is_active else False
    }
    try:
        resp = requests.patch(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        print(f"Supabase DB Error in update_schedule_status {schedule_id}: {e}")
        raise e


DEFAULT_STATIONS_FALLBACK = [
    {"code": "CMB", "country": "Sri Lanka", "name": "Colombo (Sri Lanka)", "env_var": "RECIPIENTS_CMB"},
    {"code": "IND", "country": "India", "name": "India (National)", "env_var": "RECIPIENTS_IND"},
    {"code": "VNM", "country": "Viet Nam", "name": "Viet Nam", "env_var": "RECIPIENTS_VNM"},
    {"code": "DAC", "country": "Bangladesh", "name": "Bangladesh", "env_var": "RECIPIENTS_DAC"},
    {"code": "PKI", "country": "Pakistan", "name": "Pakistan", "env_var": "RECIPIENTS_PKI"},
    {"code": "NYC", "country": "United States", "name": "United States (NYC)", "env_var": "RECIPIENTS_NYC"},
]

DEFAULT_BRANCHES_FALLBACK = [
    {"code": "BLR", "name": "Bengaluru (BLR)", "city": "Bengaluru", "country": "India", "company_code": "IND"},
    {"code": "MAA", "name": "Chennai (MAA)", "city": "Chennai", "country": "India", "company_code": "IND"},
    {"code": "HYD", "name": "Hyderabad (HYD)", "city": "Hyderabad", "country": "India", "company_code": "IND"},
    {"code": "AMD", "name": "Ahmedabad (AMD)", "city": "Ahmedabad", "country": "India", "company_code": "IND"},
    {"code": "BOM", "name": "Mumbai (BOM)", "city": "Mumbai", "country": "India", "company_code": "IND"},
    {"code": "PNQ", "name": "Pune (PNQ)", "city": "Pune", "country": "India", "company_code": "IND"},
    {"code": "DEL", "name": "Delhi (DEL)", "city": "Delhi", "country": "India", "company_code": "IND"},
    {"code": "CCU", "name": "Kolkata (CCU)", "city": "Kolkata", "country": "India", "company_code": "IND"},
]

def get_supabase_stations() -> List[Dict]:
    """Fetches active stations from Supabase table 'stations', falling back to defaults if unreachable."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return DEFAULT_STATIONS_FALLBACK
    headers = get_headers()
    url = f"{SUPABASE_URL}/rest/v1/stations?is_active=eq.true&order=code.asc&select=*"
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) > 0:
                for s in data:
                    if s.get("code") == "VNM" or str(s.get("country", "")).strip().lower().replace(" ", "") == "vietnam":
                        s["country"] = "Viet Nam"
                return data
    except Exception as e:
        print(f"Warning: Could not fetch stations from Supabase: {e}")
    return DEFAULT_STATIONS_FALLBACK

def get_supabase_branches() -> List[Dict]:
    """Fetches active branches from Supabase table 'branches', falling back to defaults if unreachable."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return DEFAULT_BRANCHES_FALLBACK
    headers = get_headers()
    url = f"{SUPABASE_URL}/rest/v1/branches?is_active=eq.true&order=name.asc&select=*"
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) > 0:
                return data
    except Exception as e:
        print(f"Warning: Could not fetch branches from Supabase: {e}")
    return DEFAULT_BRANCHES_FALLBACK

def get_supabase_recipients(code: str, is_branch: bool = False, transport_mode: str = "AIR") -> List[str]:
    """Match an explicit location code; a branch never implies its parent station."""
    if not SUPABASE_URL or not (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY):
        return []
    headers = get_headers()
    mode_col = "is_sea" if str(transport_mode).upper() == "SEA" else "is_air"

    url = f"{SUPABASE_URL}/rest/v1/{TONNAGE_USERS_TABLE}?{mode_col}=eq.true&select=email,station"
    resp = requests.get(url, headers=headers, timeout=5)
    resp.raise_for_status()
    target = code.strip().upper()
    recipients = set()
    for user in resp.json():
        email = (user.get("email") or "").strip().lower()
        assignments = {value.strip().upper() for value in (user.get("station") or "").split(",") if value.strip()}
        if email and (target in assignments or "GLOBAL" in assignments):
            recipients.add(email)
    # An empty result is authoritative; never restore older recipient lists.
    return sorted(recipients)

