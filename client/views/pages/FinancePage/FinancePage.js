import React, { useEffect } from 'react'
import PropTypes from 'prop-types'

import PageLayout from '@views/layout/PageLayout.js'

import './FinancePage.styl'

const format_currency = (value) => {
  if (value === null || value === undefined) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const format_percent = (value) => {
  if (value === null || value === undefined) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

const KPICard = ({ title, value, subtitle, color_class }) => (
  <div className={`finance-kpi-card ${color_class || ''}`}>
    <div className='finance-kpi-card__title'>{title}</div>
    <div className='finance-kpi-card__value'>{value}</div>
    {subtitle && (
      <div className='finance-kpi-card__subtitle'>{subtitle}</div>
    )}
  </div>
)

KPICard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  color_class: PropTypes.string
}

const FinancePage = ({
  net_worth,
  ytd_change_pct,
  safe_to_spend,
  asset_allocation,
  ytd_business_profit,
  is_loading,
  load_finance_overview
}) => {
  useEffect(() => {
    load_finance_overview()
  }, [])

  if (is_loading && !net_worth) {
    return (
      <PageLayout>
        <div className='finance-page'>
          <div className='finance-page__loading'>Loading finance data...</div>
        </div>
      </PageLayout>
    )
  }

  const ytd_color = ytd_change_pct >= 0 ? 'positive' : 'negative'
  const safe_to_spend_color =
    safe_to_spend === null
      ? ''
      : safe_to_spend > 0
        ? 'positive'
        : 'negative'

  // compute allocation percentages
  const allocation_entries = Object.entries(asset_allocation || {})
  const allocation_total = allocation_entries.reduce(
    (sum, [, val]) => sum + Math.abs(val),
    0
  )

  return (
    <PageLayout>
      <div className='finance-page'>
        <h2 className='finance-page__title'>Finance</h2>

        <div className='finance-kpi-grid'>
          <KPICard
            title='Net Worth'
            value={format_currency(net_worth)}
            subtitle={`YTD: ${format_percent(ytd_change_pct)}`}
            color_class={ytd_color}
          />

          {safe_to_spend !== null && (
            <KPICard
              title='Safe to Spend'
              value={format_currency(safe_to_spend)}
              subtitle='Remaining budget this month'
              color_class={safe_to_spend_color}
            />
          )}

          <KPICard
            title='Business Profit (YTD)'
            value={format_currency(ytd_business_profit)}
            color_class={ytd_business_profit >= 0 ? 'positive' : 'negative'}
          />
        </div>

        {allocation_entries.length > 0 && (
          <div className='finance-allocation'>
            <h3 className='finance-allocation__title'>Asset Allocation</h3>
            <div className='finance-allocation__list'>
              {allocation_entries
                .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                .map(([asset_class, value]) => {
                  const pct =
                    allocation_total > 0
                      ? ((Math.abs(value) / allocation_total) * 100).toFixed(1)
                      : '0.0'
                  const label = asset_class
                    .replace(/^\//, '')
                    .replace(/\//g, ' > ')
                  return (
                    <div key={asset_class} className='finance-allocation__item'>
                      <span className='finance-allocation__label'>{label}</span>
                      <span className='finance-allocation__pct'>{pct}%</span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}

FinancePage.propTypes = {
  net_worth: PropTypes.number,
  ytd_change_pct: PropTypes.number,
  safe_to_spend: PropTypes.number,
  asset_allocation: PropTypes.object,
  ytd_business_profit: PropTypes.number,
  is_loading: PropTypes.bool,
  load_finance_overview: PropTypes.func.isRequired
}

export default FinancePage
