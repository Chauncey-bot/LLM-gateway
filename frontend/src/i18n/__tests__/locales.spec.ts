import { describe, expect, it } from 'vitest'

import zh from '../locales/zh'

describe('Chinese user subscription translations', () => {
  it('includes cumulative quota labels used by the subscription card', () => {
    expect(zh.userSubscriptions.cumulativePeriod).toBe('累计周期')
    expect(zh.userSubscriptions.cumulativeTotalQuota).toBe('总额度 {amount}')
    expect(zh.userSubscriptions.cumulativeUsage).toBe('周期用量')
    expect(zh.userSubscriptions.cumulativePeriodStarts).toBe('开始：{date}')
    expect(zh.userSubscriptions.cumulativePeriodEnds).toBe('结束：{date}')
    expect(zh.userSubscriptions.cumulativePeriodUnavailable).toBe('未知')
  })
})
