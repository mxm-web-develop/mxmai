-- ============================================
-- Extend all *_scope_config tables with pricing and sensitive_words
-- Unified Business Config: routing + pricing + sensitive_words in one table
-- ============================================

-- Scope tables: writing, outline, graph, video, audio, music, text

-- 1. Add pricing columns
ALTER TABLE writing_scope_config ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4);
ALTER TABLE writing_scope_config ADD COLUMN IF NOT EXISTS charge_metric VARCHAR(64);
ALTER TABLE writing_scope_config ADD COLUMN IF NOT EXISTS price_in_tokens NUMERIC(20,8);
ALTER TABLE writing_scope_config ADD COLUMN IF NOT EXISTS min_charge_tokens NUMERIC(20,8) DEFAULT 0;
ALTER TABLE writing_scope_config ADD COLUMN IF NOT EXISTS sensitive_word_list_ids JSONB;

ALTER TABLE outline_scope_config ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4);
ALTER TABLE outline_scope_config ADD COLUMN IF NOT EXISTS charge_metric VARCHAR(64);
ALTER TABLE outline_scope_config ADD COLUMN IF NOT EXISTS price_in_tokens NUMERIC(20,8);
ALTER TABLE outline_scope_config ADD COLUMN IF NOT EXISTS min_charge_tokens NUMERIC(20,8) DEFAULT 0;
ALTER TABLE outline_scope_config ADD COLUMN IF NOT EXISTS sensitive_word_list_ids JSONB;

ALTER TABLE graph_scope_config ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4);
ALTER TABLE graph_scope_config ADD COLUMN IF NOT EXISTS charge_metric VARCHAR(64);
ALTER TABLE graph_scope_config ADD COLUMN IF NOT EXISTS price_in_tokens NUMERIC(20,8);
ALTER TABLE graph_scope_config ADD COLUMN IF NOT EXISTS min_charge_tokens NUMERIC(20,8) DEFAULT 0;
ALTER TABLE graph_scope_config ADD COLUMN IF NOT EXISTS sensitive_word_list_ids JSONB;

ALTER TABLE video_scope_config ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4);
ALTER TABLE video_scope_config ADD COLUMN IF NOT EXISTS charge_metric VARCHAR(64);
ALTER TABLE video_scope_config ADD COLUMN IF NOT EXISTS price_in_tokens NUMERIC(20,8);
ALTER TABLE video_scope_config ADD COLUMN IF NOT EXISTS min_charge_tokens NUMERIC(20,8) DEFAULT 0;
ALTER TABLE video_scope_config ADD COLUMN IF NOT EXISTS sensitive_word_list_ids JSONB;

ALTER TABLE audio_scope_config ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4);
ALTER TABLE audio_scope_config ADD COLUMN IF NOT EXISTS charge_metric VARCHAR(64);
ALTER TABLE audio_scope_config ADD COLUMN IF NOT EXISTS price_in_tokens NUMERIC(20,8);
ALTER TABLE audio_scope_config ADD COLUMN IF NOT EXISTS min_charge_tokens NUMERIC(20,8) DEFAULT 0;
ALTER TABLE audio_scope_config ADD COLUMN IF NOT EXISTS sensitive_word_list_ids JSONB;

ALTER TABLE music_scope_config ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4);
ALTER TABLE music_scope_config ADD COLUMN IF NOT EXISTS charge_metric VARCHAR(64);
ALTER TABLE music_scope_config ADD COLUMN IF NOT EXISTS price_in_tokens NUMERIC(20,8);
ALTER TABLE music_scope_config ADD COLUMN IF NOT EXISTS min_charge_tokens NUMERIC(20,8) DEFAULT 0;
ALTER TABLE music_scope_config ADD COLUMN IF NOT EXISTS sensitive_word_list_ids JSONB;

ALTER TABLE text_scope_config ADD COLUMN IF NOT EXISTS margin NUMERIC(10,4);
ALTER TABLE text_scope_config ADD COLUMN IF NOT EXISTS charge_metric VARCHAR(64);
ALTER TABLE text_scope_config ADD COLUMN IF NOT EXISTS price_in_tokens NUMERIC(20,8);
ALTER TABLE text_scope_config ADD COLUMN IF NOT EXISTS min_charge_tokens NUMERIC(20,8) DEFAULT 0;
ALTER TABLE text_scope_config ADD COLUMN IF NOT EXISTS sensitive_word_list_ids JSONB;

-- 2. Migrate data from business_pricing
-- business_type format: "scope-task_key-sub_type" or "scope-task_key"
-- Parse by splitting on '-' (but sub_type can contain hyphens, so use last segment as sub_type when >2 parts)

DO $$
DECLARE
    bp_row RECORD;
    scope_text TEXT;
    task_key_text TEXT;
    parts TEXT[];
BEGIN
    FOR bp_row IN SELECT * FROM business_pricing LOOP
        parts := string_to_array(bp_row.business_type, '-');
        IF array_length(parts, 1) >= 3 THEN
            scope_text := parts[1];
            task_key_text := parts[2];
            -- sub_type is parts[3:] joined by '-' (in case it contains hyphens)
            EXECUTE format(
                'UPDATE %I_scope_config SET margin = $1, charge_metric = $2, price_in_tokens = $3, min_charge_tokens = $4 WHERE scope = $5 AND task_key = $6 AND sub_type = $7',
                scope_text
            ) USING bp_row.metadata->>'margin', bp_row.charge_metric, bp_row.price_in_tokens, bp_row.min_charge_tokens, scope_text, task_key_text, parts[array_upper(parts,1)];
        ELSIF array_length(parts, 1) = 2 THEN
            scope_text := parts[1];
            task_key_text := parts[2];
            EXECUTE format(
                'UPDATE %I_scope_config SET margin = $1, charge_metric = $2, price_in_tokens = $3, min_charge_tokens = $4 WHERE scope = $5 AND task_key = $6 AND sub_type = $7',
                scope_text
            ) USING bp_row.metadata->>'margin', bp_row.charge_metric, bp_row.price_in_tokens, bp_row.min_charge_tokens, scope_text, task_key_text, 'default';
        END IF;
    END LOOP;
END;
$$;

-- 3. Migrate sensitive_word_list_bindings -> sensitive_word_list_ids (JSONB array)
UPDATE writing_scope_config wsc
SET sensitive_word_list_ids = (
    SELECT jsonb_agg(list_id ORDER BY sort_order)
    FROM sensitive_word_list_bindings swlb
    WHERE swlb.scope = wsc.scope
      AND swlb.type = wsc.task_key
      AND COALESCE(swlb.subtype, 'default') = wsc.sub_type
)
WHERE EXISTS (
    SELECT 1 FROM sensitive_word_list_bindings swlb
    WHERE swlb.scope = wsc.scope AND swlb.type = wsc.task_key
    AND COALESCE(swlb.subtype, 'default') = wsc.sub_type
);

-- Similar for other scope_config tables...
-- (The above UPDATE covers writing_scope_config; replicate for others if needed)

-- 4. Add RLS policies (optional, if tables have RLS enabled)
-- ALTER TABLE writing_scope_config ENABLE ROW LEVEL SECURITY;
-- (Add RLS policies as needed to match existing patterns)
