<template>
  <AppLayout>
    <div class="console-page space-y-5">
      <div class="console-title-panel">
        <p class="console-kicker">{{ t('nav.myAccount') }}</p>
        <h1 class="console-section-title">{{ t('usage.title') }}</h1>
        <p class="console-section-description">{{ t('usage.description') }}</p>
      </div>

      <TablePageLayout>
      <template #actions>
        <div class="surface-tile mb-4">
          <div class="px-6 py-4">
          <div class="flex flex-wrap items-end gap-4">
            <!-- API Key Filter -->
            <div class="min-w-[180px]">
              <label class="input-label">{{ t('usage.apiKeyFilter') }}</label>
              <Select
                v-model="filters.api_key_id"
                :options="apiKeyOptions"
                :placeholder="t('usage.allApiKeys')"
                @change="applyFilters"
              />
            </div>

            <!-- Model Filter -->
            <div class="min-w-[220px]">
              <label class="input-label">{{ t('usage.model') }}</label>
              <Select
                v-model="filters.model"
                :options="modelOptions"
                :placeholder="t('admin.usage.allModels')"
                searchable
                creatable
                :creatable-prefix="t('common.search')"
                @change="applyFilters"
              />
            </div>

            <!-- Date Range Filter -->
            <div>
              <label class="input-label">{{ t('usage.timeRange') }}</label>
              <DateRangePicker
                v-model:start-date="startDate"
                v-model:end-date="endDate"
                @change="onDateRangeChange"
              />
            </div>

            <!-- Actions -->
            <div class="ml-auto flex items-center gap-3">
              <button @click="applyFilters" :disabled="loading" class="btn btn-secondary">
                {{ t('common.refresh') }}
              </button>
              <button @click="resetFilters" class="btn btn-secondary">
                {{ t('common.reset') }}
              </button>
              <button @click="exportToCSV" :disabled="exporting" class="btn btn-primary">
                <svg
                  v-if="exporting"
                  class="-ml-1 mr-2 h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {{ exporting ? t('usage.exporting') : t('usage.exportCsv') }}
              </button>
            </div>
          </div>
        </div>
        </div>

        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <!-- Total Requests -->
          <div class="metric-tile">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <Icon name="document" size="md" class="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('usage.totalRequests') }}
              </p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">
                {{ usageStats?.total_requests?.toLocaleString() || '0' }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('usage.inSelectedRange') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Total Tokens -->
        <div class="metric-tile">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
              <Icon name="cube" size="md" class="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('usage.totalTokens') }}
              </p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">
                {{ formatTokens(usageStats?.total_tokens || 0) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('usage.in') }}: {{ formatTokens(usageStats?.total_input_tokens || 0) }} /
                {{ t('usage.out') }}: {{ formatTokens(usageStats?.total_output_tokens || 0) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Total Cost -->
        <div class="metric-tile">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
              <Icon name="dollar" size="md" class="text-green-600 dark:text-green-400" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('usage.totalCost') }}
              </p>
              <p class="text-xl font-bold text-green-600 dark:text-green-400">
                ${{ getUsageActualCost(usageStats).toFixed(4) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('usage.actualCost') }} /
                <span class="line-through">${{ getUsageStandardCost(usageStats).toFixed(4) }}</span>
                {{ t('usage.standardCost') }}
              </p>
            </div>
          </div>
        </div>

        <!-- Average Duration -->
        <div class="metric-tile">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
              <Icon name="clock" size="md" class="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
                {{ t('usage.avgDuration') }}
              </p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">
                {{ formatDuration(usageStats?.average_duration_ms || 0) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('usage.perRequest') }}</p>
            </div>
          </div>
        </div>
        </div>

        <div class="mt-4 grid items-start gap-4 xl:grid-cols-2">
          <div class="surface-tile self-start p-4">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 text-left"
              @click="toggleModelDistribution"
            >
              <h3 class="text-sm font-semibold text-slate-950 dark:text-white">
                {{ t('dashboard.modelDistribution') }}
              </h3>
              <Icon
                :name="modelDistributionExpanded ? 'chevronUp' : 'chevronDown'"
                size="sm"
                class="shrink-0 text-slate-500 dark:text-slate-400"
              />
            </button>
            <div
              v-if="modelDistributionExpanded && modelDistributionLoading"
              class="mt-4 flex h-52 items-center justify-center"
            >
              <LoadingSpinner size="md" />
            </div>
            <EmptyState
              v-else-if="modelDistributionExpanded && modelDistributionStats.length === 0"
              :message="t('dashboard.noDataAvailable')"
              class="mt-4"
            />
            <div v-else-if="modelDistributionExpanded" class="mt-4 grid gap-5 lg:grid-cols-[220px_1fr]">
              <div class="flex items-center justify-center">
                <div class="h-52 w-52">
                  <Doughnut
                    v-if="modelDistributionChartData"
                    :key="`model-${modelDistributionChartRenderKey}`"
                    :data="modelDistributionChartData"
                    :options="modelDistributionChartOptions"
                  />
                </div>
              </div>
              <div class="min-w-0 overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <th class="pb-2 text-left font-semibold">{{ t('dashboard.model') }}</th>
                      <th class="pb-2 text-right font-semibold">{{ t('dashboard.requests') }}</th>
                      <th class="pb-2 text-right font-semibold">{{ t('dashboard.tokens') }}</th>
                      <th class="pb-2 text-right font-semibold">{{ t('dashboard.actual') }}</th>
                      <th class="pb-2 text-right font-semibold">{{ t('dashboard.averageCost') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(model, index) in modelDistributionStats"
                      :key="model.model"
                      class="border-b border-slate-100 last:border-0 dark:border-white/5"
                    >
                      <td class="max-w-[120px] py-2.5">
                        <div class="flex min-w-0 items-center gap-2">
                          <span
                            class="h-2.5 w-2.5 shrink-0 rounded-full"
                            :style="{ backgroundColor: chartColors[index % chartColors.length] }"
                          ></span>
                          <span class="truncate font-medium text-slate-950 dark:text-white" :title="model.model">
                            {{ model.model }}
                          </span>
                        </div>
                      </td>
                      <td class="py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {{ model.requests.toLocaleString() }}
                      </td>
                      <td class="py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {{ formatTokens(model.total_tokens) }}
                      </td>
                      <td class="py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        ${{ formatCost(model.actual_cost) }}
                      </td>
                      <td class="py-2.5 text-right text-slate-500 dark:text-slate-400">
                        ${{ formatAverageCost(model.actual_cost, model.requests) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="surface-tile self-start p-4">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 text-left"
              @click="toggleKeySpendDistribution"
            >
              <h3 class="text-sm font-semibold text-slate-950 dark:text-white">
                {{ t('usage.keySpendDistribution') }}
              </h3>
              <Icon
                :name="keySpendExpanded ? 'chevronUp' : 'chevronDown'"
                size="sm"
                class="shrink-0 text-slate-500 dark:text-slate-400"
              />
            </button>

            <div v-if="keySpendExpanded && keySpendLoading" class="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div class="h-52 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10"></div>
              <div class="space-y-3">
                <div
                  v-for="index in 4"
                  :key="index"
                  class="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10"
                ></div>
              </div>
            </div>
            <EmptyState
              v-else-if="keySpendExpanded && keySpendDistribution.length === 0"
              :message="t('usage.noKeySpendData')"
              class="mt-4"
            />
            <div v-else-if="keySpendExpanded" class="mt-4 grid gap-5 lg:grid-cols-[220px_1fr]">
              <div class="flex items-center justify-center">
                <div class="h-52 w-52">
                  <Doughnut
                    v-if="keySpendChartData"
                    :key="`key-spend-${keySpendChartRenderKey}`"
                    :data="keySpendChartData"
                    :options="keySpendChartOptions"
                  />
                </div>
              </div>
              <div class="min-w-0 overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400">
                      <th class="pb-2 text-left font-semibold">{{ t('usage.apiKeyFilter') }}</th>
                      <th class="pb-2 text-right font-semibold">{{ t('usage.requests') }}</th>
                      <th class="pb-2 text-right font-semibold">{{ t('usage.actualCost') }}</th>
                      <th class="pb-2 text-right font-semibold">{{ t('usage.averageCost') }}</th>
                      <th class="pb-2 text-right font-semibold">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(item, index) in keySpendDistribution"
                      :key="item.key"
                      class="border-b border-slate-100 last:border-0 dark:border-white/5"
                    >
                      <td class="max-w-[260px] py-2.5">
                        <div class="flex min-w-0 items-center gap-2">
                          <span
                            class="h-2.5 w-2.5 shrink-0 rounded-full"
                            :style="{ backgroundColor: keySpendChartColors[index % keySpendChartColors.length] }"
                          ></span>
                          <span class="truncate font-medium text-slate-950 dark:text-white" :title="item.name">
                            {{ item.name }}
                          </span>
                        </div>
                      </td>
                      <td class="py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {{ item.requests.toLocaleString() }}
                      </td>
                      <td class="py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        ${{ formatCost(item.actualCost) }}
                      </td>
                      <td class="py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        ${{ formatAverageCost(item.actualCost, item.requests) }}
                      </td>
                      <td class="py-2.5 text-right text-slate-600 dark:text-slate-300">
                        {{ item.percent.toFixed(1) }}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

      </template>

      <template #table>
        <DataTable :columns="columns" :data="usageLogs" :loading="loading">
          <template #cell-api_key="{ row }">
            <span class="text-sm text-gray-900 dark:text-white">{{
              row.api_key?.name || '-'
            }}</span>
          </template>

          <template #cell-model="{ value }">
            <span class="font-medium text-gray-900 dark:text-white">{{ value }}</span>
          </template>

          <template #cell-reasoning_effort="{ row }">
            <span class="text-sm text-gray-900 dark:text-white">
              {{ formatReasoningEffort(row.reasoning_effort) }}
            </span>
          </template>

          <template #cell-endpoint="{ row }">
            <span class="text-sm text-gray-600 dark:text-gray-300 block max-w-[320px] whitespace-normal break-all">
              {{ formatUsageEndpoints(row) }}
            </span>
          </template>

          <template #cell-stream="{ row }">
            <span
              class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
              :class="getRequestTypeBadgeClass(row)"
            >
              {{ getRequestTypeLabel(row) }}
            </span>
          </template>

          <template #cell-tokens="{ row }">
            <!-- 图片生成请求 -->
            <div v-if="row.image_count > 0" class="flex items-center gap-1.5">
              <svg
                class="h-4 w-4 text-indigo-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span class="font-medium text-gray-900 dark:text-white">{{ row.image_count }}{{ $t('usage.imageUnit') }}</span>
              <span class="text-gray-400">({{ row.image_size || '2K' }})</span>
            </div>
            <!-- Token 请求 -->
            <div v-else class="flex items-center gap-1.5">
              <div class="space-y-1.5 text-sm">
                <!-- Input / Output Tokens -->
                <div class="flex items-center gap-2">
                  <!-- Input -->
                  <div class="inline-flex items-center gap-1">
                    <Icon name="arrowDown" size="sm" class="text-emerald-500" />
                    <span class="font-medium text-gray-900 dark:text-white">{{
                      row.input_tokens.toLocaleString()
                    }}</span>
                  </div>
                  <!-- Output -->
                  <div class="inline-flex items-center gap-1">
                    <Icon name="arrowUp" size="sm" class="text-violet-500" />
                    <span class="font-medium text-gray-900 dark:text-white">{{
                      row.output_tokens.toLocaleString()
                    }}</span>
                  </div>
                </div>
                <!-- Cache Tokens (Read + Write) -->
                <div
                  v-if="row.cache_read_tokens > 0 || row.cache_creation_tokens > 0"
                  class="flex items-center gap-2"
                >
                  <!-- Cache Read -->
                  <div v-if="row.cache_read_tokens > 0" class="inline-flex items-center gap-1">
                    <Icon name="inbox" size="sm" class="text-sky-500" />
                    <span class="font-medium text-sky-600 dark:text-sky-400">{{
                      formatCacheTokens(row.cache_read_tokens)
                    }}</span>
                  </div>
                  <!-- Cache Write -->
                  <div v-if="row.cache_creation_tokens > 0" class="inline-flex items-center gap-1">
                    <Icon name="edit" size="sm" class="text-amber-500" />
                    <span class="font-medium text-amber-600 dark:text-amber-400">{{
                      formatCacheTokens(row.cache_creation_tokens)
                    }}</span>
                    <span v-if="row.cache_creation_1h_tokens > 0" class="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-orange-100 text-orange-600 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:ring-orange-500/30">1h</span>
                    <span v-if="row.cache_ttl_overridden" :title="t('usage.cacheTtlOverriddenHint')" class="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-rose-100 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:ring-rose-500/30 cursor-help">R</span>
                  </div>
                </div>
              </div>
              <!-- Token Detail Tooltip -->
              <div
                class="group relative"
                @mouseenter="showTokenTooltip($event, row)"
                @mouseleave="hideTokenTooltip"
              >
                <div
                  class="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-blue-100 dark:bg-gray-700 dark:group-hover:bg-blue-900/50"
                >
                  <Icon
                    name="infoCircle"
                    size="xs"
                    class="text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400"
                  />
                </div>
              </div>
            </div>
          </template>

          <template #cell-cost="{ row }">
            <div class="flex items-center gap-1.5 text-sm">
              <span class="font-medium text-green-600 dark:text-green-400">
                ${{ getLogActualCost(row).toFixed(6) }}
              </span>
              <!-- Cost Detail Tooltip -->
              <div
                class="group relative"
                @mouseenter="showTooltip($event, row)"
                @mouseleave="hideTooltip"
              >
                <div
                  class="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-blue-100 dark:bg-gray-700 dark:group-hover:bg-blue-900/50"
                >
                  <Icon
                    name="infoCircle"
                    size="xs"
                    class="text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400"
                  />
                </div>
              </div>
            </div>
          </template>

          <template #cell-first_token="{ row }">
            <span
              v-if="row.first_token_ms != null"
              class="text-sm text-gray-600 dark:text-gray-400"
            >
              {{ formatDuration(row.first_token_ms) }}
            </span>
            <span v-else class="text-sm text-gray-400 dark:text-gray-500">-</span>
          </template>

          <template #cell-duration="{ row }">
            <span class="text-sm text-gray-600 dark:text-gray-400">{{
              formatDuration(row.duration_ms)
            }}</span>
          </template>

          <template #cell-created_at="{ value }">
            <span class="text-sm text-gray-600 dark:text-gray-400">{{
              formatDateTime(value)
            }}</span>
          </template>

          <template #cell-user_agent="{ row }">
            <span v-if="row.user_agent" class="text-sm text-gray-600 dark:text-gray-400 block max-w-[320px] whitespace-normal break-all" :title="row.user_agent">{{ formatUserAgent(row.user_agent) }}</span>
            <span v-else class="text-sm text-gray-400 dark:text-gray-500">-</span>
          </template>

          <template #empty>
            <EmptyState :message="t('usage.noRecords')" />
          </template>
        </DataTable>
      </template>

      <template #pagination>
        <Pagination
          v-if="pagination.total > 0"
          :page="pagination.page"
          :total="pagination.total"
          :page-size="pagination.page_size"
          @update:page="handlePageChange"
          @update:pageSize="handlePageSizeChange"
        />
      </template>
      </TablePageLayout>
    </div>
  </AppLayout>

  <!-- Token Tooltip Portal -->
  <Teleport to="body">
    <div
      v-if="tokenTooltipVisible"
      class="fixed z-[9999] pointer-events-none -translate-y-1/2"
      :style="{
        left: tokenTooltipPosition.x + 'px',
        top: tokenTooltipPosition.y + 'px'
      }"
    >
      <div
        class="whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl dark:border-gray-600 dark:bg-gray-800"
      >
        <div class="space-y-1.5">
          <!-- Token Breakdown -->
          <div>
            <div class="text-xs font-semibold text-gray-300 mb-1">{{ t('usage.tokenDetails') }}</div>
            <div v-if="tokenTooltipData && tokenTooltipData.input_tokens > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('admin.usage.inputTokens') }}</span>
              <span class="font-medium text-white">{{ tokenTooltipData.input_tokens.toLocaleString() }}</span>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.output_tokens > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('admin.usage.outputTokens') }}</span>
              <span class="font-medium text-white">{{ tokenTooltipData.output_tokens.toLocaleString() }}</span>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.cache_creation_tokens > 0">
              <!-- 有 5m/1h 明细时，展开显示 -->
              <template v-if="tokenTooltipData.cache_creation_5m_tokens > 0 || tokenTooltipData.cache_creation_1h_tokens > 0">
                <div v-if="tokenTooltipData.cache_creation_5m_tokens > 0" class="flex items-center justify-between gap-4">
                  <span class="text-gray-400 flex items-center gap-1.5">
                    {{ t('admin.usage.cacheCreation5mTokens') }}
                    <span class="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-amber-500/20 text-amber-400 ring-1 ring-inset ring-amber-500/30">5m</span>
                  </span>
                  <span class="font-medium text-white">{{ tokenTooltipData.cache_creation_5m_tokens.toLocaleString() }}</span>
                </div>
                <div v-if="tokenTooltipData.cache_creation_1h_tokens > 0" class="flex items-center justify-between gap-4">
                  <span class="text-gray-400 flex items-center gap-1.5">
                    {{ t('admin.usage.cacheCreation1hTokens') }}
                    <span class="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-orange-500/20 text-orange-400 ring-1 ring-inset ring-orange-500/30">1h</span>
                  </span>
                  <span class="font-medium text-white">{{ tokenTooltipData.cache_creation_1h_tokens.toLocaleString() }}</span>
                </div>
              </template>
              <!-- 无明细时，只显示聚合值 -->
              <div v-else class="flex items-center justify-between gap-4">
                <span class="text-gray-400">{{ t('admin.usage.cacheCreationTokens') }}</span>
                <span class="font-medium text-white">{{ tokenTooltipData.cache_creation_tokens.toLocaleString() }}</span>
              </div>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.cache_ttl_overridden" class="flex items-center justify-between gap-4">
              <span class="text-gray-400 flex items-center gap-1.5">
                {{ t('usage.cacheTtlOverriddenLabel') }}
                <span class="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-rose-500/20 text-rose-400 ring-1 ring-inset ring-rose-500/30">R-{{ tokenTooltipData.cache_creation_1h_tokens > 0 ? '5m' : '1H' }}</span>
              </span>
              <span class="font-medium text-rose-400">{{ tokenTooltipData.cache_creation_1h_tokens > 0 ? t('usage.cacheTtlOverridden1h') : t('usage.cacheTtlOverridden5m') }}</span>
            </div>
            <div v-if="tokenTooltipData && tokenTooltipData.cache_read_tokens > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('admin.usage.cacheReadTokens') }}</span>
              <span class="font-medium text-white">{{ tokenTooltipData.cache_read_tokens.toLocaleString() }}</span>
            </div>
          </div>
          <!-- Total -->
          <div class="flex items-center justify-between gap-6 border-t border-gray-700 pt-1.5">
            <span class="text-gray-400">{{ t('usage.totalTokens') }}</span>
            <span class="font-semibold text-blue-400">{{ ((tokenTooltipData?.input_tokens || 0) + (tokenTooltipData?.output_tokens || 0) + (tokenTooltipData?.cache_creation_tokens || 0) + (tokenTooltipData?.cache_read_tokens || 0)).toLocaleString() }}</span>
          </div>
        </div>
        <!-- Tooltip Arrow (left side) -->
        <div
          class="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-gray-900 border-t-transparent dark:border-r-gray-800"
        ></div>
      </div>
    </div>
  </Teleport>

  <!-- Tooltip Portal -->
  <Teleport to="body">
    <div
      v-if="tooltipVisible"
      class="fixed z-[9999] pointer-events-none -translate-y-1/2"
      :style="{
        left: tooltipPosition.x + 'px',
        top: tooltipPosition.y + 'px'
      }"
    >
      <div
        class="whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl dark:border-gray-600 dark:bg-gray-800"
      >
        <div class="space-y-1.5">
          <!-- Cost Breakdown -->
          <div class="mb-2 border-b border-gray-700 pb-1.5">
            <div class="text-xs font-semibold text-gray-300 mb-1">{{ t('usage.costDetails') }}</div>
            <div v-if="tooltipData && tooltipData.input_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('admin.usage.inputCost') }}</span>
              <span class="font-medium text-white">${{ tooltipData.input_cost.toFixed(6) }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.output_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('admin.usage.outputCost') }}</span>
              <span class="font-medium text-white">${{ tooltipData.output_cost.toFixed(6) }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.input_tokens > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('usage.inputTokenPrice') }}</span>
              <span class="font-medium text-sky-300">{{ formatTokenPricePerMillion(tooltipData.input_cost, tooltipData.input_tokens) }} {{ t('usage.perMillionTokens') }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.output_tokens > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('usage.outputTokenPrice') }}</span>
              <span class="font-medium text-violet-300">{{ formatTokenPricePerMillion(tooltipData.output_cost, tooltipData.output_tokens) }} {{ t('usage.perMillionTokens') }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.cache_creation_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('admin.usage.cacheCreationCost') }}</span>
              <span class="font-medium text-white">${{ tooltipData.cache_creation_cost.toFixed(6) }}</span>
            </div>
            <div v-if="tooltipData && tooltipData.cache_read_cost > 0" class="flex items-center justify-between gap-4">
              <span class="text-gray-400">{{ t('admin.usage.cacheReadCost') }}</span>
              <span class="font-medium text-white">${{ tooltipData.cache_read_cost.toFixed(6) }}</span>
            </div>
          </div>
          <!-- Rate and Summary -->
          <div class="flex items-center justify-between gap-6">
            <span class="text-gray-400">{{ t('usage.serviceTier') }}</span>
            <span class="font-semibold text-cyan-300">{{ getUsageServiceTierLabel(tooltipData?.service_tier, t) }}</span>
          </div>
          <div class="flex items-center justify-between gap-6 border-t border-gray-700 pt-1.5">
            <span class="text-gray-400">{{ t('usage.billed') }}</span>
            <span class="font-semibold text-green-400"
              >${{ getLogActualCost(tooltipData).toFixed(6) }}</span
            >
          </div>
        </div>
        <!-- Tooltip Arrow (left side) -->
        <div
          class="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-gray-900 border-t-transparent dark:border-r-gray-800"
        ></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'vue-chartjs'
