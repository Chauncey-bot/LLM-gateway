import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { getLocale } from '@/i18n'

const REWARDS_API_BASE_URL = import.meta.env.VITE_REWARDS_API_BASE_URL || ''

const rewardsClient: AxiosInstance = axios.create({
  baseURL: REWARDS_API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

rewardsClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('auth_token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.headers) {
    config.headers['Accept-Language'] = getLocale()
  }
  return config
})

rewardsClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; error?: string }>) => {
    if (error.response) {
      return Promise.reject({
        status: error.response.status,
        message: error.response.data?.message || error.response.data?.error || error.message
      })
    }
    return Promise.reject({
      status: 0,
      message: 'Network error. Please check your connection.'
    })
  }
)

export interface ReferralProfile {
  referral_code: string
  invite_url: string
  invited_count: number
  rewarded_purchase_count: number
  points_balance: number
  total_earned: number
  total_spent: number
  referrer_source_code?: string | null
  referrer_bound_at?: string | null
}

export interface PointsLedgerItem {
  id: number
  direction: 'credit' | 'debit'
  amount: number
  balance_after: number
  type: string
  reference_type: string | null
  reference_id: string | null
  remark: string | null
  created_at: string
}

export interface PointsLedgerResponse {
  page: number
  page_size: number
  total: number
  items: PointsLedgerItem[]
}

export interface RedemptionCatalogItem {
  sku_code: string
  title: string
  description: string
  cash_amount_cents: number | null
  points_cost: number
  group_id: number
  validity_days: number
  type: string
}

export interface RedemptionResult {
  success: boolean
  redeem_no: string
  sku_code: string
  points_cost: number
  balance_after: number
  fulfillment?: {
    subscriptionId?: number
    [key: string]: unknown
  }
}

export async function getReferralProfile(): Promise<ReferralProfile> {
  const { data } = await rewardsClient.get<ReferralProfile>('/api/referral/me')
  return data
}

export async function bindReferralRegistration(referralCode: string): Promise<void> {
  await rewardsClient.post('/api/referral/bind-registration', {
    referral_code: referralCode
  })
}

export async function getPointsLedger(page = 1, pageSize = 20): Promise<PointsLedgerResponse> {
  const { data } = await rewardsClient.get<PointsLedgerResponse>('/api/points/ledger', {
    params: {
      page,
      page_size: pageSize
    }
  })
  return data
}

export async function getRedemptionCatalog(): Promise<RedemptionCatalogItem[]> {
  const { data } = await rewardsClient.get<{ items: RedemptionCatalogItem[] }>(
    '/api/redemptions/catalog'
  )
  return data.items
}

export async function redeemWithPoints(skuCode: string): Promise<RedemptionResult> {
  const { data } = await rewardsClient.post<RedemptionResult>('/api/redemptions/redeem', {
    sku_code: skuCode
  })
  return data
}

export const referralsAPI = {
  getReferralProfile,
  bindReferralRegistration,
  getPointsLedger,
  getRedemptionCatalog,
  redeemWithPoints
}

export default referralsAPI
