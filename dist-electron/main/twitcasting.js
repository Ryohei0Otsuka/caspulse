"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitCastingClient = exports.TwitCastingApiError = void 0;
const BASE_URL = 'https://apiv2.twitcasting.tv';
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
class TwitCastingClient {
    token;
    constructor(token = null) {
        this.token = token;
    }
    setToken(token) {
        this.token = token;
    }
    async verifyToken(tokenOverride) {
        const response = await this.request('/verify_credentials', tokenOverride);
        return response.user;
    }
    async getUser(userIdOrScreenId) {
        const id = encodeURIComponent(userIdOrScreenId.replace(/^@/, '').trim());
        const response = await this.request(`/users/${id}`);
        return response.user;
    }
    async getCurrentLive(userId) {
        try {
            return await this.request(`/users/${encodeURIComponent(userId)}/current_live`);
        }
        catch (error) {
            if (error instanceof TwitCastingApiError && error.status === 404)
                return null;
            throw error;
        }
    }
    async getLiveThumbnailDataUrl(userId) {
        const id = encodeURIComponent(userId.trim());
        const response = await fetch(`${BASE_URL}/users/${id}/live/thumbnail?size=large&position=latest`);
        if (!response.ok)
            return null;
        const contentType = response.headers.get('content-type') ?? 'image/jpeg';
        if (!contentType.startsWith('image/'))
            return null;
        const bytes = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${bytes.toString('base64')}`;
    }
    async getComments(movieId, sliceId) {
        const params = new URLSearchParams({ limit: '50' });
        if (sliceId)
            params.set('slice_id', sliceId);
        return this.request(`/movies/${encodeURIComponent(movieId)}/comments?${params.toString()}`);
    }
    async request(path, tokenOverride) {
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
            let code;
            try {
                const body = (await response.json());
                if (body.error?.message)
                    message = body.error.message;
                if (typeof body.error?.code === 'number')
                    code = body.error.code;
            }
            catch {
                // Keep the generic HTTP error if the response body is not JSON.
            }
            throw new TwitCastingApiError(message, response.status, code);
        }
        return (await response.json());
    }
}
exports.TwitCastingClient = TwitCastingClient;
//# sourceMappingURL=twitcasting.js.map