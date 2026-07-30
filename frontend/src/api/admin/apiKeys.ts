/**
 * Admin API Keys API endpoints
 * Handles API key management for administrators
 */

import { apiClient } from '../client'
import type { ApiKey } from '@/types'

export interface UpdateApiKeyGroupResult {
  api_key: ApiKey
  auto_granted_group_access: boolean
  granted_group_id?: number
  granted_group_name?: string
}

export interface BatchUpdateApiKeyGroupResult {
  requested_count: number
  updated_count: number
  failed_count: number
  updated_ids: number[]
  failed_ids: Array<{ id: number; error?: string }>
}

const normalizeBatchUpdateApiKeyGroupResult = (
  raw: any,
  requestedKeyIds: number[]
): BatchUpdateApiKeyGroupResult => {
  const updatedIds = Array.isArray(raw?.updated_ids)
    ? raw.updated_ids
    : Array.isArray(raw?.succeeded_ids)
      ? raw.succeeded_ids
      : Array.isArray(raw?.updated)
        ? raw.updated
        : []

  const failedIds = Array.isArray(raw?.failed_ids)
    ? raw.failed_ids
    : Array.isArray(raw?.failed)
      ? raw.failed
      : []

  return {
    requested_count:
      typeof raw?.requested_count === 'number'
        ? raw.requested_count
        : typeof raw?.requested === 'number'
          ? raw.requested
          : requestedKeyIds.length,
    updated_count:
      typeof raw?.updated_count === 'number'
        ? raw.updated_count
        : typeof raw?.success_count === 'number'
          ? raw.success_count
          : Array.isArray(updatedIds)
            ? updatedIds.length
            : 0,
    failed_count:
      typeof raw?.failed_count === 'number'
        ? raw.failed_count
        : typeof raw?.failed === 'number'
          ? raw.failed
          : Array.isArray(failedIds)
            ? failedIds.length
            : 0,
    updated_ids: Array.isArray(updatedIds) ? updatedIds : [],
    failed_ids: Array.isArray(failedIds)
      ? failedIds.map((item: any) => ({
          id: Number(item.id),
          error: item.error || item.message || item.reason || String(item)
        }))
      : []
  }
}

const fallbackErrorMessage = (error: any, keyId: number) => {
  return error?.response?.data?.detail || error?.message || `key ${keyId} update failed`
}

export async function batchUpdateApiKeyGroup(
  keyIds: number[],
  groupId: number | null
): Promise<BatchUpdateApiKeyGroupResult> {
  if (keyIds.length === 0) {
    return {
      requested_count: 0,
      updated_count: 0,
      failed_count: 0,
      updated_ids: [],
      failed_ids: []
    }
  }

  const payload = { ids: keyIds, group_id: groupId === null ? 0 : groupId }

  try {
    const { data } = await apiClient.post<any>('/admin/api-keys/batch-update-group', payload)
    return normalizeBatchUpdateApiKeyGroupResult(data, keyIds)
  } catch (error: any) {
    const status = error?.response?.status
    if (status === 404 || status === 405 || status === 501) {
      const results = await Promise.allSettled(
        keyIds.map((id) => updateApiKeyGroup(id, groupId))
      )
      const succeeded: number[] = []
      const failed: Array<{ id: number; error?: string }> = []

      results.forEach((result, index) => {
        const keyId = keyIds[index]
        if (result.status === 'fulfilled') {
          succeeded.push(keyId)
        } else {
          failed.push({ id: keyId, error: fallbackErrorMessage(result.reason, keyId) })
        }
      })

      return {
        requested_count: keyIds.length,
        updated_count: succeeded.length,
        failed_count: failed.length,
        updated_ids: succeeded,
        failed_ids: failed
      }
    }
    throw error
  }
}

/**
 * Update an API key's group binding
 * @param id - API Key ID
 * @param groupId - Group ID (0 to unbind, positive to bind, null/undefined to skip)
 * @returns Updated API key with auto-grant info
 */
export async function updateApiKeyGroup(id: number, groupId: number | null): Promise<UpdateApiKeyGroupResult> {
  const { data } = await apiClient.put<UpdateApiKeyGroupResult>(`/admin/api-keys/${id}`, {
    group_id: groupId === null ? 0 : groupId
  })
  return data
}

export const apiKeysAPI = {
  updateApiKeyGroup,
  batchUpdateApiKeyGroup
}

export default apiKeysAPI
