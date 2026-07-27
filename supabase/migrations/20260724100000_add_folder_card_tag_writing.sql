-- 语感文风卡：card_tag 增加 writing
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_card_tag_check;
ALTER TABLE folders ADD CONSTRAINT folders_card_tag_check
  CHECK (card_tag IS NULL OR card_tag IN ('style', 'character', 'knowledge', 'writing'));

COMMENT ON COLUMN folders.card_tag IS
  '标签卡：null=普通管理夹；style=视觉风格 | writing=语感文风 | character | knowledge';
