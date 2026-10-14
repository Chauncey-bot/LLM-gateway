<template>
  <AppLayout>
    <TablePageLayout>
      <template #filters>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-semibold text-slate-950 dark:text-white">{{ t('admin.points.title') }}</h2>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{{ t('admin.points.description') }}</p>
          </div>
          <div class="flex w-full gap-2 sm:w-auto">
            <div class="relative w-full sm:w-72">
              <Icon name="search" size="sm" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input v-model="searchInput" class="input pl-9" :placeholder="t('admin.points.searchPlaceholder')" @keyup.enter="search" />
            </div>
            <button class="btn btn-primary" :disabled="loading" @click="search">{{ t('common.search') }}</button>
            <button class="btn btn-secondary" :disabled="loading" :title="t('common.refresh')" @click="load">{{ t('common.refresh') }}</button>
          </div>
        </div>
      </template>

      <template #table>
        <div class="table-wrapper">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
            <thead>
              <tr>
                <th class="table-header">{{ t('admin.points.account') }}</th>
                <th class="table-header">{{ t('admin.points.current') }}</th>
                <th class="table-header">{{ t('admin.points.earned') }}</th>
                <th class="table-header">{{ t('admin.points.spent') }}</th>
                <th class="table-header">{{ t('admin.points.updatedAt') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
              <tr v-if="loading"><td colspan="5" class="p-10 text-center text-sm text-gray-500">{{ t('common.loading') }}</td></tr>
              <tr v-else-if="rows.length === 0"><td colspan="5" class="p-10 text-center text-sm text-gray-500">{{ t('admin.points.empty') }}</td></tr>
              <tr v-for="row in rows" v-else :key="row.user_id" class="hover:bg-gray-50 dark:hover:bg-dark-800">
                <td class="table-cell"><div class="font-medium text-gray-900 dark:text-gray-100">{{ row.email || row.username || `#${row.user_id}` }}</div><div class="text-xs text-gray-500">ID: {{ row.user_id }}</div></td>
                <td class="table-cell font-semibold text-primary-600">{{ row.balance }}</td>
                <td class="table-cell text-emerald-600">{{ row.total_earned }}</td>
                <td class="table-cell text-red-600">{{ row.total_spent }}</td>
                <td class="table-cell text-gray-500">{{ formatDate(row.updated_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <template #pagination>
        <Pagination v-if="pagination.total > 0" :page="pagination.page" :total="pagination.total" :page-size="pagination.pageSize" @update:page="goToPage" @update:pageSize="changePageSize" />
      </template>
    </TablePageLayout>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import TablePageLayout from '@/components/layout/TablePageLayout.vue'
import Pagination from '@/components/common/Pagination.vue'
import Icon from '@/components/icons/Icon.vue'
import referralsAPI, { type AdminPointsAccount } from '@/api/referrals'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const appStore = useAppStore()
const rows = ref<AdminPointsAccount[]>([])
const searchInput = ref('')
const searchTerm = ref('')
const loading = ref(false)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const formatDate = (value: string) => value ? new Date(value).toLocaleString() : '-'

async function load() {
  loading.value = true
  try {
    const result = await referralsAPI.getAdminPointsAccounts(pagination.page, pagination.pageSize, searchTerm.value)
    rows.value = result.items || []
    pagination.total = result.total || 0
  } catch (error: any) {
    appStore.showError(error?.message || t('admin.points.loadFailed'))
  } finally {
    loading.value = false
  }
}

function search() {
  searchTerm.value = searchInput.value.trim()
  pagination.page = 1
  load()
}
function goToPage(page: number) { pagination.page = page; load() }
function changePageSize(size: number) { pagination.pageSize = size; pagination.page = 1; load() }

onMounted(load)
</script>

<style scoped>
.table-header { @apply px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400; }
.table-cell { @apply whitespace-nowrap px-5 py-4 text-sm; }
</style>
