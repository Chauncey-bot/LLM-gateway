<template>
  <div class="card overflow-hidden">
    <div class="section-toolbar px-4 py-4">
      <div class="flex items-center gap-3">
        <!-- Avatar -->
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-xl font-bold text-white shadow-sm shadow-slate-900/10 dark:bg-white dark:text-slate-950"
        >
          {{ user?.email?.charAt(0).toUpperCase() || 'U' }}
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-lg font-semibold text-gray-900 dark:text-white">
            {{ user?.email }}
          </h2>
          <div class="mt-1 flex items-center gap-2">
            <span :class="['badge', user?.role === 'admin' ? 'badge-primary' : 'badge-gray']">
              {{ user?.role === 'admin' ? t('profile.administrator') : t('profile.user') }}
            </span>
            <span
              :class="['badge', user?.status === 'active' ? 'badge-success' : 'badge-danger']"
            >
              {{ user?.status }}
            </span>
          </div>
        </div>
      </div>
    </div>
    <div class="px-4 py-3">
      <div class="grid gap-2">
        <div class="flex min-w-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Icon name="mail" size="sm" class="text-slate-400 dark:text-slate-500" />
          <span class="truncate">{{ user?.email }}</span>
        </div>
        <div
          v-if="user?.username"
          class="flex min-w-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
        >
          <Icon name="user" size="sm" class="text-slate-400 dark:text-slate-500" />
          <span class="truncate">{{ user.username }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'
import type { User } from '@/types'

defineProps<{
  user: User | null
}>()

const { t } = useI18n()
</script>
