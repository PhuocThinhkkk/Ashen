import { type RawBindings, getRawBindings } from './bindings/RawBindings';
import { type DuelBindings, getDuelBindings } from './bindings/DuelBindings';
import { type SocketBindings, getSocketBindings } from './bindings/SocketBindings';
import { type MusicBindings, getMusicBindings } from './bindings/MusicBindings';

export interface WindowBindings {
  btnToggleWin1: HTMLButtonElement | null;
  btnToggleWin2: HTMLButtonElement | null;
  btnToggleWin3: HTMLButtonElement | null;
  btnToggleWin4: HTMLButtonElement | null;
  winRawAnim: HTMLElement | null;
  winCombatDuel: HTMLElement | null;
  winWeaponOffsets: HTMLElement | null;
  winBossMusic: HTMLElement | null;
  btnMinWin2: HTMLButtonElement | null;
  btnMinWin3: HTMLButtonElement | null;
  btnMinWin4: HTMLButtonElement | null;
}

export interface DomBindings
  extends RawBindings,
    DuelBindings,
    SocketBindings,
    MusicBindings,
    WindowBindings {
  canvas: HTMLCanvasElement;
}

export function getDomBindings(): DomBindings {
  const windowBindings: WindowBindings = {
    btnToggleWin1: document.querySelector<HTMLButtonElement>('#btn-toggle-win-1'),
    btnToggleWin2: document.querySelector<HTMLButtonElement>('#btn-toggle-win-2'),
    btnToggleWin3: document.querySelector<HTMLButtonElement>('#btn-toggle-win-3'),
    btnToggleWin4: document.querySelector<HTMLButtonElement>('#btn-toggle-win-4'),
    winRawAnim:
      document.querySelector<HTMLElement>('#win-raw-anim') ||
      document.querySelector<HTMLElement>('#overlay'),
    winCombatDuel: document.querySelector<HTMLElement>('#win-combat-duel'),
    winWeaponOffsets: document.querySelector<HTMLElement>('#win-weapon-offsets'),
    winBossMusic: document.querySelector<HTMLElement>('#win-boss-music'),
    btnMinWin2: document.querySelector<HTMLButtonElement>('#btn-min-win-2'),
    btnMinWin3: document.querySelector<HTMLButtonElement>('#btn-min-win-3'),
    btnMinWin4: document.querySelector<HTMLButtonElement>('#btn-min-win-4'),
  };

  return {
    canvas: document.querySelector<HTMLCanvasElement>('#test-canvas')!,
    ...getRawBindings(),
    ...windowBindings,
    ...getDuelBindings(),
    ...getSocketBindings(),
    ...getMusicBindings(),
  };
}
