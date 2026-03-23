import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : 'http://localhost:3000',
  },
  namespace: '/ws',
})
export class CrawlGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(CrawlGateway.name);

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        this.logger.debug(`Client ${client.id} rejected: no token`);
        client.disconnect();
        return;
      }
      const secret = this.config.getOrThrow('JWT_SECRET');
      const payload = this.jwt.verify(token as string, { secret }) as { sub: string };
      (client as Socket & { userId?: string }).userId = payload.sub;
      this.logger.debug(`Client connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      this.logger.debug(`Client ${client.id} rejected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId: string },
  ) {
    if (!data.jobId) return;
    const userId = (client as Socket & { userId?: string }).userId;
    if (!userId) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }
    const job = await this.prisma.job.findFirst({ where: { id: data.jobId, userId } });
    if (!job) {
      client.emit('error', { message: 'Job not found' });
      return;
    }
    client.join(`job:${data.jobId}`);
    this.logger.debug(`Client ${client.id} subscribed to job ${data.jobId}`);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId: string },
  ) {
    if (data.jobId) {
      client.leave(`job:${data.jobId}`);
    }
  }

  emitProgress(jobId: string, data: { completed: number; total: number; currentUrl: string }) {
    this.server.to(`job:${jobId}`).emit('job:progress', { jobId, ...data });
  }

  emitPageComplete(jobId: string, data: { url: string; statusCode?: number }) {
    this.server.to(`job:${jobId}`).emit('job:page', { jobId, ...data });
  }

  emitJobCompleted(jobId: string) {
    this.server.to(`job:${jobId}`).emit('job:completed', { jobId });
  }

  emitJobFailed(jobId: string, error: string) {
    this.server.to(`job:${jobId}`).emit('job:failed', { jobId, error });
  }
}
