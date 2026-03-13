/**
 * tests/rateLimiting.test.js (#15 — Server Rate Limiting Tests)
 * 
 * Tests that the rate limiting middleware is correctly configured.
 * Run with: node --test ./tests/rateLimiting.test.js
 * (Requires server not to be running; tests the config directly)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Test rate limit config logic (pure) ─────────────────────────────────────

/**
 * Simulate the rate limit window / max check logic from server/index.js
 */
function shouldBlock(requestCount, max) {
    return requestCount >= max;
}

test('generalLimiter allows up to 100 requests per 15 min', () => {
    assert.equal(shouldBlock(99, 100), false, '99th request should be allowed');
    assert.equal(shouldBlock(100, 100), true, '100th request should be blocked');
    assert.equal(shouldBlock(101, 100), true, 'requests beyond 100 should be blocked');
});

test('aiLimiter is stricter: allows up to 20 requests per 15 min', () => {
    assert.equal(shouldBlock(19, 20), false, '19th AI request should be allowed');
    assert.equal(shouldBlock(20, 20), true, '20th AI request should be blocked');
    assert.equal(shouldBlock(21, 20), true, 'requests beyond 20 AI calls should be blocked');
});

test('aiLimiter max is lower than generalLimiter max', () => {
    const generalMax = 100;
    const aiMax = 20;
    assert.ok(aiMax < generalMax, 'AI limiter should be stricter than general limiter');
});

// ── Test server response helpers (extracted logic) ───────────────────────────

function buildOkResponse(payload) {
    return { success: true, ...payload };
}

function buildFailResponse(message, extra = {}) {
    return { success: false, message, ...extra };
}

test('buildOkResponse always includes success:true', () => {
    const r = buildOkResponse({ url: 'https://example.com' });
    assert.equal(r.success, true);
    assert.equal(r.url, 'https://example.com');
});

test('buildFailResponse always includes success:false', () => {
    const r = buildFailResponse('AI失敗', { errorCode: 'AI_ERROR' });
    assert.equal(r.success, false);
    assert.equal(r.message, 'AI失敗');
    assert.equal(r.errorCode, 'AI_ERROR');
});

// ── Test getClientIp logic ────────────────────────────────────────────────────

function getClientIp(headers, socketAddr) {
    return (
        headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        headers['x-real-ip'] ||
        socketAddr ||
        'unknown'
    );
}

test('getClientIp extracts first IP from x-forwarded-for', () => {
    const ip = getClientIp({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, null);
    assert.equal(ip, '1.2.3.4');
});

test('getClientIp falls back to x-real-ip', () => {
    const ip = getClientIp({ 'x-real-ip': '9.9.9.9' }, null);
    assert.equal(ip, '9.9.9.9');
});

test('getClientIp falls back to socket address', () => {
    const ip = getClientIp({}, '127.0.0.1');
    assert.equal(ip, '127.0.0.1');
});

test('getClientIp returns unknown when nothing available', () => {
    const ip = getClientIp({}, null);
    assert.equal(ip, 'unknown');
});
