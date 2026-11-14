import http from 'http';
import { Server, Room } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

// -----------------------------------------------------------------------------
// 1. REPLICATED NETWORK SCHEMAS (Vanilla JS via defineTypes)
// -----------------------------------------------------------------------------
export class PlayerNetworkState extends Schema {
  constructor() {
    super();
    this.sessionId = '';
    this.modelId = 'knight';
    this.isHost = false;
    this.isReady = false;

    // Spatial Transforms (Client-authoritative relay)
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotY = 0;
    this.velX = 0;
    this.velZ = 0;

    // Kinematic & Animation State
    this.state = 'idle';
    this.actionName = 'idle';
    this.attackPhase = 'none';
    this.isInvulnerable = false;

    // Vitals
    this.hp = 100;
    this.maxHp = 100;
    this.stamina = 100;
    this.maxStamina = 100;
  }
}

defineTypes(PlayerNetworkState, {
  sessionId: 'string',
  modelId: 'string',
  isHost: 'boolean',
  isReady: 'boolean',
  x: 'number',
  y: 'number',
  z: 'number',
  rotY: 'number',
  velX: 'number',
  velZ: 'number',
  state: 'string',
  actionName: 'string',
  attackPhase: 'string',
  isInvulnerable: 'boolean',
  hp: 'number',
  maxHp: 'number',
  stamina: 'number',
  maxStamina: 'number',
});

export class RoomNetworkState extends Schema {
  constructor() {
    super();
    this.roomCode = '';
    this.phase = 'LOBBY'; // 'LOBBY' | 'COMBAT' | 'MATCH_OVER'
    this.winnerSessionId = '';
    this.players = new MapSchema();
  }
}

defineTypes(RoomNetworkState, {
  roomCode: 'string',
  phase: 'string',
  winnerSessionId: 'string',
  players: { map: PlayerNetworkState },
});

// Global registry mapping 6-character room code -> Colyseus roomId
const codeToRoomId = new Map();

function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const num = Math.floor(100 + Math.random() * 900);
  const prefix = letters[Math.floor(Math.random() * letters.length)] +
                 letters[Math.floor(Math.random() * letters.length)] +
                 letters[Math.floor(Math.random() * letters.length)];
  return `${prefix}-${num}`;
}

// -----------------------------------------------------------------------------
// 2. LIGHTWEIGHT CLIENT-AUTHORITATIVE COLYSEUS ROOM
// -----------------------------------------------------------------------------
export class SoulsDuelRoom extends Room {
  constructor() {
    super();
    this.maxClients = 2; // Strict 1v1 PvP Duel Room
  }

  onCreate(options) {
    this.setState(new RoomNetworkState());

    // Generate or assign 6-character human friendly room code
    let code = options.roomCode ? String(options.roomCode).toUpperCase().trim() : generateRoomCode();
    while (codeToRoomId.has(code)) {
      code = generateRoomCode();
    }

    this.state.roomCode = code;
    codeToRoomId.set(code, this.roomId);
    this.setMetadata({ roomCode: code });

    console.log(`[SoulsDuelRoom] Created Chamber with code: ${code} (Room ID: ${this.roomId})`);

    // 1. Ready Check
    this.onMessage('SET_READY', (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isReady = Boolean(message.isReady);
        console.log(`[SoulsDuelRoom] Player ${client.sessionId} ready: ${player.isReady}`);
      }
    });

