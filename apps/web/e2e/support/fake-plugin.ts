import type { APIRequestContext } from '@playwright/test';

const BACKEND_URL = process.env.EWFS_BACKEND_URL ?? 'http://127.0.0.1:8000';

export interface ProtocolEnvelope {
  type: string;
  id?: string | number;
  callsign?: string;
  action: string;
  payload?: Record<string, unknown>;
  ok?: boolean;
  error?: string;
}

/**
 * Minimal stand-in for the euroscope-websocket-connector plugin: POSTs
 * message batches and long-polls for commands over plain HTTP, exactly like
 * PROTOCOL.md describes. Also handy for manual testing without EuroScope.
 */
export class FakePlugin {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async sendMessages(envelopes: ProtocolEnvelope[]): Promise<number> {
    const res = await this.request.post(`${BACKEND_URL}/api/euroscope/messages`, {
      headers: this.headers(),
      data: { messages: envelopes },
    });
    return res.status();
  }

  async pollOnce(timeoutSeconds = 5): Promise<ProtocolEnvelope[]> {
    const res = await this.request.get(
      `${BACKEND_URL}/api/euroscope/poll?timeout=${timeoutSeconds}`,
      { headers: this.headers() },
    );
    if (res.status() === 204) {
      return [];
    }
    const body = (await res.json()) as { commands: ProtocolEnvelope[] };
    return body.commands;
  }
}
