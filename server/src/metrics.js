'use strict';

const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

const state = {
  webhook_received_total: 0,
  webhook_failed_total: 0,
  alert_cycles_total: 0,
  alerts_fired_total: 0,
  alert_errors_total: 0,
  histograms: {
    webhook_processing_duration_seconds: initHistogram(),
    db_query_duration_seconds: initHistogram(),
  },
};

function initHistogram() {
  return {
    buckets: Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0])),
    sum: 0,
    count: 0,
  };
}

function observeHistogram(name, seconds) {
  const histogram = state.histograms[name];
  if (!histogram || !Number.isFinite(seconds) || seconds < 0) return;
  histogram.count += 1;
  histogram.sum += seconds;
  for (const bucket of BUCKETS) {
    if (seconds <= bucket) {
      histogram.buckets[bucket] += 1;
    }
  }
}

function recordWebhookProcessing(durationMs, ok = true) {
  state.webhook_received_total += 1;
  if (!ok) state.webhook_failed_total += 1;
  observeHistogram('webhook_processing_duration_seconds', durationMs / 1000);
}

function recordDbQuery(durationMs) {
  observeHistogram('db_query_duration_seconds', durationMs / 1000);
}

function recordAlertCycle({ fired = 0, errors = 0 } = {}) {
  state.alert_cycles_total += 1;
  state.alerts_fired_total += fired;
  state.alert_errors_total += errors;
}

function formatHistogram(name) {
  const histogram = state.histograms[name];
  const lines = [
    `# TYPE ${name} histogram`,
  ];

  let cumulative = 0;
  for (const bucket of BUCKETS) {
    cumulative += histogram.buckets[bucket];
    lines.push(`${name}_bucket{le="${bucket}"} ${cumulative}`);
  }
  lines.push(`${name}_bucket{le="+Inf"} ${histogram.count}`);
  lines.push(`${name}_sum ${histogram.sum.toFixed(6)}`);
  lines.push(`${name}_count ${histogram.count}`);
  return lines;
}

function renderMetricsText({ activeJobs = 0, failedJobs = 0, dbHealthy = null, alertRules = 0, alertDestinations = 0, alertDeliveries = 0, alertWorkerEnabled = null, uptimeSeconds = null } = {}) {
  const lines = [
    '# HELP julesops_webhook_received_total Total webhooks accepted by the JulesOps server.',
    '# TYPE julesops_webhook_received_total counter',
    `julesops_webhook_received_total ${state.webhook_received_total}`,
    '# HELP julesops_webhook_failed_total Total webhook requests rejected or failed.',
    '# TYPE julesops_webhook_failed_total counter',
    `julesops_webhook_failed_total ${state.webhook_failed_total}`,
    '# HELP julesops_jobs_active_total Current active jobs.',
    '# TYPE julesops_jobs_active_total gauge',
    `julesops_jobs_active_total ${activeJobs}`,
    '# HELP julesops_jobs_failed_total Current failed jobs.',
    '# TYPE julesops_jobs_failed_total gauge',
    `julesops_jobs_failed_total ${failedJobs}`,
    '# HELP julesops_db_healthy Whether the database health check is currently passing.',
    '# TYPE julesops_db_healthy gauge',
    `julesops_db_healthy ${dbHealthy === null ? 0 : dbHealthy ? 1 : 0}`,
    '# HELP julesops_alert_rules_total Number of alert rules known to the control plane.',
    '# TYPE julesops_alert_rules_total gauge',
    `julesops_alert_rules_total ${alertRules}`,
    '# HELP julesops_notification_destinations_total Number of notification destinations known to the control plane.',
    '# TYPE julesops_notification_destinations_total gauge',
    `julesops_notification_destinations_total ${alertDestinations}`,
    '# HELP julesops_alert_deliveries_total Total recorded alert deliveries.',
    '# TYPE julesops_alert_deliveries_total gauge',
    `julesops_alert_deliveries_total ${alertDeliveries}`,
    '# HELP julesops_alert_worker_enabled Whether the alert worker is enabled.',
    '# TYPE julesops_alert_worker_enabled gauge',
    `julesops_alert_worker_enabled ${alertWorkerEnabled === null ? 0 : alertWorkerEnabled ? 1 : 0}`,
  ];

  if (Number.isFinite(uptimeSeconds)) {
    lines.push('# HELP julesops_uptime_seconds Service uptime in seconds.');
    lines.push('# TYPE julesops_uptime_seconds gauge');
    lines.push(`julesops_uptime_seconds ${Math.max(0, Math.floor(uptimeSeconds))}`);
  }

  lines.push(...formatHistogram('webhook_processing_duration_seconds'));
  lines.push(...formatHistogram('db_query_duration_seconds'));
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  recordWebhookProcessing,
  recordDbQuery,
  recordAlertCycle,
  renderMetricsText,
};
