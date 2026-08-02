<template>
  <AppLayout>
    <div class="console-page mx-auto max-w-7xl space-y-5">
      <div class="console-title-panel">
        <p class="console-kicker">{{ t('nav.myAccount') }}</p>
        <h1 class="console-section-title">{{ t('userSubscriptions.title') }}</h1>
        <p class="console-section-description">{{ t('userSubscriptions.description') }}</p>
      </div>

      <div
        v-if="!loading && dailyQuota !== null"
        class="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-cyan-950 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-50"
      >
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold">{{ t('userSubscriptions.trafficQuotaBonus') }}</p>
            <p class="mt-1 text-xs text-cyan-800/80 dark:text-cyan-100/80">
              {{ t('userSubscriptions.trafficPack') }}
            </p>
          </div>
          <strong class="text-2xl tabular-nums">+${{ dailyQuota.toFixed(2) }}</strong>
        </div>
        <p v-if="dailyQuotaExpiresAt" class="mt-2 text-xs text-cyan-800/80 dark:text-cyan-100/80">
          {{ t('userSubscriptions.trafficPackExpires', { time: formatTrafficPackExpiry(dailyQuotaExpiresAt) }) }}
        </p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center py-12">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
        ></div>
      </div>

      <!-- Empty State -->
        <div v-else-if="activeSubscriptions.length === 0" class="surface-tile p-12 text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/10"
        >
          <Icon name="creditCard" size="xl" class="text-slate-400" />
        </div>
        <h3 class="mb-2 text-lg font-semibold text-slate-950 dark:text-white">
          {{ t('userSubscriptions.noActiveSubscriptions') }}
        </h3>
        <p class="text-slate-500 dark:text-slate-400">
          {{ t('userSubscriptions.noActiveSubscriptionsDesc') }}
        </p>
      </div>

      <!-- Subscriptions Grid -->
      <div v-else class="grid gap-6 lg:grid-cols-2">
        <div
          v-for="subscription in activeSubscriptions"
          :key="subscription.id"
          class="card card-hover overflow-hidden"
        >
          <!-- Header -->
          <div
            class="section-toolbar flex items-center justify-between"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-500/15"
              >
                <Icon name="creditCard" size="md" class="text-cyan-700 dark:text-cyan-300" />
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">
                  {{ subscription.group?.name || `Group #${subscription.group_id}` }}
                </h3>
                <p class="text-xs text-gray-500 dark:text-dark-400">
                  {{ subscription.group?.description || '' }}
                </p>
              </div>
            </div>
            <span
              :class="[
                'badge',
                subscription.status === 'active'
                  ? 'badge-success'
                  : subscription.status === 'expired'
                    ? 'badge-warning'
                    : 'badge-danger'
              ]"
            >
              {{ t(`userSubscriptions.status.${subscription.status}`) }}
            </span>
          </div>

          <!-- Usage Progress -->
          <div class="space-y-4 p-4">
            <!-- Expiration Info -->
            <div v-if="subscription.expires_at" class="flex items-center justify-between text-sm">
              <span class="text-gray-500 dark:text-dark-400">{{
                t('userSubscriptions.expires')
              }}</span>
              <span :class="getExpirationClass(subscription.expires_at)">
                {{ formatExpirationDate(subscription.expires_at) }}
              </span>
            </div>
            <div v-else class="flex items-center justify-between text-sm">
              <span class="text-gray-500 dark:text-dark-400">{{
                t('userSubscriptions.expires')
              }}</span>
              <span class="text-gray-700 dark:text-gray-300">{{
                t('userSubscriptions.noExpiration')
              }}</span>
            </div>

            <!-- Daily Usage -->
            <div v-if="subscription.group?.daily_limit_usd" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('userSubscriptions.daily') }}
                </span>
                <span class="text-sm text-gray-500 dark:text-dark-400">
                  ${{ (subscription.daily_usage_usd || 0).toFixed(2) }} / ${{
                    getEffectiveDailyLimit(subscription).toFixed(2)
                  }}
                </span>
              </div>
              <div class="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                <div
                  class="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                  :class="
                    getProgressBarClass(
                      subscription.daily_usage_usd,
                      getEffectiveDailyLimit(subscription)
                    )
                  "
                  :style="{
                    width: getProgressWidth(
                      subscription.daily_usage_usd,
                      getEffectiveDailyLimit(subscription)
                    )
                  }"
                ></div>
              </div>
              <p
                v-if="subscription.daily_window_start"
                class="text-xs text-gray-500 dark:text-dark-400"
              >
                {{
                  t('userSubscriptions.subscriptionQuotaReset', {
                    time: formatTimeUntilNextMidnight()
                  })
                }}
              </p>
              <div
                v-if="activeTrafficPack"
                class="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100"
              >
                <div class="flex items-center justify-between gap-3 font-medium">
                  <span>{{ t('userSubscriptions.trafficPack') }}</span>
                  <span>+${{ activeTrafficPack.bonusQuotaUsd.toFixed(2) }}</span>
                </div>
                <p class="mt-1 text-cyan-800/80 dark:text-cyan-100/80">
                  {{
                    t('userSubscriptions.trafficPackQuota', {
                      base: `$${getBaseDailyLimit(subscription).toFixed(2)}`,
                      total: `$${getEffectiveDailyLimit(subscription).toFixed(2)}`
                    })
                  }}
                </p>
                <p class="mt-0.5 text-cyan-800/80 dark:text-cyan-100/80">
                  {{
                    t('userSubscriptions.trafficPackExpires', {
                      time: formatTrafficPackExpiry(activeTrafficPack.expiresAt)
                    })
                  }}
                </p>
              </div>
            </div>

            <!-- Weekly Usage -->
            <div v-if="subscription.group?.weekly_limit_usd" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('userSubscriptions.weekly') }}
                </span>
                <span class="text-sm text-gray-500 dark:text-dark-400">
                  ${{ (subscription.weekly_usage_usd || 0).toFixed(2) }} / ${{
                    subscription.group.weekly_limit_usd.toFixed(2)
                  }}
                </span>
              </div>
              <div class="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                <div
                  class="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                  :class="
                    getProgressBarClass(
                      subscription.weekly_usage_usd,
                      subscription.group.weekly_limit_usd
                    )
                  "
                  :style="{
                    width: getProgressWidth(
                      subscription.weekly_usage_usd,
                      subscription.group.weekly_limit_usd
                    )
                  }"
                ></div>
              </div>
              <p
                v-if="subscription.weekly_window_start"
                class="text-xs text-gray-500 dark:text-dark-400"
              >
                {{
                  t('userSubscriptions.resetIn', {
                    time: formatResetTime(subscription.weekly_window_start, 168)
                  })
                }}
              </p>
            </div>

            <!-- Monthly Usage -->
            <div v-if="subscription.group?.monthly_limit_usd" class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('userSubscriptions.monthly') }}
                </span>
                <span class="text-sm text-gray-500 dark:text-dark-400">
                  ${{ (subscription.monthly_usage_usd || 0).toFixed(2) }} / ${{
                    subscription.group.monthly_limit_usd.toFixed(2)
                  }}
                </span>
              </div>
              <div class="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                <div
                  class="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                  :class="
                    getProgressBarClass(
                      subscription.monthly_usage_usd,
                      subscription.group.monthly_limit_usd
                    )
                  "
                  :style="{
                    width: getProgressWidth(
                      subscription.monthly_usage_usd,
                      subscription.group.monthly_limit_usd
                    )
                  }"
                ></div>
              </div>
              <p
                v-if="subscription.monthly_window_start"
                class="text-xs text-gray-500 dark:text-dark-400"
              >
                {{
                  t('userSubscriptions.resetIn', {
                    time: formatResetTime(subscription.monthly_window_start, 720)
                  })
                }}
              </p>
            </div>

            <!-- No limits configured - Unlimited badge -->
            <div
              v-if="
                !subscription.group?.daily_limit_usd &&
                !subscription.group?.weekly_limit_usd &&
                !subscription.group?.monthly_limit_usd
              "
              class="surface-tile flex items-center justify-center py-6"
            >
              <div class="flex items-center gap-3">
                <span class="text-4xl text-emerald-600 dark:text-emerald-400">∞</span>
                <div>
                  <p class="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {{ t('userSubscriptions.unlimited') }}
                  </p>
                  <p class="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                    {{ t('userSubscriptions.unlimitedDesc') }}
                  </p>
                </div>
              </div>
            </div>

            <div class="border-t border-gray-200 pt-3 dark:border-dark-700">
              <button
                type="button"
                class="btn btn-warning btn-sm w-full"
                :disabled="isResettingQuota"
                @click="openResetQuotaDialog(subscription)"
              >
                <Icon name="refresh" size="xs" class="mr-1.5" />
                {{ t('userSubscriptions.resetQuota') }}
              </button>
            </div>
          </div>
        </div>
      </div>

              <ConfirmDialog
                :show="showResetQuotaDialog"
                :title="t('userSubscriptions.resetQuotaTitle')"
                :message="t('userSubscriptions.resetQuotaConfirm', {
                  name: resettingSubscription?.group?.name || `Group #${resettingSubscription?.group_id || ''}`
                })"
                :confirm-text="t('userSubscriptions.resetQuotaConfirmAction')"
                :cancel-text="t('common.cancel')"
                :danger="true"
                @confirm="confirmResetQuota"
                @cancel="closeResetQuotaDialog"
              />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import subscriptionsAPI from '@/api/subscriptions'
