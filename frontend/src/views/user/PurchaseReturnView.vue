<template>
  <AppLayout>
    <div class="console-page mx-auto max-w-4xl space-y-5">
      <div class="console-title-panel">
        <p class="console-kicker">{{ t('nav.buySubscription') }}</p>
        <h1 class="console-section-title">{{ t('orders.returnTitle') }}</h1>
        <p class="console-section-description">{{ t('orders.returnDescription') }}</p>
      </div>

      <div v-if="loading" class="flex justify-center py-12">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
        ></div>
      </div>

      <div v-else-if="errorMessage" class="card p-6">
        <EmptyState
          :title="t('orders.returnErrorTitle')"
          :description="errorMessage"
          :action-text="t('orders.retry')"
          @action="loadOrderStatus"
        >
          <template #icon>
            <Icon name="exclamationTriangle" size="xl" class="text-rose-500" />
          </template>
        </EmptyState>
      </div>

      <template v-else-if="order">
        <div
          v-if="querySupported === false"
          class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
        >
          {{ t('orders.checkResultQueryUnavailable') }}
        </div>

        <div class="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
          <div class="card p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-medium text-gray-500 dark:text-dark-400">
                  {{ t('orders.columns.orderId') }}
                </p>
                <p class="mt-2 font-mono text-sm text-slate-900 dark:text-white">
                  {{ order.merchantOrderId }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <OrderBadge kind="trade" :status="order.tradeStatus" />
                <OrderBadge kind="fulfillment" :status="order.fulfillmentStatus" />
              </div>
            </div>

            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <div class="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('orders.columns.type') }}
                </p>
                <p class="mt-2 font-medium text-slate-900 dark:text-white">
                  {{ t(`orders.types.${order.skuType}`, { default: order.skuType }) }}
                </p>
              </div>
              <div class="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('orders.columns.amount') }}
                </p>
                <p class="mt-2 font-medium text-slate-900 dark:text-white">
                  {{ formatAmount(order.amountCents) }}
                </p>
              </div>
              <div class="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('orders.columns.createdAt') }}
                </p>
                <p class="mt-2 text-sm text-slate-900 dark:text-white">
                  {{ formatDateTime(order.createdAt) }}
                </p>
              </div>
              <div class="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('orders.lastCheckedAt') }}
                </p>
                <p class="mt-2 text-sm text-slate-900 dark:text-white">
                  {{ order.lastCheckedAt ? formatDateTime(order.lastCheckedAt) : '-' }}
                </p>
              </div>
            </div>

            <div class="mt-6 rounded-2xl border border-gray-200 px-4 py-4 dark:border-white/10">
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                {{ t('orders.returnStatusTitle') }}
              </p>
              <p class="mt-2 text-sm text-gray-600 dark:text-dark-300">
                {{ statusMessage }}
              </p>
              <p
                v-if="order.errorMessage"
                class="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"
              >
                {{ order.errorMessage }}
              </p>
            </div>
          </div>

          <div class="card p-6">
            <div class="space-y-4">
              <div>
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('orders.columns.sku') }}
                </p>
                <p class="mt-2 font-medium text-slate-900 dark:text-white">{{ order.skuCode }}</p>
                <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">{{ orderSummary }}</p>
              </div>

              <div>
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('orders.platformOrderNo') }}
                </p>
                <p class="mt-2 break-all text-sm text-slate-900 dark:text-white">
                  {{ order.platformOrderNo || '-' }}
                </p>
              </div>

              <div class="flex flex-wrap gap-3 pt-2">
                <button type="button" class="btn btn-secondary" @click="loadOrderStatus">
                  <Icon name="refresh" size="sm" class="mr-1.5" />
                  {{ t('orders.retry') }}
                </button>
                <RouterLink to="/orders" class="btn btn-primary">
                  {{ t('orders.backToOrders') }}
                </RouterLink>
                <RouterLink to="/purchase" class="btn btn-secondary">
                  {{ t('orders.backToPurchase') }}
                </RouterLink>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import { EmptyState } from '@/components/common'
import OrderBadge from '@/components/pay/OrderBadge.vue'
import { isPayApiError, payAPI, type PaymentOrder } from '@/api/pay'
import { formatDateTime } from '@/utils/format'

const { t } = useI18n()
const route = useRoute()

const loading = ref(false)
const errorMessage = ref('')
const order = ref<PaymentOrder | null>(null)
const querySupported = ref(true)

const orderSummary = computed(() => {
  if (!order.value) return ''

  if (order.value.skuType === 'subscription') {
    return t('orders.subscriptionSummary', {
      groupId: order.value.groupId ?? '-',
      validityDays: order.value.validityDays ?? '-'
    })
  }

  return t('orders.balanceSummary', {
    balanceAmount: order.value.balanceAmount ?? '-'
  })
})

const statusMessage = computed(() => {
  if (!order.value) return ''
  if (querySupported.value === false) return t('orders.checkResultQueryUnavailable')

  if (order.value.fulfillmentStatus === 'fulfilled') {
    return t('orders.checkResultFulfilled')
  }

  if (order.value.fulfillmentStatus === 'fulfillment_failed') {
    return t('orders.checkResultFulfillmentFailed', {
      reason: order.value.errorMessage || t('orders.unknownError')
    })
  }

  if (['failed', 'closed', 'refunded'].includes(order.value.tradeStatus)) {
    return t('orders.checkResultTradeStopped', {
      status: t(`orders.tradeStatusOptions.${order.value.tradeStatus}`)
    })
  }

  return t('orders.checkResultPending')
})

function formatAmount(amountCents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100)
}

async function loadOrderStatus(): Promise<void> {
  const merchantOrderId = route.query.merchantOrderId

  if (typeof merchantOrderId !== 'string' || !merchantOrderId.trim()) {
    errorMessage.value = t('orders.returnMissingOrderId')
    order.value = null
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await payAPI.checkOrder(merchantOrderId)
    order.value = response.order
    querySupported.value = response.querySupported !== false
  } catch (error) {
    errorMessage.value = isPayApiError(error) ? error.message : t('orders.loadFailedFallback')
    order.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadOrderStatus()
})
</script>
