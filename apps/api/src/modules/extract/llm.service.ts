import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from '../usage/usage.service';

/**
 * Shared LLM extraction service used by Scrape, Crawl, and Extract processors.
 * Reads LLM config from per-user settings first, falls back to env vars.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private usageService: UsageService,
  ) {}

  /**
   * Extract structured data from content using an LLM.
   * If userId is provided, uses the user's LLM settings from UserSettings.
   */
  async extract(
    content: string,
    options?: {
      schema?: Record<string, unknown>;
      prompt?: string;
      userId?: string;
      provider?: string;
      model?: string;
      apiKey?: string;
      baseUrl?: string;
    },
  ): Promise<unknown> {
    if (options?.userId) {
      const limits = await this.usageService.getEffectiveLimits(options.userId);
      if (!limits.canUseOwnLlm) {
        throw new ForbiddenException('Your plan does not include LLM/extract access');
      }
    }

    // Resolve LLM config: explicit options > user settings > env vars
    let provider = options?.provider;
    let apiKey = options?.apiKey;
    let model = options?.model;
    let baseUrl = options?.baseUrl;

    // Load user settings when userId is provided; apply per-field fallback
    // so explicit options only override their own field, not others
    if (options?.userId) {
      const userSettings = await this.prisma.userSettings.findUnique({
        where: { userId: options.userId },
      });
      if (userSettings) {
        provider = provider ?? userSettings.llmProvider ?? undefined;
        apiKey = apiKey ?? userSettings.llmApiKey ?? undefined;
        model = model ?? userSettings.llmModel ?? undefined;
        baseUrl = baseUrl ?? userSettings.llmBaseUrl ?? undefined;
      }
    }

    // Fall back to env vars
    provider = provider ?? this.config.get('LLM_PROVIDER', 'openai');
    apiKey = apiKey ?? this.config.get('LLM_API_KEY', '');
    model = model ?? this.config.get('LLM_MODEL', 'gpt-4o-mini');
    baseUrl = baseUrl ?? this.config.get('LLM_BASE_URL', 'https://api.openai.com/v1');

    this.logger.log(`LLM config: provider=${provider}, model=${model}, baseUrl=${baseUrl}, hasKey=${!!apiKey}, userId=${options?.userId}`);

    if (!apiKey) {
      this.logger.warn('No LLM API key configured (neither user nor env), skipping extraction');
      return null;
    }

    const systemPrompt = this.buildSystemPrompt(options?.schema, options?.prompt);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content.substring(0, 12000) },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      const responseText = await response.text();

      if (!response.ok) {
        this.logger.warn(`LLM API returned ${response.status}: ${responseText.slice(0, 200)}`);
        return null;
      }

      if (!responseText.trim().startsWith('{') && !responseText.trim().startsWith('[')) {
        this.logger.warn(`LLM API returned non-JSON response: ${responseText.slice(0, 200)}`);
        return null;
      }

      const data = JSON.parse(responseText) as { choices?: { message?: { content?: string } }[] };
      const result = data.choices?.[0]?.message?.content;
      if (!result) return null;

      try {
        return JSON.parse(result);
      } catch {
        return { raw: result };
      }
    } catch (error) {
      this.logger.error(`LLM extraction failed: ${error}`);
      return null;
    }
  }

  private buildSystemPrompt(schema?: Record<string, unknown>, prompt?: string): string {
    let systemPrompt = 'You are a data extraction assistant. Extract structured data from the provided content.';

    if (schema) {
      systemPrompt += `\n\nReturn data matching this JSON schema:\n${JSON.stringify(schema, null, 2)}`;
    }

    if (prompt) {
      systemPrompt += `\n\nAdditional instructions: ${prompt}`;
    }

    systemPrompt += '\n\nReturn ONLY valid JSON.';
    return systemPrompt;
  }
}
