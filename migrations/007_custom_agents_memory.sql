-- Per-agent persistent memory carried across 24/7 runs.
ALTER TABLE custom_agents ADD COLUMN IF NOT EXISTS memory TEXT DEFAULT '';
