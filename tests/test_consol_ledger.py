"""Offline ledger and report email integration: no database or real email calls."""
import base64
import datetime
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from openpyxl import load_workbook
from api import email_service, ledger_service, main, pdf_service
import weekly_report_mailer as mailer


class ConsolLedgerTest(unittest.TestCase):
    def test_standard_sea_ledger_contains_query_rows_before_dashboard_normalization(self):
        records = [{"Console_Number": "SEA-1", "Master_Airway_Bill": "00001", "FCL_TEU_Count": 2.5,
                    "LCL_Volume": 10, "Revenue_USD": 100, "Source_Column": "first"},
                   {"Console_Number": "SEA-1", "Master_Airway_Bill": "00001", "FCL_TEU_Count": 2.5,
                    "LCL_Volume": 10, "Revenue_USD": 200, "Source_Column": "second"}]
        request = MagicMock(headers={"X-Consol-Ledger": "true"})
        with patch.object(main, "get_sea_source_data", return_value=records) as query:
            result = main.fetch_data("2026-09-21", "2026-09-27", transport_mode="SEA", request=request)
        query.assert_called_once()
        self.assertEqual(result["ledger_records"], records)
        self.assertEqual(len(result["data"]), 1)
        self.assertNotIn("Source_Column", result["data"][0])
        self.assertEqual(result["ledger_records"][1]["Source_Column"], "second")

    def test_custom_sea_ledger_keeps_original_query_columns(self):
        records = [{"Console_Number": "SEA-1", "Master_Airway_Bill": "00001", "FCL_TEU_Count": 2.5,
                    "LCL_Volume": 10, "Revenue_USD": 100, "Source_Column": "source value"}]
        with patch.object(main, "execute_custom_query", return_value=records) as query:
            result = main.custom_query(main.CustomQueryRequest(query="SELECT * WHERE TransportMode = 'SEA'",
                transport_mode="SEA"), request=MagicMock(headers={"X-Consol-Ledger": "true"}))
        query.assert_called_once()
        self.assertEqual(result["ledger_records"], records)
        self.assertNotIn("Source_Column", result["data"][0])
        self.assertNotIn("Airline", result["ledger_records"][0])

    def test_export_keeps_every_row_column_and_duplicate_source_record(self):
        rows = [{"Console_Number": "000123", "FCL_TEU_Count": 2.5, "LCL_Volume": 10.25,
                 "Revenue_USD": 1000, "ETD": "2026-09-21T00:15:00+05:30", "Note": "=1+1"}
                for _ in range(125)]
        rows[-1]["Extra_Source_Column"] = "last row retained"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sea.xlsx"
            ledger_service.generate_consol_ledger(path, rows, "SEA")
            book = load_workbook(path)
            sheet = book["Consol Ledger"]
            self.assertEqual(sheet.max_row, 129)
            self.assertEqual([cell.value for cell in sheet[4]], list(rows[-1]))
            self.assertEqual(sheet["A5"].value, "000123")
            self.assertEqual(sheet["A5"].data_type, "s")
            self.assertEqual(sheet["B5"].value, 2.5)
            self.assertEqual(sheet["B5"].data_type, "n")
            self.assertEqual(sheet["E5"].value, datetime.datetime(2026, 9, 21, 0, 15))
            self.assertEqual(sheet["E5"].number_format, "yyyy-mm-dd hh:mm:ss")
            self.assertEqual(sheet["F5"].value, "=1+1")
            self.assertEqual(sheet["F5"].data_type, "s")
            self.assertEqual(sheet["G129"].value, "last row retained")
            self.assertEqual(sheet.freeze_panes, "B5")
            self.assertEqual(sheet.tables["ConsolRecords"].ref, "A4:G129")
            book.close()

    def test_empty_result_still_exports_valid_ledger(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.xlsx"
            ledger_service.generate_consol_ledger(path, [], "AIR")
            book = load_workbook(path)
            self.assertIn("No records", book.active["A4"].value)
            book.close()

    def test_air_source_dates_and_shipment_columns_are_retained(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "air.xlsx"
            row = {"Console_Number": "AIR-1", "ShipmentNumber": "00001", "Total_Tonnage": 2500,
                   "ETD": datetime.datetime(2026, 9, 21, 10, 30), "Linked": True, "Missing": None}
            ledger_service.generate_consol_ledger(path, [row])
            book = load_workbook(path)
            self.assertEqual([cell.value for cell in book.active[5]], list(row.values()))
            book.close()

    def test_air_and_sea_etd_exports_as_sortable_datetime_with_requested_display(self):
        expected = datetime.datetime(2026, 10, 7, 9, 10)
        values = ["2026-10-07T09:10:00", "2026-10-07 09:10:00",
                  "2026-10-07T09:10:00Z", "2026-10-07T09:10:00+05:30",
                  "2026-10-07T09:10:00-04:00", expected,
                  expected.replace(tzinfo=datetime.timezone(datetime.timedelta(hours=5, minutes=30)))]
        for mode in ("AIR", "SEA"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                rows = [{"ETD": value, "Source_Timestamp": "2026-10-07T09:10:00+05:30"} for value in values]
                path = Path(directory) / f"{mode}.xlsx"
                ledger_service.generate_consol_ledger(path, rows, mode)
                book = load_workbook(path)
                for index in range(5, len(values) + 5):
                    cell = book.active.cell(index, 1)
                    self.assertEqual(cell.value, expected)
                    self.assertEqual(cell.data_type, "d")
                    self.assertEqual(cell.number_format, "yyyy-mm-dd hh:mm:ss")
                    self.assertEqual(cell.value.strftime("%Y-%m-%d %H:%M:%S"), "2026-10-07 09:10:00")
                    self.assertEqual(book.active.cell(index, 2).value, rows[index - 5]["Source_Timestamp"])
                book.close()

    def test_etd_date_only_blank_invalid_and_fractional_values(self):
        rows = [{"ETD": value} for value in ["2026-10-07", datetime.date(2026, 10, 7), None, "", "unknown",
                                             "2026-10-07T09:10:00.123+05:30"]]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dates.xlsx"
            ledger_service.generate_consol_ledger(path, rows)
            book = load_workbook(path)
            self.assertEqual(book.active["A5"].value, datetime.datetime(2026, 10, 7))
            self.assertEqual(book.active["A6"].value, datetime.datetime(2026, 10, 7))
            self.assertIsNone(book.active["A7"].value)
            self.assertIsNone(book.active["A8"].value)
            self.assertEqual(book.active["A9"].value, "unknown")
            self.assertEqual(book.active["A10"].value, datetime.datetime(2026, 10, 7, 9, 10, 0, 123000))
            self.assertEqual(book.active["A10"].number_format, "yyyy-mm-dd hh:mm:ss")
            book.close()

    def test_etd_epoch_timestamp_formats_as_datetime(self):
        # 1792436340000 ms is 2026-10-19 18:59:00 UTC
        expected = datetime.datetime(2026, 10, 19, 18, 59, 0)
        values = [
            1792436340000,
            1792436340000.0,
            "1792436340000",
            1792436340,
            "1792436340",
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "epoch.xlsx"
            rows = [{"ETD": v, "Console_Number": f"C{i}"} for i, v in enumerate(values, 1)]
            ledger_service.generate_consol_ledger(path, rows, "AIR")
            book = load_workbook(path)
            for idx in range(5, len(values) + 5):
                cell = book.active.cell(idx, 1)
                self.assertEqual(cell.value, expected)
                self.assertEqual(cell.data_type, "d")
                self.assertEqual(cell.number_format, "yyyy-mm-dd hh:mm:ss")
                self.assertEqual(cell.value.strftime("%Y-%m-%d %H:%M:%S"), "2026-10-19 18:59:00")
            book.close()


    def mock_graph(self):
        app = MagicMock()
        app.acquire_token_for_client.return_value = {"access_token": "fixture-token"}
        return app

    def test_manual_and_scheduled_air_sea_both_sends_have_matching_excel_and_cleanup(self):
        for scheduled in (False, True):
            for mode in ("AIR", "SEA", "BOTH"):
                with self.subTest(scheduled=scheduled, mode=mode):
                    created = []
                    def generate(output_path, transport_mode, **kwargs):
                        created.append(output_path)
                        Path(output_path).write_bytes(b"fixture PDF")
                        ledger_service.generate_consol_ledger(ledger_service.ledger_path(output_path),
                            [{"Console_Number": transport_mode + "-1", "Source_Value": 123,
                              "ETD": "2026-10-07T09:10:00+05:30"}], transport_mode)
                    config = {"is_active": 1, "recipient_email": "fixture@example.test", "frequency": "weekly",
                              "filters": {"transport_mode": mode, "country": "India", "company_code": "IND"}}
                    with patch.dict("os.environ", {"DB_SERVER": "fixture", "DB_USER": "fixture", "DB_PASSWORD": "fixture",
                            "MAIL_AZURE_TENANT_ID": "fixture", "MAIL_AZURE_CLIENT_ID": "fixture",
                            "MAIL_AZURE_CLIENT_SECRET": "fixture", "SENDER_EMAIL": "fixture@example.test", "VERCEL": ""}), \
                         patch.object(main, "generate_dashboard_pdf", side_effect=generate), \
                         patch.object(main, "get_schedule", return_value=config), \
                         patch.object(main, "get_supabase_stations", return_value=[]), \
                         patch.object(main, "get_supabase_branches", return_value=[]), \
                         patch.object(email_service, "ConfidentialClientApplication", return_value=self.mock_graph()), \
                         patch.object(email_service.requests, "post", return_value=MagicMock(status_code=202)) as post, \
                         patch.object(email_service, "log_email_transaction"):
                        if scheduled:
                            main.execute_scheduled_report_job("fixture")
                        else:
                            main.send_report(main.ReportRequest(start_date="2026-09-21", end_date="2026-09-27",
                                recipient_email="fixture@example.test", country="India", transport_mode=mode))
                        post.assert_called_once()
                        attachments = post.call_args.kwargs["json"]["message"]["attachments"]
                        self.assertEqual(len(attachments), 4 if mode == "BOTH" else 2)
                        for pdf, excel in zip(attachments[::2], attachments[1::2]):
                            self.assertEqual(pdf["contentType"], "application/pdf")
                            self.assertEqual(excel["name"], ledger_service.ledger_attachment_name(pdf["name"]))
                            self.assertEqual(excel["contentType"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                            book = load_workbook(io.BytesIO(base64.b64decode(excel["contentBytes"])))
                            self.assertEqual(book.active["A5"].value, "SEA-1" if pdf["name"].startswith("Sea_") else "AIR-1")
                            self.assertEqual(book.active["C5"].value, datetime.datetime(2026, 10, 7, 9, 10))
                            self.assertEqual(book.active["C5"].number_format, "yyyy-mm-dd hh:mm:ss")
                            book.close()
                    for path in created:
                        self.assertFalse(Path(path).exists())
                        self.assertFalse(Path(ledger_service.ledger_path(path)).exists())

    def test_missing_excel_prevents_graph_send(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.pdf"
            path.write_bytes(b"fixture PDF")
            with patch.dict("os.environ", {"MAIL_AZURE_TENANT_ID": "fixture", "MAIL_AZURE_CLIENT_ID": "fixture",
                    "MAIL_AZURE_CLIENT_SECRET": "fixture", "SENDER_EMAIL": "fixture@example.test"}), \
                 patch.object(email_service, "ConfidentialClientApplication", return_value=self.mock_graph()), \
                 patch.object(email_service.requests, "post") as post, \
                 patch.object(email_service, "log_email_transaction"):
                with self.assertRaises(FileNotFoundError):
                    email_service.send_pdf_via_graph(pdf_path=str(path), recipient_email="fixture@example.test")
                post.assert_not_called()

    def test_standalone_mailer_delegates_to_bundle_sender(self):
        with patch.object(email_service, "send_pdf_via_graph") as send:
            mailer.send_email_via_graph("fixture.pdf", "India", "2026-09-21", "2026-09-27",
                                       ["fixture@example.test"], "SEA")
        self.assertEqual(send.call_args.kwargs["pdf_path"], "fixture.pdf")
        self.assertIn("Consol Ledger Excel", send.call_args.kwargs["body"])

    def test_bundle_requests_ledger_from_same_pdf_generation(self):
        with patch.object(pdf_service, "generate_dashboard_pdf") as generate:
            pdf_service.generate_report_bundle("fixture.pdf", transport_mode="SEA", max_data_rows=1)
        self.assertEqual(generate.call_args.kwargs["ledger_output_path"], "fixture.xlsx")
        self.assertEqual(generate.call_args.kwargs["max_data_rows"], 1)

    def test_ledger_header_is_scoped_to_data_and_capture_preserves_source_rows(self):
        rows = [{"Console_Number": "AIR-1", "Source_Value": 123}]
        for mode, endpoint in (("standard", "/api/data"), ("custom-sql", "/api/custom-query")):
            with self.subTest(mode=mode):
                playwright = MagicMock()
                page = playwright.chromium.launch.return_value.new_page.return_value
                handlers = {}
                page.on.side_effect = lambda event, callback: handlers.update({event: callback})
                data_response = MagicMock(url="http://127.0.0.1:8000" + endpoint, ok=True)
                data_response.json.return_value = {"status": "success", "data": [], "ledger_records": rows}
                page.goto.side_effect = lambda *args, **kwargs: handlers["response"](data_response)
                page.locator.side_effect = lambda selector: MagicMock(
                    count=MagicMock(return_value=1 if selector == ".print-page-container" else 0))
                context = MagicMock()
                context.__enter__.return_value = playwright
                with patch.dict("os.environ", {"API_PORT": "8000"}, clear=True), \
                     patch.object(pdf_service, "sync_playwright", return_value=context), \
                     patch.object(pdf_service, "get_tonnage_base_url", return_value="http://127.0.0.1:3000"), \
                     patch.object(ledger_service, "generate_consol_ledger") as ledger:
                    pdf_service.generate_report_bundle("fixture.pdf", mode=mode)
                pattern, add_header = page.route.call_args.args
                self.assertEqual(pattern, "http://127.0.0.1:8000" + endpoint + "**")
                route = MagicMock()
                route.request.headers = {"content-type": "application/json"}
                add_header(route)
                route.fallback.assert_called_once_with(headers={"content-type": "application/json", "X-Consol-Ledger": "true"})
                page.set_extra_http_headers.assert_not_called()
                ledger.assert_called_once_with("fixture.xlsx", rows, "AIR")
                page.pdf.assert_called_once()


if __name__ == "__main__":
    unittest.main()
