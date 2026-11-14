import {
  DEFAULT_PLAYER_WEAPON_SOCKET,
  DEFAULT_BOSS_WEAPON_SOCKET,
  saveSocketConfig,
  applyWeaponSocketTransform,
} from '../../combat/WeaponSocketConfig';
import type { RawAnimationStage } from '../track1/RawAnimationStage';
import type { DomBindings } from './DomBindings';

export class WeaponSocketGUI {
  private activeTab: 'player' | 'boss' = 'player';

  constructor(
    private readonly stage: RawAnimationStage,
    private readonly dom: DomBindings,
  ) {}

  public init(): void {
    // 1. Tab Switching
    this.dom.tabSocketPlayer?.addEventListener('click', () => {
      this.activeTab = 'player';
      this.dom.tabSocketPlayer?.classList.add('active');
      this.dom.tabSocketBoss?.classList.remove('active');
      this.syncInputsFromSocket();
    });

    this.dom.tabSocketBoss?.addEventListener('click', () => {
      this.activeTab = 'boss';
      this.dom.tabSocketBoss?.classList.add('active');
      this.dom.tabSocketPlayer?.classList.remove('active');
      this.syncInputsFromSocket();
    });

    // 2. Wire Slider & Range Inputs
    const onInputChange = () => {
      this.readInputsToSocket();
    };

    const inputs = [
      this.dom.inpPosX,
      this.dom.inpPosY,
      this.dom.inpPosZ,
      this.dom.inpRotX,
      this.dom.inpRotY,
      this.dom.inpRotZ,
      this.dom.inpScale,
    ];

    inputs.forEach((inp) => {
      inp?.addEventListener('input', onInputChange);
      inp?.addEventListener('change', onInputChange);
    });

    // 3. Quick Grip Presets
    this.dom.btnPresetKnight2h?.addEventListener('click', () => {
      this.stage.playerSocket.posX = 1.8;
      this.stage.playerSocket.posY = 12.0;
      this.stage.playerSocket.posZ = -0.5;
      this.stage.playerSocket.rotX = 85.0;
      this.stage.playerSocket.rotY = 5.0;
      this.stage.playerSocket.rotZ = -10.0;
      if (this.stage.axeObject) applyWeaponSocketTransform(this.stage.axeObject, this.stage.playerSocket);
      saveSocketConfig('player', this.stage.playerSocket);
      this.syncInputsFromSocket();
    });

    this.dom.btnPresetBoss2h?.addEventListener('click', () => {
      this.stage.bossSocket.posX = 2.5;
      this.stage.bossSocket.posY = 16.0;
      this.stage.bossSocket.posZ = -1.0;
      this.stage.bossSocket.rotX = 85.0;
      this.stage.bossSocket.rotY = 5.0;
      this.stage.bossSocket.rotZ = -10.0;
      if (this.stage.bossSwordGroup) applyWeaponSocketTransform(this.stage.bossSwordGroup, this.stage.bossSocket);
      saveSocketConfig('boss', this.stage.bossSocket);
      this.syncInputsFromSocket();
    });

    this.dom.btnFlipPlayerBlade?.addEventListener('click', () => {
      this.stage.playerSocket.rotX =
        this.stage.playerSocket.rotX > 0
          ? this.stage.playerSocket.rotX - 180
          : this.stage.playerSocket.rotX + 180;
      if (this.stage.axeObject) applyWeaponSocketTransform(this.stage.axeObject, this.stage.playerSocket);
      saveSocketConfig('player', this.stage.playerSocket);
      this.syncInputsFromSocket();
    });

    this.dom.btnFlipBossBlade?.addEventListener('click', () => {
      this.stage.bossSocket.rotX =
        this.stage.bossSocket.rotX > 0
          ? this.stage.bossSocket.rotX - 180
          : this.stage.bossSocket.rotX + 180;
      if (this.stage.bossSwordGroup) applyWeaponSocketTransform(this.stage.bossSwordGroup, this.stage.bossSocket);
      saveSocketConfig('boss', this.stage.bossSocket);
      this.syncInputsFromSocket();
    });

    this.dom.btnResetSocketConfig?.addEventListener('click', () => {
      Object.assign(this.stage.playerSocket, DEFAULT_PLAYER_WEAPON_SOCKET);
      Object.assign(this.stage.bossSocket, DEFAULT_BOSS_WEAPON_SOCKET);
      saveSocketConfig('player', this.stage.playerSocket);
      saveSocketConfig('boss', this.stage.bossSocket);
      if (this.stage.axeObject) applyWeaponSocketTransform(this.stage.axeObject, this.stage.playerSocket);
      if (this.stage.bossSwordGroup) applyWeaponSocketTransform(this.stage.bossSwordGroup, this.stage.bossSocket);
      this.syncInputsFromSocket();
    });

    // 4. Save & Export Buttons
    this.dom.btnSavePrintConfig?.addEventListener('click', () => this.printAndSaveConfig());
    this.dom.btnCopyConfigTs?.addEventListener('click', () => this.printAndSaveConfig());

    this.dom.btnCloseCodeBox?.addEventListener('click', () => {
      if (this.dom.socketCodeContainer) this.dom.socketCodeContainer.style.display = 'none';
    });

    // Initial sync
    this.syncInputsFromSocket();
  }

