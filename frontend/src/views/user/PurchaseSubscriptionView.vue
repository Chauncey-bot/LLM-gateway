<template>
  <AppLayout>
    <div class="console-page mx-auto max-w-7xl space-y-5">
      <div class="console-title-panel">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="console-kicker">{{ t('nav.myAccount') }}</p>
            <h1 class="console-section-title">{{ t('purchase.title') }}</h1>
            <p class="console-section-description">{{ t('purchase.description') }}</p>
          </div>

          <a
            v-if="hasLegacyPurchaseUrl"
            :href="legacyPurchaseUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-secondary btn-sm"
          >
            <Icon name="externalLink" size="sm" class="mr-1.5" :stroke-width="2" />
            {{ t('purchase.openLegacyPage') }}
          </a>
        </div>
      </div>

      <div
        v-if="querySupported === false"
        class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200"
      >
        {{ t('purchase.queryUnavailable') }}
      </div>

      <div v-if="loading" class="flex justify-center py-12">
        <div
          class="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
        ></div>
      </div>

      <div v-else-if="!purchaseEnabled" class="card p-6">
        <EmptyState :title="t('purchase.notEnabledTitle')" :description="t('purchase.notEnabledDesc')">
          <template #icon>
            <Icon name="creditCard" size="xl" class="text-slate-400" />
          </template>
        </EmptyState>
      </div>

      <div v-else-if="loadError" class="card p-6">
        <EmptyState
          :title="t('purchase.loadFailedTitle')"
          :description="loadError"
          :action-text="t('purchase.retry')"
          @action="loadPage"
        >
          <template #icon>
            <Icon name="exclamationTriangle" size="xl" class="text-rose-500" />
          </template>
        </EmptyState>
      </div>

      <template v-else>
        <div class="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-500 dark:text-dark-400">
                {{ t('purchase.currentAccount') }}
              </p>
              <p class="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                {{ session?.user.email || authStore.user?.email || '-' }}
              </p>
              <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">
                {{ t('purchase.currentAccountHint') }}
              </p>
            </div>

            <div class="flex flex-wrap gap-3 text-sm">
              <div class="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-900/60">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('purchase.userId') }}
                </div>
                <div class="mt-1 font-medium text-slate-900 dark:text-white">
                  #{{ session?.user.id || authStore.user?.id || '-' }}
                </div>
              </div>

              <div class="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-900/60">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-dark-400">
                  {{ t('purchase.queryStatus') }}
                </div>
                <div class="mt-1 font-medium text-slate-900 dark:text-white">
                  {{
                    querySupported === false
                      ? t('purchase.queryStatusDisabled')
                      : t('purchase.queryStatusEnabled')
                  }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="catalogEmpty" class="card p-6">
          <EmptyState :title="t('purchase.emptyCatalogTitle')" :description="t('purchase.emptyCatalogDesc')">
            <template #icon>
              <Icon name="inbox" size="xl" class="text-slate-400" />
            </template>
          </EmptyState>
        </div>

        <template v-else>
          <section class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
                  {{ t('purchase.subscriptionPlans') }}
                </h2>
                <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">
                  {{ t('purchase.subscriptionPlansDesc') }}
                </p>
              </div>
            </div>

            <div
              v-if="visibleSubscriptions.length > 0"
              class="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
            >
              <article
                v-for="item in visibleSubscriptions"
                :key="item.code"
                class="card card-hover flex h-full flex-col overflow-hidden"
              >
                <div class="section-toolbar flex items-start justify-between">
                  <div class="flex items-start gap-3">
                    <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                      <Icon name="creditCard" size="md" />
                    </div>
                    <div>
                      <h3 class="font-semibold text-slate-900 dark:text-white">{{ item.title }}</h3>
                      <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">{{ item.code }}</p>
                    </div>
                  </div>
                  <span class="badge badge-primary text-xs">
                    {{ t('orders.types.subscription') }}
                  </span>
                </div>

                <div class="flex flex-1 flex-col gap-4 p-4">
                  <p class="min-h-[48px] text-sm leading-6 text-gray-600 dark:text-dark-300">
                    {{ item.description || t('purchase.noDescription') }}
                  </p>

                  <div class="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {{ formatAmount(item.amountCents) }}
                  </div>

                  <div class="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                    <div class="text-xs uppercase tracking-wide">{{ t('purchase.validityDays') }}</div>
                    <div class="mt-1 font-medium text-slate-900 dark:text-white">
                      {{ item.validityDays ?? '-' }}
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn btn-primary mt-auto"
                    :disabled="submittingSkuCode === item.code"
                    @click="submitOrder(item.code)"
                  >
                    {{ submittingSkuCode === item.code ? t('purchase.creatingOrder') : t('purchase.buyNow') }}
                  </button>
                </div>
              </article>
            </div>

            <div v-else class="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-white/10 dark:text-dark-400">
              {{ t('purchase.emptySubscriptions') }}
            </div>
          </section>

        <section class="space-y-4">
            <div>
              <h2 class="text-xl font-semibold text-slate-900 dark:text-white">
                {{ t('purchase.balancePacks') }}
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">
                {{ t('purchase.balancePacksDesc') }}
              </p>
            </div>

            <div
              v-if="visibleBalancePacks.length > 0"
              class="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
            >
              <article
                v-for="item in visibleBalancePacks"
                :key="item.code"
                class="card card-hover flex h-full flex-col overflow-hidden"
              >
                <div class="section-toolbar flex items-start justify-between">
                  <div class="flex items-start gap-3">
                    <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      <Icon name="dollar" size="md" />
                    </div>
                    <div>
                      <h3 class="font-semibold text-slate-900 dark:text-white">{{ item.title }}</h3>
                      <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">{{ item.code }}</p>
                    </div>
                  </div>
                  <span class="badge badge-success text-xs">
                    {{ t('orders.types.balance') }}
                  </span>
                </div>

                <div class="flex flex-1 flex-col gap-4 p-4">
                  <p class="min-h-[48px] text-sm leading-6 text-gray-600 dark:text-dark-300">
                    {{ item.description || t('purchase.noDescription') }}
                  </p>

                  <div class="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {{ formatAmount(item.amountCents) }}
                  </div>

                  <div class="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-gray-500 dark:bg-white/5 dark:text-dark-400">
                    <div class="text-xs uppercase tracking-wide">{{ t('purchase.balanceAmount') }}</div>
                    <div class="mt-1 font-medium text-slate-900 dark:text-white">
                      {{ item.balanceAmount ?? '-' }}
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn btn-primary mt-auto"
                    :disabled="submittingSkuCode === item.code"
                    @click="submitOrder(item.code)"
                  >
                    {{ submittingSkuCode === item.code ? t('purchase.creatingOrder') : t('purchase.buyNow') }}
                  </button>
                </div>
              </article>
            </div>

            <div v-else class="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-white/10 dark:text-dark-400">
              {{ t('purchase.emptyBalancePacks') }}
            </div>
          </section>
        </template>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import { EmptyState } from '@/components/common'
import {
  isPayApiError,
  payAPI,
  type PaymentCatalogResponse,
  type PaymentSessionResponse
} from '@/api/pay'
import { buildEmbeddedUrl, detectTheme } from '@/utils/embedded-url'

const { t, locale } = useI18n()
const appStore = useAppStore()
const authStore = useAuthStore()

const loading = ref(true)
const loadError = ref('')
const session = ref<PaymentSessionResponse | null>(null)
const catalog = ref<PaymentCatalogResponse>({
  subscriptions: [],
  balancePacks: []
})
const querySupported = ref(true)
const submittingSkuCode = ref('')
const purchaseTheme = ref<'light' | 'dark'>('light')

let themeObserver: MutationObserver | null = null

const hiddenCatalogAmountCents = new Set<number | string>([300000, 400000, '300000', '400000'])

const isCatalogItemHidden = (amountCents: number | string): boolean => {
  const normalizedAmount = Number(amountCents)
  return hiddenCatalogAmountCents.has(normalizedAmount) || hiddenCatalogAmountCents.has(String(amountCents))
}

const visibleSubscriptions = computed(() =>
  catalog.value.subscriptions.filter((item) => !isCatalogItemHidden(item.amountCents))
)
const visibleBalancePacks = computed(() =>
  catalog.value.balancePacks.filter((item) => !isCatalogItemHidden(item.amountCents))
)

const purchaseEnabled = computed(() => {
  return appStore.cachedPublicSettings?.purchase_subscription_enabled ?? false
})

const legacyPurchaseUrl = computed(() => {
  const baseUrl = (appStore.cachedPublicSettings?.purchase_subscription_url || '').trim()
  return buildEmbeddedUrl(baseUrl, authStore.user?.id, authStore.token, purchaseTheme.value, locale.value)
})

const hasLegacyPurchaseUrl = computed(() => {
  const url = legacyPurchaseUrl.value
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false
  }

  try {
    const parsed = new URL(url)
    if (typeof window === 'undefined') return true
    return !(parsed.origin === window.location.origin && parsed.pathname === '/purchase')
  } catch {
    return false
  }
})

