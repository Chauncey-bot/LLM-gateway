<template>
  <AppLayout>
    <div class="console-page mx-auto max-w-6xl space-y-4">
      <div class="console-title-panel profile-hero">
        <div>
          <p class="console-kicker">{{ t('nav.myAccount') }}</p>
          <h1 class="console-section-title">{{ t('profile.title') }}</h1>
          <p class="console-section-description">{{ t('profile.description') }}</p>
        </div>
        <div class="profile-hero-stats">
          <div v-for="item in summaryItems" :key="item.label" class="profile-hero-stat">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div class="space-y-4">
          <ProfileInfoCard :user="user" />

          <div
            v-if="contactInfo"
            class="surface-tile border-cyan-200/80 bg-cyan-50/70 p-4 dark:border-cyan-400/20 dark:bg-cyan-400/10"
          >
            <div class="flex items-center gap-3">
              <div class="rounded-lg bg-cyan-100 p-2 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300">
                <Icon name="chat" size="md" />
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-cyan-950 dark:text-cyan-100">{{ t('common.contactSupport') }}</h3>
                <p class="truncate text-sm font-medium text-slate-600 dark:text-slate-300">{{ contactInfo }}</p>
              </div>
            </div>
          </div>

          <ProfileEditForm :initial-username="user?.username || ''" />
        </div>

        <div class="space-y-4">
          <ProfilePasswordForm />
          <ProfileTotpCard />
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'; import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'; import { formatDate } from '@/utils/format'
import { authAPI } from '@/api'; import AppLayout from '@/components/layout/AppLayout.vue'
import ProfileInfoCard from '@/components/user/profile/ProfileInfoCard.vue'
import ProfileEditForm from '@/components/user/profile/ProfileEditForm.vue'
import ProfilePasswordForm from '@/components/user/profile/ProfilePasswordForm.vue'
import ProfileTotpCard from '@/components/user/profile/ProfileTotpCard.vue'
import { Icon } from '@/components/icons'

const { t } = useI18n(); const authStore = useAuthStore(); const user = computed(() => authStore.user)
const contactInfo = ref('')

const summaryItems = computed(() => [
  { label: t('profile.accountBalance'), value: formatCurrency(user.value?.balance || 0) },
  { label: t('profile.concurrencyLimit'), value: String(user.value?.concurrency || 0) },
  {
    label: t('profile.memberSince'),
    value: formatDate(user.value?.created_at || '', { year: 'numeric', month: 'long' }),
  },
])

onMounted(async () => { try { const s = await authAPI.getPublicSettings(); contactInfo.value = s.contact_info || '' } catch (error) { console.error('Failed to load contact info:', error) } })
const formatCurrency = (v: number) => `$${v.toFixed(2)}`
</script>

<style scoped>
.profile-hero {
  @apply flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between;
}

.profile-hero-stats {
  @apply grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[520px];
}

.profile-hero-stat {
  @apply rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 shadow-sm dark:border-white/10 dark:bg-white/5;
}

.profile-hero-stat span {
  @apply block text-xs font-medium text-slate-500 dark:text-slate-400;
}

.profile-hero-stat strong {
  @apply mt-1 block truncate text-sm font-semibold text-slate-950 dark:text-white;
}
</style>
