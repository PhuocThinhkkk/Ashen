import GUI from 'lil-gui';
import {
  DEFAULT_PLAYER_WEAPON_SOCKET,
  DEFAULT_BOSS_WEAPON_SOCKET,
  saveSocketConfig,
  applyWeaponSocketTransform,
} from '../../combat/WeaponSocketConfig';
import type { RawAnimationStage } from '../track1/RawAnimationStage';

export class WeaponSocketGUI {
  private gui: GUI | null = null;

  constructor(private readonly stage: RawAnimationStage) {}

  public init(): void {
    this.gui = new GUI({ title: '⚔️ Weapon Socket Tuning' });
    this.gui.domElement.style.position = 'fixed';
    this.gui.domElement.style.top = '14px';
    this.gui.domElement.style.right = '14px';
    this.gui.domElement.style.zIndex = '90';

    if (window.innerWidth < 850) {
      this.gui.close();
    }

    const syncGUI = () => {
      this.gui?.controllersRecursive().forEach((c) => c.updateDisplay());
    };

    // Knight Player Folder
    const playerFolder = this.gui.addFolder('Knight Sword Socket');
    const updatePlayer = () => {
      if (this.stage.axeObject) {
        applyWeaponSocketTransform(this.stage.axeObject, this.stage.playerSocket);
      }
      saveSocketConfig('player', this.stage.playerSocket);
    };

    playerFolder.add(this.stage.playerSocket, 'posX', -30, 30, 0.1).name('Pos X').onChange(updatePlayer);
    playerFolder.add(this.stage.playerSocket, 'posY', -30, 50, 0.1).name('Pos Y (Palm)').onChange(updatePlayer);
    playerFolder.add(this.stage.playerSocket, 'posZ', -30, 30, 0.1).name('Pos Z').onChange(updatePlayer);
    playerFolder.add(this.stage.playerSocket, 'rotX', -180, 180, 1).name('Rot X°').onChange(updatePlayer);
    playerFolder.add(this.stage.playerSocket, 'rotY', -180, 180, 1).name('Rot Y°').onChange(updatePlayer);
    playerFolder.add(this.stage.playerSocket, 'rotZ', -180, 180, 1).name('Rot Z°').onChange(updatePlayer);
    playerFolder.add(this.stage.playerSocket, 'scale', 5, 80, 1).name('Scale').onChange(updatePlayer);
    playerFolder.open();

    // Titan Boss Folder
    const bossFolder = this.gui.addFolder('Titan Greatsword Socket');
    const updateBoss = () => {
      if (this.stage.bossSwordGroup) {
        applyWeaponSocketTransform(this.stage.bossSwordGroup, this.stage.bossSocket);
      }
      saveSocketConfig('boss', this.stage.bossSocket);
    };

    bossFolder.add(this.stage.bossSocket, 'posX', -50, 50, 0.5).name('Pos X').onChange(updateBoss);
    bossFolder.add(this.stage.bossSocket, 'posY', -50, 80, 0.5).name('Pos Y (Palm)').onChange(updateBoss);
    bossFolder.add(this.stage.bossSocket, 'posZ', -50, 50, 0.5).name('Pos Z').onChange(updateBoss);
    bossFolder.add(this.stage.bossSocket, 'rotX', -180, 180, 1).name('Rot X°').onChange(updateBoss);
    bossFolder.add(this.stage.bossSocket, 'rotY', -180, 180, 1).name('Rot Y°').onChange(updateBoss);
    bossFolder.add(this.stage.bossSocket, 'rotZ', -180, 180, 1).name('Rot Z°').onChange(updateBoss);
    bossFolder.add(this.stage.bossSocket, 'scale', 20, 200, 1).name('Scale').onChange(updateBoss);
    bossFolder.open();

    // Global Actions in GUI
    this.gui.add({ saveAndPrint: () => this.printAndSaveConfig() }, 'saveAndPrint').name('💾 Save & Print Config');
    this.gui.add(
      {
        resetDefaults: () => {
          Object.assign(this.stage.playerSocket, DEFAULT_PLAYER_WEAPON_SOCKET);
          Object.assign(this.stage.bossSocket, DEFAULT_BOSS_WEAPON_SOCKET);
          saveSocketConfig('player', this.stage.playerSocket);
          saveSocketConfig('boss', this.stage.bossSocket);
          updatePlayer();
          updateBoss();
          syncGUI();
        },
      },
      'resetDefaults',
    ).name('↺ Reset Defaults');

    // Wire up overlay preset buttons
    document.querySelector('#btn-preset-knight-2h')?.addEventListener('click', () => {
      this.stage.playerSocket.posX = 1.8;
      this.stage.playerSocket.posY = 12.0;
      this.stage.playerSocket.posZ = -0.5;
      this.stage.playerSocket.rotX = 85.0;
      this.stage.playerSocket.rotY = 5.0;
      this.stage.playerSocket.rotZ = -10.0;
      updatePlayer();
      syncGUI();
    });

    document.querySelector('#btn-preset-boss-2h')?.addEventListener('click', () => {
      this.stage.bossSocket.posX = 2.5;
      this.stage.bossSocket.posY = 16.0;
      this.stage.bossSocket.posZ = -1.0;
      this.stage.bossSocket.rotX = 85.0;
      this.stage.bossSocket.rotY = 5.0;
      this.stage.bossSocket.rotZ = -10.0;
      updateBoss();
      syncGUI();
    });

    document.querySelector('#btn-flip-player-blade')?.addEventListener('click', () => {
      this.stage.playerSocket.rotX =
        this.stage.playerSocket.rotX > 0
          ? this.stage.playerSocket.rotX - 180
          : this.stage.playerSocket.rotX + 180;
      updatePlayer();
      syncGUI();
    });

    document.querySelector('#btn-flip-boss-blade')?.addEventListener('click', () => {
      this.stage.bossSocket.rotX =
        this.stage.bossSocket.rotX > 0
          ? this.stage.bossSocket.rotX - 180
          : this.stage.bossSocket.rotX + 180;
      updateBoss();
      syncGUI();
    });

    document.querySelector('#btn-save-print-config')?.addEventListener('click', () => this.printAndSaveConfig());
    document.querySelector('#btn-copy-config-ts')?.addEventListener('click', () => this.printAndSaveConfig());

    document.querySelector('#btn-reset-socket-config')?.addEventListener('click', () => {
      Object.assign(this.stage.playerSocket, DEFAULT_PLAYER_WEAPON_SOCKET);
      Object.assign(this.stage.bossSocket, DEFAULT_BOSS_WEAPON_SOCKET);
      saveSocketConfig('player', this.stage.playerSocket);
      saveSocketConfig('boss', this.stage.bossSocket);
      updatePlayer();
      updateBoss();
      syncGUI();
    });

    document.querySelector('#btn-close-code-box')?.addEventListener('click', () => {
      const box = document.querySelector<HTMLElement>('#socket-code-container');
      if (box) box.style.display = 'none';
    });
  }