import { useAppStore } from '@/stores/app'
import { usageAPI, keysAPI } from '@/api'
import AppLayout from '@/components/layout/AppLayout.vue'
import TablePageLayout from '@/components/layout/TablePageLayout.vue'
import DataTable from '@/components/common/DataTable.vue'
import Pagination from '@/components/common/Pagination.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import Select, { type SelectOption } from '@/components/common/Select.vue'
import DateRangePicker from '@/components/common/DateRangePicker.vue'
import Icon from '@/components/icons/Icon.vue'
import type { UsageLog, ApiKey, UsageQueryParams, UsageStatsResponse, ModelStat } from '@/types'
import type { Column } from '@/components/common/types'
import { formatDateTime, formatReasoningEffort } from '@/utils/format'
import { getPersistedPageSize } from '@/composables/usePersistedPageSize'
import { formatTokenPricePerMillion } from '@/utils/usagePricing'
import { getUsageServiceTierLabel } from '@/utils/usageServiceTier'
import { resolveUsageRequestType } from '@/utils/usageRequestType'

ChartJS.register(ArcElement, Tooltip, Legend)

const { t } = useI18n()
const appStore = useAppStore()

let abortController: AbortController | null = null

// Tooltip state
const tooltipVisible = ref(false)
const tooltipPosition = ref({ x: 0, y: 0 })
const tooltipData = ref<UsageLog | null>(null)

