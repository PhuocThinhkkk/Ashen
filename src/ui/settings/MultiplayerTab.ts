import type { TabRenderContext } from './types';
import { NetworkManager } from '../../network/NetworkManager';

export function renderMultiplayerTab(ctx: TabRenderContext): void {
  const el = ctx.container;
  const net = NetworkManager.getInstance();

  if (net.isConnected && net.roomCode) {
    // IN ROOM LOBBY VIEW
    el.innerHTML = `
      <div class="settings-section">
        <h3 class="section-title">ACTIVE DUEL CHAMBER</h3>
        <p class="section-desc">1v1 PvP online chamber synchronized via lightweight Colyseus relay.</p>

        <div class="model-status-card" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            CHAMBER CODE: <b style="color: #ffd700; font-size: 1.15rem; letter-spacing: 2px;">${net.roomCode}</b>
          </div>
          <button id="btn-copy-code" class="btn-util">COPY CODE</button>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Your Combat Role</span>
            <span class="control-sub">${net.isHost ? 'Host (Chamber Overseer)' : 'Challenger (Duelist)'}</span>
          </div>
          <span class="toggle-badge permanent">${net.isHost ? 'HOST' : 'GUEST'}</span>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Duel Readiness</span>
            <span class="control-sub">Signal when your character and graphics are prepared</span>
          </div>
          <button id="btn-toggle-ready" class="btn-util">TOGGLE READY</button>
        </div>

        ${
          net.isHost
            ? `
        <div class="control-row" style="background: rgba(30, 24, 12, 0.7); border-color: #ffd700;">
          <div class="control-info">
            <span class="control-label" style="color: #ffd700;">Initiate Combat Encounter</span>
            <span class="control-sub">Loads arena duel, spawns opponent, and enables PvP damage</span>
          </div>
          <button id="btn-start-duel" class="btn-action">INITIATE ONLINE DUEL</button>
        </div>`
            : `
        <div class="profiler-banner active">
          WAITING FOR HOST TO INITIATE DUEL...
        </div>`
        }

        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button id="btn-leave-room" class="btn-util" style="border-color: #ff5555; color: #ff8888;">LEAVE CHAMBER</button>
        </div>
      </div>
    `;

    el.querySelector('#btn-copy-code')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(net.roomCode);
      const btn = el.querySelector<HTMLButtonElement>('#btn-copy-code');
      if (btn) btn.textContent = 'COPIED!';
    });

    let isReady = false;
    el.querySelector('#btn-toggle-ready')?.addEventListener('click', () => {
      isReady = !isReady;
      net.setReady(isReady);
      const btn = el.querySelector<HTMLButtonElement>('#btn-toggle-ready');
      if (btn) btn.textContent = isReady ? 'READY (CONFIRMED)' : 'TOGGLE READY';
    });

    el.querySelector('#btn-start-duel')?.addEventListener('click', () => {
      net.startMatch();
    });

    el.querySelector('#btn-leave-room')?.addEventListener('click', () => {
      net.leaveRoom();
      ctx.renderCurrentTab();
    });
  } else {
    // NOT IN ROOM VIEW
    el.innerHTML = `
      <div class="settings-section">
        <h3 class="section-title">ONLINE MULTIPLAYER DUEL CHAMBERS</h3>
        <p class="section-desc">Host or join 1v1 PvP combat trials with friends via human-readable invite codes.</p>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Allocate New Chamber (Host)</span>
            <span class="control-sub">Creates an online room and generates a 6-character room code to invite your opponent.</span>
          </div>
          <button id="btn-create-chamber" class="btn-action">ALLOCATE CHAMBER</button>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Enter Existing Chamber (Join)</span>
            <span class="control-sub">Connect to your friend's duel chamber using their room code.</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="inp-chamber-code" class="settings-select" placeholder="CODE (e.g. ASH-101)" style="width: 140px; text-transform: uppercase;" />
            <button id="btn-join-chamber" class="btn-util">ENTER</button>
          </div>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Relay Server Endpoint</span>
            <span class="control-sub">WebSocket endpoint (ensure 'npm run server' is running on port 2567)</span>
          </div>
          <input type="text" id="inp-server-endpoint" class="settings-select" value="${net.serverUrl}" style="width: 220px;" />
        </div>

        <div id="net-status-banner" class="profiler-banner">
          READY TO CONNECT — Start server with 'npm run server' then allocate or join a chamber.
        </div>
      </div>
    `;

    el.querySelector('#inp-server-endpoint')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) net.setServerUrl(val);
    });

    const statusBanner = el.querySelector<HTMLElement>('#net-status-banner');
    const setStatus = (msg: string) => {
      if (statusBanner) statusBanner.textContent = msg;
    };

    el.querySelector('#btn-create-chamber')?.addEventListener('click', async () => {
      setStatus('ALLOCATING CHAMBER ON RELAY SERVER...');
      try {
        await net.createRoom(ctx.config.currentPlayerModel);
        ctx.renderCurrentTab();
      } catch (err) {
        setStatus(`Failed: ${(err as Error).message}. (Check if 'npm run server' is active)`);
      }
    });

    el.querySelector('#btn-join-chamber')?.addEventListener('click', async () => {
      const codeInput = el.querySelector<HTMLInputElement>('#inp-chamber-code');
      const code = codeInput?.value.trim() || '';
      if (!code) {
        setStatus('Please enter a valid 6-character room code.');
        return;
      }

      setStatus(`LOCATING CHAMBER ${code.toUpperCase()}...`);
      const ok = await net.joinRoom(code, ctx.config.currentPlayerModel);
      if (ok) {
        ctx.renderCurrentTab();
      } else {
        setStatus(`Chamber ${code.toUpperCase()} not found or inactive.`);
      }
    });
  }
}