  public printAndSaveConfig(): string {
    saveSocketConfig('player', this.stage.playerSocket);
    saveSocketConfig('boss', this.stage.bossSocket);
    const code = this.generateExportCode();

    console.log('%c⚔️ CURRENT WEAPON SOCKET CONFIG', 'color: #ffaa33; font-weight: bold;');
    console.log(code);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }

    const codeBox = document.querySelector<HTMLElement>('#socket-code-container');
    const codeOutput = document.querySelector<HTMLElement>('#socket-code-output');
    const saveStatus = document.querySelector<HTMLElement>('#socket-save-status');

    if (codeBox && codeOutput) {
      codeOutput.textContent = code;
      codeBox.style.display = 'block';
    }
    if (saveStatus) {
      saveStatus.textContent = 'SAVED & PRINTED!';
      saveStatus.style.color = '#38d665';
      saveStatus.style.borderColor = '#38d665';
      setTimeout(() => {
        saveStatus.textContent = 'SYNCED';
      }, 2500);
    }

    return code;
  }

  private generateExportCode(): string {
    const p = this.stage.playerSocket;
    const b = this.stage.bossSocket;
    return `export const DEFAULT_PLAYER_WEAPON_SOCKET: WeaponSocketTransform = {
  posX: ${Number(p.posX.toFixed(2))},
  posY: ${Number(p.posY.toFixed(2))},
  posZ: ${Number(p.posZ.toFixed(2))},
  rotX: ${Number(p.rotX.toFixed(1))},
  rotY: ${Number(p.rotY.toFixed(1))},
  rotZ: ${Number(p.rotZ.toFixed(1))},
  scale: ${p.scale},
};

export const DEFAULT_BOSS_WEAPON_SOCKET: WeaponSocketTransform = {
  posX: ${Number(b.posX.toFixed(2))},
  posY: ${Number(b.posY.toFixed(2))},
  posZ: ${Number(b.posZ.toFixed(2))},
  rotX: ${Number(b.rotX.toFixed(1))},
  rotY: ${Number(b.rotY.toFixed(1))},
  rotZ: ${Number(b.rotZ.toFixed(1))},
  scale: ${b.scale},
};`;
  }
}
