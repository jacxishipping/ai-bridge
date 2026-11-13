-- Per-agent persistent memory carried across 24/7 runs.
ALTER TABLE custom_agents ADD COLUMN memory TEXT DEFAULT '';
