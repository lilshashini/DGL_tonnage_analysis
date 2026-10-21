import unittest
from unittest.mock import patch, MagicMock
import pandas as pd

from api.database import (
    normalize_country_name,
    build_multi_in_clause,
    execute_custom_query,
    get_airlines,
    get_origin_cities,
    get_destination_cities,
)
from api.main import (
    normalize_country_name as main_normalize_country,
    extract_station_info_from_sql,
    generate_branchwise_sql,
)
from api.sea_database import build_sea_query, COUNTRY_ZONES
from api.scheduler_db import get_supabase_stations
from weekly_report_mailer import normalize_country as mailer_normalize_country


class TestVietnamNormalization(unittest.TestCase):

    def test_database_normalize_country_name(self):
        self.assertEqual(normalize_country_name("Vietnam"), "Viet Nam")
        self.assertEqual(normalize_country_name("vietnam"), "Viet Nam")
        self.assertEqual(normalize_country_name(" Viet Nam "), "Viet Nam")
        self.assertEqual(normalize_country_name("India"), "India")
        self.assertIsNone(normalize_country_name(None))

    def test_main_normalize_country_name(self):
        self.assertEqual(main_normalize_country("Vietnam"), "Viet Nam")
        self.assertEqual(main_normalize_country("vietnam"), "Viet Nam")
        self.assertEqual(main_normalize_country("Viet Nam"), "Viet Nam")
        self.assertEqual(main_normalize_country(None, "VNM"), "Viet Nam")
        self.assertEqual(main_normalize_country("", "VNM"), "Viet Nam")
        self.assertEqual(main_normalize_country("India", "IND"), "India")

    def test_mailer_normalize_country(self):
        self.assertEqual(mailer_normalize_country("Vietnam"), "Viet Nam")
        self.assertEqual(mailer_normalize_country("vietnam"), "Viet Nam")
        self.assertEqual(mailer_normalize_country(None, "VNM"), "Viet Nam")
        self.assertEqual(mailer_normalize_country("Viet Nam"), "Viet Nam")

    def test_build_multi_in_clause_normalizes_vietnam(self):
        params = {}
        clause = build_multi_in_clause("vt.ConLoadPortCountryName", "Vietnam", params, "country")
        self.assertEqual(clause, "AND vt.ConLoadPortCountryName IN (:country_0)")
        self.assertEqual(params["country_0"], "Viet Nam")

        params2 = {}
        clause2 = build_multi_in_clause("vt.ConLoadPortCountryName", "Vietnam, Sri Lanka", params2, "country")
        self.assertIn("Viet Nam", params2.values())
        self.assertIn("Sri Lanka", params2.values())

    def test_extract_station_info_from_sql_normalizes_vietnam(self):
        sql = "SELECT * FROM t WHERE vt.ConLoadPortCountryName = 'Vietnam' AND vs.Company = 'VNM'"
        company, country = extract_station_info_from_sql(sql)
        self.assertEqual(company, "VNM")
        self.assertEqual(country, "Viet Nam")

    def test_generate_branchwise_sql_normalizes_vietnam(self):
        sql = generate_branchwise_sql("Vietnam", "VNM", "HAN", "2026-01-01", "2026-01-07")
        self.assertIn("vt.ConLoadPortCountryName = 'Viet Nam'", sql)

    def test_sea_query_normalizes_vietnam(self):
        query, params = build_sea_query("2026-01-01", "2026-01-07", country="Vietnam", company_code="VNM")
        self.assertIn("Viet Nam", params.values())
        self.assertNotIn("Vietnam", params.values())
        self.assertIn("viet nam", COUNTRY_ZONES)
        self.assertEqual(COUNTRY_ZONES["viet nam"], "Asia/Ho_Chi_Minh")

    @patch("api.database.run_query")
    def test_get_airlines_normalizes_vietnam(self, mock_run_query):
        mock_run_query.return_value = pd.DataFrame({"airline": ["Vietnam Airlines"]})
        airlines = get_airlines("2026-01-01", "2026-01-07", country="Vietnam")
        self.assertEqual(airlines, ["Vietnam Airlines"])
        call_params = mock_run_query.call_args[0][1]
        self.assertEqual(call_params["country"], "Viet Nam")

    @patch("api.database.run_query")
    def test_execute_custom_query_replaces_vietnam(self, mock_run_query):
        mock_run_query.return_value = pd.DataFrame([{"Console_Number": "C123"}])
        sql = "SELECT * FROM dbo.ChatData_ViewShipConsolTransport vt WHERE vt.ConLoadPortCountryName = 'Vietnam'"
        records = execute_custom_query(sql)
        passed_query = mock_run_query.call_args[0][0]
        self.assertIn("vt.ConLoadPortCountryName = 'Viet Nam'", passed_query)
        self.assertNotIn("'Vietnam'", passed_query)

    @patch("api.scheduler_db.requests.get")
    def test_get_supabase_stations_normalizes_vnm(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {"code": "VNM", "name": "Vietnam Hub", "country": "Vietnam"},
            {"code": "IND", "name": "India Hub", "country": "India"},
        ]
        mock_get.return_value = mock_resp
        stations = get_supabase_stations()
        vnm_station = next(s for s in stations if s["code"] == "VNM")
        self.assertEqual(vnm_station["country"], "Viet Nam")


if __name__ == "__main__":
    unittest.main()