  public syncInputsFromSocket(): void {
    const socket = this.activeTab === 'player' ? this.stage.playerSocket : this.stage.bossSocket;

    if (this.dom.inpPosX) this.dom.inpPosX.value = String(socket.posX);
    if (this.dom.inpPosY) this.dom.inpPosY.value = String(socket.posY);
    if (this.dom.inpPosZ) this.dom.inpPosZ.value = String(socket.posZ);
    if (this.dom.inpRotX) this.dom.inpRotX.value = String(socket.rotX);
    if (this.dom.inpRotY) this.dom.inpRotY.value = String(socket.rotY);
    if (this.dom.inpRotZ) this.dom.inpRotZ.value = String(socket.rotZ);
    if (this.dom.inpScale) this.dom.inpScale.value = String(socket.scale);

    if (this.dom.valPosX) this.dom.valPosX.textContent = Number(socket.posX).toFixed(1);
    if (this.dom.valPosY) this.dom.valPosY.textContent = Number(socket.posY).toFixed(1);
    if (this.dom.valPosZ) this.dom.valPosZ.textContent = Number(socket.posZ).toFixed(1);
    if (this.dom.valRotX) this.dom.valRotX.textContent = `${Math.round(socket.rotX)}°`;
    if (this.dom.valRotY) this.dom.valRotY.textContent = `${Math.round(socket.rotY)}°`;
    if (this.dom.valRotZ) this.dom.valRotZ.textContent = `${Math.round(socket.rotZ)}°`;
    if (this.dom.valScale) this.dom.valScale.textContent = String(Math.round(socket.scale));
  }

  private readInputsToSocket(): void {
    const socket = this.activeTab === 'player' ? this.stage.playerSocket : this.stage.bossSocket;

    if (this.dom.inpPosX) socket.posX = parseFloat(this.dom.inpPosX.value);
    if (this.dom.inpPosY) socket.posY = parseFloat(this.dom.inpPosY.value);
    if (this.dom.inpPosZ) socket.posZ = parseFloat(this.dom.inpPosZ.value);
    if (this.dom.inpRotX) socket.rotX = parseFloat(this.dom.inpRotX.value);
    if (this.dom.inpRotY) socket.rotY = parseFloat(this.dom.inpRotY.value);
    if (this.dom.inpRotZ) socket.rotZ = parseFloat(this.dom.inpRotZ.value);
    if (this.dom.inpScale) socket.scale = parseFloat(this.dom.inpScale.value);

    if (this.activeTab === 'player') {
      if (this.stage.axeObject) applyWeaponSocketTransform(this.stage.axeObject, this.stage.playerSocket);
      saveSocketConfig('player', this.stage.playerSocket);
    } else {
      if (this.stage.bossSwordGroup) applyWeaponSocketTransform(this.stage.bossSwordGroup, this.stage.bossSocket);
      saveSocketConfig('boss', this.stage.bossSocket);
    }

    if (this.dom.valPosX) this.dom.valPosX.textContent = Number(socket.posX).toFixed(1);
    if (this.dom.valPosY) this.dom.valPosY.textContent = Number(socket.posY).toFixed(1);
    if (this.dom.valPosZ) this.dom.valPosZ.textContent = Number(socket.posZ).toFixed(1);
    if (this.dom.valRotX) this.dom.valRotX.textContent = `${Math.round(socket.rotX)}°`;
    if (this.dom.valRotY) this.dom.valRotY.textContent = `${Math.round(socket.rotY)}°`;
    if (this.dom.valRotZ) this.dom.valRotZ.textContent = `${Math.round(socket.rotZ)}°`;
    if (this.dom.valScale) this.dom.valScale.textContent = String(Math.round(socket.scale));
  }

  public printAndSaveConfig(): string {
    saveSocketConfig('player', this.stage.playerSocket);
    saveSocketConfig('boss', this.stage.bossSocket);
    const code = this.generateExportCode();

    console.log('%cCURRENT WEAPON SOCKET CONFIG', 'color: #ffaa33; font-weight: bold;');
    console.log(code);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }

    if (this.dom.socketCodeContainer && this.dom.socketCodeOutput) {
      this.dom.socketCodeOutput.textContent = code;
      this.dom.socketCodeContainer.style.display = 'block';
    }
    if (this.dom.socketSaveStatus) {
      this.dom.socketSaveStatus.textContent = 'SAVED & PRINTED!';
      this.dom.socketSaveStatus.style.color = '#38d665';
      this.dom.socketSaveStatus.style.borderColor = '#38d665';
      setTimeout(() => {
        if (this.dom.socketSaveStatus) {
          this.dom.socketSaveStatus.textContent = 'SYNCED';
        }
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
