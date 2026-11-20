import type { SettingsManager } from '../../systems/SettingsManager';
import type { PerformanceProfiler } from '../../systems/PerformanceProfiler';

export interface ModelOption {
  id: string;
  name: string;
}

export interface UnifiedSettingsModalConfig {
  playerModels: ModelOption[];
  currentPlayerModel: string;
  onPlayerModelChange: (modelId: string) => Promise<void> | void;
  bossModels: ModelOption[];
  currentBossModel: string;
  onBossModelChange: (modelId: string) => Promise<void> | void;
  onResetTrial: () => void;
  onToggleHitboxDebug: (visible?: boolean) => boolean;
}

export type SettingsTabId =
  | 'general'
  | 'graphics'
  | 'vfx'
  | 'performance'
  | 'models'
  | 'gameplay'
  | 'multiplayer'
  | 'audio';

export interface TabRenderContext {
  container: HTMLElement;
  config: UnifiedSettingsModalConfig;
  settingsManager: SettingsManager;
  profiler: PerformanceProfiler;
  icons: Record<string, string>;
  closeModal: () => void;
  renderCurrentTab: () => void;
  switchTab: (tab: SettingsTabId) => void;
}
