import GUI, { type Controller } from 'lil-gui';

export type DebugTuning = {
  speed: number;
  dashMultiplier: number;
  acceleration: number;
  cameraLag: number;
  exposure: number;
  maxDpr: number;
};

export type ModelSwitchControls = {
  playerModels: string[];
  currentPlayerModel: string;
  onPlayerModelChange: (modelId: string) => void;
  bossModels: string[];
  currentBossModel: string;
  onBossModelChange: (modelId: string) => void;
};

export class DebugTools {
  private gui: GUI | null = null;
  private playerController: Controller | null = null;
  private bossController: Controller | null = null;
  private modelState = {
    playerModel: 'knight',
    bossModel: 'enemy_2',
  };

  constructor(
    tuning: DebugTuning,
    onChange: () => void,
    modelControls?: ModelSwitchControls,
  ) {
    // Enabled by default in dev mode or whenever ?debug is present
    const enabled =
      Boolean(import.meta.env.DEV) ||
      new URLSearchParams(window.location.search).has('debug');
    if (!enabled) return;

    this.gui = new GUI({ title: 'Game Tuning & Models' });
    this.gui.open();

    this.gui.add(tuning, 'speed', 2, 14, 0.1);
    this.gui.add(tuning, 'dashMultiplier', 1, 3, 0.05);
    this.gui.add(tuning, 'acceleration', 4, 22, 0.1);
    this.gui.add(tuning, 'cameraLag', 0.02, 0.8, 0.01);
    this.gui.add(tuning, 'maxDpr', 1, 2, 0.25).onChange(onChange);
    this.gui.add(tuning, 'exposure', 0.6, 1.8, 0.01).onChange(onChange);

    if (modelControls) {
      this.modelState.playerModel = modelControls.currentPlayerModel;
      this.modelState.bossModel = modelControls.currentBossModel;

      const modelFolder = this.gui.addFolder('Model Selection');
      modelFolder.open();

      this.playerController = modelFolder
        .add(this.modelState, 'playerModel', modelControls.playerModels)
        .name('Player Body')
        .onChange((val: string) => modelControls.onPlayerModelChange(val));

      this.bossController = modelFolder
        .add(this.modelState, 'bossModel', modelControls.bossModels)
        .name('Boss Body')
        .onChange((val: string) => modelControls.onBossModelChange(val));
    }
  }

  public syncModels(playerModelId: string, bossModelId: string): void {
    this.modelState.playerModel = playerModelId;
    this.modelState.bossModel = bossModelId;
    if (this.playerController) {
      this.playerController.updateDisplay();
    }
    if (this.bossController) {
      this.bossController.updateDisplay();
    }
  }

  setHidden(hidden: boolean): void {
    if (!this.gui) return;
    if (hidden) this.gui.hide();
    else this.gui.show();
  }

  dispose(): void {
    this.gui?.destroy();
    this.gui = null;
  }
}
