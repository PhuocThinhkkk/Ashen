import type { DomBindings } from './DomBindings';
import type { RawAnimationStage } from '../track1/RawAnimationStage';
import type { AssetTestCameraManager } from '../camera/AssetTestCameraManager';
import type { CameraPreset } from '../types';

export class RawInspectorUI {
  constructor(
    private readonly dom: DomBindings,
    private readonly stage: RawAnimationStage,
    private readonly cameraMgr: AssetTestCameraManager,
    private readonly onToggleHitbox: () => void,
    private readonly onStepFrame: (frames: number) => void,
    private readonly onTogglePause: () => void,
    private readonly onPlaybackSpeedChange: (speed: number) => void,
    private readonly onPlayerModelChange: (modelId: 'knight' | 'samurai') => Promise<void>,
    private readonly onCaptureAllAnimations: () => Promise<void>,
  ) {}

  public init(): void {
    // 1. Overlay collapse toggle
    this.dom.overlayToggleBtn?.addEventListener('click', () => {
      const isCollapsed = this.dom.overlay?.classList.toggle('collapsed');
      if (this.dom.overlayToggleBtn) {
        this.dom.overlayToggleBtn.textContent = isCollapsed ? 'Show' : 'Hide';
      }
    });

    // 2. Model buttons
    this.dom.playerModelButtons?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.onclick = async () => {
        const modelId = btn.getAttribute('data-model') as 'knight' | 'samurai';
        if (!modelId || modelId === this.stage.diagnostics.player.modelId) return;
        this.dom.playerModelButtons?.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        await this.onPlayerModelChange(modelId);
      };
    });

    // 3. Camera buttons
    this.dom.cameraButtons?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.onclick = () => {
        const preset = btn.getAttribute('data-cam') as CameraPreset;
        this.dom.cameraButtons?.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.cameraMgr.setCamera(preset);
      };
    });

    // 4. Speed buttons
    this.dom.speedButtons?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.onclick = () => {
        const speed = parseFloat(btn.getAttribute('data-speed') || '1.0');
        this.dom.speedButtons?.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.onPlaybackSpeedChange(speed);
      };
    });

    // 5. Capture all button
    this.dom.btnCaptureAll?.addEventListener('click', async () => {
      if (this.dom.btnCaptureAll) this.dom.btnCaptureAll.disabled = true;
      if (this.dom.captureStatus) this.dom.captureStatus.textContent = 'Capturing mid-frames...';
      await this.onCaptureAllAnimations();
      if (this.dom.btnCaptureAll) this.dom.btnCaptureAll.disabled = false;
    });

    // 6. Hitbox & Frame Step Controls
    this.dom.btnToggleHitbox?.addEventListener('click', this.onToggleHitbox);
    this.dom.btnStepPrev?.addEventListener('click', () => this.onStepFrame(-1));
    this.dom.btnPlayPause?.addEventListener('click', this.onTogglePause);
    this.dom.btnStepNext?.addEventListener('click', () => this.onStepFrame(1));
  }

  public populatePlayerButtons(): void {
    if (!this.dom.playerAnimButtons) return;
    this.dom.playerAnimButtons.innerHTML = '';

    for (const clip of this.stage.playerRawClips) {
      const btn = document.createElement('button');
      btn.className = 'btn-player';
      btn.setAttribute('data-clip', clip.name);
      btn.textContent = clip.name;
      if (clip.name === this.stage.diagnostics.player.activeClip) {
        btn.classList.add('active');
      }
      btn.onclick = () => {
        this.stage.playPlayerAnimation(clip.name);
        this.updateActiveClipLabels();
      };
      this.dom.playerAnimButtons.appendChild(btn);
    }
  }

  public populateBossButtons(): void {
    if (!this.dom.bossAnimButtons) return;
    this.dom.bossAnimButtons.innerHTML = '';

    for (const clip of this.stage.bossRawClips) {
      const btn = document.createElement('button');
      btn.className = 'btn-boss';
      btn.setAttribute('data-clip', clip.name);
      btn.textContent = clip.name;
      if (clip.name === this.stage.diagnostics.boss.activeClip) {
        btn.classList.add('active');
      }
      btn.onclick = () => {
        this.stage.playBossAnimation(clip.name);
        this.updateActiveClipLabels();
      };
      this.dom.bossAnimButtons.appendChild(btn);
    }
  }

  public updateActiveClipLabels(): void {
    if (this.dom.playerActiveLabel) {
      this.dom.playerActiveLabel.textContent = this.stage.diagnostics.player.activeClip;
    }
    if (this.dom.bossActiveLabel) {
      this.dom.bossActiveLabel.textContent = this.stage.diagnostics.boss.activeClip;
    }

    this.dom.playerAnimButtons?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-clip') === this.stage.diagnostics.player.activeClip);
    });

    this.dom.bossAnimButtons?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-clip') === this.stage.diagnostics.boss.activeClip);
    });
  }

  public updateDiagnosticsInfo(): void {
    if (this.dom.playerInfo) {
      this.dom.playerInfo.innerHTML = `<strong>Player (${this.stage.diagnostics.player.modelId}):</strong> Height ${this.stage.diagnostics.player.height}m | Bones: ${this.stage.diagnostics.player.bonesCount} | Clips: ${this.stage.diagnostics.player.clips.length}`;
    }
    if (this.dom.bossInfo) {
      this.dom.bossInfo.innerHTML = `<strong>Boss (${this.stage.diagnostics.boss.modelId}):</strong> Height ${this.stage.diagnostics.boss.height}m | Bones: ${this.stage.diagnostics.boss.bonesCount} | Clips: ${this.stage.diagnostics.boss.clips.length}`;
    }
    if (this.dom.weaponInfo) {
      this.dom.weaponInfo.innerHTML = `<strong>Weapon:</strong> Socketed to <span class="status-ok">${this.stage.playerHandBone ? this.stage.playerHandBone.name : 'NONE'}</span>`;
    }
  }
}
