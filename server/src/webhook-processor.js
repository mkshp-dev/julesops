'use strict';

const crypto = require('crypto');

const store = require('./store');
const {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
} = require('./installation-handlers');

async function processWebhookPayload(options) {
  const {
    eventName,
    payload,
    deliveryId = crypto.randomUUID(),
    signatureMode = 'unknown',
    recordEvent = true,
  } = options;

  const repository = payload.repository ? payload.repository.full_name : null;
  const installationId = payload.installation ? payload.installation.id : null;

  let eventRecord = null;
  if (recordEvent) {
    eventRecord = await store.saveEvent({
      deliveryId,
      eventType: eventName,
      action: payload.action || null,
      installationId,
      repository,
      rawPayload: payload,
      signatureMode,
    });
  }

  let handlerResult = null;
  let jobError = null;

  try {
    if (eventName === 'installation') {
      handlerResult = await handleInstallationEvent(payload);
    } else if (eventName === 'installation_repositories') {
      handlerResult = await handleInstallationRepositoriesEvent(payload);
    } else {
      const partialJob = store.normalizeJobFromWebhook(eventName, payload);
      if (partialJob) {
        await store.upsertJob(partialJob);
      }
    }
  } catch (err) {
    jobError = err.message;
    console.error(`[server] Error processing ${eventName} event ${deliveryId}:`, err);
  }

  if (recordEvent) {
    await store.updateEventStatus(deliveryId, jobError ? 'failed' : 'processed', jobError);
  }

  return {
    ok: !jobError,
    event: eventRecord,
    handler: handlerResult,
    error: jobError,
    deliveryId,
    installationId,
    repository,
  };
}

module.exports = {
  processWebhookPayload,
};
