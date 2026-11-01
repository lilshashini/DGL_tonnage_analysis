"""Recipient search and schedule payload regression; all external requests are fixtures."""
import base64
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright
from browser_freight_modes import BASE, intercept, respond, created_schedules


def main():
    fail_ad = True
    org_requests = []
    ad_users = [
        {"email": "ad.only@example.test", "displayName": "AD Only Person"},
        {"email": " FIXTURE@EXAMPLE.TEST ", "displayName": "Fixture Recipient"},
        {"email": "disabled@example.test", "displayName": "Disabled Person"},
    ]

    def fixture(route):
        request = route.request
        url = urlparse(request.url)
        if request.method == 'OPTIONS':
            intercept(route)
        elif url.hostname == "fixture.supabase.co" and url.path.endswith('/tonnage_users'):
            assert request.method == 'GET', 'Recipient selection must not change saved memberships'
            respond(route, [
                {"id": "fixture", "email": "fixture@example.test", "display_name": "Fixture Recipient", "station": "IND", "is_air": True, "is_sea": True},
                {"id": "disabled", "email": "disabled@example.test", "display_name": "Disabled Person", "station": "IND", "is_air": False, "is_sea": False},
            ])
        elif url.path == '/api/org-users':
            org_requests.append(request.url)
            if fail_ad:
                route.fulfill(status=503, content_type='application/json', body=json.dumps({'detail': 'Directory temporarily unavailable'}))
            else:
                respond(route, {'status': 'success', 'users': ad_users, 'byDepartment': {}})
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
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until='networkidle')
        for mode in ('AIR', 'SEA'):
            fail_ad = True
            page.get_by_role('tab', name='Air Freight' if mode == 'AIR' else 'Sea Freight', exact=True).click()
            root = page.locator(f'#freight-panel-{mode}')
            root.get_by_role('button', name='Email Scheduling', exact=True).click()
            root.get_by_role('button', name='Configure New Schedule', exact=True).click()
            config = root.locator('[data-schedule-config]')
            config.get_by_role('button', name='One person', exact=True).click()
            picker = config.locator('[data-schedule-recipient-picker]')
            picker.get_by_role('alert').filter(has_text='Directory temporarily unavailable').wait_for()
            field = picker.get_by_role('combobox', name='Recipient', exact=True)
            field.fill('Fixture')
            picker.get_by_role('option', name=re.compile('Fixture Recipient')).wait_for()
            fail_ad = False
            before = len(org_requests)
            picker.get_by_role('button', name='Refresh users', exact=True).click()
            page.wait_for_function("document.querySelector('[data-schedule-config] [data-schedule-recipient-picker] [role=alert]') === null")
            field.fill('AD Only')
            option = picker.get_by_role('option', name=re.compile('AD Only Person'))
            option.wait_for()
            assert len(org_requests) > before
            assert option.get_attribute('aria-disabled') == 'false'
            field.press('ArrowDown')
            page.keyboard.press('Enter')
            assert field.input_value() == 'ad.only@example.test'
            assert field.get_attribute('aria-expanded') == 'false'
            field.fill('Disabled')
            blocked = picker.get_by_role('option', name=re.compile('Disabled Person'))
            assert blocked.get_attribute('aria-disabled') == 'true'
            field.press('Enter')
            assert 'Selected:' not in picker.inner_text()
            assert f'{mode} reports disabled' in blocked.inner_text()
            field.fill('fixture@example.test')
            assert picker.get_by_role('option').count() == 1, 'Duplicate AD/saved recipient'
            field.fill('nobody-matches')
            picker.get_by_text('No matching users. Try their email address or refresh users.', exact=True).wait_for()
            before = len(org_requests)
            picker.get_by_role('button', name='Refresh users', exact=True).click()
            field.fill('ad.only@example.test')
            picker.get_by_role('option', name=re.compile('AD Only Person')).click()
            assert len(org_requests) > before, 'Refresh must reload an already populated AD list'
            config.get_by_role('button', name='Select All', exact=True).click()
            with page.expect_response(lambda response: response.request.method == 'POST' and '/api/schedules' in response.url):
                config.get_by_role('button', name='Save Schedule', exact=True).click()
            config.get_by_text('Saved 1 station schedule.').wait_for()
            assert created_schedules[-1]['recipient_email'] == 'ad.only@example.test'
            assert created_schedules[-1]['filters']['transport_mode'] == mode
            assert created_schedules[-1]['filters']['recipient_mode'] == 'person'
            field.fill('AD Only')
            picker.get_by_role('option', name=re.compile('AD Only Person')).wait_for()
            Path('outputs').mkdir(exist_ok=True)
            config.scroll_into_view_if_needed()
            page.screenshot(path=f'outputs/schedule-ad-recipient-{mode.lower()}.png')
            print(f'PASS: {mode}: AD search, exact recipient payload, saved preferences, duplicates, error and refresh.')
        assert not errors, errors
        browser.close()


if __name__ == '__main__':
    main()