const catalogEmpty = computed(() => {
  return visibleSubscriptions.value.length === 0 && visibleBalancePacks.value.length === 0
})

function formatAmount(amountCents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountCents / 100)
}

async function loadPage(): Promise<void> {
  loading.value = true
  loadError.value = ''

  try {
    if (appStore.publicSettingsLoaded === false) {
      await appStore.fetchPublicSettings()
    }

    if (!purchaseEnabled.value) {
      return
    }

    const [nextSession, nextCatalog] = await Promise.all([
      payAPI.getSession(),
      payAPI.getCatalog()
    ])

    session.value = nextSession
    catalog.value = nextCatalog
    querySupported.value = nextSession.querySupported !== false
  } catch (error) {
    loadError.value = isPayApiError(error) ? error.message : t('purchase.loadFailedFallback')
  } finally {
    loading.value = false
  }
}

async function submitOrder(skuCode: string): Promise<void> {
  submittingSkuCode.value = skuCode

  try {
    const result = await payAPI.createOrder(skuCode)
    appStore.showInfo(t('purchase.redirectingToPay'))

    const host = document.createElement('div')
    host.style.display = 'none'
    host.innerHTML = result.formHtml
    document.body.appendChild(host)

    const form = host.querySelector('form')
    if (!form) {
      throw new Error(t('purchase.invalidForm'))
    }

    form.submit()
  } catch (error) {
    appStore.showError(isPayApiError(error) ? error.message : t('purchase.createOrderFailed'))
  } finally {
    submittingSkuCode.value = ''
  }
}

onMounted(() => {
  purchaseTheme.value = detectTheme()

  if (typeof document !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      purchaseTheme.value = detectTheme()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
  }

  void loadPage()
})

onUnmounted(() => {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
})
</script>
