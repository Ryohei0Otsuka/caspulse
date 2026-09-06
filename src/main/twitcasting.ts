import type {
  TwitCastingComment,
  TwitCastingMovie,
  TwitCastingUser,
} from '../shared/types';

const TWITCASTING_BASE_URL = 'https://apiv2.twitcasting.tv';
const DEFAULT_RELAY_BASE_URL = 'https://caspulse-relay.vercel.app';

interface UserResponse {
  user: TwitCastingUser;
}

interface CurrentLiveResponse {
  movie: TwitCastingMovie;
  broadcaster: TwitCastingUser;
  tags: string[];
}

export interface CommentsResponse {
  movie_id: string;
  all_count: number;
  comments: TwitCastingComment[];
}

export class TwitCastingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'TwitCastingApiError';
  }
}

export class TwitCastingClient {
  private readonly relayBaseUrl: string;

  constructor(relayBaseUrl = process.env.CASPULSE_RELAY_URL || DEFAULT_RELAY_BASE_URL) {
    this.relayBaseUrl = relayBaseUrl.replace(/\/+$/, '');
  }

  getRelayBaseUrl(): string {
    return this.relayBaseUrl;
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.relayBaseUrl}/api/health`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return false;
      const body = await response.json() as { ok?: boolean };
      return body.ok === true;
    } catch {
      return false;
    }
  }

  async getUser(userIdOrScreenId: string): Promise<TwitCastingUser> {
    const target = userIdOrScreenId.replace(/^@/, '').trim();
    const response = await this.relayRequest<UserResponse>(
      `/api/user?target=${encodeURIComponent(target)}`,
    );
    return response.user;
  }

  async getCurrentLive(userId: string): Promise<CurrentLiveResponse | null> {
    try {
      return await this.relayRequest<CurrentLiveResponse>(
        `/api/live?user_id=${encodeURIComponent(userId)}`,
      );
    } catch (error) {
      if (error instanceof TwitCastingApiError && error.status === 404) return null;
      throw error;
    }
  }

  // The official live-thumbnail endpoint is public, so the image can be fetched
  // directly without exposing any CASPULSE secret.
  async getLiveThumbnailDataUrl(userId: string): Promise<string | null> {
    const id = encodeURIComponent(userId.trim());
    const response = await fetch(
      `${TWITCASTING_BASE_URL}/users/${id}/live/thumbnail?size=large&position=latest`,
    );
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  }

  async getComments(movieId: string, sliceId?: string): Promise<CommentsResponse> {
    const params = new URLSearchParams({ movie_id: movieId });
    if (sliceId) params.set('slice_id', sliceId);
    return this.relayRequest<CommentsResponse>(`/api/comments?${params.toString()}`);
  }

  private async relayRequest<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.relayBaseUrl}${path}`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new TwitCastingApiError(
        'CASPULSE Relayに接続できません。ネット接続を確認して、もう一度お試しください。',
        0,
      );
    }

    if (!response.ok) {
      let message = `CASPULSE Relay error (${response.status})`;
      let code: number | undefined;

      try {
        const body = await response.json() as {
          error?: string | { message?: string; code?: number };
          details?: { error?: { message?: string; code?: number } };
        };
        const apiError = body.details?.error;
        if (apiError?.message) message = apiError.message;
        if (typeof apiError?.code === 'number') code = apiError.code;
        if (typeof body.error === 'string' && !apiError?.message) message = body.error;
      } catch {
        // Keep the generic HTTP error.
      }

      throw new TwitCastingApiError(message, response.status, code);
    }

    return await response.json() as T;
  }
}