import { getPaymentDailyQuota, listPaymentOrders, type PaymentOrder } from '@/api/pay'
import type { UserSubscription } from '@/types'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { formatDateTime } from '@/utils/format'

const { t } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()

const subscriptions = ref<UserSubscription[]>([])
interface ActiveTrafficPack {
  bonusQuotaUsd: number
  expiresAt: string
}

const activeTrafficPack = ref<ActiveTrafficPack | null>(null)
const dailyQuota = ref<number | null>(null)
const dailyQuotaExpiresAt = ref<string | null>(null)
const activeSubscriptions = computed(() =>
  subscriptions.value.filter((subscription) => {
    if (!subscription.expires_at) {
      return true
    }

    return new Date(subscription.expires_at).getTime() > Date.now()
  })
)
const loading = ref(true)
const showResetQuotaDialog = ref(false)
const isResettingQuota = ref(false)
const resettingSubscription = ref<UserSubscription | null>(null)
const MS_PER_DAY = 24 * 60 * 60 * 1000
const ONE_DAY_ROUNDING_TOLERANCE_MS = 30 * 60 * 1000

function toLocalDateStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function getDaysRemaining(expiresAt: string): number {
  const expiresDate = toLocalDateStart(new Date(expiresAt))
  const nowDate = toLocalDateStart(new Date())
  if (isNaN(expiresDate.getTime())) return -1
  return Math.floor((expiresDate.getTime() - nowDate.getTime()) / MS_PER_DAY)
}

