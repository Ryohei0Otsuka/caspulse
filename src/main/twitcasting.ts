import type {
  TwitCastingComment,
  TwitCastingMovie,
  TwitCastingUser,
} from '../shared/types';

const BASE_URL = 'https://apiv2.twitcasting.tv';

interface UserResponse {
  user: TwitCastingUser;
}

interface CurrentLiveResponse {
  movie: TwitCastingMovie;
  broadcaster: TwitCastingUser;
  tags: string[];
}

interface VerifyResponse {
  user: TwitCastingUser;
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
  constructor(private token: string | null = null) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  async verifyToken(tokenOverride?: string): Promise<TwitCastingUser> {
    const response = await this.request<VerifyResponse>('/verify_credentials', tokenOverride);
    return response.user;
  }

  async getUser(userIdOrScreenId: string): Promise<TwitCastingUser> {
    const id = encodeURIComponent(userIdOrScreenId.replace(/^@/, '').trim());
    const response = await this.request<UserResponse>(`/users/${id}`);
    return response.user;
  }

  async getCurrentLive(userId: string): Promise<CurrentLiveResponse | null> {
    try {
      return await this.request<CurrentLiveResponse>(
        `/users/${encodeURIComponent(userId)}/current_live`,
      );
    } catch (error) {
      if (error instanceof TwitCastingApiError && error.status === 404) return null;
      throw error;
    }
  }

  async getComments(movieId: string, sliceId?: string): Promise<CommentsResponse> {
    const params = new URLSearchParams({ limit: '50' });
    if (sliceId) params.set('slice_id', sliceId);
    return this.request<CommentsResponse>(
      `/movies/${encodeURIComponent(movieId)}/comments?${params.toString()}`,
    );
  }

  private async request<T>(path: string, tokenOverride?: string): Promise<T> {
    const token = tokenOverride ?? this.token;
    if (!token) {
      throw new Error('まだツイキャスとつながってないよ。設定からOAuth連携してね。');
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'X-Api-Version': '2.0',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      let message = `TwitCasting API error (${response.status})`;
      let code: number | undefined;
      try {
        const body = (await response.json()) as {
          error?: { message?: string; code?: number };
        };
        if (body.error?.message) message = body.error.message;
        if (typeof body.error?.code === 'number') code = body.error.code;
      } catch {
        // Keep the generic HTTP error if the response body is not JSON.
      }
      throw new TwitCastingApiError(message, response.status, code);
    }

    return (await response.json()) as T;
  }
}
