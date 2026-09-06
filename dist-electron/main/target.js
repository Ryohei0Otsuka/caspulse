"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTwitCastingTarget = parseTwitCastingTarget;
const ALLOWED_HOST = /(^|\.)twitcasting\.tv$/i;
function parseTwitCastingTarget(rawInput) {
    const originalInput = rawInput.trim();
    if (!originalInput) {
        throw new Error('配信URLまたは screen_id を入力してください。');
    }
    if (originalInput.length > 500) {
        throw new Error('入力が長すぎます。TwitCastingの配信URLまたはIDを入力してください。');
    }
    const asUrl = /^(?:https?:\/\/|www\.|twitcasting\.tv\/)/i.test(originalInput)
        ? originalInput.replace(/^www\./i, 'https://www.').replace(/^twitcasting\.tv\//i, 'https://twitcasting.tv/')
        : null;
    if (asUrl) {
        let url;
        try {
            url = new URL(asUrl);
        }
        catch {
            throw new Error('TwitCasting URLを正しく読み取れませんでした。');
        }
        if (!ALLOWED_HOST.test(url.hostname)) {
            throw new Error('twitcasting.tv のURLを入力してください。');
        }
        const firstSegment = url.pathname.split('/').filter(Boolean)[0];
        if (!firstSegment) {
            throw new Error('URLから配信者IDを判別できませんでした。');
        }
        const decoded = decodeURIComponent(firstSegment).replace(/^@/, '').trim();
        validateTargetId(decoded);
        return { screenIdOrUserId: decoded, originalInput };
    }
    const normalized = originalInput.replace(/^@/, '').trim();
    validateTargetId(normalized);
    return { screenIdOrUserId: normalized, originalInput };
}
function validateTargetId(value) {
    if (!value || value.includes('/') || /\s/.test(value) || value.length > 180) {
        throw new Error('配信URL、@screen_id、またはscreen_idを入力してください。');
    }
}
//# sourceMappingURL=target.js.map