async function loadSubscriptions() {
  try {
    loading.value = true
    subscriptions.value = await subscriptionsAPI.getMySubscriptions()
    try {
      const [{ orders }, quota] = await Promise.all([
        listPaymentOrders({
          pageSize: 200,
          tradeStatus: 'paid',
          fulfillmentStatus: 'fulfilled'
        }),
        getPaymentDailyQuota()
      ])
      activeTrafficPack.value = getActiveTrafficPack(orders)
      dailyQuota.value = Number(quota.quotaDailyLimit)
      dailyQuotaExpiresAt.value = quota.trafficPackExpiresAt
    } catch (error) {
      activeTrafficPack.value = null
      dailyQuota.value = null
      dailyQuotaExpiresAt.value = null
      console.warn('Failed to load traffic pack status:', error)
    }
  } catch (error) {
    console.error('Failed to load subscriptions:', error)
    appStore.showError(t('userSubscriptions.failedToLoad'))
  } finally {
    loading.value = false
  }
}

function getActiveTrafficPack(orders: PaymentOrder[]): ActiveTrafficPack | null {
  const now = Date.now()
  const activePacks = orders
    .filter((order) => {
      const expiresAt = order.trafficPackExpiresAt
      return (
        order.skuType === 'traffic' &&
        order.tradeStatus === 'paid' &&
        order.fulfillmentStatus === 'fulfilled' &&
        !order.trafficPackReverted &&
        Number(order.trafficPackBonusUsd) > 0 &&
        expiresAt &&
        new Date(expiresAt).getTime() > now
      )
    })
    .sort(
      (left, right) =>
        new Date(right.trafficPackExpiresAt || 0).getTime() -
        new Date(left.trafficPackExpiresAt || 0).getTime()
    )

  const pack = activePacks[0]
  if (!pack?.trafficPackExpiresAt) return null

  return {
    bonusQuotaUsd: activePacks.reduce(
      (total, order) => total + Number(order.trafficPackBonusUsd || 0),
      0
    ),
    expiresAt: pack.trafficPackExpiresAt
  }
}

