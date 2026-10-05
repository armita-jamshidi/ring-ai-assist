/**
 * Official Ring Partner API (https://developer.amazon.com/docs/ring/api-documentation.html).
 *
 * Not used by the main loop yet. The Partner API can't talk through a camera,
 * which this app needs, so we use ring-client-api for that. This module holds
 * the pieces needed to move events/video onto the official API later:
 * OAuth token refresh, device listing, webhook signature checks, and
 * account-linking nonces.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { requireEnv } from '../config.js'

const API_BASE = 'https://api.amazonvision.com'
const OAUTH_URL = 'https://oauth.ring.com/oauth/token'
const NONCE_WINDOW_SECONDS = 600

export interface PartnerTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'Bearer'
  scope?: string
}

function hmacKey(): Buffer {
  // The portal shows the key base64-encoded.
  return Buffer.from(requireEnv('RING_PARTNER_HMAC_KEY'), 'base64')
}

async function tokenRequest(params: Record<string, string>): Promise<PartnerTokens> {
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...params,
      client_id: requireEnv('RING_PARTNER_CLIENT_ID'),
      client_secret: requireEnv('RING_PARTNER_CLIENT_SECRET'),
    }),
  })
  if (!res.ok) throw new Error(`Ring OAuth ${res.status}: ${await res.text()}`)
  return (await res.json()) as PartnerTokens
}

export const exchangeAuthCode = (code: string) => tokenRequest({ grant_type: 'authorization_code', code })
export const refreshPartnerToken = (refreshToken: string) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })

export async function partnerGet<T = unknown>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Ring Partner API ${path} -> ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

export const listPartnerDevices = (accessToken: string) => partnerGet('/v1/devices', accessToken)

/** Checks the `X-Signature: sha256=<hex>` header on a webhook against the raw body. */
export function verifyWebhookSignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', hmacKey()).update(rawBody).digest()
  const given = Buffer.from(signatureHeader.slice('sha256='.length), 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Account-linking nonce: base64url(HMAC-SHA256(key, "<time>:<account_id>")).
 * The docs don't pin down the <time> format; unix seconds is assumed here.
 * Confirm it with the Ring MCP server before relying on this.
 */
export function makeNonce(accountId: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  return createHmac('sha256', hmacKey()).update(`${unixSeconds}:${accountId}`).digest('base64url')
}

export function verifyNonce(nonce: string, accountId: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  for (let t = nowSeconds - NONCE_WINDOW_SECONDS; t <= nowSeconds; t++) {
    const candidate = Buffer.from(makeNonce(accountId, t))
    const given = Buffer.from(nonce)
    if (candidate.length === given.length && timingSafeEqual(candidate, given)) return true
  }
  return false
}
