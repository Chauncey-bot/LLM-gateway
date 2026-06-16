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
          <p class="console-kicker">{{ t('referrals.kicker') }}</p>
          <h2 class="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white md:text-3xl">
            {{ t('referrals.heroTitle') }}
          </h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            {{ t('referrals.heroDescription') }}
          </p>
        </div>

        <div class="relative z-10 mt-6 grid gap-3 sm:grid-cols-3 lg:mt-0 lg:w-[520px]">
          <div v-for="metric in heroMetrics" :key="metric.label" class="metric-tile">
            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ metric.label }}</p>
            <p class="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">{{ metric.value }}</p>
          </div>
        </div>
      </section>

      <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div class="card overflow-hidden">
          <div class="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:p-6">
            <div class="min-w-0">
              <div class="flex items-center gap-3">
                <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm shadow-slate-900/10 dark:bg-white dark:text-slate-950">
                  <Icon name="users" size="lg" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-slate-500 dark:text-slate-400">{{ t('referrals.inviteCardKicker') }}</p>
                  <h3 class="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                    {{ t('referrals.inviteCardTitle') }}
                  </h3>
                </div>
              </div>

              <div class="mt-6 grid gap-3 sm:grid-cols-3">
                <div v-for="metric in heroMetrics" :key="`card-${metric.label}`" class="metric-tile">
                  <p class="text-sm text-slate-500 dark:text-slate-400">{{ metric.label }}</p>
                  <p class="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">{{ metric.value }}</p>
                </div>
              </div>

              <div class="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div class="min-w-0 flex-1">
                    <label class="input-label">{{ t('referrals.inviteUrlLabel') }}</label>
                    <input
                      :value="profile?.invite_url || ''"
                      readonly
                      class="input mt-1 bg-white font-mono text-sm dark:bg-white/[0.04]"
                      :placeholder="t('common.loading')"
                    />
                  </div>
                  <button class="btn btn-primary shrink-0" :disabled="!profile" @click="copyInviteUrl">
                    <Icon name="copy" size="sm" />
                    {{ t('referrals.copyLink') }}
                  </button>
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>{{ t('referrals.referralCode') }}</span>
                  <span class="rounded-md bg-slate-950 px-3 py-1 font-mono font-semibold text-white dark:bg-white dark:text-slate-950">
                    {{ profile?.referral_code || '--' }}
                  </span>
                  <button
                    class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold text-slate-700 transition-colors hover:bg-white disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/10"
                    :disabled="!profile"
                    @click="copyReferralCode"
                  >
                    <Icon name="clipboard" size="xs" />
                    {{ t('referrals.copyCode') }}
                  </button>
                </div>
              </div>
            </div>

            <div class="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.035]">
              <div class="flex h-40 w-40 items-center justify-center rounded-lg bg-white p-3 shadow-sm shadow-slate-900/[0.03] dark:bg-white/90">
                <img v-if="qrCodeDataUrl" :src="qrCodeDataUrl" :alt="t('referrals.qrAlt')" class="h-full w-full" />
                <Icon v-else name="grid" size="xl" class="text-gray-300 dark:text-dark-500" />
              </div>
              <p class="mt-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                {{ t('referrals.scanHint') }}
              </p>
              <button class="btn btn-secondary mt-3 w-full" :disabled="loading" @click="loadAll">
                <Icon name="refresh" size="sm" />
                {{ t('common.refresh') }}
              </button>
            </div>
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-base font-semibold text-slate-950 dark:text-white">{{ t('referrals.overview') }}</h3>
          <div class="mt-4 space-y-3">
            <div class="surface-tile px-4 py-3">
              <span class="text-sm text-slate-500 dark:text-slate-400">{{ t('referrals.myInviterCode') }}</span>
              <p class="mt-1 truncate font-mono font-semibold text-slate-950 dark:text-white" :title="inviterCode">
                {{ inviterCode }}
              </p>
            </div>
            <div class="surface-tile flex items-center justify-between px-4 py-3">
              <span class="text-sm text-slate-500 dark:text-slate-400">{{ t('referrals.totalEarned') }}</span>
              <span class="font-semibold text-emerald-600">{{ profile?.total_earned ?? 0 }}</span>
            </div>
            <div class="surface-tile flex items-center justify-between px-4 py-3">
              <span class="text-sm text-slate-500 dark:text-slate-400">{{ t('referrals.totalSpent') }}</span>
              <span class="font-semibold text-red-600">{{ profile?.total_spent ?? 0 }}</span>
            </div>
            <div class="surface-tile flex items-center justify-between px-4 py-3">
              <span class="text-sm text-slate-500 dark:text-slate-400">{{ t('referrals.rewardOrders') }}</span>
              <span class="font-semibold text-slate-950 dark:text-white">{{ profile?.rewarded_purchase_count ?? 0 }}</span>
            </div>
          </div>

          <div class="mt-5 border-t border-slate-200 pt-5 dark:border-white/10">
            <label class="input-label">{{ t('referrals.bindCodeLabel') }}</label>
            <div class="mt-2 flex gap-2">
              <input
                v-model.trim="bindCode"
                class="input"
                :placeholder="bindCodePlaceholder"
                :disabled="bindingReferral || isAlreadyBound"
              />
              <button
                class="btn btn-secondary shrink-0"
                :disabled="!bindCode || bindingReferral || isAlreadyBound"
                @click="handleBindReferral"
              >
                {{ bindingReferral ? t('referrals.binding') : t('referrals.bind') }}
              </button>
            </div>
            <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {{ bindHintText }}
            </p>
          </div>
        </div>
      </section>

      <section>
        <div class="card p-5">
          <h3 class="text-base font-semibold text-slate-950 dark:text-white">{{ t('referrals.rewardRules') }}</h3>
          <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div v-for="rule in rewardRules" :key="rule.title" class="surface-tile flex gap-3 p-3">
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
                {{ rule.step }}
              </span>
              <div>
                <p class="text-sm font-semibold text-slate-950 dark:text-white">{{ rule.title }}</p>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ rule.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { AppLayout } from '@/components/layout'
