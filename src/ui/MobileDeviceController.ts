export interface MobileDeviceControllerOptions {
  onRestart?: () => void;
}

export class MobileDeviceController {
  private fullscreenBtn: HTMLButtonElement | null = null;
  private quickRestartBtn: HTMLButtonElement | null = null;
  private orientationOverlay: HTMLElement | null = null;
  private orientationFsBtn: HTMLButtonElement | null = null;
  private orientationDismissBtn: HTMLButtonElement | null = null;

  private isPortraitDismissed = false;
  private options: MobileDeviceControllerOptions;

  constructor(options: MobileDeviceControllerOptions = {}) {
    this.options = options;
    this.initElements();
    this.bindEvents();
    this.detectTouchDevice();
    this.updateOrientationState();
    this.updateFullscreenUI();
  }

  private initElements(): void {
    this.fullscreenBtn = document.querySelector<HTMLButtonElement>('#fullscreen-btn');
    this.quickRestartBtn = document.querySelector<HTMLButtonElement>('#quick-restart-btn');
    this.orientationOverlay = document.querySelector<HTMLElement>('#orientation-overlay');
    this.orientationFsBtn = document.querySelector<HTMLButtonElement>('#orientation-fullscreen-btn');
    this.orientationDismissBtn = document.querySelector<HTMLButtonElement>('#orientation-dismiss-btn');
  }

  private bindEvents(): void {
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener('click', () => {
        void this.toggleFullscreen();
      });
    }

    if (this.quickRestartBtn) {
      this.quickRestartBtn.addEventListener('click', () => {
        this.options.onRestart?.();
      });
    }

    if (this.orientationFsBtn) {
      this.orientationFsBtn.addEventListener('click', async () => {
        window.dispatchEvent(new Event('pointerdown'));
        await this.toggleFullscreen(true);
        this.isPortraitDismissed = true;
        this.updateOrientationState();
      });
    }

    if (this.orientationDismissBtn) {
      this.orientationDismissBtn.addEventListener('click', () => {
        window.dispatchEvent(new Event('pointerdown'));
        this.isPortraitDismissed = true;
        this.updateOrientationState();
      });
    }

    window.addEventListener('resize', this.onViewportChange);
    window.addEventListener('orientationchange', this.onViewportChange);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.onFullscreenChange);
  }

  private detectTouchDevice(): void {
    const isTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches;

    if (isTouch) {
      document.body.classList.add('touch-device');
    }
  }

  private readonly onViewportChange = (): void => {
    this.updateOrientationState();
  };

  private readonly onFullscreenChange = (): void => {
    this.updateFullscreenUI();
  };

  public isFullscreen(): boolean {
    return Boolean(
      document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement,
    );
  }

  /**
   * [Purpose]: Requests or exits browser fullscreen mode across vendor prefixes with fallback exception handling.
   * @condition User clicks fullscreen toggle button or triggers orientation prompt tap-to-enter.
   * @param forceEnter Boolean flag forcing fullscreen entry regardless of current fullscreen state.
   * @returns Promise resolving when fullscreen transition completes or catches security/permission errors.
   */
  public async toggleFullscreen(forceEnter = false): Promise<void> {
    const currentlyFs = this.isFullscreen();

    if (!currentlyFs || forceEnter) {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
        mozRequestFullScreen?: () => Promise<void>;
        msRequestFullscreen?: () => Promise<void>;
      };

      try {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          await docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          await docEl.msRequestFullscreen();
        }
      } catch (err) {
        console.warn('[MobileDeviceController] Fullscreen request prevented:', err);
      }

      await this.lockLandscape();
    } else {
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
        mozCancelFullScreen?: () => Promise<void>;
        msExitFullscreen?: () => Promise<void>;
      };

      try {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      } catch (err) {
        console.warn('[MobileDeviceController] Exit fullscreen prevented:', err);
      }
    }

    this.updateFullscreenUI();
  }

  public async lockLandscape(): Promise<void> {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape');
      }
    } catch {
      // Screen orientation lock may not be allowed on all platforms/browsers
    }
  }

  private updateFullscreenUI(): void {
    if (!this.fullscreenBtn) return;
    const isFs = this.isFullscreen();

    const enterPath = this.fullscreenBtn.querySelector<SVGElement>('.fs-enter-path');
    const exitPath = this.fullscreenBtn.querySelector<SVGElement>('.fs-exit-path');
    const labelSpan = this.fullscreenBtn.querySelector<HTMLElement>('.btn-text');

    if (enterPath && exitPath) {
      if (isFs) {
        enterPath.classList.add('hidden');
        exitPath.classList.remove('hidden');
      } else {
        enterPath.classList.remove('hidden');
        exitPath.classList.add('hidden');
      }
    }

    if (labelSpan) {
      labelSpan.textContent = isFs ? 'EXIT FS' : 'FULLSCREEN';
    }
  }

  /**
   * [Purpose]: Evaluates viewport orientation and touch/viewport width constraints to toggle portrait warning overlay.
   * @condition Fired on window resize, orientationchange events, and after user dismisses portrait banner.
   * @param none Inspects window dimensions, pointer media query, and isPortraitDismissed flag.
   * @returns Toggles 'hidden' class on orientationOverlay DOM element based on orientation checks.
   */
  public updateOrientationState(): void {
    if (!this.orientationOverlay) return;

    const isTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches;

    const isPortrait = window.innerHeight > window.innerWidth;
    const isMobileWidth = window.innerWidth <= 920;

    // Show prompt if portrait on touch/narrow screen, unless dismissed
    if (isPortrait && (isTouch || isMobileWidth) && !this.isPortraitDismissed) {
      this.orientationOverlay.classList.remove('hidden');
    } else {
      this.orientationOverlay.classList.add('hidden');
    }
  }

  public dispose(): void {
    window.removeEventListener('resize', this.onViewportChange);
    window.removeEventListener('orientationchange', this.onViewportChange);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.onFullscreenChange);
  }
}
