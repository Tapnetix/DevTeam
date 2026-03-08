// ── Embedding Service ─────────────────────────────────────────────────
//
// Wraps an embedding API (default: OpenAI text-embedding-3-small) and
// returns 1536-dimensional vectors for semantic search with pgvector.

export interface EmbeddingServiceOptions {
  /** API key for the embedding provider. */
  apiKey: string;
  /** Model identifier. Default: 'text-embedding-3-small'. */
  model?: string;
  /** Base URL for the API (without trailing /embeddings). Default: OpenAI. */
  baseUrl?: string;
  /** Number of retry attempts on transient failures. Default: 3. */
  maxRetries?: number;
  /** Initial delay between retries in ms (doubles on each retry). Default: 200. */
  retryDelayMs?: number;
}

/** HTTP status codes that are safe to retry. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export class EmbeddingService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: EmbeddingServiceOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'text-embedding-3-small';
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 200;
  }

  /**
   * Generate an embedding vector for a single text input.
   * Returns a number[] of 1536 dimensions.
   */
  async embed(text: string): Promise<number[]> {
    const results = await this.callApi(text);
    return results[0];
  }

  /**
   * Generate embedding vectors for multiple texts in a single API call.
   * Returns an array of number[] vectors (one per input).
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.callApi(texts);
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async callApi(input: string | string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/embeddings`;
    const body = JSON.stringify({
      input,
      model: this.model,
    });

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body,
        });

        if (!response.ok) {
          const status = response.status;
          const errorBody = await response.json().catch(() => ({}));
          const message =
            (errorBody as { error?: { message?: string } })?.error?.message ??
            response.statusText;

          // Only retry on retryable status codes
          if (RETRYABLE_STATUS_CODES.has(status)) {
            lastError = new Error(
              `Embedding API error ${status}: ${message}`,
            );
            if (attempt < this.maxRetries) {
              await this.delay(attempt);
              continue;
            }
            throw lastError;
          }

          // Non-retryable error: throw immediately
          throw new Error(`Embedding API error ${status}: ${message}`);
        }

        const data = (await response.json()) as {
          data: Array<{ embedding: number[]; index: number }>;
        };

        // Sort by index to guarantee order
        return data.data
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding);
      } catch (error) {
        lastError = error as Error;

        // If this is a non-retryable API error we threw ourselves, re-throw
        if (
          lastError.message.startsWith('Embedding API error') &&
          !RETRYABLE_STATUS_CODES.has(
            parseInt(lastError.message.match(/\d+/)?.[0] ?? '0', 10),
          )
        ) {
          throw lastError;
        }

        if (attempt < this.maxRetries) {
          await this.delay(attempt);
          continue;
        }
      }
    }

    throw lastError ?? new Error('Embedding API call failed');
  }

  private delay(attempt: number): Promise<void> {
    const ms = this.retryDelayMs * Math.pow(2, attempt);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