// Token tooltip state
const tokenTooltipVisible = ref(false)
const tokenTooltipPosition = ref({ x: 0, y: 0 })
const tokenTooltipData = ref<UsageLog | null>(null)

// Usage stats from API
const usageStats = ref<UsageStatsResponse | null>(null)

const columns = computed<Column[]>(() => [
  { key: 'api_key', label: t('usage.apiKeyFilter'), sortable: false },
  { key: 'model', label: t('usage.model'), sortable: true },
  { key: 'reasoning_effort', label: t('usage.reasoningEffort'), sortable: false },
  { key: 'endpoint', label: t('usage.endpoint'), sortable: false },
  { key: 'stream', label: t('usage.type'), sortable: false },
  { key: 'tokens', label: t('usage.tokens'), sortable: false },
  { key: 'cost', label: t('usage.cost'), sortable: false },
  { key: 'first_token', label: t('usage.firstToken'), sortable: false },
  { key: 'duration', label: t('usage.duration'), sortable: false },
  { key: 'created_at', label: t('usage.time'), sortable: true },
  { key: 'user_agent', label: t('usage.userAgent'), sortable: false }
])

const usageLogs = ref<UsageLog[]>([])
const apiKeys = ref<ApiKey[]>([])
const loading = ref(false)
const exporting = ref(false)
const keySpendLoading = ref(false)
const keySpendDistribution = ref<ApiKeySpendItem[]>([])
const modelDistributionLoading = ref(false)
const modelDistributionStats = ref<ModelStat[]>([])
const modelDistributionExpanded = ref(false)
const keySpendExpanded = ref(false)
const modelDistributionChartRenderKey = ref(0)
const keySpendChartRenderKey = ref(0)
let keySpendReqSeq = 0
let modelDistributionReqSeq = 0

