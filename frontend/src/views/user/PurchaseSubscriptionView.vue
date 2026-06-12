<template>
  <div class="min-h-screen bg-[#f6f7fb] px-4 py-6">
    <div class="mx-auto w-full max-w-6xl space-y-4">
      <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wider text-primary-600">
          {{ pageLabel }}
        </p>
        <h1 class="mt-2 text-2xl font-bold text-gray-900">
          {{ pageTitle }}
        </h1>
        <p class="mt-2 max-w-3xl text-sm leading-relaxed text-gray-500">
          {{ pageDescription }}
        </p>
      </section>

      <div
        v-if="globalError"
        class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ globalError }}
      </div>

      <section v-if="isPurchaseRoute" class="space-y-4">
        <section class="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 class="text-lg font-semibold text-gray-900">已登录用户信息</h2>
          <p class="mt-2 text-sm text-gray-500">
            {{ session.user ? session.user.email : '请先确认登录状态' }}
          </p>
        </section>

        <section class="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 class="text-lg font-semibold text-gray-900">订阅套餐</h2>
          <p class="mt-1 text-sm text-gray-500">先选套餐，再点击支付。</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="sku in subscriptions"
              :key="sku.code"
              class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div class="text-sm font-semibold text-gray-900">{{ sku.title }}</div>
              <div class="mt-2 text-xs text-gray-500">{{ sku.description }}</div>
              <div class="mt-4 flex items-end justify-between">
                <div>
                  <p class="text-xl font-bold text-gray-900">{{ formatCny(sku.amountCents) }}</p>
                  <p class="text-xs text-gray-500">
                    有效期 {{ sku.validityDays }} 天 · Group {{ sku.groupId }}
                  </p>
                </div>
                <button
                  class="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="busyCreate === sku.code"
                  @click="createOrder(sku.code)"
                >
                  {{ busyCreate === sku.code ? '提交中...' : '立即支付' }}
                </button>
              </div>
            </article>
          </div>
          <p v-if="!subscriptions.length" class="mt-4 text-sm text-gray-500">
            当前未配置订阅套餐。
          </p>
        </section>

        <section class="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 class="text-lg font-semibold text-gray-900">余额充值</h2>
          <p class="mt-1 text-sm text-gray-500">选择余额档位后支付后自动到账。</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="sku in balancePacks"
              :key="sku.code"
              class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div class="text-sm font-semibold text-gray-900">{{ sku.title }}</div>
              <div class="mt-2 text-xs text-gray-500">{{ sku.description }}</div>
              <div class="mt-4 flex items-end justify-between">
                <div>
                  <p class="text-xl font-bold text-gray-900">{{ formatCny(sku.amountCents) }}</p>
                  <p class="text-xs text-gray-500">到账 {{ sku.balanceAmount }} 元</p>
                </div>
                <button
                  class="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="busyCreate === sku.code"
                  @click="createOrder(sku.code)"
                >
                  {{ busyCreate === sku.code ? '提交中...' : '立即支付' }}
                </button>
              </div>
            </article>
          </div>
          <p v-if="!balancePacks.length" class="mt-4 text-sm text-gray-500">
            当前未配置余额充值档位。
          </p>
        </section>
      </section>

      <section v-else class="space-y-4">
        <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 class="text-lg font-semibold text-gray-900">
              订单筛选
            </h2>
            <p class="text-xs text-gray-500">
              共 {{ total }} 条，当前 {{ page }} / {{ totalPages }} 页
            </p>
          </div>
          <div class="mt-4 grid gap-3 md:flex md:flex-wrap md:items-center">
            <select
              v-model="filters.tradeStatus"
              class="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
              @change="resetPageAndLoad"
            >
              <option value="all">支付状态：全部</option>
              <option value="paid">已支付</option>
              <option value="pending">待支付</option>
              <option value="closed">已关闭</option>
              <option value="failed">支付失败</option>
              <option value="refunded">已退款</option>
            </select>
            <select
              v-model="filters.fulfillmentStatus"
              class="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
              @change="resetPageAndLoad"
            >
              <option value="all">发放状态：全部</option>
              <option value="pending">待发放</option>
              <option value="fulfilled">已发放</option>
              <option value="fulfillment_failed">发放失败</option>
            </select>
            <input
              v-model.trim="filters.keyword"
              type="text"
              class="h-10 flex-1 min-w-[220px] rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
              :placeholder="isAdminMode ? '关键词：订单号 / SKU / 邮箱 / 用户名' : '关键词：订单号 / SKU'"
              @keydown.enter.prevent="applyOrderFilters"
            />
            <button
              class="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
              :disabled="ordersLoading"
              @click="applyOrderFilters"
            >
              查询
            </button>
            <button
              class="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
              :disabled="ordersLoading"
              @click="resetFilters"
            >
              重置
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-gray-200 bg-white">
          <div v-if="ordersLoading" class="py-12 text-center text-sm text-gray-500">
            加载订单中...
          </div>
          <div v-else-if="ordersError" class="px-5 py-4 text-sm text-red-600">
            {{ ordersError }}
          </div>
          <div v-else-if="orders.length === 0" class="px-5 py-4 text-sm text-gray-500">
            暂无订单。
          </div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th v-if="isAdminMode" class="px-4 py-3">用户账号</th>
                  <th class="px-4 py-3">订单号</th>
                  <th class="px-4 py-3">类型</th>
                  <th class="px-4 py-3">SKU</th>
                  <th class="px-4 py-3">支付状态</th>
                  <th class="px-4 py-3">发放状态</th>
                  <th class="px-4 py-3">金额</th>
                  <th class="px-4 py-3">创建时间</th>
                  <th class="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 text-sm text-gray-700">
                <tr v-for="order in orders" :key="order.merchantOrderId" class="hover:bg-gray-50">
                  <td v-if="isAdminMode" class="px-4 py-3">
                    <p class="font-medium">{{ order.userEmail || '-' }}</p>
                    <p class="text-xs text-gray-500">用户名：{{ order.userUsername || '-' }}</p>
                    <p class="text-xs text-gray-500">UID：{{ order.userId }}</p>
                  </td>
                  <td class="px-4 py-3 font-mono text-xs text-gray-700">{{ order.merchantOrderId }}</td>
                  <td class="px-4 py-3 text-gray-700">
                    {{ order.skuType === 'subscription' ? '订阅' : '余额' }}
                  </td>
                  <td class="px-4 py-3 text-gray-700">
                    <p>{{ order.skuCode }}</p>
                    <p class="text-xs text-gray-500">
                      {{ formatOrderSummary(order) }}
                    </p>
                  </td>
                  <td class="px-4 py-3">
                    <span :class="statusBadgeClass(order.tradeStatus)" class="inline-flex rounded-full px-2.5 py-1 text-xs">
                      {{ order.tradeStatusLabel || order.tradeStatus }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <span
                      :class="statusBadgeClass(order.fulfillmentStatus)"
                      class="inline-flex rounded-full px-2.5 py-1 text-xs"
                    >
                      {{ order.fulfillmentStatusLabel || order.fulfillmentStatus }}
                    </span>
                  </td>
                  <td class="px-4 py-3 font-semibold text-gray-900">
                    {{ formatCny(order.amountCents) }}
                  </td>
                  <td class="px-4 py-3 text-xs text-gray-500">
                    {{ formatDateTime(order.createdAt) }}
                  </td>
                  <td class="px-4 py-3">
                    <div v-if="isAdminMode" class="flex gap-2">
                      <button
                        class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-50"
                        :disabled="busyOrderStatus === order.merchantOrderId"
                        @click="setAdminOrderStatus(order.merchantOrderId, 'paid')"
                      >
                        标记已支付
                      </button>
                      <button
                        class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-50"
                        :disabled="busyOrderStatus === order.merchantOrderId"
                        @click="setAdminOrderStatus(order.merchantOrderId, 'closed')"
                      >
                        标记关闭
                      </button>
                    </div>
                    <div v-else>
                      <button
                        class="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 disabled:opacity-50"
                        :disabled="busyOrderStatus === order.merchantOrderId"
                        @click="checkOrder(order.merchantOrderId)"
                      >
                        刷新状态
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="flex items-center justify-end gap-2">
          <button
            class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
            :disabled="page <= 1 || ordersLoading"
            @click="changePage(page - 1)"
          >
            上一页
          </button>
          <button
            class="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
            :disabled="page >= totalPages || ordersLoading"
            @click="changePage(page + 1)"
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

type PurchaseRouteMode = 'purchase' | 'orders'
type TradeStatus = 'all' | 'paid' | 'pending' | 'closed' | 'failed' | 'refunded'
type FulfillmentStatus = 'all' | 'pending' | 'fulfilled' | 'fulfillment_failed'

interface CatalogSku {
  code: string
  title: string
  description: string
  amountCents: number
  groupId?: number
  validityDays?: number
  balanceAmount?: number
}

interface CatalogData {
  subscriptions: CatalogSku[]
  balancePacks: CatalogSku[]
}

interface PurchaseSession {
  id: number
  email: string
  username: string
}

interface OrderRow {
  merchantOrderId: string
  userId: number
  userEmail: string | null
  userUsername: string | null
  skuType: 'subscription' | 'balance'
  skuCode: string
  groupId: number | null
  validityDays: number | null
  balanceAmount: number | null
  amountCents: number
  platformOrderNo: string | null
  tradeStatus: string
  tradeStatusLabel: string
  fulfillmentStatus: string
  fulfillmentStatusLabel: string
  createdAt: string
}

interface OrdersResponse {
  orders: OrderRow[]
  total: number
  page: number
  totalPages: number
}

const PAGE_SIZE = 20
const TTL_MS = 30000

const isPurchaseRoute = computed<PurchaseRouteMode>(() =>
  route.path === '/purchase' ? 'purchase' : 'orders',
)
const isAdminMode = computed(() => route.path === '/admin/orders')

const pageLabel = computed(() =>
  isPurchaseRoute.value === 'purchase' ? '充值 / 订阅' : '订单管理',
)
const pageTitle = computed(() =>
  isPurchaseRoute.value === 'purchase' ? '购买套餐' : '订单管理',
)
const pageDescription = computed(() =>
  isPurchaseRoute.value === 'purchase'
    ? '通过支付宝购买订阅或充值余额，支付完成后会进入订单发放流程。'
    : '查看并筛选订单，管理员可手动调整支付状态。',
)

const globalError = ref('')
const ordersError = ref('')
const ordersLoading = ref(false)
const session = reactive<PurchaseSession & { user: PurchaseSession | null }>({ id: 0, email: '', username: '', user: null })
const catalog = ref<CatalogData>({ subscriptions: [], balancePacks: [] })
const subscriptions = computed(() => catalog.value.subscriptions)
const balancePacks = computed(() => catalog.value.balancePacks)

const orders = ref<OrderRow[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = ref(1)
const filters = reactive({
  tradeStatus: 'all' as TradeStatus,
  fulfillmentStatus: 'all' as FulfillmentStatus,
  keyword: '',
})
const sessionAuthToken = ref('')
const busyCreate = ref('')
const busyOrderStatus = ref('')
const cache = new Map<string, { fetchedAt: number; data: OrdersResponse }>()

function formatCny(amountCents: number): string {
  return `¥${(Number(amountCents || 0) / 100).toFixed(2)}`
}

function formatDateTime(value: string): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function formatOrderSummary(order: OrderRow): string {
  if (order.skuType === 'subscription') {
    return `Group ${order.groupId ?? '-'} · ${order.validityDays ?? '-'} 天`
  }
  return `余额 +${order.balanceAmount ?? 0}`
}

function statusBadgeClass(status: string): string {
  if (status === 'paid' || status === 'fulfilled') {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  }
  if (status === 'closed' || status === 'failed' || status === 'refunded' || status === 'fulfillment_failed') {
    return 'bg-rose-50 text-rose-700 border border-rose-200'
  }
  return 'bg-amber-50 text-amber-700 border border-amber-200'
}

function resolveToken(): string {
  if (typeof window === 'undefined') return ''
  const qsToken = new URLSearchParams(window.location.search).get('token') || ''
  const token =
    qsToken ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pay_embedded_token') : null) ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null) ||
    ''
  if (qsToken && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('pay_embedded_token', qsToken)
  }
  return token
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (!sessionAuthToken.value) {
    sessionAuthToken.value = resolveToken()
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (sessionAuthToken.value) {
    headers.Authorization = `Bearer ${sessionAuthToken.value}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })
  const text = await response.text()
  let json: { error?: string } | null = null
  if (text) {
    try {
      json = JSON.parse(text) as { error?: string }
    } catch {
      json = null
    }
  }

  if (!response.ok) {
    const message =
      (json && (json as { error?: string; message?: string }).error) ||
      (json && (json as { message?: string }).message) ||
      `请求失败：HTTP ${response.status}`
    throw new Error(message)
  }

  return (json || {}) as T
}

function buildOrderQuery(): string {
  const params = new URLSearchParams()
  params.set('page', String(page.value))
  params.set('pageSize', String(PAGE_SIZE))
  if (filters.tradeStatus && filters.tradeStatus !== 'all') params.set('tradeStatus', filters.tradeStatus)
  if (filters.fulfillmentStatus && filters.fulfillmentStatus !== 'all') {
    params.set('fulfillmentStatus', filters.fulfillmentStatus)
  }
  if (filters.keyword) params.set('keyword', filters.keyword)
  return params.toString()
}

function setGlobalError(message: string) {
  globalError.value = message
}

function clearErrors() {
  globalError.value = ''
  ordersError.value = ''
}

async function loadPurchase() {
  clearErrors()
  try {
    const [sess, cat] = await Promise.all([
      requestJson<{ user: PurchaseSession; querySupported: boolean }>('/pay-api/session'),
      requestJson<CatalogData>('/pay-api/catalog'),
    ])
    session.user = sess.user
    catalog.value = {
      subscriptions: cat.subscriptions || [],
      balancePacks: cat.balancePacks || [],
    }
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : '加载购买页面失败')
  }
}

async function loadOrders(force = false): Promise<void> {
  clearErrors()
  ordersLoading.value = true
  try {
    const endpoint = isAdminMode.value ? '/pay-api/admin/orders' : '/pay-api/orders'
    const query = buildOrderQuery()
    const key = `${endpoint}?${query}`
    const cached = cache.get(key)
    const now = Date.now()
    if (!force && cached && now - cached.fetchedAt < TTL_MS) {
      const cachedData = cached.data
      orders.value = cachedData.orders
      total.value = cachedData.total
      page.value = cachedData.page
      totalPages.value = cachedData.totalPages
      ordersLoading.value = false
      return
    }

    const result = await requestJson<OrdersResponse>(`${endpoint}?${query}`)
    const data: OrdersResponse = {
      orders: Array.isArray(result.orders) ? result.orders : [],
      total: Number(result.total || 0),
      page: Number(result.page || page.value),
      totalPages: Number(result.totalPages || 1),
    }
    orders.value = data.orders
    total.value = data.total
    page.value = data.page
    totalPages.value = Math.max(1, data.totalPages)
    cache.set(key, { fetchedAt: now, data })
  } catch (error) {
    ordersError.value = error instanceof Error ? error.message : '加载订单失败'
  } finally {
    ordersLoading.value = false
  }
}

function applyOrderFilters() {
  page.value = 1
  void loadOrders(true)
}

function resetFilters() {
  filters.tradeStatus = 'all'
  filters.fulfillmentStatus = 'all'
  filters.keyword = ''
  page.value = 1
  void loadOrders(true)
}

function resetPageAndLoad() {
  page.value = 1
  void loadOrders()
}

function changePage(next: number) {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  void loadOrders()
}

async function createOrder(skuCode: string) {
  clearErrors()
  busyCreate.value = skuCode
  try {
    const response = await requestJson<{ formHtml: string }>('/pay-api/orders', {
      method: 'POST',
      body: JSON.stringify({ skuCode }),
    })
    if (!response.formHtml || typeof response.formHtml !== 'string') {
      throw new Error('订单创建成功后未返回支付表单')
    }
    const holder = document.createElement('div')
    holder.style.display = 'none'
    holder.innerHTML = response.formHtml
    document.body.appendChild(holder)
    const form = holder.querySelector('form')
    if (!form) throw new Error('未找到支付提交表单')
    form.submit()
  } catch (error) {
    setGlobalError(error instanceof Error ? error.message : '创建订单失败')
  } finally {
    busyCreate.value = ''
  }
}

async function checkOrder(merchantOrderId: string) {
  clearErrors()
  busyOrderStatus.value = merchantOrderId
  try {
    await requestJson(`/pay-api/orders/${encodeURIComponent(merchantOrderId)}/check`, {
      method: 'POST',
      body: '{}',
    })
    await loadOrders(true)
  } catch (error) {
    ordersError.value = error instanceof Error ? error.message : '刷新订单状态失败'
  } finally {
    busyOrderStatus.value = ''
  }
}

async function setAdminOrderStatus(merchantOrderId: string, tradeStatus: 'paid' | 'closed') {
  clearErrors()
  busyOrderStatus.value = merchantOrderId
  try {
    await requestJson(`/pay-api/admin/orders/${encodeURIComponent(merchantOrderId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ tradeStatus }),
    })
    await loadOrders(true)
  } catch (error) {
    ordersError.value = error instanceof Error ? error.message : '更新订单状态失败'
  } finally {
    busyOrderStatus.value = ''
  }
}

async function initialize() {
  clearErrors()
  sessionAuthToken.value = resolveToken()
  if (!sessionAuthToken.value) {
    setGlobalError('当前未检测到登录 token，请重新登录后再试。')
    return
  }
  cache.clear()
  if (isPurchaseRoute.value === 'purchase') {
    await loadPurchase()
  } else {
    page.value = 1
    await loadOrders(true)
  }
}

watch(
  () => route.path,
  () => {
    void initialize()
  },
)

onMounted(() => {
  void initialize()
})
</script>
