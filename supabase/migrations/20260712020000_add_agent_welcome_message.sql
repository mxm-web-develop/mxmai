-- AI 助手欢迎语（空态展示，登录用户可读，不暴露完整 model_config）
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS welcome_message TEXT;
