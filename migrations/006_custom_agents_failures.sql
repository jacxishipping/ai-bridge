-- Track consecutive failures so the runner can auto-pause broken agents.
ALTER TABLE custom_agents ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_agents ADD COLUMN last_skip_reason TEXT DEFAULT '';
