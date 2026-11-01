"""Manual report popup regression. All API calls are intercepted; no reports are sent."""
import base64
import json
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from browser_freight_modes import BASE, intercept, respond


def main():
    pending = []
    requests_seen = []
    schedules = [dict(id=f'run-{mode.lower()}', frequency='weekly', day_of_week=0,
                      time_of_day='08:00', is_active=True, recipient_email='fixture@example.test, colleague@example.test',
                      filters={'transport_mode': mode, 'company_code': 'IND', 'country': 'India'})
                 for mode in ('AIR', 'SEA')]

    def fixture(route):
        request = route.request
        path = urlparse(request.url).path
        if request.method == 'OPTIONS':
            intercept(route)
        elif path == '/api/schedules':
            assert request.method == 'GET'
            respond(route, {'status': 'success', 'data': schedules})
        elif path.startswith('/api/schedules/') and path.endswith('/run'):
            assert request.method == 'POST'
            assert request.headers.get('authorization', '').startswith('Bearer ')
            requests_seen.append(path)
            pending.append(route)
        else:
            intercept(route)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 1050})
        context.route('**/*', fixture)
        token = base64.urlsafe_b64encode(json.dumps({'exp': int(time.time()) + 86400, 'sub': 'fixture'}).encode()).decode().rstrip('=')
        session = {'access_token': 'eyJhbGciOiJIUzI1NiJ9.' + token + '.fixture', 'refresh_token': 'fixture',
                   'token_type': 'bearer', 'expires_in': 86400, 'expires_at': int(time.time()) + 86400,
                   'user': {'id': 'fixture', 'email': 'fixture@example.test', 'aud': 'authenticated'}}
        context.add_init_script(f"localStorage.setItem('sb-fixture-auth-token', {json.dumps(json.dumps(session))});")
        page = context.new_page()
        page.set_default_timeout(15000)
        errors, alerts = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: (alerts.append(dialog.message), dialog.dismiss()))
        page.goto(BASE, wait_until='networkidle')
        cases = [
            (200, {'status': 'success', 'message': 'Report generated and email accepted for sending.'}, 'sent', 'Report sent'),
            (200, {'status': 'skipped', 'message': 'Schedule is currently inactive.'}, 'skipped', 'Report not sent'),
            (500, {'detail': 'Report generation failed (fixture).'}, 'error', 'Could not confirm sending'),
            (401, {'detail': 'Your session has expired (fixture).'}, 'error', 'Could not confirm sending'),
            (0, None, 'error', 'Could not confirm sending'),
            (200, None, 'error', 'Could not confirm sending'),
        ]
        Path('outputs').mkdir(exist_ok=True)
        for mode in ('AIR', 'SEA'):
            page.get_by_role('tab', name='Air Freight' if mode == 'AIR' else 'Sea Freight', exact=True).click()
            root = page.locator(f'#freight-panel-{mode}')
            root.get_by_role('button', name='Email Scheduling', exact=True).click()
            row = root.locator(f'[data-schedule-id="run-{mode.lower()}"]')
            run = row.get_by_role('button', name='Run Report Now', exact=True)
            for index, (http_status, payload, state, title) in enumerate(cases):
                before = len(requests_seen)
                run.focus()
                # A rapid double-click must initiate only one send request.
                with page.expect_request(lambda request: request.method == 'POST' and request.url.endswith(f'/run-{mode.lower()}/run')):
                    run.evaluate('button => {button.click(); button.click();}')
                modal = page.get_by_role('dialog', name='Sending report…', exact=True)
                modal.wait_for()
                assert modal.locator('[role="status"]').get_attribute('aria-live') == 'polite'
                assert modal.get_by_role('button', name='Sending…', exact=True).is_disabled()
                assert row.get_by_role('button', name='Sending report', exact=True).is_disabled()
                assert f'{"Air" if mode == "AIR" else "Sea"} Freight' in modal.inner_text()
                assert 'India (IND)' in modal.inner_text() and 'Recipients (2)' in modal.inner_text()
                assert 'fixture@example.test' in modal.inner_text() and 'colleague@example.test' in modal.inner_text()
                page.keyboard.press('Escape')
                assert modal.is_visible(), 'Pending popup must stay open'
                assert len(requests_seen) == before + 1 and len(pending) == 1
                if index == 0:
                    page.screenshot(path=f'outputs/report-sending-{mode.lower()}.png')
                response = pending.pop()
                if http_status == 0:
                    response.abort('failed')
                else:
                    response.fulfill(status=http_status, content_type='application/json',
                                     body=json.dumps(payload) if payload is not None else '<html>Proxy response</html>')
                finished = page.get_by_role('dialog', name=title, exact=True)
                finished.wait_for()
                assert finished.get_attribute('data-schedule-run-status') == state
                if payload:
                    assert (payload.get('detail') or payload['message']) in finished.inner_text()
                else:
                    assert 'before running this schedule again' in finished.inner_text()
                if index == 0:
                    page.screenshot(path=f'outputs/report-sent-{mode.lower()}.png')
                if index == 2:
                    page.screenshot(path=f'outputs/report-send-error-{mode.lower()}.png')
                if index % 2:
                    page.keyboard.press('Escape')
                else:
                    finished.get_by_role('button', name='Done', exact=True).click()
                finished.wait_for(state='detached')
                assert run.is_enabled()
                assert run.evaluate('button => document.activeElement === button'), 'Focus must return to Run Report Now'
            print(f'PASS: {mode}: sending, confirmed sent, skipped, HTTP errors, interrupted request, invalid response, duplicate-click guard and keyboard focus.')
        assert not errors, errors
        assert not alerts, alerts
        browser.close()


if __name__ == '__main__':
    main()
