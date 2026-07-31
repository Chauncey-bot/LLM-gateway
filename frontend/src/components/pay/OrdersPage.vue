<template>
  <AppLayout>
    <div class="console-page mx-auto max-w-7xl space-y-5">
      <div class="console-title-panel">
        <p class="console-kicker">{{ kicker }}</p>
        <h1 class="console-section-title">{{ t('orders.title') }}</h1>
        <p class="console-section-description">{{ description }}</p>
      </div>

      <div
        v-if="querySupported === false"
        class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
      >
        {{ t('orders.queryUnavailable') }}
      </div>

      <div class="card overflow-hidden">
        <div class="section-toolbar flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div class="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr),180px,180px]">
            <div class="relative">
              <Icon
                name="search"
                size="md"
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                v-model="keywordDraft"
                type="text"
                class="input pl-10"
                :placeholder="keywordPlaceholder"
                @keydown.enter.prevent="applyFilters"
              />
            </div>

            <Select
              v-model="filters.tradeStatus"
              :options="tradeStatusOptions"
              @change="handleTradeStatusChange"
            />

            <Select
              v-model="filters.fulfillmentStatus"
              :options="fulfillmentStatusOptions"
              @change="handleFulfillmentStatusChange"
            />
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="btn btn-secondary" @click="resetFilters">
              {{ t('orders.reset') }}
            </button>
            <button type="button" class="btn btn-primary" @click="applyFilters">
              {{ t('orders.apply') }}
            </button>
            <button type="button" class="btn btn-secondary" @click="reloadOrders">
              <Icon name="refresh" size="sm" class="mr-1.5" />
              {{ t('orders.refresh') }}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-white/10 dark:text-dark-300">
          <div>
            {{ t('orders.total', { total }) }}
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span>{{ t(`orders.tradeStatusOptions.${filters.tradeStatus}`) }}</span>
            <span>{{ t(`orders.fulfillmentStatusOptions.${filters.fulfillmentStatus}`) }}</span>
          </div>
        </div>

        <div v-if="loading" class="flex justify-center py-12">
          <div
            class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
          ></div>
        </div>

        <div v-else-if="loadError" class="p-6">
          <EmptyState
            :title="t('orders.loadFailedTitle')"
            :description="loadError"
            :action-text="t('orders.refresh')"
            @action="reloadOrders"
          >
            <template #icon>
              <Icon name="exclamationTriangle" size="xl" class="text-rose-500" />
            </template>
          </EmptyState>
        </div>

        <div v-else-if="orders.length === 0" class="p-6">
          <EmptyState
            :title="t('orders.emptyTitle')"
            :description="emptyDescription"
            :action-text="admin ? undefined : t('nav.buySubscription')"
            :action-to="admin ? undefined : '/purchase'"
          >
            <template #icon>
              <Icon name="clipboard" size="xl" class="text-slate-400" />
            </template>
          </EmptyState>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-white/10">
            <thead class="bg-gray-50 dark:bg-white/5">
              <tr class="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-300">
                <th class="px-4 py-3">{{ t('orders.columns.orderId') }}</th>
                <th v-if="admin" class="px-4 py-3">{{ t('orders.columns.user') }}</th>
                <th class="px-4 py-3">{{ t('orders.columns.type') }}</th>
                <th class="px-4 py-3">{{ t('orders.columns.sku') }}</th>
                <th class="px-4 py-3">{{ t('orders.columns.paymentStatus') }}</th>
                <th class="px-4 py-3">{{ t('orders.columns.fulfillmentStatus') }}</th>
                <th class="px-4 py-3">{{ t('orders.columns.amount') }}</th>
                <th class="px-4 py-3">{{ t('orders.columns.createdAt') }}</th>
                <th class="px-4 py-3">{{ t('orders.columns.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-white/10">
              <tr
                v-for="order in orders"
                :key="order.merchantOrderId"
                class="align-top text-sm text-gray-700 dark:text-dark-200"
              >
                <td class="px-4 py-4">
                  <div class="font-mono text-xs text-slate-900 dark:text-white">
                    {{ order.merchantOrderId }}
                  </div>
                  <div v-if="order.platformOrderNo" class="mt-1 text-xs text-gray-500 dark:text-dark-400">
                    {{ t('orders.platformOrderNo') }}: {{ order.platformOrderNo }}
                  </div>
                </td>
                <td v-if="admin" class="px-4 py-4">
                  <div class="font-medium text-slate-900 dark:text-white">
                    {{ order.userEmail || '-' }}
                  </div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-dark-400">
                    #{{ order.userId }}<span v-if="order.userUsername"> / {{ order.userUsername }}</span>
                  </div>
                </td>
                <td class="px-4 py-4">
                  {{ t(`orders.types.${order.skuType}`, { default: order.skuType }) }}
                </td>
                <td class="px-4 py-4">
                  <div class="font-medium text-slate-900 dark:text-white">{{ order.skuCode }}</div>
                  <div class="mt-1 text-xs text-gray-500 dark:text-dark-400">
                    {{ orderSummary(order) }}
                  </div>
                </td>
                <td class="px-4 py-4">
                  <OrderBadge kind="trade" :status="order.tradeStatus" />
                </td>
                <td class="px-4 py-4">
                  <OrderBadge kind="fulfillment" :status="order.fulfillmentStatus" />
                  <div
                    v-if="order.errorMessage"
                    class="mt-2 max-w-xs text-xs text-rose-600 dark:text-rose-300"
                  >
                    {{ order.errorMessage }}
                  </div>
                </td>
                <td class="px-4 py-4 font-semibold text-slate-900 dark:text-white">
                  {{ formatAmount(order.amountCents) }}
                </td>
                <td class="px-4 py-4 text-xs text-gray-500 dark:text-dark-400">
                  <div>{{ formatDateTime(order.createdAt) }}</div>
                  <div v-if="order.lastCheckedAt" class="mt-1">
                    {{ t('orders.lastCheckedAt') }}: {{ formatDateTime(order.lastCheckedAt) }}
                  </div>
                </td>
                <td class="px-4 py-4">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-if="!admin"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="rowActionOrderId === order.merchantOrderId"
                      @click="refreshOrder(order)"
                    >
                      {{ t('orders.checkStatus') }}
                    </button>

                    <template v-else>
                      <button
                        v-if="canMarkPaid(order)"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="rowActionOrderId === order.merchantOrderId"
                        @click="changeAdminStatus(order, 'paid')"
                      >
                        {{ t('orders.markPaid') }}
                      </button>
                      <button
                        v-if="canMarkClosed(order)"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="rowActionOrderId === order.merchantOrderId"
                        @click="changeAdminStatus(order, 'closed')"
                      >
                        {{ t('orders.markClosed') }}
                      </button>
                      <span
                        v-if="!canMarkPaid(order) && !canMarkClosed(order)"
                        class="text-xs text-gray-400 dark:text-dark-500"
                      >
                        {{ t('orders.noActions') }}
                      </span>
                    </template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <Pagination
          v-if="total > 0"
          :total="total"
          :page="page"
          :page-size="pageSize"
          :page-size-options="[10, 20, 50, 100]"
          :show-jump="true"
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import { EmptyState, Pagination } from '@/components/common'
import Select from '@/components/common/Select.vue'
import OrderBadge from '@/components/pay/OrderBadge.vue'
import { useAppStore } from '@/stores'
import {
  isPayApiError,
  payAPI,
  type PaymentOrder,
  type PaymentOrderListResponse
} from '@/api/pay'
import { formatDateTime } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    admin?: boolean
  }>(),
  {
    admin: false
  }
)

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(false)
const loadError = ref('')
const orders = ref<PaymentOrder[]>([])
const querySupported = ref(true)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const rowActionOrderId = ref('')

const filters = reactive(defaultFilters(props.admin))
const keywordDraft = ref(filters.keyword)

const admin = computed(() => props.admin)
const kicker = computed(() => (admin.value ? t('nav.orders') : t('nav.myAccount')))
const description = computed(() =>
  admin.value ? t('orders.adminDescription') : t('orders.description')
)
const emptyDescription = computed(() =>
  admin.value ? t('orders.emptyAdminDesc') : t('orders.emptyDesc')
)
const keywordPlaceholder = computed(() =>
  admin.value ? t('orders.keywordPlaceholderAdmin') : t('orders.keywordPlaceholder')
)

const tradeStatusOptions = computed(() => [
  { value: 'all', label: t('orders.tradeStatusOptions.all') },
  { value: 'pending', label: t('orders.tradeStatusOptions.pending') },
  { value: 'paid', label: t('orders.tradeStatusOptions.paid') },
  { value: 'closed', label: t('orders.tradeStatusOptions.closed') },
  { value: 'failed', label: t('orders.tradeStatusOptions.failed') },
  { value: 'refunded', label: t('orders.tradeStatusOptions.refunded') }
])

const fulfillmentStatusOptions = computed(() => [
  { value: 'all', label: t('orders.fulfillmentStatusOptions.all') },
  { value: 'pending', label: t('orders.fulfillmentStatusOptions.pending') },
  { value: 'fulfilled', label: t('orders.fulfillmentStatusOptions.fulfilled') },
  {
    value: 'fulfillment_failed',
    label: t('orders.fulfillmentStatusOptions.fulfillment_failed')
  }
])

function defaultFilters(isAdmin: boolean) {
  return {
    tradeStatus: isAdmin ? 'all' : 'paid',
    fulfillmentStatus: 'all',
    keyword: ''
  }
}

function formatAmount(amountCents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100)
}

