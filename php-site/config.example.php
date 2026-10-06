<?php
// ШАБЛОН. На сервере скопируйте в config.php и впишите реальные значения.
// config.php НЕ попадает в репозиторий (.gitignore). Секреты — только здесь.

return [
    'db' => [
        'host' => 'localhost',
        'name' => 'u3661097_default',
        'user' => 'u3661097_default',
        'pass' => 'ВПИШИТЕ_ПАРОЛЬ_БД',
        'charset' => 'utf8mb4',
    ],

    // Пароль админки хэшем: php -r "echo password_hash('пароль', PASSWORD_DEFAULT), PHP_EOL;"
    'admin' => [
        'password_hash' => 'ВСТАВЬТЕ_ХЭШ_ПАРОЛЯ',
    ],

    // Реквизиты предоплаты (показываются клиенту после брони)
    'prepay' => [
        'phone' => '+7 924 661-15-20',
        'bank'  => 'Т-Банк',
        'name'  => 'Вероника Д.',
    ],

    // Telegram-бот — уведомления оператору (чат-ид: напишите боту /start, затем @userinfobot)
    'telegram' => [
        'enabled'   => true,
        'bot_token' => '',
        'chat_ids'  => [],
    ],

    // MAX-бот — уведомления оператору
    'max' => [
        'enabled'   => true,
        'bot_token' => '',
        'chat_ids'  => [],
        'api_base'  => 'https://botapi.max.ru',
    ],

    // Проверка телефона по номеру через Telegram Gateway (gatewayapi.telegram.org).
    // mode: 'off' — не проверять; 'gateway' — слать код в Telegram по номеру; 'mock' — показывать код (тест).
    'verify' => [
        'mode'  => 'off',
        'gateway_token' => '',
        'code_ttl' => 300,
    ],

    // Онлайн-оплата предоплаты (необязательно). mode: 'manual' — реквизиты; 'yookassa' — онлайн.
    'payment' => [
        'mode' => 'manual',
        'yookassa_shop_id' => '',
        'yookassa_secret'  => '',
    ],

    'site_url' => 'https://nery-quest.ru',
    'rate_limit_seconds' => 60,
];
