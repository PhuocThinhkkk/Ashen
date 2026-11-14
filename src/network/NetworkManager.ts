import { Client, Room } from 'colyseus.js';

export interface PlayerSyncData {
  x: number;
  y: number;
  z: number;
  rotY: number;
  velX: number;
  velZ: number;
  state: string;
  actionName: string;
  attackPhase: string;
  isInvulnerable: boolean;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
}

export interface RemoteHitData {
  attackerSessionId: string;
  targetSessionId: string;
  damage: number;
  isHeavy: boolean;
  hitPoint: { x: number; y: number; z: number };
  hitDir: { x: number; y: number; z: number };
}

export interface LobbyPlayer {
  sessionId: string;
  modelId: string;
  isHost: boolean;
  isReady: boolean;
  hp: number;
}

export type NetworkEventCallback<T> = (data: T) => void;

export class NetworkManager {
  private static instance: NetworkManager | null = null;
  private client: Client | null = null;
  private room: Room | null = null;

  public isConnected = false;
  public roomCode = '';
  public isHost = false;
  public mySessionId = '';
  public serverUrl = '';

  // Event Listeners
  public onLobbyUpdate?: (players: LobbyPlayer[]) => void;
  public onMatchStart?: (data: { p1SessionId: string; p2SessionId: string | null }) => void;
  public onRemoteUpdate?: (data: PlayerSyncData & { sessionId: string }) => void;
  public onCombatHit?: (hitData: RemoteHitData) => void;
  public onMatchOver?: (data: { winnerSessionId: string }) => void;
  public onOpponentDisconnect?: () => void;
  public onStatusChange?: (status: string) => void;
  public onError?: (error: string) => void;

  constructor() {
    const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
    const port = 2567;
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.serverUrl = `${protocol}//${host}:${port}`;
  }

  public static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  public getClient(): Client {
    if (!this.client) {
      this.client = new Client(this.serverUrl);
    }
    return this.client;
  }

  public setServerUrl(url: string): void {
    this.serverUrl = url;
    this.client = new Client(this.serverUrl);
  }

  /**
   * Creates a new multiplayer 1v1 duel room and returns the 6-character room code.
   */
  public async createRoom(modelId = 'knight'): Promise<string> {
    this.leaveRoom();
    this.onStatusChange?.('ALLOCATING SANCTUARY CHAMBER...');

    try {
      const client = this.getClient();
      this.room = await client.create('souls_room', { modelId });
      this.setupRoomListeners(this.room);

      this.isHost = true;
      this.mySessionId = this.room.sessionId;
      this.isConnected = true;

      // Extract generated room code from state or metadata
      const rawCode = (this.room as unknown as { metadata?: { roomCode?: string } }).metadata?.roomCode ||
                      (this.room.state as unknown as { roomCode?: string })?.roomCode ||
                      'CHAMBER';
      this.roomCode = String(rawCode);
      this.onStatusChange?.(`CHAMBER READY: ${this.roomCode}`);
      return this.roomCode;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onError?.(`Failed to create chamber: ${msg}. (Ensure "npm run server" is running on port 2567)`);
      this.onStatusChange?.('SERVER UNREACHABLE');
      throw err;
    }
  }

