'use strict';

/**
 * alerts.js — Alert worker that scans for stale/failed jobs and fires notifications.
 *
 * Alert types checked:
 *   - dispatch_failure:  jobs with status 'failed'
 *   - stale_in_progress: jobs in 'in-progress' status for longer than threshold_hours
 *   - stale_review:      jobs in 'review' status for longer than threshold_hours
 *   - webhook_failure:   events with processing_status = 'failed' in the last 24h
 *
 * In Postgres mode, rules and destinations are loaded from the database.
 * In JSON-file demo mode, a default set of built-in rules runs and notifications
 * are logged to the console only (no database required).
 *
 * Usage:
 *   const { startAlertWorker, runAlerts } = require('./alerts');
 *   startAlertWorker(); // call once at server startup
 *
 * Or run as a one-shot:
 *   node -e "require('./src/alerts').runAlerts().then(console.log)"
 */

const db = require('./db');
const { dispatch } = require('./notify');

const DEFAULT_STALE_HOURS = Number(process.env.ALERT_STALE_HOURS || 24);
const WORKER_INTERVAL_MS = Number(process.env.ALERT_INTERVAL_MS || 15 * 60 * 1000); // 15 min

// ─── Postgres helpers ─────────────────────────────────────────────────────────

async function loadRulesAndDestinations() {
  const pool = db.getPool();
  if (!pool) {
    // Demo mode: default rules
    return [
      { id: 'default-dispatch-failure', rule_type: 'dispatch_failure', threshold_hours: 0, installation_id: null, destinations: [] },
      { id: 'default-stale-in-progress', rule_type: 'stale_in_progress', threshold_hours: DEFAULT_STALE_HOURS, installation_id: null, destinations: [] },
      { id: 'default-stale-review', rule_type: 'stale_review', threshold_hours: DEFAULT_STALE_HOURS, installation_id: null, destinations: [] },
      { id: 'default-webhook-failure', rule_type: 'webhook_failure', threshold_hours: 1, installation_id: null, destinations: [] },
    ];
  }

  const rules = await db.query(`SELECT * FROM alert_rules WHERE enabled = TRUE`);

  for (const rule of rules) {
    rule.destinations = await db.query(
      `SELECT * FROM notification_destinations
        WHERE installation_id = $1 AND enabled = TRUE`,
      [rule.installation_id],
    );
  }

  return rules;
}

async function recordDelivery(ruleId, destinationId, jobId, status, errorMessage) {
  await store.recordAlertDelivery({
    ruleId,
    destinationId,
    jobId: jobId || null,
    status,
    errorMessage: errorMessage || null,
  });
}

// ─── Alert detectors ──────────────────────────────────────────────────────────

/**
 * Find jobs that have status 'failed'.
 *
 * @returns {Promise<object[]>}
 */
async function detectFailedJobs() {
  const pool = db.getPool();
  if (pool) {
    return db.query(`SELECT * FROM jobs WHERE current_status = 'failed' ORDER BY updated_at DESC LIMIT 50`);
  }
  // JSON-file mode
  const { jobs } = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'data', 'store.json'), 'utf8'
  ));
  return (jobs || []).filter(j => j.current_status === 'failed');
}

/**
 * Find jobs stuck in a particular status for longer than thresholdHours.
 *
 * @param {string} status
 * @param {number} thresholdHours
 * @returns {Promise<object[]>}
 */
async function detectStaleJobs(status, thresholdHours) {
  const pool = db.getPool();
  if (pool) {
    return db.query(
      `SELECT * FROM jobs
        WHERE current_status = $1
          AND updated_at < NOW() - INTERVAL '1 hour' * $2
        ORDER BY updated_at ASC LIMIT 50`,
      [status, thresholdHours],
    );
  }
  // JSON-file mode
  const cutoff = Date.now() - thresholdHours * 60 * 60 * 1000;
  const { jobs } = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'data', 'store.json'), 'utf8'
  ));
  return (jobs || []).filter(j =>
    j.current_status === status && new Date(j.updated_at).getTime() < cutoff
  );
}