function orderSummary(order: PaymentOrder): string {
  if (order.skuType === 'subscription') {
    return t('orders.subscriptionSummary', {
      groupId: order.groupId ?? '-',
      validityDays: order.validityDays ?? '-'
    })
  }
  if (order.skuType === 'traffic') {
    return t('orders.trafficSummary', {
      balanceAmount: order.balanceAmount ?? '-'
    })
  }

  return t('orders.balanceSummary', {
    balanceAmount: order.balanceAmount ?? '-'
  })
}

function replaceOrder(updated: PaymentOrder): void {
  const index = orders.value.findIndex((item) => item.merchantOrderId === updated.merchantOrderId)
  if (index !== -1) {
    orders.value.splice(index, 1, updated)
  }
}

function describeOrderResult(
  order: PaymentOrder,
  supported: boolean
): { type: 'success' | 'error' | 'warning' | 'info'; message: string } {
  if (!supported) {
    return {
      type: 'warning',
      message: t('orders.checkResultQueryUnavailable')
    }
  }

  if (order.fulfillmentStatus === 'fulfilled') {
    return {
      type: 'success',
      message: t('orders.checkResultFulfilled')
    }
  }

  if (order.fulfillmentStatus === 'fulfillment_failed') {
    return {
      type: 'error',
      message: t('orders.checkResultFulfillmentFailed', {
        reason: order.errorMessage || t('orders.unknownError')
      })
    }
  }

  if (['failed', 'closed', 'refunded'].includes(order.tradeStatus)) {
    return {
      type: 'error',
      message: t('orders.checkResultTradeStopped', {
        status: t(`orders.tradeStatusOptions.${order.tradeStatus}`)
      })
    }
  }

  return {
    type: 'info',
    message: t('orders.checkResultPending')
  }
}

