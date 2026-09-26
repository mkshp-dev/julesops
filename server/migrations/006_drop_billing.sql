-- Migration: 006_drop_billing
-- JulesOps is free; Stripe billing was removed. Drop the billing tables
-- created by 001_initial_schema.sql and 004_subscriptions.sql.

DROP VIEW IF EXISTS installation_plans;
DROP TABLE IF EXISTS subscriptions;
