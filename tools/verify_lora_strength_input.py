"""Typing a LoRA weight in a real browser: decimal point, minus sign and out-of-range text.

`<input type="number">` reports an empty value while the user has typed an incomplete
number ("0." or "-"), so a strictly controlled field that rewrites itself on every change
erases the keystroke that starts a decimal. This probe types character by character in
Chromium (the same engine family as WebView2) and checks the in-progress text survives,
the final weight commits, and out-of-range text is repaired on blur instead of sticking.
Mocked IPC and synthetic models only: no backend, no models, no generation.
"""
import json
from pathlib import Path
from playwright.sync_api import expect
import verify_library_gallery as gallery
import verify_postprocessing as runner
import verify_workspace_layout as layout

CHECKS = [
    'an in-progress "0." is not rewritten or committed as 0',
    'typing 0.5 character by character commits 0.5',
    'a minus sign can be typed and -0.25 commits',
    'out-of-range 50 is never stored: blur keeps the last accepted weight (5)',
    'clearing the box and blurring keeps the last accepted weight instead of zero',
]


def typed(page, selector, text):
    """Type like a user: one key at a time, reading the field after each keystroke."""
    field = page.locator(selector)
    field.click()
    field.press('Control+a')
    seen = []
    for character in text:
        page.keyboard.press(character)
        seen.append((character, field.input_value()))
    return seen


def verify(browser, url, shots):
    context = browser.new_context(viewport={'width':1600,'height':1000})
    context.add_init_script(layout.collection.FIXTURE.replace('__MIXED__','false') + gallery.FIXTURE)
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(url) else route.abort())
    try:
        page = context.new_page()
        page.on('pageerror', lambda error: print('PAGE_ERROR', str(error)))
        page.set_default_timeout(8000)
        page.goto(url, wait_until='domcontentloaded', timeout=30000)
        layout.collection.set_locale(page, 'en', '[data-node="studio"]')

        page.locator('[data-dock-tab="loras"]').click()
        card = page.locator('.wb-dock .studio-model-results .wb-tiles > li').first
        expect(card).to_be_visible()
        card.locator('button').first.click()          # select the LoRA, which reveals its weight field
        field = '.wb-loras input[type="number"]'
        weight = page.locator(field).first
        expect(weight).to_be_visible()
        assert weight.input_value() == '1', weight.input_value()

        # 1. the decimal point: the incomplete number must survive the re-render
        keystrokes = typed(page, field, '0.')
        assert keystrokes[-1] == ('.', ''), keystrokes          # browser reports "" for "0."
        # A rewrite would show the committed number instead: "1" (no commit) or "0" (bad commit).
        after_dot = weight.input_value()
        assert after_dot == '', ('decimal point was rewritten', keystrokes, after_dot)

        # 2. finish 0.5 and blur
        page.keyboard.press('5')
        assert weight.input_value() == '0.5', weight.input_value()
        page.keyboard.press('Tab')
        expect(weight).to_have_value('0.5')

        # 3. negative weight typed from scratch
        keystrokes = typed(page, field, '-0.25')
        assert keystrokes[0][1] == '', ('minus sign was rewritten', keystrokes)
        page.keyboard.press('Tab')
        expect(weight).to_have_value('-0.25')

        # 4. "50" passes through the valid 5 and then stops being acceptable: the app keeps 5, never 50.
        keystrokes = typed(page, field, '50')
        assert keystrokes[-1][1] == '50', keystrokes
        page.keyboard.press('Tab')
        expect(weight).to_have_value('5')

        # 5. clearing the box must not zero the weight
        weight.click()
        weight.press('Control+a')
        page.keyboard.press('Backspace')
        assert weight.input_value() == '', weight.input_value()
        page.keyboard.press('Tab')
        expect(weight).to_have_value('5')

        result = {
            'status': 'PASS',
            'kind': 'Chromium; mocked IPC and synthetic models; typing only, no run and no backend',
            'checks': CHECKS,
            'artifacts': str(shots),
        }
        (shots/'result.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, indent=2))
    finally:
        context.close()


if __name__ == '__main__':
    runner.verify = verify
    runner.main(artifact_root=Path.home()/'.hermes/cache/scratch/deas-lora-strength')
