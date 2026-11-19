import * as THREE from 'three';
import { RemotePlayerProxy } from '../network/RemotePlayerProxy';
import type { RemoteHitData } from '../network/NetworkManager';
import type { Game } from './Game';

export class GameMultiplayerHandler {
  private game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  public setupNetworkHandlers(): void {
    const g = this.game as any;

    g.network.onMatchStart = (data: any) => {
      void this.startMultiplayerDuel(data);
    };

    g.network.onRemoteUpdate = (data: any) => {
      if (g.remotePlayer && g.isMultiplayerDuel) {
        g.remotePlayer.applyRemoteState(data);
      }
    };

    g.network.onCombatHit = (hitData: RemoteHitData) => {
      this.handleRemoteCombatHit(hitData);
    };

    g.network.onMatchOver = (data: { winnerSessionId: string }) => {
      this.handleMultiplayerMatchOver(data);
    };

    g.network.onOpponentDisconnect = () => {
      this.handleOpponentDisconnect();
    };
  }

  public async startMultiplayerDuel(data: { p1SessionId: string; p2SessionId: string | null }): Promise<void> {
    const g = this.game as any;
    g.isMultiplayerDuel = true;
    g.boss.group.visible = false;
    g.settingsModal.close();

    const isHost = g.network.mySessionId === data.p1SessionId;
    g.opponentSessionId = isHost ? (data.p2SessionId || '') : data.p1SessionId;

    // Reset local player to dedicated spawn
    const mySpawn = isHost ? new THREE.Vector3(0, 0, 7) : new THREE.Vector3(0, 0, -7);
    g.player.reset(mySpawn);
    if (!isHost) {
      g.player.group.rotation.set(0, Math.PI, 0);
    }

    // Spawn or update remote player proxy
    const oppSpawn = isHost ? new THREE.Vector3(0, 0, -7) : new THREE.Vector3(0, 0, 7);
    if (!g.remotePlayer) {
      g.remotePlayer = new RemotePlayerProxy(isHost ? 'samurai' : 'knight');
      g.remotePlayer.setVfx(g.vfx);
      g.scene.add(g.remotePlayer.group);
    }
    g.remotePlayer.group.visible = true;
    g.remotePlayer.reset(oppSpawn);

    // Update camera to target remote opponent
    g.cameraRig.setLockedTarget(g.remotePlayer.group.position);
    g.cameraRig.snapTo(g.player.group.position, g.arena.radius);
    g.hud.reset();
  }

  public handleRemoteCombatHit(hitData: RemoteHitData): void {
    const g = this.game as any;
    const contact = new THREE.Vector3(hitData.hitPoint.x, hitData.hitPoint.y, hitData.hitPoint.z);
    const dir = new THREE.Vector3(hitData.hitDir.x, hitData.hitDir.y, hitData.hitDir.z);

    g.vfx.spawnBloodBurst(contact, dir, hitData.isHeavy);

    // If local player was target, take damage locally
    if (hitData.targetSessionId === g.network.mySessionId) {
      g.player.takeDamage(hitData.damage, hitData.isHeavy);
      const screenPos = g.projectToScreen(g.player.group.position, 1.2);
      g.hud.spawnDamageNumber(hitData.damage, screenPos.x, screenPos.y, true);
      g.audio.hitConfirm(hitData.isHeavy);
      g.audio.damageTaken(hitData.isHeavy, false);
      if (g.settingsManager.data.vfx.cameraShake) {
        g.cameraRig.addShake(hitData.isHeavy ? 0.42 : 0.22);
      }
      g.hitstopTimer = 0.05;
    } else if (g.remotePlayer) {
      // Opponent was target
      g.remotePlayer.hp = Math.max(0, g.remotePlayer.hp - hitData.damage);
      const screenPos = g.projectToScreen(g.remotePlayer.group.position, 1.2);
      g.hud.spawnDamageNumber(hitData.damage, screenPos.x, screenPos.y, false);
      g.audio.hitConfirm(hitData.isHeavy);
      g.audio.damageTaken(hitData.isHeavy, true);
    }
  }

  public handleMultiplayerMatchOver(data: { winnerSessionId: string }): void {
    const g = this.game as any;
    const won = data.winnerSessionId === g.network.mySessionId;
    if (won) {
      g.audio.victoryStinger();
    } else {
      g.audio.deathStinger();
    }
  }

  public handleOpponentDisconnect(): void {
    const g = this.game as any;
    if (g.remotePlayer) {
      g.remotePlayer.group.visible = false;
    }
    g.isMultiplayerDuel = false;
    g.boss.group.visible = true;
    g.resetRun();
  }
}
