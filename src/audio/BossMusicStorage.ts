import {
  type BossMusicPreset,
  DEFAULT_PROCEDURAL_PRESET,
  BUILTIN_PROCEDURAL_ID,
} from './types';

const DB_NAME = 'SoulsBrowserAudioDB';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio_files';
const PRESETS_STORAGE_KEY = 'ashen_souls_boss_music_presets_v1';

class BossMusicStorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          db.createObjectStore(AUDIO_STORE);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open audio IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  public async saveAudioBinary(key: string, data: ArrayBuffer): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      const store = tx.objectStore(AUDIO_STORE);
      const req = store.put(data, key);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Failed to save audio binary: ${key}`));
    });
  }

  public async getAudioBinary(key: string): Promise<ArrayBuffer | null> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE, 'readonly');
        const store = tx.objectStore(AUDIO_STORE);
        const req = store.get(key);

        req.onsuccess = () => {
          resolve((req.result as ArrayBuffer) || null);
        };
        req.onerror = () => reject(req.error || new Error(`Failed to retrieve audio binary: ${key}`));
      });
    } catch {
      return null;
    }
  }

  public async deleteAudioBinary(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(AUDIO_STORE, 'readwrite');
        const store = tx.objectStore(AUDIO_STORE);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore if not present
    }
  }

  public getPresets(): BossMusicPreset[] {
    const defaultList: BossMusicPreset[] = [DEFAULT_PROCEDURAL_PRESET];
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaultList;
    }

    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (!raw) return defaultList;
      const parsed: BossMusicPreset[] = JSON.parse(raw);
      // Ensure built-in preset is always present
      const hasBuiltIn = parsed.some((p) => p.id === BUILTIN_PROCEDURAL_ID);
      return hasBuiltIn ? parsed : [DEFAULT_PROCEDURAL_PRESET, ...parsed];
    } catch {
      return defaultList;
    }
  }

  public getPresetById(id: string): BossMusicPreset | null {
    if (id === BUILTIN_PROCEDURAL_ID) {
      return DEFAULT_PROCEDURAL_PRESET;
    }
    const presets = this.getPresets();
    return presets.find((p) => p.id === id) || null;
  }

  public savePreset(preset: BossMusicPreset): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const presets = this.getPresets();
      const existingIdx = presets.findIndex((p) => p.id === preset.id);
      if (existingIdx >= 0) {
        presets[existingIdx] = preset;
      } else {
        presets.push(preset);
      }
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }

  public async deletePreset(id: string): Promise<void> {
    if (id === BUILTIN_PROCEDURAL_ID) return; // Cannot delete built-in
    const preset = this.getPresetById(id);
    if (preset) {
      if (preset.config.mode === 'single') {
        if (preset.config.fileKey) {
          await this.deleteAudioBinary(preset.config.fileKey);
        }
      } else {
        if (preset.config.phase1FileKey) {
          await this.deleteAudioBinary(preset.config.phase1FileKey);
        }
        if (preset.config.phase2FileKey) {
          await this.deleteAudioBinary(preset.config.phase2FileKey);
        }
      }
    }

    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const presets = this.getPresets().filter((p) => p.id !== id);
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch {
      // Storage unavailable
    }
  }
}

export const BossMusicStorage = new BossMusicStorageManager();