function showToast(type: 'success' | 'error' | 'warning' | 'info', message: string): void {
  switch (type) {
    case 'success':
      appStore.showSuccess(message)
      return
    case 'warning':
      appStore.showWarning(message)
      return
    case 'info':
      appStore.showInfo(message)
      return
    default:
      appStore.showError(message)
  }
}

async function loadOrders(showSpinner: boolean = true): Promise<void> {
  if (showSpinner) {
    loading.value = true
  }

  loadError.value = ''

  try {
    const response: PaymentOrderListResponse = admin.value
      ? await payAPI.listAdminOrders({
          page: page.value,
          pageSize: pageSize.value,
          tradeStatus: filters.tradeStatus,
          fulfillmentStatus: filters.fulfillmentStatus,
          keyword: filters.keyword
        })
      : await payAPI.listOrders({
          page: page.value,
          pageSize: pageSize.value,
          tradeStatus: filters.tradeStatus,
          fulfillmentStatus: filters.fulfillmentStatus,
          keyword: filters.keyword
        })

    orders.value = response.orders
    total.value = response.total
    page.value = response.page
    pageSize.value = response.pageSize
    querySupported.value = response.querySupported !== false
  } catch (error) {
    loadError.value = isPayApiError(error)
      ? error.message
      : t('orders.loadFailedFallback')
  } finally {
    loading.value = false
  }
}

function applyFilters(): void {
  filters.keyword = keywordDraft.value.trim()
  if (page.value !== 1) {
    page.value = 1
  }
  void loadOrders()
}

function resetFilters(): void {
  Object.assign(filters, defaultFilters(admin.value))
  keywordDraft.value = filters.keyword
  page.value = 1
  void loadOrders()
}

function handleTradeStatusChange(): void {
  page.value = 1
  void loadOrders()
}

function handleFulfillmentStatusChange(): void {
  page.value = 1
  void loadOrders()
}

function handlePageChange(nextPage: number): void {
  page.value = nextPage
  void loadOrders()
}

function handlePageSizeChange(nextPageSize: number): void {
  pageSize.value = nextPageSize
  page.value = 1
  void loadOrders()
}

function reloadOrders(): void {
  void loadOrders()
}

function canMarkPaid(order: PaymentOrder): boolean {
  return !['paid', 'refunded'].includes(order.tradeStatus)
}

function canMarkClosed(order: PaymentOrder): boolean {
  return !['paid', 'refunded', 'closed'].includes(order.tradeStatus)
}

async function refreshOrder(order: PaymentOrder): Promise<void> {
  rowActionOrderId.value = order.merchantOrderId
  try {
    const response = await payAPI.checkOrder(order.merchantOrderId)
    querySupported.value = response.querySupported !== false
    replaceOrder(response.order)

    const result = describeOrderResult(response.order, response.querySupported !== false)
    showToast(result.type, result.message)
  } catch (error) {
    appStore.showError(isPayApiError(error) ? error.message : t('orders.refreshFailed'))
  } finally {
    rowActionOrderId.value = ''
  }
}

async function changeAdminStatus(
  order: PaymentOrder,
  tradeStatus: 'paid' | 'closed'
): Promise<void> {
  rowActionOrderId.value = order.merchantOrderId
  try {
    const response = await payAPI.updateAdminOrderStatus(order.merchantOrderId, tradeStatus)
    replaceOrder(response.order)
    showToast('success', t('orders.updateStatusSuccess'))
  } catch (error) {
    appStore.showError(isPayApiError(error) ? error.message : t('orders.updateStatusFailed'))
  } finally {
    rowActionOrderId.value = ''
  }
}

onMounted(() => {
  void loadOrders()
})
</script>