/**
 * Find events that failed processing in the last N hours.
 *
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
async function detectFailedWebhooks(hours) {
  const pool = db.getPool();
  if (pool) {
    return db.query(
      `SELECT * FROM events
        WHERE processing_status = 'failed'
          AND received_at > NOW() - INTERVAL '1 hour' * $1
        ORDER BY received_at DESC LIMIT 50`,
      [hours],
    );
  }
  return [];
}

// ─── Alert builder ─────────────────────────────────────────────────────────────

function buildAlert(ruleType, job, extra = {}) {
  const repo = job ? (job.repository || job.repo || '') : '';
  const issue = job ? (job.issue_number || '') : '';

  const messages = {
    dispatch_failure:  `Job failed: ${repo}#${issue} — ${job ? job.issue_title || '' : ''}`,
    stale_in_progress: `Job stuck in-progress: ${repo}#${issue} — ${job ? job.issue_title || '' : ''}`,
    stale_review:      `Job stale in review: ${repo}#${issue} — ${job ? job.issue_title || '' : ''}`,
    webhook_failure:   `Webhook processing failure${extra.event_type ? `: ${extra.event_type}` : ''}`,
  };

  return {
    rule_type: ruleType,
    message: messages[ruleType] || ruleType,
    repository: repo,
    issue_number: issue,
    job_id: job ? job.id : null,
    job_url: repo && issue ? `https://github.com/${repo}/issues/${issue}` : null,
    triggered_at: new Date().toISOString(),
    ...extra,
  };
}

// ─── Main run function ────────────────────────────────────────────────────────

/**
 * Run a full alert check cycle.
 *
 * @returns {Promise<{ checked: number, fired: number, errors: number }>}
 */
async function runAlerts() {
  const rules = await loadRulesAndDestinations();
  let checked = 0, fired = 0, errors = 0;

  for (const rule of rules) {
    checked += 1;
    let affectedItems = [];

    try {
      switch (rule.rule_type) {
        case 'dispatch_failure':
          affectedItems = await detectFailedJobs();
          break;
        case 'stale_in_progress':
          affectedItems = await detectStaleJobs('in-progress', rule.threshold_hours || DEFAULT_STALE_HOURS);
          break;
        case 'stale_review':
          affectedItems = await detectStaleJobs('review', rule.threshold_hours || DEFAULT_STALE_HOURS);
          break;
        case 'webhook_failure':
          affectedItems = await detectFailedWebhooks(rule.threshold_hours || 1);
          break;
        default:
          continue;
      }
    } catch (err) {
      console.error(`[alerts] Error detecting ${rule.rule_type}:`, err.message);
      errors += 1;
      continue;
    }

    if (affectedItems.length === 0) continue;

    console.log(`[alerts] Rule ${rule.rule_type}: ${affectedItems.length} item(s) detected`);

    for (const item of affectedItems) {
      const alert = buildAlert(rule.rule_type, item);

      if (rule.destinations.length === 0) {
        // Demo mode or no destinations configured — just log
        console.warn(`[alerts] ALERT (no destination): ${alert.message}`);
        fired += 1;
        continue;
      }

      for (const dest of rule.destinations) {
        try {
          const result = await dispatch(dest, alert);
          await recordDelivery(rule.id, dest.id, item.id, result.ok ? 'sent' : 'failed', result.error);
          if (result.ok) {
            fired += 1;
          } else {
            console.error(`[alerts] Failed to deliver to ${dest.type} ${dest.url || dest.email}: ${result.error}`);
            errors += 1;
          }
        } catch (err) {
          console.error(`[alerts] Unexpected dispatch error:`, err.message);
          errors += 1;
        }
      }
    }
  }

  console.log(`[alerts] Cycle complete. Rules checked: ${checked}, alerts fired: ${fired}, errors: ${errors}`);
  recordAlertCycle({ fired, errors });
  return { checked, fired, errors };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

let workerTimer = null;

/**
 * Start the alert worker background timer.
 * Safe to call multiple times (idempotent).
 */
function startAlertWorker() {
  if (workerTimer) return;

  console.log(`[alerts] Alert worker starting (interval: ${WORKER_INTERVAL_MS / 1000}s)`);

  // Run once immediately, then on interval
  runAlerts().catch(err => console.error('[alerts] Worker error:', err));

  workerTimer = setInterval(() => {
    runAlerts().catch(err => console.error('[alerts] Worker error:', err));
  }, WORKER_INTERVAL_MS);

  if (workerTimer.unref) workerTimer.unref();
}

/**
 * Stop the alert worker.
 */
function stopAlertWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}

module.exports = { runAlerts, startAlertWorker, stopAlertWorker, buildAlert };


