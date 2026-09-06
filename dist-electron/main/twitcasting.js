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
    // The official live-thumbnail endpoint is public, so the image can be fetched
    // directly without exposing any CASPULSE secret.
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
    async relayRequest(path) {
        let response;
        try {
            response = await fetch(`${this.relayBaseUrl}${path}`, {
                headers: { Accept: 'application/json' },
            });
        }
        catch {
            throw new TwitCastingApiError('CASPULSE Relayに接続できません。ネット接続を確認して、もう一度お試しください。', 0);
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
}
exports.TwitCastingClient = TwitCastingClient;
//# sourceMappingURL=twitcasting.js.map