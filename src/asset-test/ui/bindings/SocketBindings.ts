export interface SocketBindings {
  tabSocketPlayer: HTMLButtonElement | null;
  tabSocketBoss: HTMLButtonElement | null;
  tabSocketPotion: HTMLButtonElement | null;
  btnActDrink: HTMLButtonElement | null;
  socketSaveStatus: HTMLElement | null;
  inpPosX: HTMLInputElement | null;
  inpPosY: HTMLInputElement | null;
  inpPosZ: HTMLInputElement | null;
  inpRotX: HTMLInputElement | null;
  inpRotY: HTMLInputElement | null;
  inpRotZ: HTMLInputElement | null;
  inpScale: HTMLInputElement | null;
  valPosX: HTMLElement | null;
  valPosY: HTMLElement | null;
  valPosZ: HTMLElement | null;
  valRotX: HTMLElement | null;
  valRotY: HTMLElement | null;
  valRotZ: HTMLElement | null;
  valScale: HTMLElement | null;
  btnPresetKnight2h: HTMLButtonElement | null;
  btnPresetBoss2h: HTMLButtonElement | null;
  btnFlipPlayerBlade: HTMLButtonElement | null;
  btnFlipBossBlade: HTMLButtonElement | null;
  btnResetSocketConfig: HTMLButtonElement | null;
  btnSavePrintConfig: HTMLButtonElement | null;
  btnCopyConfigTs: HTMLButtonElement | null;
  socketCodeContainer: HTMLElement | null;
  socketCodeOutput: HTMLElement | null;
  btnCloseCodeBox: HTMLButtonElement | null;
}

export function getSocketBindings(): SocketBindings {
  return {
    tabSocketPlayer: document.querySelector<HTMLButtonElement>('#tab-socket-player'),
    tabSocketBoss: document.querySelector<HTMLButtonElement>('#tab-socket-boss'),
    tabSocketPotion: document.querySelector<HTMLButtonElement>('#tab-socket-potion'),
    btnActDrink: document.querySelector<HTMLButtonElement>('#btn-act-drink'),
    socketSaveStatus: document.querySelector<HTMLElement>('#socket-save-status'),
    inpPosX: document.querySelector<HTMLInputElement>('#inp-pos-x'),
    inpPosY: document.querySelector<HTMLInputElement>('#inp-pos-y'),
    inpPosZ: document.querySelector<HTMLInputElement>('#inp-pos-z'),
    inpRotX: document.querySelector<HTMLInputElement>('#inp-rot-x'),
    inpRotY: document.querySelector<HTMLInputElement>('#inp-rot-y'),
    inpRotZ: document.querySelector<HTMLInputElement>('#inp-rot-z'),
    inpScale: document.querySelector<HTMLInputElement>('#inp-scale'),
    valPosX: document.querySelector<HTMLElement>('#val-pos-x'),
    valPosY: document.querySelector<HTMLElement>('#val-pos-y'),
    valPosZ: document.querySelector<HTMLElement>('#val-pos-z'),
    valRotX: document.querySelector<HTMLElement>('#val-rot-x'),
    valRotY: document.querySelector<HTMLElement>('#val-rot-y'),
    valRotZ: document.querySelector<HTMLElement>('#val-rot-z'),
    valScale: document.querySelector<HTMLElement>('#val-scale'),
    btnPresetKnight2h: document.querySelector<HTMLButtonElement>('#btn-preset-knight-2h'),
    btnPresetBoss2h: document.querySelector<HTMLButtonElement>('#btn-preset-boss-2h'),
    btnFlipPlayerBlade: document.querySelector<HTMLButtonElement>('#btn-flip-player-blade'),
    btnFlipBossBlade: document.querySelector<HTMLButtonElement>('#btn-flip-boss-blade'),
    btnResetSocketConfig: document.querySelector<HTMLButtonElement>('#btn-reset-socket-config'),
    btnSavePrintConfig: document.querySelector<HTMLButtonElement>('#btn-save-print-config'),
    btnCopyConfigTs: document.querySelector<HTMLButtonElement>('#btn-copy-config-ts'),
    socketCodeContainer: document.querySelector<HTMLElement>('#socket-code-container'),
    socketCodeOutput: document.querySelector<HTMLElement>('#socket-code-output'),
    btnCloseCodeBox: document.querySelector<HTMLButtonElement>('#btn-close-code-box'),
  };
}