  /**
   * Joins an existing room via its 6-character invite code.
   */
  public async joinRoom(roomCode: string, modelId = 'samurai'): Promise<boolean> {
    this.leaveRoom();
    const cleanCode = roomCode.toUpperCase().trim();
    this.onStatusChange?.(`LOCATING CHAMBER ${cleanCode}...`);

    try {
      // 1. Resolve room code to Colyseus roomId via HTTP lookup
      const httpProtocol = this.serverUrl.startsWith('wss') ? 'https:' : 'http:';
      const host = this.serverUrl.replace(/^(ws|wss):\/\//, '');
      const lookupUrl = `${httpProtocol}//${host}/match/code?code=${encodeURIComponent(cleanCode)}`;

      const res = await fetch(lookupUrl);
      if (!res.ok) {
        throw new Error(`Chamber code "${cleanCode}" not found or inactive.`);
      }

      const info = await res.json();
      if (!info.roomId) {
        throw new Error('Chamber resolution returned empty roomId.');
      }

      // 2. Connect to Colyseus Room using resolved roomId
      const client = this.getClient();
      this.room = await client.joinById(info.roomId, { modelId });
      this.setupRoomListeners(this.room);

      this.isHost = false;
      this.mySessionId = this.room.sessionId;
      this.roomCode = cleanCode;
      this.isConnected = true;

      this.onStatusChange?.(`CONNECTED TO CHAMBER: ${cleanCode}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.onError?.(msg);
      this.onStatusChange?.('CONNECTION FAILED');
      return false;
    }
  }

  private setupRoomListeners(room: Room): void {
    // 1. State changes & player list sync
    room.state.players.onAdd = () => this.syncLobbyPlayers();
    room.state.players.onRemove = () => this.syncLobbyPlayers();
    room.state.players.onChange = () => this.syncLobbyPlayers();

    // 2. Room messages
    room.onMessage('MATCH_STARTED', (data: { p1SessionId: string; p2SessionId: string | null }) => {
      this.onStatusChange?.('COMBAT INITIATED');
      this.onMatchStart?.(data);
    });

    room.onMessage('REMOTE_PLAYER_UPDATE', (data: PlayerSyncData & { sessionId: string }) => {
      this.onRemoteUpdate?.(data);
    });

    room.onMessage('COMBAT_HIT_RELAY', (data: RemoteHitData) => {
      this.onCombatHit?.(data);
    });

    room.onMessage('MATCH_OVER', (data: { winnerSessionId: string }) => {
      this.onStatusChange?.('DUEL CONCLUDED');
      this.onMatchOver?.(data);
    });

    room.onMessage('REMATCH_STARTED', (data: { p1SessionId: string; p2SessionId: string | null }) => {
      this.onStatusChange?.('REMATCH TRIAL INITIATED');
      this.onMatchStart?.(data);
    });

    room.onMessage('OPPONENT_DISCONNECTED', () => {
      this.onStatusChange?.('OPPONENT DISCONNECTED');
      this.onOpponentDisconnect?.();
    });

    room.onError((code, message) => {
      console.warn(`[NetworkManager] Room error (${code}):`, message);
      this.onError?.(`Network error: ${message}`);
    });

    room.onLeave((code) => {
      console.log(`[NetworkManager] Left room (${code})`);
      this.isConnected = false;
      this.room = null;
      this.onStatusChange?.('DISCONNECTED');
    });
  }

  private syncLobbyPlayers(): void {
    if (!this.room) return;
    const list: LobbyPlayer[] = [];
    this.room.state.players.forEach((p: LobbyPlayer, sessionId: string) => {
      list.push({
        sessionId,
        modelId: p.modelId,
        isHost: p.isHost,
        isReady: p.isReady,
        hp: p.hp,
      });
    });
    this.onLobbyUpdate?.(list);
  }

  public setReady(isReady: boolean): void {
    if (this.room) {
      this.room.send('SET_READY', { isReady });
    }
  }

  public setModel(modelId: string): void {
    if (this.room) {
      this.room.send('SET_MODEL', { modelId });
    }
  }

  public startMatch(): void {
    if (this.room && this.isHost) {
      this.room.send('START_MATCH', {});
    }
  }

  public sendPlayerState(data: PlayerSyncData): void {
    if (this.room && this.isConnected) {
      this.room.send('PLAYER_STATE', data);
    }
  }

  public sendCombatHit(hitData: {
    targetSessionId: string;
    damage: number;
    isHeavy: boolean;
    hitPoint: { x: number; y: number; z: number };
    hitDir: { x: number; y: number; z: number };
  }): void {
    if (this.room && this.isConnected) {
      this.room.send('COMBAT_HIT', hitData);
    }
  }

  public rematch(): void {
    if (this.room && this.isConnected) {
      this.room.send('REMATCH', {});
    }
  }

  public leaveRoom(): void {
    if (this.room) {
      try {
        this.room.leave();
      } catch {
        // Ignored
      }
      this.room = null;
    }
    this.isConnected = false;
    this.isHost = false;
    this.roomCode = '';
  }
}