import Icon from '@/components/icons/Icon.vue'
import { useAppStore } from '@/stores'
import {
  bindReferralRegistration,
  getReferralProfile,
  type ReferralProfile
} from '@/api/referrals'

const appStore = useAppStore()
const { t } = useI18n()

const loading = ref(false)
const bindingReferral = ref(false)
const bindCode = ref('')
const errorMessage = ref('')
const qrCodeDataUrl = ref('')
const profile = ref<ReferralProfile | null>(null)

const pointsBalance = computed(() => profile.value?.points_balance ?? 0)
const inviterCode = computed(() => {
  const referrer = profile.value
  if (!referrer) return loading.value ? t('common.loading') : t('referrals.noInviterBound')
  return referrer.referrer_source_code || t('referrals.noInviterBound')
})
const isAlreadyBound = computed(() =>
  Boolean(
    inviterCode.value &&
      inviterCode.value !== t('referrals.noInviterBound') &&
      inviterCode.value !== t('common.loading')
  )
)
const bindHintText = computed(() =>
  isAlreadyBound.value ? t('referrals.alreadyBoundHint') : t('referrals.bindHint')
)
const bindCodePlaceholder = computed(() =>
  isAlreadyBound.value ? inviterCode.value : t('referrals.bindCodePlaceholder')
)
const heroMetrics = computed(() => [
  {
    label: t('referrals.currentPoints'),
    value: loading.value && !profile.value ? '--' : String(pointsBalance.value)
  },
  {
    label: t('referrals.invitedFriends'),
    value: String(profile.value?.invited_count ?? '--')
  },
  {
    label: t('referrals.rewardOrders'),
    value: String(profile.value?.rewarded_purchase_count ?? '--')
  }
])

const rewardRules = computed(() => [
  {
    step: 1,
    title: t('referrals.rules.share.title'),
    description: t('referrals.rules.share.description')
  },
  {
    step: 2,
    title: t('referrals.rules.purchase.title'),
    description: t('referrals.rules.purchase.description')
  },
  {
    step: 3,
    title: t('referrals.rules.renewal.title'),
    description: t('referrals.rules.renewal.description')
  },
  {
    step: 4,
    title: t('referrals.rules.mall.title'),
    description: t('referrals.rules.mall.description')
  }
])

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return fallback
}

async function loadProfile(): Promise<void> {
  profile.value = await getReferralProfile()
}

async function loadAll(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    await loadProfile()
  } catch (error) {
    errorMessage.value = getErrorMessage(error, t('referrals.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function copyText(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const input = document.createElement('input')
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }
  appStore.showSuccess(successMessage)
}

function copyInviteUrl(): void {
  if (profile.value?.invite_url) {
    void copyText(profile.value.invite_url, t('referrals.linkCopied'))
  }
}

function copyReferralCode(): void {
  if (profile.value?.referral_code) {
    void copyText(profile.value.referral_code, t('referrals.codeCopied'))
  }
}

async function handleBindReferral(): Promise<void> {
  if (isAlreadyBound.value) {
    return
  }
  if (!bindCode.value) return
  bindingReferral.value = true
  errorMessage.value = ''
  try {
    await bindReferralRegistration(bindCode.value)
    appStore.showSuccess(t('referrals.bindSuccess'))
    bindCode.value = ''
    await loadProfile()
  } catch (error) {
    const message = getErrorMessage(error, t('referrals.bindFailed'))
    errorMessage.value = message
    appStore.showError(message)
  } finally {
    bindingReferral.value = false
  }
}

watch(
  () => profile.value?.invite_url,
  async (url) => {
    if (!url) {
      qrCodeDataUrl.value = ''
      return
    }
    qrCodeDataUrl.value = await QRCode.toDataURL(url, {
      margin: 1,
      width: 256,
      color: {
        dark: '#111827',
        light: '#ffffff'
      }
    })
  }
)

onMounted(() => {
  void loadAll()
})
</script>
