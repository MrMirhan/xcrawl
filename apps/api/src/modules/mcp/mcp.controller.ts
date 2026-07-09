import {
  All,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';
import { McpService } from './mcp.service';

interface AuthedRequest extends Request {
  apiKeyId?: string;
  userId?: string;
}

@ApiExcludeController()
@Controller('mcp')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private mcp: McpService) {}

  @All()
  async handle(@Req() req: AuthedRequest, @Res() res: Response, @Body() body: unknown): Promise<void> {
    const sessionId = req.headers['mcp-session-id'];
    const sessionIdValue = Array.isArray(sessionId) ? sessionId[0] : sessionId;

    try {
      if (req.method === 'POST') {
        if (sessionIdValue && this.mcp.hasSession(sessionIdValue)) {
          const transport = this.mcp.getSession(sessionIdValue);
          await transport!.handleRequest(req, res, body);
          return;
        }

        if (!sessionIdValue && isInitializeRequest(body)) {
          const transport = await this.mcp.createSession({
            apiKeyId: req.apiKeyId,
            userId: req.userId,
          });
          await transport.handleRequest(req, res, body);
          return;
        }

        throw new HttpException(
          { jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: missing or unknown session id' }, id: null },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (req.method === 'GET' || req.method === 'DELETE') {
        if (!sessionIdValue || !this.mcp.hasSession(sessionIdValue)) {
          throw new HttpException('Unknown or missing mcp-session-id', HttpStatus.NOT_FOUND);
        }
        const transport = this.mcp.getSession(sessionIdValue);
        await transport!.handleRequest(req, res);
        return;
      }

      throw new HttpException('Method Not Allowed', HttpStatus.METHOD_NOT_ALLOWED);
    } catch (error) {
      if (res.headersSent) return;
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : 'MCP transport error';
      this.logger.error(`MCP ${req.method} failed: ${message}`);
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