interface ApiKeySpendItem {
  key: string
  apiKeyId: number | null
  name: string
  requests: number
  actualCost: number
  percent: number
}

const apiKeyOptions = computed(() => {
  return [
    { value: null, label: t('usage.allApiKeys') },
    ...apiKeys.value.map((key) => ({
      value: key.id,
      label: key.name
    }))
  ]
})

const modelOptions = computed<SelectOption[]>(() => {
  const models = new Set<string>()
  Object.keys(usageStats.value?.models || {}).forEach((model) => {
    if (model) models.add(model)
  })
  usageLogs.value.forEach((log) => {
    if (log.model) models.add(log.model)
  })
  if (filters.value.model) {
    models.add(String(filters.value.model))
  }

  return [
    { value: null, label: t('admin.usage.allModels') },
    ...Array.from(models)
      .sort((a, b) => a.localeCompare(b))
      .map((model) => ({ value: model, label: model }))
  ]
})

// Helper function to format date in local timezone
const formatLocalDate = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Initialize date range immediately
const now = new Date()

// Date range state
const startDate = ref(formatLocalDate(now))
const endDate = ref(formatLocalDate(now))

const filters = ref<UsageQueryParams>({
  api_key_id: undefined,
  start_date: undefined,
  end_date: undefined
})

