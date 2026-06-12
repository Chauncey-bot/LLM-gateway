<template>
  <AppLayout>
    <div class="console-page mx-auto max-w-7xl space-y-5">
      <div
        v-if="errorMessage"
        class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-sm dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200"
      >
        {{ errorMessage }}
      </div>

      <section class="console-page-hero">
        <div class="relative z-10">
          <p class="console-kicker">{{ t('pointsMall.kicker') }}</p>
          <h2 class="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-3xl">
            {{ t('pointsMall.title') }}
          </h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {{ t('pointsMall.description') }}
          </p>
        </div>

        <div class="relative z-10 mt-6 grid gap-3 sm:grid-cols-3 lg:mt-0 lg:w-[520px]">
          <div class="metric-tile">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ t('pointsMall.currentPoints') }}</p>
            <p class="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
              {{ loading && !profile ? '--' : pointsBalance }}
            </p>
          </div>
          <div class="metric-tile">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ t('pointsMall.totalEarned') }}</p>
            <p class="mt-2 text-3xl font-semibold text-emerald-600">
              {{ profile?.total_earned ?? '--' }}
            </p>
          </div>
          <div class="metric-tile">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ t('pointsMall.totalSpent') }}</p>
            <p class="mt-2 text-3xl font-semibold text-red-600">
              {{ profile?.total_spent ?? '--' }}
            </p>
          </div>
        </div>
      </section>

      <section class="card overflow-hidden">
        <div class="section-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-base font-semibold text-slate-950 dark:text-white">{{ t('pointsMall.redemptionTitle') }}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {{ t('pointsMall.redemptionDescription') }}
            </p>
          </div>
          <button class="btn btn-secondary btn-sm" :disabled="catalogLoading" @click="loadCatalog">
            <Icon name="refresh" size="xs" />
            {{ t('common.refresh') }}
          </button>
        </div>

        <div v-if="catalogLoading" class="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <div v-for="i in 6" :key="i" class="h-36 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-800"></div>
        </div>
        <div v-else-if="catalogItems.length === 0" class="px-5 py-12 text-center text-sm text-gray-500 dark:text-dark-400">
          {{ t('pointsMall.emptyCatalog') }}
        </div>
        <div v-else class="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <article v-for="item in catalogItems" :key="item.sku_code" class="surface-tile card-hover">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h4 class="truncate font-semibold text-slate-950 dark:text-white">{{ item.title }}</h4>
                <p v-if="item.description" class="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                  {{ item.description }}
                </p>
              </div>
              <span class="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                {{ t('pointsMall.validityDays', { days: item.validity_days }) }}
              </span>
            </div>

            <div class="mt-4 flex items-end justify-between gap-3">
              <div>
                <p class="text-2xl font-semibold text-slate-950 dark:text-white">{{ t('pointsMall.pointsCost', { points: item.points_cost }) }}</p>
                <p v-if="item.cash_amount_cents !== null" class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ t('pointsMall.referencePrice', { amount: formatMoney(item.cash_amount_cents) }) }}
                </p>
              </div>
              <button
                class="btn btn-primary shrink-0"
                :disabled="redeemingSku === item.sku_code || !canRedeem(item)"
                @click="handleRedeem(item)"
              >
                {{ redeemingSku === item.sku_code ? t('pointsMall.redeeming') : canRedeem(item) ? t('pointsMall.redeemNow') : t('pointsMall.insufficientPoints') }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="card overflow-hidden">
        <div class="section-toolbar flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-base font-semibold text-slate-950 dark:text-white">{{ t('pointsMall.ledgerTitle') }}</h3>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {{ t('pointsMall.ledgerDescription') }}
            </p>
          </div>
          <button class="btn btn-secondary btn-sm" :disabled="ledgerLoading" @click="loadLedger">
            <Icon name="refresh" size="xs" />
            {{ t('common.refresh') }}
          </button>
        </div>

        <div v-if="ledgerLoading" class="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">{{ t('common.loading') }}</div>
        <div v-else-if="ledgerItems.length === 0" class="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          {{ t('pointsMall.emptyLedger') }}
        </div>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-100 dark:divide-white/10">
            <thead class="bg-slate-50 dark:bg-white/[0.04]">
              <tr>
                <th class="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{{ t('pointsMall.table.time') }}</th>
                <th class="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{{ t('pointsMall.table.type') }}</th>
                <th class="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{{ t('pointsMall.table.change') }}</th>
                <th class="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">{{ t('pointsMall.table.balance') }}</th>
                <th class="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{{ t('pointsMall.table.remark') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white dark:divide-white/10 dark:bg-transparent">
              <tr v-for="item in ledgerItems" :key="item.id" class="transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.035]">
                <td class="whitespace-nowrap px-5 py-3 text-sm text-slate-600 dark:text-slate-300">{{ formatDate(item.created_at) }}</td>
                <td class="px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-200">{{ formatLedgerType(item.type) }}</td>
                <td
                  class="whitespace-nowrap px-5 py-3 text-right text-sm font-semibold"
                  :class="item.direction === 'credit' ? 'text-emerald-600' : 'text-red-600'"
                >
                  {{ item.direction === 'credit' ? '+' : '-' }}{{ item.amount }}
                </td>
                <td class="whitespace-nowrap px-5 py-3 text-right text-sm text-slate-700 dark:text-slate-200">{{ item.balance_after }}</td>
                <td class="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">{{ item.remark || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-white/10 dark:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {{ t('pointsMall.pagination', { total: ledgerTotal, page: ledgerPage }) }}
          </p>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" :disabled="ledgerPage <= 1 || ledgerLoading" @click="changeLedgerPage(ledgerPage - 1)">
              {{ t('common.previous') }}
            </button>
            <button class="btn btn-secondary btn-sm" :disabled="ledgerPage >= ledgerPages || ledgerLoading" @click="changeLedgerPage(ledgerPage + 1)">
              {{ t('common.next') }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppLayout } from '@/components/layout'
import Icon from '@/components/icons/Icon.vue'
import { useAppStore } from '@/stores'
import {
  getPointsLedger,
  getRedemptionCatalog,
  getReferralProfile,
  redeemWithPoints,
  type PointsLedgerItem,
  type RedemptionCatalogItem,
  type ReferralProfile
} from '@/api/referrals'

const appStore = useAppStore()
const { locale, t } = useI18n()

const loading = ref(false)
const ledgerLoading = ref(false)
const catalogLoading = ref(false)
const redeemingSku = ref('')
const errorMessage = ref('')
const profile = ref<ReferralProfile | null>(null)
const ledgerItems = ref<PointsLedgerItem[]>([])
const catalogItems = ref<RedemptionCatalogItem[]>([])
const ledgerPage = ref(1)
const ledgerPageSize = 10
const ledgerTotal = ref(0)

const pointsBalance = computed(() => profile.value?.points_balance ?? 0)
const ledgerPages = computed(() => Math.max(1, Math.ceil(ledgerTotal.value / ledgerPageSize)))
const currentLocale = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return fallback
}

async function loadProfile(): Promise<void> {
  profile.value = await getReferralProfile()
}

async function loadLedger(): Promise<void> {
  ledgerLoading.value = true
  try {
    const data = await getPointsLedger(ledgerPage.value, ledgerPageSize)
    ledgerItems.value = data.items
    ledgerTotal.value = data.total
  } finally {
    ledgerLoading.value = false
  }
}

async function loadCatalog(): Promise<void> {
  catalogLoading.value = true
  try {
    catalogItems.value = await getRedemptionCatalog()
  } finally {
    catalogLoading.value = false
  }
}

async function loadAll(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    await Promise.all([loadProfile(), loadLedger(), loadCatalog()])
  } catch (error) {
    errorMessage.value = getErrorMessage(error, t('pointsMall.loadFailed'))
  } finally {
    loading.value = false
  }
}

function canRedeem(item: RedemptionCatalogItem): boolean {
  return pointsBalance.value >= item.points_cost
}

async function handleRedeem(item: RedemptionCatalogItem): Promise<void> {
  if (!canRedeem(item)) return
  const confirmed = window.confirm(t('pointsMall.confirmRedeem', { points: item.points_cost, title: item.title }))
  if (!confirmed) return

  redeemingSku.value = item.sku_code
  errorMessage.value = ''
  try {
    await redeemWithPoints(item.sku_code)
    appStore.showSuccess(t('pointsMall.redeemSuccess'))
    await Promise.all([loadProfile(), loadLedger()])
  } catch (error) {
    const message = getErrorMessage(error, t('pointsMall.redeemFailed'))
    errorMessage.value = message
    appStore.showError(message)
  } finally {
    redeemingSku.value = ''
  }
}

async function changeLedgerPage(page: number): Promise<void> {
  ledgerPage.value = Math.min(Math.max(1, page), ledgerPages.value)
  await loadLedger()
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(currentLocale.value, {
    style: 'currency',
    currency: 'CNY'
  }).format(cents / 100)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(currentLocale.value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatLedgerType(type: string): string {
  const labels: Record<string, string> = {
    referral_reward: t('pointsMall.ledgerTypes.referralReward'),
    renewal_reward: t('pointsMall.ledgerTypes.renewalReward'),
    redeem_subscription: t('pointsMall.ledgerTypes.redeemSubscription'),
    admin_adjustment: t('pointsMall.ledgerTypes.adminAdjustment')
  }
  return labels[type] || type
}

onMounted(() => {
  void loadAll()
})
</script>
