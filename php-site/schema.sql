-- Схема БД Neru-Квест (MySQL 8 / MariaDB). Импорт: phpMyAdmin → «Импорт», либо
-- mysql -u u3661097_default -p u3661097_default < schema.sql

SET NAMES utf8mb4;

-- Настройки (ключ-значение) — редактируются в админке
CREATE TABLE IF NOT EXISTS settings (
    k  VARCHAR(50)  NOT NULL PRIMARY KEY,
    v  VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (k, v) VALUES
    ('base_price', '3500'),        -- цена игры за команду до base_players
    ('base_players', '5'),         -- сколько человек входит в базовую цену
    ('extra_per_player', '700'),   -- доплата за игрока сверх базовых (в пределах одной игры)
    ('max_per_game', '7'),         -- максимум игроков в одной игре
    ('prepay_amount', '500'),      -- предоплата для записи
    ('cancel_hours', '24'),        -- возврат предоплаты при отмене не позднее N часов
    ('duration_min', '60');        -- длительность игры, мин

-- Доп. опции (добавлять/убирать в админке). unit: 'toggle' — фикс. цена; 'hour' — цена × количество часов
CREATE TABLE IF NOT EXISTS options (
    id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    label  VARCHAR(120) NOT NULL,
    price  INT UNSIGNED NOT NULL DEFAULT 0,
    unit   VARCHAR(10)  NOT NULL DEFAULT 'toggle',
    sort   INT          NOT NULL DEFAULT 0,
    active TINYINT(1)   NOT NULL DEFAULT 1,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO options (id, label, price, unit, sort, active) VALUES
    (1, 'Комната отдыха', 500, 'hour',   1, 1),
    (2, 'Надпись «С днём рождения»', 200, 'toggle', 2, 1),
    (3, 'Цветная посуда (на всех)',  200, 'toggle', 3, 1),
    (4, 'Воздушные шары (20 шт)',     200, 'toggle', 4, 1);

-- Заявки / брони
CREATE TABLE IF NOT EXISTS bookings (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status         VARCHAR(20)  NOT NULL DEFAULT 'new',   -- new|confirmed|paid|done|cancelled

    name           VARCHAR(120) NOT NULL,
    phone          VARCHAR(40)  NOT NULL,
    phone_verified TINYINT(1)   NOT NULL DEFAULT 0,
    play_date      DATE         NULL,
    play_time      VARCHAR(20)  NULL,

    players        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    games          SMALLINT UNSIGNED NOT NULL DEFAULT 1,  -- сколько игр (деление больших групп)
    level          VARCHAR(40)  NULL,
    options_json   TEXT         NULL,                     -- выбранные опции (снимок)

    games_total    INT UNSIGNED NOT NULL DEFAULT 0,
    options_total  INT UNSIGNED NOT NULL DEFAULT 0,
    total          INT UNSIGNED NOT NULL DEFAULT 0,
    prepay         INT UNSIGNED NOT NULL DEFAULT 0,

    comment        TEXT         NULL,
    ip             VARCHAR(45)  NULL,
    notified       TINYINT(1)   NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    KEY idx_created (created_at),
    KEY idx_status  (status),
    KEY idx_ip_time (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Коды подтверждения телефона
CREATE TABLE IF NOT EXISTS verify_codes (
    phone      VARCHAR(40) NOT NULL PRIMARY KEY,
    code       VARCHAR(8)  NOT NULL,
    expires_at DATETIME    NOT NULL,
    attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Защита админки от перебора
CREATE TABLE IF NOT EXISTS login_attempts (
    ip       VARCHAR(45) NOT NULL PRIMARY KEY,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    last_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