// Initialize filters with date range
filters.value.start_date = startDate.value
filters.value.end_date = endDate.value

const getActiveFilters = (): UsageQueryParams => {
  const model = String(filters.value.model || '').trim()
  return {
    ...filters.value,
    api_key_id: filters.value.api_key_id == null ? undefined : Number(filters.value.api_key_id),
    model: model || undefined
  }
}

// Handle date range change from DateRangePicker
const onDateRangeChange = (range: {
  startDate: string
  endDate: string
  preset: string | null
}) => {
  filters.value.start_date = range.startDate
  filters.value.end_date = range.endDate
  applyFilters()
}

const pagination = reactive({
  page: 1,
  page_size: getPersistedPageSize(),
  total: 0,
  pages: 0
})

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const formatCost = (value: number): string => value.toFixed(4)

const keySpendTotal = computed(() =>
  keySpendDistribution.value.reduce((sum, item) => sum + item.actualCost, 0)
)

const chartColors = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#ec4899',
  '#64748b'
]

const keySpendChartColors = chartColors

const normalizeNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const getLogActualCost = (log: UsageLog | null | undefined): number => {
  const record = log as
    | {
        actual_cost?: unknown
        total_cost?: unknown
        cost?: unknown
      }
    | undefined
  return normalizeNumber(record?.actual_cost ?? record?.total_cost ?? record?.cost)
}

