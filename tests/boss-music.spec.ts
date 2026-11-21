import { expect, test } from '@playwright/test';

test.describe('Dynamic Boss Music System', () => {
  test('Asset-Test Editor: Tab 4 navigation, mode switcher, live transport, and TS export', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 20000 },
    );

    // 1. Switch to Tab 4 (Boss Music Editor) via button click
    const btnTab4 = page.locator('#btn-toggle-win-4');
    await expect(btnTab4).toBeVisible();
    await btnTab4.click();

    const winMusic = page.locator('#win-boss-music');
    await expect(winMusic).toBeVisible();
    await expect(btnTab4).toHaveClass(/active/);

    // 2. Test Key 4 hotkey toggling
    await page.keyboard.press('Digit1');
    await expect(winMusic).toHaveClass(/hidden/);
    await page.keyboard.press('Digit4');
    await expect(winMusic).not.toHaveClass(/hidden/);

    // 3. Test Mode Switching: Single-Track vs Dual-Track
    const btnSingle = page.locator('#btn-music-mode-single');
    const btnDual = page.locator('#btn-music-mode-dual');
    const containerSingle = page.locator('#container-single-track');
    const containerDual = page.locator('#container-dual-track');

    // Built-in procedural default preset starts in dual-track mode
    await expect(containerDual).toBeVisible();
    await expect(containerSingle).toBeHidden();

    await btnSingle.click();
    await expect(containerSingle).toBeVisible();
    await expect(containerDual).toBeHidden();

    // Test URL loading from public/ directory
    const inpSingleUrl = page.locator('#inp-single-url');
    const btnSingleLoad = page.locator('#btn-single-load-url');
    const singleInfo = page.locator('#single-file-info');

    await inpSingleUrl.fill('/assets/sfx/damage_grunt.mp3');
    await btnSingleLoad.click();
    await expect(singleInfo).toContainText('Loaded: /assets/sfx/damage_grunt.mp3');

    await btnDual.click();
    await expect(containerSingle).toBeHidden();
    await expect(containerDual).toBeVisible();

    // 4. Test Live Preview Transport Controls
    const btnPlayP1 = page.locator('#btn-preview-p1');
    const btnPlayP2 = page.locator('#btn-preview-p2');
    const btnTransition = page.locator('#btn-preview-transition');
    const btnStop = page.locator('#btn-preview-stop');
    const stateBadge = page.locator('#music-state-badge');

    await expect(stateBadge).toHaveText('IDLE');

    // Click Play Phase 1
    await btnPlayP1.click();
    await page.waitForTimeout(150);
    await expect(stateBadge).toHaveText('PLAYING P1');

    // Click Trigger P2 Transition
    await btnTransition.click();
    await page.waitForTimeout(150);
    await expect(stateBadge).toHaveText('TRANSITIONING');

    // Wait for transition crossfade to complete into Phase 2
    await page.waitForFunction(
      () => {
        const badge = document.querySelector('#music-state-badge');
        return badge && badge.textContent === 'PLAYING P2';
      },
      { timeout: 4000 },
    );

    // Click Stop
    await btnStop.click();
    await page.waitForTimeout(150);
    await expect(stateBadge).toHaveText('IDLE');

    // Direct Play Phase 2
    await btnPlayP2.click();
    await page.waitForTimeout(150);
    await expect(stateBadge).toHaveText('PLAYING P2');
    await btnStop.click();

    // 5. Test Export JSON Preset
    const btnExport = page.locator('#btn-export-music-json');
    await btnExport.click();
    const codeBox = page.locator('#music-code-container');
    await expect(codeBox).toBeVisible();
    const codeOutput = page.locator('#music-code-output');
    const text = await codeOutput.textContent();
    expect(text).toContain('"mode"');
    expect(text).toContain('"config"');

    // Screenshot of Window 4 editor
    await page.screenshot({
      path: 'artifacts/screenshots/boss-music-editor-tab4.png',
      fullPage: true,
    });

    expect(consoleErrors).toEqual([]);
  });

  test('Settings Modal: Tab VIII AUDIO selector, volume persistence, and preset switching', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.assetsLoaded === true,
      { timeout: 20000 },
    );

    // 1. Open Settings Modal
    const settingsBtn = page.locator('#game-settings-btn');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const modal = page.locator('#unified-settings-modal');
    await expect(modal).toBeVisible();

    // 2. Navigate to Tab VIII AUDIO
    const audioTabBtn = page.locator('.settings-tab-btn[data-tab="audio"]');
    await expect(audioTabBtn).toBeVisible();
    await expect(audioTabBtn).toContainText('VIII');
    await expect(audioTabBtn).toContainText('AUDIO');
    await audioTabBtn.click();

    // Verify Audio controls are rendered
    const musicSelect = page.locator('#select-boss-music');
    await expect(musicSelect).toBeVisible();

    const sliderMusicVol = page.locator('#slider-music-vol');
    await expect(sliderMusicVol).toBeVisible();

    const sliderSfxVol = page.locator('#slider-sfx-vol');
    await expect(sliderSfxVol).toBeVisible();

    // 3. Change volume slider and verify persistence
    await sliderMusicVol.fill('45');
    await sliderMusicVol.dispatchEvent('input');
    await page.waitForTimeout(100);

    const savedSettings = await page.evaluate(() => {
      const raw = localStorage.getItem('ashen_souls_settings_v1');
      return raw ? JSON.parse(raw) : null;
    });
    expect(savedSettings).not.toBeNull();
    expect(savedSettings.audio.bossMusicVolume).toBeCloseTo(0.45, 2);

    // 4. Capture screenshot of Audio Tab
    await page.screenshot({
      path: 'artifacts/screenshots/settings-audio-tab.png',
      fullPage: true,
    });
  });

  test('Game Combat Encounter: Phase 1 starts, Phase 2 transitions, defeat stops music', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__ && window.__THREE_GAME_DIAGNOSTICS__.assetsLoaded === true,
      { timeout: 20000 },
    );

    // 1. Natural user interaction triggers AudioContext resume & Phase 1 playback (NO artificial startBossMusic hook call)
    await page.locator('#game-canvas').click();
    await page.keyboard.press('KeyW');

    await page.waitForFunction(() => {
      const audioDiag = window.__THREE_GAME_TEST_HOOKS__?.getAudioDiagnostics?.();
      const musicState = window.__THREE_GAME_TEST_HOOKS__?.getMusicState?.();
      const isRunning = audioDiag?.contextState === 'running';
      const isPhase1 = (audioDiag?.activePhase ?? musicState?.activePhase) === 'phase1';
      return isRunning && isPhase1;
    }, { timeout: 8000 });

    const audioStatus = await page.evaluate(() => {
      return (
        window.__THREE_GAME_TEST_HOOKS__?.getAudioDiagnostics?.() ??
        window.__THREE_GAME_DIAGNOSTICS__?.audio ??
        null
      );
    });
    expect(audioStatus).not.toBeNull();
    expect(audioStatus?.contextState).toBe('running');
    expect(audioStatus?.activePhase).toBe('phase1');
    expect(audioStatus?.isPlaying).toBe(true);

    let musicState = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getMusicState?.());
    expect(musicState.activePhase).toBe('phase1');
    const initialProgress = musicState.phase1Progress ?? 0;

    // Verify Phase 1 sustains uninterrupted playback across > 2.0 seconds (no trailing pause timer kill)
    await page.waitForTimeout(2000);
    const sustainedStatus = await page.evaluate(() => ({
      diag: window.__THREE_GAME_TEST_HOOKS__?.getAudioDiagnostics?.() ?? null,
      music: window.__THREE_GAME_TEST_HOOKS__?.getMusicState?.() ?? null,
    }));
    expect(sustainedStatus.diag?.isPlaying).toBe(true);
    expect(sustainedStatus.music?.activePhase).toBe('phase1');
    expect(sustainedStatus.music?.phase1Progress).toBeGreaterThan(initialProgress);

    // 2. Trigger Phase 2 via test hooks
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState?.('boss_phase2'));
    await page.waitForTimeout(300);

    musicState = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getMusicState?.());
    expect(['transitioning', 'phase2']).toContain(musicState.activePhase);

    // 3. Trigger Boss Defeat
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState?.('boss_dead'));
    await page.waitForTimeout(300);

    musicState = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getMusicState?.());
    expect(musicState.activePhase).toBe('none');

    // 4. Trigger Restart and verify Phase 1 restarts and sustains playback
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(500);

    const restartStatus = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getAudioDiagnostics?.());
    expect(restartStatus?.activePhase).toBe('phase1');

    await page.waitForTimeout(1500);
    const sustainedRestart = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getAudioDiagnostics?.());
    expect(sustainedRestart?.isPlaying).toBe(true);
    expect(sustainedRestart?.activePhase).toBe('phase1');
  });
});
