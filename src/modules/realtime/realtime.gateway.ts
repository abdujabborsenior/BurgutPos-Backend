import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AppEvent, type UserAccessRevokedEvent } from '../../common/events';
import type { AuthUser } from '../../common/types/auth-user';
import { handshakeIp } from '../../common/utils/client-ip';
import type { AppConfig } from '../../config/configuration';
import { AuthService } from '../auth/auth.service';
import { extractBearerToken } from '../auth/guards/jwt-auth.guard';
import { RealtimeService } from './realtime.service';

interface PresenceEntry {
  id: number;
  fullName: string;
  roleName: string | null;
  /** When this user's FIRST socket arrived: "сколько уже в системе". */
  connectedAt: string;
  /** Address of the newest socket — the device the person is working at now. */
  ip: string | null;
  sockets: Set<string>;
}

interface SocketData {
  user?: AuthUser;
}

@WebSocketGateway({
  path: '/socket.io',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly presence = new Map<number, PresenceEntry>();
  private readonly trustProxy: boolean;

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.trustProxy = config.getOrThrow<AppConfig>('app').trustProxy;
  }

  afterInit(server: Server): void {
    this.realtime.attach(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const handshakeToken = (
      client.handshake.auth as { token?: unknown } | undefined
    )?.token;
    const token =
      typeof handshakeToken === 'string'
        ? handshakeToken
        : extractBearerToken(client.handshake.headers.authorization);
    try {
      if (!token) throw new Error('missing token');
      const user = await this.auth.authenticate(token);
      (client.data as SocketData).user = user;
      this.track(
        user,
        client.id,
        handshakeIp(client.handshake, this.trustProxy),
      );
      this.broadcastPresence();
    } catch {
      client.emit('auth_error', { message: 'Сессия истекла' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const user = (client.data as SocketData).user;
    if (!user) return;
    const entry = this.presence.get(user.id);
    if (!entry) return;
    entry.sockets.delete(client.id);
    if (entry.sockets.size === 0) this.presence.delete(user.id);
    this.broadcastPresence();
  }

  @SubscribeMessage('presence:get')
  getPresence() {
    return this.presenceList();
  }

  @OnEvent(AppEvent.UserAccessRevoked)
  async onAccessRevoked(event: UserAccessRevokedEvent): Promise<void> {
    try {
      const sockets = await this.server.fetchSockets();
      for (const socket of sockets) {
        const user = (socket.data as SocketData).user;
        if (
          user?.id === event.userId &&
          user.sessionId !== event.exceptSessionId
        ) {
          socket.emit('auth_error', { message: 'Доступ отозван' });
          socket.disconnect(true);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to disconnect revoked user: ${String(error)}`);
    }
  }

  private track(user: AuthUser, socketId: string, ip: string | null): void {
    const existing = this.presence.get(user.id);
    if (existing) {
      existing.sockets.add(socketId);
      // The same person on a second device: show where they are now, but keep
      // the moment they first came online.
      if (ip) existing.ip = ip;
      return;
    }
    this.presence.set(user.id, {
      id: user.id,
      fullName: user.fullName,
      roleName: user.roleName,
      connectedAt: new Date().toISOString(),
      ip,
      sockets: new Set([socketId]),
    });
  }

  private presenceList() {
    return [...this.presence.values()]
      .map(({ id, fullName, roleName, connectedAt, ip, sockets }) => ({
        id,
        fullName,
        roleName,
        connectedAt,
        ip,
        devices: sockets.size,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }

  private broadcastPresence(): void {
    this.server.emit('presence', this.presenceList());
  }
}