const getLogStandardCost = (log: UsageLog | null | undefined): number => {
  const record = log as
    | {
        total_cost?: unknown
        total_standard_cost?: unknown
        standard_cost?: unknown
        actual_cost?: unknown
        cost?: unknown
      }
    | undefined
  return normalizeNumber(
    record?.total_cost ??
      record?.total_standard_cost ??
      record?.standard_cost ??
      record?.actual_cost ??
      record?.cost
  )
}

const getUsageActualCost = (stats: UsageStatsResponse | null): number => {
  const record = stats as
    | {
        total_actual_cost?: unknown
        total_cost?: unknown
      }
    | null
    | undefined
  return normalizeNumber(record?.total_actual_cost ?? record?.total_cost)
}

const getUsageStandardCost = (stats: UsageStatsResponse | null): number => {
  const record = stats as
    | {
        total_cost?: unknown
        total_actual_cost?: unknown
      }
    | null
    | undefined
  return normalizeNumber(record?.total_cost ?? record?.total_actual_cost)
}

const modelDistributionChartData = computed(() => {
  if (!modelDistributionStats.value.length) return null

  return {
    labels: modelDistributionStats.value.map((item) => item.model),
    datasets: [
      {
        data: modelDistributionStats.value.map((item) => item.total_tokens),
        backgroundColor: modelDistributionStats.value.map(
          (_, index) => chartColors[index % chartColors.length]
        ),
        borderWidth: 0
      }
    ]
  }
})

const modelDistributionChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      callbacks: {
        label: (context: any) => `${context.label}: ${formatTokens(Number(context.parsed || 0))}`
      }
    }
  }
}))

const keySpendChartData = computed(() => {
  if (!keySpendDistribution.value.length) return null

  return {
    labels: keySpendDistribution.value.map((item) => item.name),
    datasets: [
      {
        data: keySpendDistribution.value.map((item) => item.actualCost),
        backgroundColor: keySpendDistribution.value.map(
          (_, index) => keySpendChartColors[index % keySpendChartColors.length]
        ),
        borderWidth: 0
      }
    ]
  }
})

const keySpendChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const value = Number(context.parsed || 0)
          const total = keySpendTotal.value
          const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
          return `${context.label}: $${formatCost(value)} (${percent}%)`
        }
      }
    }
  }
}))

const formatAverageCost = (actualCost: number, requests: number): string => {
  const safeRequests = Math.max(requests, 0)
  const average = safeRequests > 0 ? actualCost / safeRequests : 0
  return average.toFixed(4)
}

const refreshChart = async (chartKey: typeof modelDistributionChartRenderKey) => {
  await nextTick()
  requestAnimationFrame(() => {
    chartKey.value += 1
  })
}

const toggleModelDistribution = () => {
  modelDistributionExpanded.value = !modelDistributionExpanded.value
  if (modelDistributionExpanded.value) {
    loadModelDistribution()
    refreshChart(modelDistributionChartRenderKey)
  }
}

const toggleKeySpendDistribution = () => {
  keySpendExpanded.value = !keySpendExpanded.value
  if (keySpendExpanded.value) {
    loadKeySpendDistribution()
    refreshChart(keySpendChartRenderKey)
  }
}

const formatUserAgent = (ua: string): string => {
  return ua
}

const getRequestTypeLabel = (log: UsageLog): string => {
  const requestType = resolveUsageRequestType(log)
  if (requestType === 'ws_v2') return t('usage.ws')
  if (requestType === 'stream') return t('usage.stream')
  if (requestType === 'sync') return t('usage.sync')
  return t('usage.unknown')
}

const getRequestTypeBadgeClass = (log: UsageLog): string => {
  const requestType = resolveUsageRequestType(log)
  if (requestType === 'ws_v2') return 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200'
  if (requestType === 'stream') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  if (requestType === 'sync') return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
}

const getRequestTypeExportText = (log: UsageLog): string => {
  const requestType = resolveUsageRequestType(log)
  if (requestType === 'ws_v2') return 'WS'
  if (requestType === 'stream') return 'Stream'
  if (requestType === 'sync') return 'Sync'
  return 'Unknown'
}

const formatUsageEndpoints = (log: UsageLog): string => {
  const inbound = log.inbound_endpoint?.trim()
  return inbound || '-'
}

