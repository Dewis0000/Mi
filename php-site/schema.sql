-- Схема БД для сайта Neru-Квест (MySQL 8 / MariaDB).
-- Импортируйте через phpMyAdmin (панель reg.ru) в базу u3661097_default,
-- либо: mysql -u u3661097_default -p u3661097_default < schema.sql

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS bookings (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status          VARCHAR(20)     NOT NULL DEFAULT 'new',   -- new | confirmed | paid | done | cancelled

    name            VARCHAR(120)    NOT NULL,
    phone           VARCHAR(40)     NOT NULL,
    play_date       DATE            NULL,
    play_time       VARCHAR(20)     NULL,

    players         TINYINT UNSIGNED NOT NULL DEFAULT 1,
    ages            VARCHAR(120)    NULL,
    level           VARCHAR(40)     NULL,                     -- выбранный уровень или "на месте"

    rest_room       TINYINT(1)      NOT NULL DEFAULT 0,
    rest_hours      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    deco_birthday   TINYINT(1)      NOT NULL DEFAULT 0,
    deco_tableware  TINYINT(1)      NOT NULL DEFAULT 0,
    deco_balloons   TINYINT(1)      NOT NULL DEFAULT 0,

    comment         TEXT            NULL,
    price_estimate  INT UNSIGNED    NOT NULL DEFAULT 0,

    ip              VARCHAR(45)     NULL,
    user_agent      VARCHAR(255)    NULL,
    notified        TINYINT(1)      NOT NULL DEFAULT 0,       -- удалось ли отправить уведомление

    PRIMARY KEY (id),
    KEY idx_created (created_at),
    KEY idx_status  (status),
    KEY idx_ip_time (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
