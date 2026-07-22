<template>
  <AppLayout>
    <div class="space-y-6">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>

      <template v-else-if="stats">
        <section class="console-page-hero">
          <div class="relative">
            <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p class="console-kicker">{{ t('nav.dashboard') }}</p>
                <h2 class="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-3xl">
                  {{ t('dashboard.heroTitle', { name: displayName }) }}
                </h2>
              </div>
              <div class="flex flex-wrap gap-3">
                <button class="btn btn-primary" @click="router.push('/keys')">
                  <Icon name="key" size="sm" />
                  {{ t('dashboard.createApiKey') }}
                </button>
                <button class="btn btn-secondary" @click="router.push('/usage')">
                  <Icon name="chart" size="sm" />
                  {{ t('dashboard.viewUsage') }}
                </button>
              </div>
            </div>

            <div class="mt-6">
              <UserDashboardStats :stats="stats" />
            </div>
          </div>
        </section>

        <div class="grid gap-6 xl:grid-cols-2">
          <section class="surface-tile">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="console-kicker">{{ t('dashboard.activePlanKicker') }}</p>
                <h3 class="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                  {{ t('dashboard.activePlanTitle') }}
                </h3>
              </div>
              <button class="btn btn-secondary btn-sm" @click="router.push('/subscriptions')">
                {{ t('dashboard.viewAll') }}
              </button>
            </div>

            <div v-if="subscriptionStore.loading && activeSubscriptions.length === 0" class="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {{ t('common.loading') }}
            </div>
            <div v-else-if="activeSubscriptions.length === 0" class="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
              {{ t('dashboard.noActivePlans') }}
            </div>
            <div v-else class="mt-4 grid gap-3">
              <article
                v-for="subscription in activeSubscriptions"
                :key="subscription.id"
                class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-base font-semibold text-slate-950 dark:text-white">
                      {{ subscription.group?.name || `Group #${subscription.group_id}` }}
                    </p>
                    <p v-if="subscription.group?.description" class="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                      {{ subscription.group.description }}
                    </p>
                  </div>
                  <span class="badge badge-success shrink-0">{{ t('dashboard.active') }}</span>
                </div>

                <div class="mt-4 grid gap-2 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-slate-500 dark:text-slate-400">{{ t('dashboard.expiresAt') }}</span>
                    <span class="font-medium text-slate-700 dark:text-slate-200">
                      {{ formatSubscriptionExpiry(subscription.expires_at) }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-slate-500 dark:text-slate-400">{{ t('dashboard.usageLimits') }}</span>
                    <span class="text-right font-medium text-slate-700 dark:text-slate-200">
                      {{ formatSubscriptionLimits(subscription) }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section class="surface-tile">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="console-kicker">{{ t('dashboard.referralKicker') }}</p>
                <h3 class="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                  {{ t('dashboard.referralTitle') }}
                </h3>
              </div>
              <button class="btn btn-secondary btn-sm" @click="router.push('/referrals')">
                <Icon name="gift" size="sm" />
                {{ t('dashboard.viewReferrals') }}
              </button>
            </div>

            <div v-if="referralLoading && !referralProfile" class="mt-4 text-sm text-slate-500 dark:text-slate-400">
              {{ t('common.loading') }}
            </div>
            <div
              v-else-if="!referralProfile"
              class="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400"
            >
              {{ t('dashboard.referralUnavailable') }}
            </div>
            <div v-else class="mt-4 grid gap-3 sm:grid-cols-2">
              <article
                v-for="item in referralSummaryItems"
                :key="item.label"
                class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.04]"
              >
                <div class="flex items-center gap-3">
                  <div :class="item.iconWrapClass">
                    <Icon :name="item.icon" size="md" :class="item.iconClass" :stroke-width="2" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ item.label }}</p>
                    <p class="mt-1 text-xl font-semibold text-slate-950 dark:text-white">{{ item.value }}</p>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>

        <UserDashboardCharts
          v-model:startDate="startDate"
          v-model:endDate="endDate"
          v-model:granularity="granularity"
          :loading="loadingCharts"
          :trend="trendData"
          :models="modelStats"
          @dateRangeChange="loadCharts"
          @granularityChange="loadCharts"
        />
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { getReferralProfile, type ReferralProfile } from '@/api/referrals'
import { usageAPI, type UserDashboardStats as UserStatsType } from '@/api/usage'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import Icon from '@/components/icons/Icon.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import UserDashboardCharts from '@/components/user/dashboard/UserDashboardCharts.vue'
import UserDashboardStats from '@/components/user/dashboard/UserDashboardStats.vue'
import { useAuthStore } from '@/stores/auth'
import { useSubscriptionStore } from '@/stores/subscriptions'
import type { ModelStat, TrendDataPoint, UserSubscription } from '@/types'

type IconName = InstanceType<typeof Icon>['$props']['name']

const authStore = useAuthStore()
const subscriptionStore = useSubscriptionStore()
const { t, locale } = useI18n()
const router = useRouter()

const user = computed(() => authStore.user)
const displayName = computed(() => user.value?.username || user.value?.email?.split('@')[0] || 'User')
const activeSubscriptions = computed(() => subscriptionStore.activeSubscriptions)