const formatTokens = (value: number): string => {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`
  } else if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`
  } else if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`
  }
  return value.toLocaleString()
}

// Compact format for cache tokens in table cells
const formatCacheTokens = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  } else if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toLocaleString()
}

const loadUsageLogs = async () => {
  if (abortController) {
    abortController.abort()
  }
  const currentAbortController = new AbortController()
  abortController = currentAbortController
  const { signal } = currentAbortController
  loading.value = true
  try {
    const params: UsageQueryParams = {
      page: pagination.page,
      page_size: pagination.page_size,
      ...getActiveFilters()
    }

    const response = await usageAPI.query(params, { signal })
    if (signal.aborted) {
      return
    }
    usageLogs.value = response.items
    pagination.total = response.total
    pagination.pages = response.pages
  } catch (error) {
    if (signal.aborted) {
      return
    }
    const abortError = error as { name?: string; code?: string }
    if (abortError?.name === 'AbortError' || abortError?.code === 'ERR_CANCELED') {
      return
    }
    appStore.showError(t('usage.failedToLoad'))
  } finally {
    if (abortController === currentAbortController) {
      loading.value = false
    }
  }
}

const loadApiKeys = async () => {
  try {
    const response = await keysAPI.list(1, 100)
    apiKeys.value = response.items
  } catch (error) {
    console.error('Failed to load API keys:', error)
  }
}

const loadUsageStats = async () => {
  try {
    const activeFilters = getActiveFilters()
    const stats = await usageAPI.getStatsByDateRange(
      activeFilters.start_date || startDate.value,
      activeFilters.end_date || endDate.value,
      activeFilters.api_key_id,
      activeFilters.model
    )
    usageStats.value = stats
  } catch (error) {
    console.error('Failed to load usage stats:', error)
  }
}

const getActiveUsageStats = (apiKeyId?: number, model?: string) => {
  const activeFilters = getActiveFilters()
  return usageAPI.getStatsByDateRange(
    activeFilters.start_date || startDate.value,
    activeFilters.end_date || endDate.value,
    apiKeyId,
    model || activeFilters.model
  )
}

const toModelStat = (model: string, stats: UsageStatsResponse): ModelStat => ({
  model,
  requests: normalizeNumber(stats.total_requests),
  input_tokens: normalizeNumber(stats.total_input_tokens),
  output_tokens: normalizeNumber(stats.total_output_tokens),
  cache_creation_tokens: 0,
  cache_read_tokens: normalizeNumber(stats.total_cache_tokens),
  total_tokens: normalizeNumber(stats.total_tokens),
  cost: getUsageStandardCost(stats),
  actual_cost: getUsageActualCost(stats)
})

const loadModelDistribution = async () => {
  const seq = ++modelDistributionReqSeq
  modelDistributionLoading.value = true
  try {
    const activeFilters = getActiveFilters()
    const response = await usageAPI.getDashboardModels({
      start_date: activeFilters.start_date || startDate.value,
      end_date: activeFilters.end_date || endDate.value
    })
    if (seq !== modelDistributionReqSeq) return

    const models = (response.models || [])
      .filter((item) => !activeFilters.model || item.model === activeFilters.model)

    if (activeFilters.api_key_id === undefined) {
      modelDistributionStats.value = models
        .map((item) => ({
          ...item,
          requests: normalizeNumber(item.requests),
          input_tokens: normalizeNumber(item.input_tokens),
          output_tokens: normalizeNumber(item.output_tokens),
          cache_creation_tokens: normalizeNumber(item.cache_creation_tokens),
          cache_read_tokens: normalizeNumber(item.cache_read_tokens),
          total_tokens: normalizeNumber(item.total_tokens),
          cost: normalizeNumber(item.cost),
          actual_cost: normalizeNumber(item.actual_cost)
        }))
        .sort((a, b) => b.total_tokens - a.total_tokens)
    } else {
      const items: ModelStat[] = []
      for (const item of models) {
        const stats = await getActiveUsageStats(activeFilters.api_key_id, item.model)
        if (seq !== modelDistributionReqSeq) return
        if (normalizeNumber(stats.total_requests) > 0) {
          items.push(toModelStat(item.model, stats))
        }
      }
      modelDistributionStats.value = items.sort((a, b) => b.total_tokens - a.total_tokens)
    }
    refreshChart(modelDistributionChartRenderKey)
  } catch (error) {
    console.error('Failed to load model distribution:', error)
    if (seq === modelDistributionReqSeq) {
      modelDistributionStats.value = []
    }
  } finally {
    if (seq === modelDistributionReqSeq) {
      modelDistributionLoading.value = false
    }
  }
}

const loadKeySpendDistribution = async () => {
  const seq = ++keySpendReqSeq
  keySpendLoading.value = true
  try {
    const activeFilters = getActiveFilters()
    const totalStats = await getActiveUsageStats(activeFilters.api_key_id, activeFilters.model)
    if (seq !== keySpendReqSeq) return

    const keys = activeFilters.api_key_id === undefined
      ? apiKeys.value
      : apiKeys.value.filter((key) => Number(key.id) === Number(activeFilters.api_key_id))
    const items: Omit<ApiKeySpendItem, 'percent'>[] = []

    for (const apiKey of keys) {
      const stats = activeFilters.api_key_id === undefined
        ? await getActiveUsageStats(Number(apiKey.id), activeFilters.model)
        : totalStats
      if (seq !== keySpendReqSeq) return
      const requests = normalizeNumber(stats.total_requests)
      if (requests > 0) {
        items.push({
          key: String(apiKey.id),
          apiKeyId: Number(apiKey.id),
          name: apiKey.name,
          requests,
          actualCost: getUsageActualCost(stats)
        })
      }
    }

    const knownRequests = items.reduce((sum, item) => sum + item.requests, 0)
    const knownActualCost = items.reduce((sum, item) => sum + item.actualCost, 0)
    const unknownRequests = Math.max(0, normalizeNumber(totalStats.total_requests) - knownRequests)
    const unknownActualCost = Math.max(0, getUsageActualCost(totalStats) - knownActualCost)
    if (activeFilters.api_key_id === undefined && (unknownRequests > 0 || unknownActualCost > 0)) {
      items.push({
        key: 'unknown',
        apiKeyId: null,
        name: t('usage.unknownApiKey'),
        requests: unknownRequests,
        actualCost: unknownActualCost
      })
    }

    const total = items.reduce((sum, item) => sum + item.actualCost, 0)
    keySpendDistribution.value = items
      .map((item) => ({
        ...item,
        percent: total > 0 ? (item.actualCost / total) * 100 : 0
      }))
      .sort((a, b) => b.actualCost - a.actualCost)
  } catch (error) {
    console.error('Failed to load key spend distribution:', error)
    if (seq === keySpendReqSeq) {
      keySpendDistribution.value = []
    }
  } finally {
    if (seq === keySpendReqSeq) {
      keySpendLoading.value = false
    }
  }
}

const refreshUsageData = async (options: { resetPage?: boolean } = {}) => {
  if (options.resetPage) {
    pagination.page = 1
  }

  const tasks: Promise<unknown>[] = [loadUsageLogs(), loadUsageStats()]

  if (modelDistributionExpanded.value) {
    tasks.push(loadModelDistribution())
  }

  if (keySpendExpanded.value) {
    tasks.push(loadKeySpendDistribution())
  }

  await Promise.all(tasks)
}

const applyFilters = async () => {
  await refreshUsageData({ resetPage: true })
}

const resetFilters = async () => {
  filters.value = {
    api_key_id: undefined,
    start_date: undefined,
    end_date: undefined
  }
  // Reset date range to default (today)
  const now = new Date()
  startDate.value = formatLocalDate(now)
  endDate.value = formatLocalDate(now)
  filters.value.start_date = startDate.value
  filters.value.end_date = endDate.value
  await refreshUsageData({ resetPage: true })
}

const handlePageChange = (page: number) => {
  pagination.page = page
  loadUsageLogs()
}

const handlePageSizeChange = (pageSize: number) => {
  pagination.page_size = pageSize
  pagination.page = 1
  loadUsageLogs()
}

/**
 * Escape CSV value to prevent injection and handle special characters
 */
const escapeCSVValue = (value: unknown): string => {
  if (value == null) return ''

  const str = String(value)
  const escaped = str.replace(/"/g, '""')

  // Prevent formula injection by prefixing dangerous characters with single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    return `"\'${escaped}"`
  }

  // Escape values containing comma, quote, or newline
  if (/[,"\n\r]/.test(str)) {
    return `"${escaped}"`
  }

  return str
}

const exportToCSVPages = async (
  totalPages: number,
  pageSize: number,
  filters: UsageQueryParams
): Promise<UsageLog[]> => {
  const batchSize = 6
  const pagesResult: UsageLog[][] = new Array(totalPages)

  for (let startPage = 1; startPage <= totalPages; startPage += batchSize) {
    const pageTasks = [] as Promise<UsageLog[]>[]
    for (let page = startPage; page < startPage + batchSize && page <= totalPages; page++) {
      pageTasks.push(
        usageAPI
          .query({ ...filters, page, page_size: pageSize })
          .then((response) => response.items)
      )
    }
    const pageResponses = await Promise.all(pageTasks)
    pageResponses.forEach((items, index) => {
      const pageIndex = startPage + index - 1
      pagesResult[pageIndex] = items
    })
  }

  return pagesResult
    .filter((records): records is UsageLog[] => Array.isArray(records))
    .flat()
}

const exportToCSV = async () => {
  if (pagination.total === 0) {
    appStore.showWarning(t('usage.noDataToExport'))
    return
  }

  exporting.value = true
  appStore.showInfo(t('usage.preparingExport'))

  try {
    const exportPageSize = 500
    const filters = {
      ...getActiveFilters()
    }
    const totalPages = Math.ceil((pagination.total || 0) / exportPageSize)
    if (totalPages <= 0) {
      appStore.showWarning(t('usage.noDataToExport'))
      return
    }

    const allLogs = await exportToCSVPages(totalPages, exportPageSize, filters)

    if (allLogs.length === 0) {
      appStore.showWarning(t('usage.noDataToExport'))
      return
    }

    const headers = [
      'Time',
      'API Key Name',
      'Model',
      'Reasoning Effort',
      'Inbound Endpoint',
      'Type',
      'Input Tokens',
      'Output Tokens',
      'Cache Read Tokens',
      'Cache Creation Tokens',
      'Rate Multiplier',
      'Billed Cost',
      'Original Cost',
      'First Token (ms)',
      'Duration (ms)'
    ]
    const rows = allLogs.map((log) =>
      [
        log.created_at,
        log.api_key?.name || '',
        log.model,
        formatReasoningEffort(log.reasoning_effort),
        log.inbound_endpoint || '',
        getRequestTypeExportText(log),
        log.input_tokens,
        log.output_tokens,
        log.cache_read_tokens,
        log.cache_creation_tokens,
        log.rate_multiplier,
        getLogActualCost(log).toFixed(8),
        getLogStandardCost(log).toFixed(8),
        log.first_token_ms ?? '',
        log.duration_ms
      ].map(escapeCSVValue)
    )

    const csvContent = [
      headers.map(escapeCSVValue).join(','),
      ...rows.map((row) => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `usage_${filters.start_date}_to_${filters.end_date}.csv`
    link.click()
    window.URL.revokeObjectURL(url)

    appStore.showSuccess(t('usage.exportSuccess'))
  } catch (error) {
    appStore.showError(t('usage.exportFailed'))
    console.error('CSV Export failed:', error)
  } finally {
    exporting.value = false
  }
}

// Tooltip functions
const showTooltip = (event: MouseEvent, row: UsageLog) => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  tooltipData.value = row
  // Position to the right of the icon, vertically centered
  tooltipPosition.value.x = rect.right + 8
  tooltipPosition.value.y = rect.top + rect.height / 2
  tooltipVisible.value = true
}

const hideTooltip = () => {
  tooltipVisible.value = false
  tooltipData.value = null
}

// Token tooltip functions
const showTokenTooltip = (event: MouseEvent, row: UsageLog) => {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()

  tokenTooltipData.value = row
  tokenTooltipPosition.value.x = rect.right + 8
  tokenTooltipPosition.value.y = rect.top + rect.height / 2
  tokenTooltipVisible.value = true
}

const hideTokenTooltip = () => {
  tokenTooltipVisible.value = false
  tokenTooltipData.value = null
}

onMounted(() => {
  loadApiKeys()
  refreshUsageData()
})
</script>
