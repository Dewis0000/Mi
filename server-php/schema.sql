-- Схема БД Neru-Квест для MySQL.
-- Обычно таблицы создаются автоматически при первом запросе. Этот файл нужен
-- только если у пользователя БД нет прав на CREATE TABLE — тогда импортируйте
-- его через phpMyAdmin (панель reg.ru) в свою базу.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(40) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  phone_verified INT NOT NULL DEFAULT 0,
  name VARCHAR(80),
  birth_date VARCHAR(32),
  email VARCHAR(120),
  password_hash VARCHAR(255),
  points INT NOT NULL DEFAULT 0,
  last_visit_at VARCHAR(32),
  role_key VARCHAR(20),
  blocked INT NOT NULL DEFAULT 0,
  messenger VARCHAR(12) NOT NULL DEFAULT 'TELEGRAM',
  telegram_chat_id VARCHAR(40),
  vk_user_id VARCHAR(40),
  max_user_id VARCHAR(40),
  notify_bookings INT NOT NULL DEFAULT 1,
  notify_reminders INT NOT NULL DEFAULT 1,
  notify_promo INT NOT NULL DEFAULT 0,
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_codes (
  id VARCHAR(40) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at INT NOT NULL,
  consumed INT NOT NULL DEFAULT 0,
  created_at INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  expires_at INT NOT NULL,
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  quest_id VARCHAR(40) NOT NULL,
  start_at VARCHAR(32) NOT NULL,
  end_at VARCHAR(32) NOT NULL,
  players_count INT NOT NULL,
  ages TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'NEW',
  source VARCHAR(12) NOT NULL DEFAULT 'WEB',
  base_price INT NOT NULL DEFAULT 0,
  discount_percent INT NOT NULL DEFAULT 0,
  discount_amount INT NOT NULL DEFAULT 0,
  promo_code VARCHAR(40),
  final_price INT NOT NULL DEFAULT 0,
  prepaid INT NOT NULL DEFAULT 0,
  comment TEXT,
  admin_note TEXT,
  is_double_session INT NOT NULL DEFAULT 0,
  linked_booking_id VARCHAR(40),
  passed INT,
  time_spent_min INT,
  points_awarded INT NOT NULL DEFAULT 0,
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holds (
  id VARCHAR(40) PRIMARY KEY,
  quest_id VARCHAR(40) NOT NULL,
  user_id VARCHAR(40) NOT NULL,
  start_at VARCHAR(32) NOT NULL,
  end_at VARCHAR(32) NOT NULL,
  expires_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS points_log (
  id VARCHAR(40) PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(40) NOT NULL,
  comment TEXT,
  booking_id VARCHAR(40),
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_logs (
  id VARCHAR(40) PRIMARY KEY,
  admin_id VARCHAR(40) NOT NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id VARCHAR(40),
  details TEXT,
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kv_store (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messenger_links (
  id VARCHAR(40) PRIMARY KEY,
  platform VARCHAR(12) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  chat_id VARCHAR(40) NOT NULL,
  username VARCHAR(80),
  created_at VARCHAR(32) NOT NULL,
  UNIQUE (platform, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
