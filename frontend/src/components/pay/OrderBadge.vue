<template>
  <span :class="badgeClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  kind: 'trade' | 'fulfillment'
  status: string
}>()

const { t } = useI18n()

const label = computed(() => {
  if (props.kind === 'trade') {
    switch (props.status) {
      case 'pending':
        return t('orders.tradeStatusOptions.pending')
      case 'paid':
        return t('orders.tradeStatusOptions.paid')
      case 'closed':
        return t('orders.tradeStatusOptions.closed')
      case 'failed':
        return t('orders.tradeStatusOptions.failed')
      case 'refunded':
        return t('orders.tradeStatusOptions.refunded')
      default:
        return props.status
    }
  }

  switch (props.status) {
    case 'pending':
      return t('orders.fulfillmentStatusOptions.pending')
    case 'fulfilled':
      return t('orders.fulfillmentStatusOptions.fulfilled')
    case 'fulfillment_failed':
      return t('orders.fulfillmentStatusOptions.fulfillment_failed')
    default:
      return props.status
  }
})

const badgeClass = computed(() => {
  const base =
    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset'

  if (props.kind === 'trade') {
    switch (props.status) {
      case 'paid':
        return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20`
      case 'failed':
      case 'closed':
      case 'refunded':
        return `${base} bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20`
      case 'pending':
        return `${base} bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20`
      default:
        return `${base} bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10`
    }
  }

  switch (props.status) {
    case 'fulfilled':
      return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20`
    case 'fulfillment_failed':
      return `${base} bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20`
    case 'pending':
      return `${base} bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10`
    default:
      return `${base} bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10`
  }
})
</script>
