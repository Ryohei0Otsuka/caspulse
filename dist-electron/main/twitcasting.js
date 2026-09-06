"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitCastingClient = exports.TwitCastingApiError = void 0;
const TWITCASTING_BASE_URL = 'https://apiv2.twitcasting.tv';
const DEFAULT_RELAY_BASE_URL = 'https://caspulse-relay.vercel.app';
class TwitCastingApiError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'TwitCastingApiError';
    }
}
exports.TwitCastingApiError = TwitCastingApiError;
function friendlyApiMessage(status, code, fallback) {
    if (code === 2002)
        return 'この配信ではコメントが制限されています。';
    if (code === 2003)
        return '同じコメントを続けて送ることはできません。';
    if (code === 2004)
        return 'この配信ではこれ以上コメントを投稿できません。';
    if (code === 2005)
        return 'コメント投稿の権限がありません。ツイキャス連携をやり直してください。';
    if (code === 2006)
        return 'ツイキャス側でメールアドレス確認が必要です。';
    if (status === 401)
        return 'ツイキャス連携の有効期限が切れています。もう一度連携してください。';
    if (status === 403)
        return fallback || 'この操作はツイキャス側で許可されていません。';
    if (status === 404)
        return fallback || '対象の配信が見つかりません。';
    return fallback || `TwitCasting API error (${status})`;
}
class TwitCastingClient {
    relayBaseUrl;
    constructor(relayBaseUrl = process.env.CASPULSE_RELAY_URL || DEFAULT_RELAY_BASE_URL) {
        this.relayBaseUrl = relayBaseUrl.replace(/\/+$/, '');
    }
    getRelayBaseUrl() {
        return this.relayBaseUrl;
    }
    async health() {
        try {
            const response = await fetch(`${this.relayBaseUrl}/api/health`, {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok)
                return false;
            const body = await response.json();
            return body.ok === true;
        }
        catch {
            return false;
        }
    }
    async getOAuthClientId() {
        const response = await this.relayRequest('/api/oauth-config');
        const clientId = String(response.client_id ?? '').trim();
        if (!clientId)
            throw new Error('CASPULSEのコメント連携設定を取得できませんでした。');
        return clientId;
    }
    async getUser(userIdOrScreenId) {
        const target = userIdOrScreenId.replace(/^@/, '').trim();
        const response = await this.relayRequest(`/api/user?target=${encodeURIComponent(target)}`);
        return response.user;
    }
    async getCurrentLive(userId) {
        try {
            return await this.relayRequest(`/api/live?user_id=${encodeURIComponent(userId)}`);
        }
        catch (error) {
            if (error instanceof TwitCastingApiError && error.status === 404)
                return null;
            throw error;
        }
    }
    async getLiveThumbnailDataUrl(userId) {
        const id = encodeURIComponent(userId.trim());
        const response = await fetch(`${TWITCASTING_BASE_URL}/users/${id}/live/thumbnail?size=large&position=latest`);
        if (!response.ok)
            return null;
        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        if (!contentType.startsWith('image/'))
            return null;
        const bytes = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${bytes.toString('base64')}`;
    }
    async getComments(movieId, sliceId) {
        const params = new URLSearchParams({ movie_id: movieId });
        if (sliceId)
            params.set('slice_id', sliceId);
        return this.relayRequest(`/api/comments?${params.toString()}`);
    }
    async verifyUserToken(accessToken) {
        const response = await this.bearerRequest('/verify_credentials', accessToken, { method: 'GET' });
        return response.user;
    }
    async postComment(movieId, accessToken, comment) {
        return this.bearerRequest(`/movies/${encodeURIComponent(movieId)}/comments`, accessToken, {
            method: 'POST',
            body: JSON.stringify({ comment, sns: 'none' }),
        });
    }
    async relayRequest(path) {
        let response;
        try {
            response = await fetch(`${this.relayBaseUrl}${path}`, {
                headers: { Accept: 'application/json' },
            });
        }
        catch {
            throw new TwitCastingApiError('CASPULSE Relayにつながりません。ネット接続を確認して、もう一度試してください。', 0);
        }
        if (!response.ok) {
            let message = `CASPULSE Relay error (${response.status})`;
            let code;
            try {
                const body = await response.json();
                const apiError = body.details?.error;
                if (apiError?.message)
                    message = apiError.message;
                if (typeof apiError?.code === 'number')
                    code = apiError.code;
                if (typeof body.error === 'string' && !apiError?.message)
                    message = body.error;
            }
            catch {
                // Keep the generic HTTP error.
            }
            throw new TwitCastingApiError(message, response.status, code);
        }
        return await response.json();
    }
    async bearerRequest(path, accessToken, init) {
        let response;
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
        }
        catch {
            throw new TwitCastingApiError('TwitCasting APIにつながりません。', 0);
        }
        let body = {};
        try {
            body = await response.json();
        }
        catch {
            // Keep empty body.
        }
        if (!response.ok) {
            const apiError = body?.error;
            const code = typeof apiError?.code === 'number' ? apiError.code : undefined;
            throw new TwitCastingApiError(friendlyApiMessage(response.status, code, apiError?.message), response.status, code);
        }
        return body;
    }
}
exports.TwitCastingClient = TwitCastingClient;
//# sourceMappingURL=twitcasting.js.map