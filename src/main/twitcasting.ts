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

interface VerifyCredentialsResponse {
  user: TwitCastingUser;
}

interface OAuthConfigResponse {
  client_id: string;
}

export interface CommentsResponse {
  movie_id: string;
  all_count: number;
  comments: TwitCastingComment[];
}

export interface PostCommentApiResponse {
  movie_id: string;
  all_count: number;
  comment: TwitCastingComment;
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

function friendlyApiMessage(status: number, code?: number, fallback?: string): string {
  if (code === 2002) return 'この配信ではコメントが制限されています。';
  if (code === 2003) return '同じコメントを続けて送ることはできません。';
  if (code === 2004) return 'この配信ではこれ以上コメントを投稿できません。';
  if (code === 2005) return 'コメント投稿の権限がありません。ツイキャス連携をやり直してください。';
  if (code === 2006) return 'ツイキャス側でメールアドレス確認が必要です。';
  if (status === 401) return 'ツイキャス連携の有効期限が切れています。もう一度連携してください。';
  if (status === 403) return fallback || 'この操作はツイキャス側で許可されていません。';
  if (status === 404) return fallback || '対象の配信が見つかりません。';
  return fallback || `TwitCasting API error (${status})`;
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

  async getOAuthClientId(): Promise<string> {
    const response = await this.relayRequest<OAuthConfigResponse>('/api/oauth-config');
    const clientId = String(response.client_id ?? '').trim();
    if (!clientId) throw new Error('CASPULSEのコメント連携設定を取得できませんでした。');
    return clientId;
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

  async verifyUserToken(accessToken: string): Promise<TwitCastingUser> {
    const response = await this.bearerRequest<VerifyCredentialsResponse>(
      '/verify_credentials',
      accessToken,
      { method: 'GET' },
    );
    return response.user;
  }

  async postComment(movieId: string, accessToken: string, comment: string): Promise<PostCommentApiResponse> {
    return this.bearerRequest<PostCommentApiResponse>(
      `/movies/${encodeURIComponent(movieId)}/comments`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ comment, sns: 'none' }),
      },
    );
  }

  private async relayRequest<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.relayBaseUrl}${path}`, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new TwitCastingApiError(
        'CASPULSE Relayにつながりません。ネット接続を確認して、もう一度試してください。',
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

  private async bearerRequest<T>(path: string, accessToken: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${TWITCASTING_BASE_URL}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'X-Api-Version': '2.0',
          Authorization: `Bearer ${accessToken}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new TwitCastingApiError('TwitCasting APIにつながりません。', 0);
    }

    let body: unknown = {};
    try {
      body = await response.json();
    } catch {
      // Keep empty body.
    }

    if (!response.ok) {
      const apiError = (body as { error?: { code?: number; message?: string } })?.error;
      const code = typeof apiError?.code === 'number' ? apiError.code : undefined;
      throw new TwitCastingApiError(
        friendlyApiMessage(response.status, code, apiError?.message),
        response.status,
        code,
      );
    }

    return body as T;
  }
}