    // 2. Character Model Switch
    this.onMessage('SET_MODEL', (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player && message.modelId) {
        player.modelId = String(message.modelId);
        console.log(`[SoulsDuelRoom] Player ${client.sessionId} selected model: ${player.modelId}`);
      }
    });

    // 3. Match Start (Host initiates when both ready)
    this.onMessage('START_MATCH', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player && player.isHost) {
        this.state.phase = 'COMBAT';
        this.state.winnerSessionId = '';

        // Assign spawn positions along arena Z axis
        const sessions = Array.from(this.state.players.keys());
        const p1 = this.state.players.get(sessions[0]);
        const p2 = sessions[1] ? this.state.players.get(sessions[1]) : null;

        if (p1) {
          p1.x = 0; p1.y = 0; p1.z = 7.0; p1.rotY = 0;
          p1.hp = p1.maxHp; p1.stamina = p1.maxStamina;
          p1.state = 'idle';
        }
        if (p2) {
          p2.x = 0; p2.y = 0; p2.z = -7.0; p2.rotY = Math.PI;
          p2.hp = p2.maxHp; p2.stamina = p2.maxStamina;
          p2.state = 'idle';
        }

        this.broadcast('MATCH_STARTED', {
          p1SessionId: sessions[0],
          p2SessionId: sessions[1] || null,
        });
        console.log(`[SoulsDuelRoom] Match started in room ${this.state.roomCode}!`);
      }
    });

    // 4. Client-Authoritative Transform & Animation State Relay
    this.onMessage('PLAYER_STATE', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player && this.state.phase === 'COMBAT') {
        player.x = data.x ?? player.x;
        player.y = data.y ?? player.y;
        player.z = data.z ?? player.z;
        player.rotY = data.rotY ?? player.rotY;
        player.velX = data.velX ?? player.velX;
        player.velZ = data.velZ ?? player.velZ;
        player.state = data.state ?? player.state;
        player.actionName = data.actionName ?? player.actionName;
        player.attackPhase = data.attackPhase ?? player.attackPhase;
        player.isInvulnerable = Boolean(data.isInvulnerable);
        player.hp = data.hp ?? player.hp;
        player.stamina = data.stamina ?? player.stamina;

        // Relay directly to other client for low-latency interpolation
        this.broadcast('REMOTE_PLAYER_UPDATE', {
          sessionId: client.sessionId,
          ...data,
        }, { except: client });
      }
    });

    // 5. Combat Hit Event Relay (Client-Authoritative damage claim)
    this.onMessage('COMBAT_HIT', (client, hitData) => {
      // Broadcast to victim and all clients to trigger damage, blood, and sparks
      this.broadcast('COMBAT_HIT_RELAY', {
        attackerSessionId: client.sessionId,
        targetSessionId: hitData.targetSessionId,
        damage: hitData.damage,
        isHeavy: Boolean(hitData.isHeavy),
        hitPoint: hitData.hitPoint,
        hitDir: hitData.hitDir,
      });

      // Update target player HP in schema if present
      const victim = this.state.players.get(hitData.targetSessionId);
      if (victim) {
        victim.hp = Math.max(0, victim.hp - hitData.damage);
        if (victim.hp <= 0 && this.state.phase === 'COMBAT') {
          this.state.phase = 'MATCH_OVER';
          this.state.winnerSessionId = client.sessionId;
          this.broadcast('MATCH_OVER', {
            winnerSessionId: client.sessionId,
            defeatedSessionId: victim.sessionId,
          });
          console.log(`[SoulsDuelRoom] Match won by ${client.sessionId}!`);
        }
      }
    });

    // 6. Rematch Request
    this.onMessage('REMATCH', () => {
      this.state.phase = 'COMBAT';
      this.state.winnerSessionId = '';
      const sessions = Array.from(this.state.players.keys());
      const p1 = this.state.players.get(sessions[0]);
      const p2 = sessions[1] ? this.state.players.get(sessions[1]) : null;

      if (p1) {
        p1.x = 0; p1.y = 0; p1.z = 7.0; p1.rotY = 0;
        p1.hp = p1.maxHp; p1.stamina = p1.maxStamina;
        p1.state = 'idle';
      }
      if (p2) {
        p2.x = 0; p2.y = 0; p2.z = -7.0; p2.rotY = Math.PI;
        p2.hp = p2.maxHp; p2.stamina = p2.maxStamina;
        p2.state = 'idle';
      }

      this.broadcast('REMATCH_STARTED', {
        p1SessionId: sessions[0],
        p2SessionId: sessions[1] || null,
      });
      console.log(`[SoulsDuelRoom] Rematch started in room ${this.state.roomCode}!`);
    });
  }

  onJoin(client, options) {
    const isHost = this.state.players.size === 0;
    const player = new PlayerNetworkState();
    player.sessionId = client.sessionId;
    player.modelId = options.modelId || (isHost ? 'knight' : 'samurai');
    player.isHost = isHost;
    player.isReady = isHost; // Host auto-ready

    // Default neutral coordinates
    player.x = 0;
    player.y = 0;
    player.z = isHost ? 7.0 : -7.0;
    player.rotY = isHost ? 0 : Math.PI;

    this.state.players.set(client.sessionId, player);
    console.log(`[SoulsDuelRoom] Client ${client.sessionId} joined as ${isHost ? 'Host' : 'Challenger'}`);
  }

  onLeave(client) {
    console.log(`[SoulsDuelRoom] Client ${client.sessionId} left.`);
    this.state.players.delete(client.sessionId);

    if (this.state.phase === 'COMBAT') {
      this.state.phase = 'MATCH_OVER';
      const remaining = Array.from(this.state.players.keys())[0];
      if (remaining) {
        this.state.winnerSessionId = remaining;
      }
      this.broadcast('OPPONENT_DISCONNECTED', { sessionId: client.sessionId });
    }
  }

  onDispose() {
    if (this.state.roomCode) {
      codeToRoomId.delete(this.state.roomCode);
    }
    console.log(`[SoulsDuelRoom] Chamber ${this.state.roomCode} disposed.`);
  }
}

// -----------------------------------------------------------------------------
// 3. HTTP + WEBSOCKET SERVER BOOTSTRAP
// -----------------------------------------------------------------------------
const port = Number(process.env.PORT || 2567);
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/match/code') {
    const code = url.searchParams.get('code')?.toUpperCase().trim();
    const roomId = codeToRoomId.get(code);
    if (roomId) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ found: true, roomId, code }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ found: false, error: 'Chamber code not found or expired.' }));
    }
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', activeRooms: codeToRoomId.size }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Ashen Souls Multiplayer Colyseus Relay Server Active\n');
});

const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
  }),
});

gameServer.define('souls_room', SoulsDuelRoom);

server.listen(port, () => {
  console.log(`=======================================================`);
  console.log(`  ASHEN SOULS MULTIPLAYER RELAY SERVER ONLINE`);
  console.log(`  WebSocket Address: ws://localhost:${port}`);
  console.log(`  HTTP Lookup API:   http://localhost:${port}/match/code?code=ABC-123`);
  console.log(`=======================================================`);
});
