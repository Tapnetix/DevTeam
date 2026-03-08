import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingService } from '../knowledge/embeddings.js';

// Helper to create a fake embedding vector of the expected dimension
function fakeVector(dimensions = 1536): number[] {
  return Array.from({ length: dimensions }, (_, i) => i * 0.001);
}

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    service = new EmbeddingService({
      apiKey: 'test-api-key',
      model: 'text-embedding-3-small',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns an embedding vector of 1536 dimensions', async () => {
    const mockVector = fakeVector(1536);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: mockVector, index: 0 }],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    });

    const result = await service.embed('Hello, world!');

    expect(result).toHaveLength(1536);
    expect(result).toEqual(mockVector);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('sends correct request to OpenAI API', async () => {
    const mockVector = fakeVector();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: mockVector, index: 0 }],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    });

    await service.embed('Test input');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
        }),
        body: JSON.stringify({
          input: 'Test input',
          model: 'text-embedding-3-small',
        }),
      }),
    );
  });

  it('supports batch embedding of multiple texts', async () => {
    const mockVectors = [fakeVector(), fakeVector()];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: mockVectors.map((embedding, index) => ({ embedding, index })),
        usage: { prompt_tokens: 10, total_tokens: 10 },
      }),
    });

    const results = await service.embedBatch(['text1', 'text2']);

    expect(results).toHaveLength(2);
    expect(results[0]).toHaveLength(1536);
    expect(results[1]).toHaveLength(1536);
  });

  it('retries on transient failure', async () => {
    const mockVector = fakeVector();

    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockVector, index: 0 }],
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
      });

    const result = await service.embed('retry me');

    expect(result).toHaveLength(1536);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 429 (rate limit)', async () => {
    const mockVector = fakeVector();

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: { message: 'Rate limited' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockVector, index: 0 }],
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
      });

    const result = await service.embed('rate limited');

    expect(result).toHaveLength(1536);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on HTTP 500 (server error)', async () => {
    const mockVector = fakeVector();

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: { message: 'Server error' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockVector, index: 0 }],
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
      });

    const result = await service.embed('server error');

    expect(result).toHaveLength(1536);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all retries', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Persistent network error'));

    // Default maxRetries is 3, so it should try 4 times total (1 initial + 3 retries)
    await expect(service.embed('will fail')).rejects.toThrow(
      'Persistent network error',
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it('throws on non-retryable HTTP errors (e.g. 401)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: { message: 'Invalid API key' } }),
    });

    await expect(service.embed('unauthorized')).rejects.toThrow(
      /Embedding API error.*401/,
    );

    // Non-retryable error should only make 1 call
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses custom API base URL when provided', async () => {
    const customService = new EmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
      baseUrl: 'https://custom.api.com/v1',
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: fakeVector(), index: 0 }],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    });

    await customService.embed('custom url');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://custom.api.com/v1/embeddings',
      expect.anything(),
    );
  });

  it('respects rate limiting with configurable delay', async () => {
    const rateLimitedService = new EmbeddingService({
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
      maxRetries: 1,
      retryDelayMs: 10,
    });

    const mockVector = fakeVector();

    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockVector, index: 0 }],
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
      });

    const start = Date.now();
    const result = await rateLimitedService.embed('retry with delay');
    const elapsed = Date.now() - start;

    expect(result).toHaveLength(1536);
    // Should have waited at least retryDelayMs
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });
});
