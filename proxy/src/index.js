/**
 * inscript-proxy
 *
 * Cloudflare Worker behind https://api.inscript.org that holds the API keys
 *
 *   /abs/v1/*  (also /v1/*)  -> https://api.scripture.api.bible/v1/*   (api-key header)
 *   /fcbh/v4/*               -> https://4.dbt.io/api/*                 (?v=4&key=)
 *   /esv/v3/passage/{html,search}/ -> https://api.esv.org/v3/passage/* (Authorization: Token)
 *
 */

import { resolveUpstream, matchOrigin } from './routes.js';

const sha256Hex = async (input) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * API.Bible fair-use reporting (FUMS) https://docs.api.bible/guides/fums.
 */
async function reportFums(token, request) {
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const ua = request.headers.get('User-Agent') ?? '';
  const deviceId = await sha256Hex(`${ip}|${ua}`);
  const sessionId = await sha256Hex(`${ip}|${ua}|${new Date().toISOString().slice(0, 13)}`);

  const params = new URLSearchParams({ t: token, dId: deviceId, sId: sessionId, uId: deviceId });

  try {
    await fetch(`https://fums.api.bible/f3?${params}`);
  } catch (_e) {
    // Reporting is best-effort; never let it break the response.
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigin = matchOrigin(origin, env.ALLOWED_ORIGINS ?? '');

    if (origin && !allowedOrigin) {
      return new Response('Origin not allowed', { status: 403 });
    }

    const corsHeaders = allowedOrigin
      ? {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Vary': 'Origin'
        }
      : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    if (url.pathname === '/' || url.pathname === '') {
      return new Response(
        JSON.stringify({ name: 'inscript-proxy', services: ['abs/v1', 'fcbh/v4', 'esv/v3'] }),
        { headers: { ...JSON_HEADERS, ...corsHeaders } }
      );
    }

    const apiBibleIds = (env.API_BIBLE_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const route = resolveUpstream(url.pathname, url.search, { apiBibleIds });

    if (route == null) {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }
    if (route.error) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const upstreamUrl = new URL(route.url);
    const upstreamHeaders = new Headers({ 'Accept': 'application/json' });

    if (route.service === 'apibible') {
      upstreamHeaders.set('api-key', env.API_BIBLE_KEY ?? '');
    } else if (route.service === 'fcbh') {
      upstreamUrl.searchParams.set('v', '4');
      upstreamUrl.searchParams.set('key', env.BIBLE_BRAIN_KEY ?? '');
    } else if (route.service === 'esv') {
      upstreamHeaders.set('Authorization', `Token ${env.ESV_API_KEY ?? ''}`);
    }

    const upstream = await fetch(upstreamUrl, { method: request.method, headers: upstreamHeaders });

    const responseHeaders = {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      ...corsHeaders
    };

    if (route.service === 'apibible' && upstream.ok) {
      const text = await upstream.text();

      if (text.includes('fums')) {
        try {
          const meta = JSON.parse(text)?.meta;
          const token = meta?.fumsToken ?? meta?.fumsId;
          if (token) ctx.waitUntil(reportFums(token, request));
        } catch (_e) { /* not JSON; nothing to report */ }
      }

      return new Response(text, { status: upstream.status, headers: responseHeaders });
    }

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  }
};