const stats = ref<UserStatsType | null>(null)
const loading = ref(false)
const loadingCharts = ref(false)
const referralLoading = ref(false)
const referralProfile = ref<ReferralProfile | null>(null)
const trendData = ref<TrendDataPoint[]>([])
const modelStats = ref<ModelStat[]>([])

const formatLD = (d: Date) => d.toISOString().split('T')[0]
const startDate = ref(formatLD(new Date(Date.now() - 6 * 86400000)))
const endDate = ref(formatLD(new Date()))
const granularity = ref<'day' | 'hour'>('day')
const MS_PER_DAY = 24 * 60 * 60 * 1000

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

const numberLocale = computed(() => locale.value === 'zh' ? 'zh-CN' : 'en-US')
const formatNumber = (value: number) => value.toLocaleString(numberLocale.value)

const referralSummaryItems = computed(() => {
  const profile = referralProfile.value
  return [
    {
      label: t('dashboard.currentPoints'),
      value: formatNumber(profile?.points_balance ?? 0),
      icon: 'gift' as IconName,
      iconWrapClass: 'rounded-xl bg-emerald-100 p-2 shadow-sm shadow-emerald-900/10 dark:bg-emerald-400/10',
      iconClass: 'text-emerald-600 dark:text-emerald-400'
    },
    {
      label: t('dashboard.invitedFriends'),
      value: formatNumber(profile?.invited_count ?? 0),
      icon: 'users' as IconName,
      iconWrapClass: 'rounded-xl bg-sky-100 p-2 shadow-sm shadow-sky-900/10 dark:bg-sky-400/10',
      iconClass: 'text-sky-600 dark:text-sky-400'
    },
    {
      label: t('dashboard.rewardOrders'),
      value: formatNumber(profile?.rewarded_purchase_count ?? 0),
      icon: 'badge' as IconName,
      iconWrapClass: 'rounded-xl bg-violet-100 p-2 shadow-sm shadow-violet-900/10 dark:bg-violet-400/10',
      iconClass: 'text-violet-600 dark:text-violet-400'
    },
    {
      label: t('dashboard.totalEarned'),
      value: formatNumber(profile?.total_earned ?? 0),
      icon: 'trendingUp' as IconName,
      iconWrapClass: 'rounded-xl bg-amber-100 p-2 shadow-sm shadow-amber-900/10 dark:bg-amber-400/10',
      iconClass: 'text-amber-600 dark:text-amber-400'
    }
  ]
})

const loadStats = async () => {
  loading.value = true
  try {
    await authStore.refreshUser()
    stats.value = await usageAPI.getDashboardStats()
  } catch (error) {
    console.error('Failed to load dashboard stats:', error)
  } finally {
    loading.value = false
  }
}

const loadCharts = async () => {
  loadingCharts.value = true
  try {
    const [trend, models] = await Promise.all([
      usageAPI.getDashboardTrend({
        start_date: startDate.value,
        end_date: endDate.value,
        granularity: granularity.value
      }),
      usageAPI.getDashboardModels({
        start_date: startDate.value,
        end_date: endDate.value
      })
    ])
    trendData.value = trend.trend || []
    modelStats.value = models.models || []
  } catch (error) {
    console.error('Failed to load charts:', error)
  } finally {
    loadingCharts.value = false
  }
}

const loadSubscriptions = async () => {
  try {
    await subscriptionStore.fetchActiveSubscriptions()
  } catch (error) {
    console.error('Failed to load active subscriptions:', error)
  }
}

const loadReferralStats = async () => {
  referralLoading.value = true
  try {
    referralProfile.value = await getReferralProfile()
  } catch (error) {
    console.error('Failed to load referral stats:', error)
  } finally {
    referralLoading.value = false
  }
}

const formatSubscriptionExpiry = (expiresAt: string | null) => {
  if (!expiresAt) return t('dashboard.neverExpires')
  const expires = new Date(expiresAt)
  const days = getDaysRemaining(expiresAt)
  const date = expires.toLocaleString(numberLocale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  if (days <= 0) return t('dashboard.expiresOn', { date })
  return t('dashboard.daysRemaining', { date, days })
}

const formatSubscriptionLimits = (subscription: UserSubscription) => {
  const limits = [
    subscription.group?.daily_limit_usd ? t('dashboard.limitDailyUsd', { amount: subscription.group.daily_limit_usd.toFixed(0) }) : '',
    subscription.group?.weekly_limit_usd ? t('dashboard.limitWeeklyUsd', { amount: subscription.group.weekly_limit_usd.toFixed(0) }) : '',
    subscription.group?.monthly_limit_usd ? t('dashboard.limitMonthlyUsd', { amount: subscription.group.monthly_limit_usd.toFixed(0) }) : ''
  ].filter(Boolean)
  return limits.length > 0 ? limits.join(' / ') : t('dashboard.unlimited')
}

onMounted(() => {
  loadStats()
  loadCharts()
  loadSubscriptions()
  loadReferralStats()
})
</script>