function getBaseDailyLimit(subscription: UserSubscription): number {
  return Number(subscription.group?.daily_limit_usd || 0)
}

function getEffectiveDailyLimit(subscription: UserSubscription): number {
  const trafficQuotaBonus = dailyQuota.value ?? activeTrafficPack.value?.bonusQuotaUsd ?? 0
  return getBaseDailyLimit(subscription) + trafficQuotaBonus
}

function formatTimeUntilNextMidnight(): string {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  const remainingMinutes = Math.max(0, Math.ceil((nextMidnight.getTime() - now.getTime()) / 60_000))
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  return `${hours}h ${minutes}m`
}

function formatTrafficPackExpiry(expiresAt: string): string {
  return formatDateTime(new Date(expiresAt), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function getProgressWidth(used: number | undefined, limit: number | null | undefined): string {
  if (!limit || limit === 0) return '0%'
  const percentage = Math.min(((used || 0) / limit) * 100, 100)
  return `${percentage}%`
}

function getProgressBarClass(used: number | undefined, limit: number | null | undefined): string {
  if (!limit || limit === 0) return 'bg-gray-400'
  const percentage = ((used || 0) / limit) * 100
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

function formatExpirationDate(expiresAt: string): string {
  const days = getDaysRemaining(expiresAt)
  const expiry = new Date(expiresAt)
  if (isNaN(expiry.getTime())) {
    return t('userSubscriptions.status.expired')
  }

  if (days < 0) {
    return t('userSubscriptions.status.expired')
  }

  const dateStr = formatDateTime(expiry, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  if (days === 0) {
    return `${dateStr} (Today)`
  }
  if (days === 1) {
    return `${dateStr} (Tomorrow)`
  }

  return t('userSubscriptions.daysRemaining', { days }) + ` (${dateStr})`
}

function getExpirationClass(expiresAt: string): string {
  const days = getDaysRemaining(expiresAt)

  if (days <= 0) return 'text-red-600 dark:text-red-400 font-medium'
  if (days <= 3) return 'text-red-600 dark:text-red-400'
  if (days <= 7) return 'text-orange-600 dark:text-orange-400'
  return 'text-gray-700 dark:text-gray-300'
}

function formatResetTime(windowStart: string | null, windowHours: number): string {
  if (!windowStart) return t('userSubscriptions.windowNotActive')

  const start = new Date(windowStart)
  const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000)
  const now = new Date()
  const diff = end.getTime() - now.getTime()

  if (diff <= 0) return t('userSubscriptions.windowNotActive')

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

function getResetQuotaError(subscription: UserSubscription | null): string | null {
  if (!subscription) return t('userSubscriptions.resetQuotaFailed')

  if (!authStore.user || subscription.user_id !== authStore.user.id) {
    return t('userSubscriptions.resetQuotaOnlyOwn')
  }

  if (subscription.status !== 'active') {
    return t('userSubscriptions.resetQuotaNotActive')
  }

  if (!subscription.expires_at) {
    return t('userSubscriptions.resetQuotaNoExpiry')
  }

  const expiresAt = new Date(subscription.expires_at)
  if (isNaN(expiresAt.getTime())) {
    return t('userSubscriptions.resetQuotaInvalidExpiry')
  }

  if (expiresAt.getTime() - Date.now() < MS_PER_DAY) {
    return t('userSubscriptions.resetQuotaExpiresSoon')
  }

  return null
}

function normalizeResetExpiry({
  updated,
  originalExpiresAt
}: {
  updated: UserSubscription
  originalExpiresAt: string | null
}): UserSubscription {
  if (!originalExpiresAt) return updated

  const originalTs = new Date(originalExpiresAt).getTime()
  if (!Number.isFinite(originalTs) || !updated.expires_at) return updated

  const updatedTs = new Date(updated.expires_at).getTime()
  if (!Number.isFinite(updatedTs)) {
    updated.expires_at = new Date(originalTs - MS_PER_DAY).toISOString()
    return updated
  }

  const expectedTs = originalTs - MS_PER_DAY
  if (updatedTs <= expectedTs - ONE_DAY_ROUNDING_TOLERANCE_MS) {
    return updated
  }

  if (updatedTs >= originalTs || updatedTs > expectedTs) {
    updated.expires_at = new Date(expectedTs).toISOString()
  }

  return updated
}

function openResetQuotaDialog(subscription: UserSubscription): void {
  const resetError = getResetQuotaError(subscription)
  if (resetError) {
    appStore.showError(resetError)
    return
  }
  resettingSubscription.value = subscription
  showResetQuotaDialog.value = true
}

function closeResetQuotaDialog(): void {
  showResetQuotaDialog.value = false
  resettingSubscription.value = null
}

async function confirmResetQuota(): Promise<void> {
  if (!resettingSubscription.value || isResettingQuota.value) return

  const resetError = getResetQuotaError(resettingSubscription.value)
  if (resetError) {
    appStore.showError(resetError)
    showResetQuotaDialog.value = false
    resettingSubscription.value = null
    return
  }

  isResettingQuota.value = true
  try {
    const previousExpiresAt = resettingSubscription.value.expires_at
    const response = await subscriptionsAPI.resetQuota(resettingSubscription.value.id, {
      daily: true,
      weekly: false,
      monthly: false
    })

    const normalized = normalizeResetExpiry({
      updated: response,
      originalExpiresAt: previousExpiresAt
    })
    subscriptions.value = subscriptions.value.map((item) => {
      if (item.id === normalized.id) {
        return normalized
      }
      return item
    })
    appStore.showSuccess(t('userSubscriptions.resetQuotaSuccess'))
    showResetQuotaDialog.value = false
    resettingSubscription.value = null
  } catch (error: any) {
    const responseData = error?.response?.data || {}
    const status = Number(error?.status ?? error?.response?.status)
    const detail =
      responseData?.detail ||
      responseData?.message ||
      error?.message ||
      ''
    const normalizedMessage = String(detail || '').toLowerCase()

    if (
      status >= 500 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      status === 0 ||
      normalizedMessage.includes('unavailable') ||
      normalizedMessage.includes('service unavailable') ||
      normalizedMessage.includes('后台服务') ||
      normalizedMessage.includes('服务不可用')
    ) {
      appStore.showError(t('userSubscriptions.resetQuotaServiceUnavailable'))
      showResetQuotaDialog.value = false
      resettingSubscription.value = null
      return
    }

    if (status === 403) {
      appStore.showError(t('userSubscriptions.resetQuotaOnlyOwn'))
      showResetQuotaDialog.value = false
      resettingSubscription.value = null
      return
    }

    if (error?.status === 404) {
      appStore.showError(t('userSubscriptions.resetQuotaNotSupported'))
      showResetQuotaDialog.value = false
      resettingSubscription.value = null
      return
    }

    appStore.showError(error.response?.data?.detail || t('userSubscriptions.resetQuotaFailed'))
    showResetQuotaDialog.value = false
    resettingSubscription.value = null
    console.error('Failed to reset subscription quota:', error)
  } finally {
    isResettingQuota.value = false
  }
}

onMounted(() => {
  loadSubscriptions()
})
</script>
