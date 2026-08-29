import { getLocale } from '@/i18n'

const PAY_API_BASE_URL =
  import.meta.env.VITE_PAY_API_BASE_URL || (import.meta.env.DEV ? '' : 'https://www.zhisales.com')
const PAY_EMBEDDED_TOKEN_KEY = 'pay_embedded_token'
const AUTH_TOKEN_KEY = 'auth_token'

export interface PaymentSessionUser {
  id: number
  email: string
  username: string
  role: 'admin' | 'user' | string
}

export interface PaymentSessionResponse {
  user: PaymentSessionUser
  querySupported: boolean
}

export interface PaymentCatalogSubscription {
  code: string
  title: string
  description: string
  amountCents: number
  validityDays: number | null
  quotaDurationType?: "daily" | "monthly"
}

export interface PaymentCatalogBalancePack {
  code: string
  title: string
  description: string
  amountCents: number
  balanceAmount: number | null
}

export interface PaymentCatalogTrafficPack {
  code: string
  title: string
  description: string
  amountCents: number
  bonusQuotaUsd: number
  validityDays: number | null
}

export interface PaymentCatalogResponse {
  subscriptions: PaymentCatalogSubscription[]
  balancePacks: PaymentCatalogBalancePack[]
  trafficPacks: PaymentCatalogTrafficPack[]
}

export interface PaymentDailyQuotaResponse {
  quotaDailyLimit: number
  quotaDailyUsage: number
  trafficPackExpiresAt: string | null
}

export type PaymentTradeStatus = 'pending' | 'paid' | 'closed' | 'failed' | 'refunded' | string
export type PaymentFulfillmentStatus = 'pending' | 'fulfilled' | 'fulfillment_failed' | string
export type PaymentSkuType = 'subscription' | 'balance' | 'traffic' | string

export interface PaymentOrder {
  merchantOrderId: string
  userId: number
  userEmail: string | null
  userUsername: string | null
  skuType: PaymentSkuType
  skuCode: string
  groupId: number | null
  validityDays: number | null
  balanceAmount: number | null
  amountCents: number
  platformOrderNo: string | null
  tradeStatus: PaymentTradeStatus
  tradeStatusLabel: string
  fulfillmentStatus: PaymentFulfillmentStatus
  fulfillmentStatusLabel: string
  fulfilledAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  lastCheckedAt: string | null
  trafficPackBonusUsd?: number | null
  trafficPackBaseDailyQuotaUsd?: number | null
  trafficPackAppliedAt?: string | null
  trafficPackExpiresAt?: string | null
  trafficPackReverted?: boolean
  trafficPackRevertedAt?: string | null
  trafficPackRevertError?: string | null
  trafficPackStatus?: 'applied' | 'expired' | 'cancelled_by_manual_reset' | null
  trafficPackResetReason?: string | null
  trafficPackResetAt?: string | null
}

export interface CreatePaymentOrderResponse {
  merchantOrderId: string
  formHtml: string
  order: PaymentOrder
  querySupported: boolean
}

export interface CheckPaymentOrderResponse {
  querySupported: boolean
  order: PaymentOrder
}

export interface PaymentOrderListParams {
  page?: number
  pageSize?: number
  tradeStatus?: string
  fulfillmentStatus?: string
  keyword?: string
}

export interface PaymentOrderListResponse {
  orders: PaymentOrder[]
  querySupported: boolean
  page: number
  pageSize: number
  offset: number
  total: number
  totalPages: number
  tradeStatus: string
  fulfillmentStatus: string
  keyword: string
}

export interface UpdateAdminPaymentOrderStatusResponse {
  ok: boolean
  order: PaymentOrder
  paymentStatus: string
  fulfillmentStatus: string
}

export interface PayApiError extends Error {
  status?: number
}

function getPayAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(PAY_EMBEDDED_TOKEN_KEY)
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function buildPayUrl(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>
): string {
  const base = `${PAY_API_BASE_URL}${path}`
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  const url = new URL(base, origin)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

async function payRequest<T>(
  path: string,
  options: RequestInit & {
    query?: Record<string, string | number | boolean | null | undefined>
  } = {}
): Promise<T> {
  const { query: rawQuery, ...requestOptions } = options
  const headers = new Headers(options.headers || {})
  headers.set('Accept-Language', getLocale())

  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getPayAuthToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const query =
    (requestOptions.method || 'GET').toUpperCase() === 'GET'
      ? { timezone: getUserTimezone(), ...(rawQuery || {}) }
      : rawQuery

  const response = await fetch(buildPayUrl(path, query), {
    ...requestOptions,
    headers
  })

  const text = await response.text()
  let parsed: unknown = {}

  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }

  if (!response.ok) {
    const error = new Error(
      (parsed as Record<string, unknown>)?.error?.toString() || text || `HTTP ${response.status}`
    ) as PayApiError
    error.status = response.status
    throw error
  }

  return parsed as T
}

export function isPayApiError(error: unknown): error is PayApiError {
  return error instanceof Error
}

export async function getPaymentSession(): Promise<PaymentSessionResponse> {
  return payRequest<PaymentSessionResponse>('/pay-api/session')
}

export async function getPaymentCatalog(): Promise<PaymentCatalogResponse> {
  return payRequest<PaymentCatalogResponse>('/pay-api/catalog')
}

export async function getPaymentDailyQuota(): Promise<PaymentDailyQuotaResponse> {
  return payRequest<PaymentDailyQuotaResponse>('/pay-api/daily-quota')
}

export async function createPaymentOrder(skuCode: string): Promise<CreatePaymentOrderResponse> {
  return payRequest<CreatePaymentOrderResponse>('/pay-api/orders', {
    method: 'POST',
    body: JSON.stringify({ skuCode })
  })
}

export async function getPaymentOrder(merchantOrderId: string): Promise<CheckPaymentOrderResponse> {
  return payRequest<CheckPaymentOrderResponse>(
    `/pay-api/orders/${encodeURIComponent(merchantOrderId)}`
  )
}

export async function checkPaymentOrder(
  merchantOrderId: string
): Promise<CheckPaymentOrderResponse> {
  return payRequest<CheckPaymentOrderResponse>(
    `/pay-api/orders/${encodeURIComponent(merchantOrderId)}/check`,
    {
      method: 'POST'
    }
  )
}

export async function listPaymentOrders(
  params: PaymentOrderListParams = {}
): Promise<PaymentOrderListResponse> {
  return payRequest<PaymentOrderListResponse>('/pay-api/orders', {
    query: { ...params }
  })
}

export async function listAdminPaymentOrders(
  params: PaymentOrderListParams = {}
): Promise<PaymentOrderListResponse> {
  try {
    return await payRequest<PaymentOrderListResponse>('/pay-api/admin/orders', {
      query: { ...params }
    })
  } catch (error) {
    if (
      isPayApiError(error) &&
      (error.status === 404 ||
        error.status === 405 ||
        error.status === 410 ||
        error.status === 501)
    ) {
      return payRequest<PaymentOrderListResponse>('/pay-api/orders', {
        query: { ...params }
      })
    }
    throw error
  }
}

export async function updateAdminPaymentOrderStatus(
  merchantOrderId: string,
  tradeStatus: 'paid' | 'closed'
): Promise<UpdateAdminPaymentOrderStatusResponse> {
  return payRequest<UpdateAdminPaymentOrderStatusResponse>(
    `/pay-api/admin/orders/${encodeURIComponent(merchantOrderId)}/status`,
    {
      method: 'POST',
      body: JSON.stringify({ tradeStatus })
    }
  )
}

export const payAPI = {
  getSession: getPaymentSession,
  getCatalog: getPaymentCatalog,
  getDailyQuota: getPaymentDailyQuota,
  createOrder: createPaymentOrder,
  getOrder: getPaymentOrder,
  checkOrder: checkPaymentOrder,
  listOrders: listPaymentOrders,
  listAdminOrders: listAdminPaymentOrders,
  updateAdminOrderStatus: updateAdminPaymentOrderStatus
}

export default payAPI
