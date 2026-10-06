<?php
// Единый источник контента сайта, настроек записи и квестов.
// Пока статично (правится здесь); данные клиентов/броней живут в БД.
// Формат публичных частей совпадает с тем, что ждёт фронтенд.

return [
    'site' => [
        'name'      => 'Neru-Квест',
        'tagline'   => 'Хоррор-квест в реальности · Нерюнгри',
        'heroTitle' => "Граф Дракула\nждёт гостей",
        'heroText'  => 'Хоррор-квест с живым актёром. Тёмные коридоры, загадки и один час, чтобы выбраться. Три уровня сложности выбираете прямо перед игрой. Соберите команду до 7 человек.',
        'aboutText' => 'Neru-Квест — квест в реальности в Нерюнгри. Атмосферные декорации, живой актёр и продуманный сюжет. Выберите удобное время, оставьте заявку — и мы свяжемся с вами для подтверждения.',
    ],
    'contacts' => [
        'address'     => 'Нерюнгри, ул. Чурапчинская, 46',
        'addressNote' => 'Вход с обратной стороны дома, в подвал — сине-белое крыльцо',
        'lat'         => 56.6557,
        'lon'         => 124.7247,
        'phone'       => '+7 924 661-15-20',
        'email'       => '',
        'hours'       => 'Ежедневно, по записи',
        'mapUrl'      => 'https://yandex.ru/maps/org/neru_kvest/211067171529/',
        'telegram'    => '',
        'vk'          => '',
        'max'         => '',
    ],
    // Настройки записи. horizonDays/leadMinutes — только серверные (в публичный /content не идут).
    'booking' => [
        'prepayMode'       => 'prepay',   // 'none' | 'prepay'
        'prepayPercent'    => 30,
        'prepayAmount'     => 500,
        'basePlayers'      => 5,
        'extraPlayerPrice' => 700,
        'cancelHours'      => 24,
        'holdMinutes'      => 10,
        'horizonDays'      => 60,
        'leadMinutes'      => 30,
    ],
    'extras' => [
        ['id' => 'rest',      'label' => 'Комната отдыха',            'price' => 500, 'unit' => 'hour',   'requiresRoom' => false],
        ['id' => 'birthday',  'label' => 'Надпись «С днём рождения»', 'price' => 200, 'unit' => 'toggle', 'requiresRoom' => true],
        ['id' => 'tableware', 'label' => 'Цветная посуда (на всех)',  'price' => 200, 'unit' => 'toggle', 'requiresRoom' => true],
        ['id' => 'balloons',  'label' => 'Воздушные шары (20 шт)',    'price' => 200, 'unit' => 'toggle', 'requiresRoom' => true],
    ],
    'loyalty' => [
        'pointsPerVisit'      => 0,
        'tiers'               => [['from' => 0, 'percent' => 0]],
        'burnAfterMonths'     => 6,
        'burnPercentPerMonth' => 25,
    ],
    'recordings' => ['price' => 0, 'linkDays' => 30, 'retentionDays' => 60],

    // Роли и права (для админки). Владелец (owner_phones из config) всегда получает 'owner'.
    'roles' => [
        'owner'      => ['name' => 'Главный администратор', 'permissions' => '*'],
        'deputy'     => ['name' => 'Заместитель администратора', 'permissions' => ['dashboard.view','bookings.view','bookings.edit','users.view','users.edit','points.edit','quests.edit','content.edit','recordings.manage','reports.view','payments.view','promo.edit','settings.edit','logs.view']],
        'accountant' => ['name' => 'Бухгалтер', 'permissions' => ['dashboard.view','bookings.view','reports.view','payments.view']],
        'operator'   => ['name' => 'Оператор / администратор зала', 'permissions' => ['dashboard.view','bookings.view','bookings.edit','users.view','users.edit','recordings.manage']],
    ],

    // Квесты. _schedule/roomNumber/isActive/sortOrder — служебные (в публичный ответ не идут).
    'quests' => [
        [
            'id'    => 'graf-drakula',
            'slug'  => 'graf-drakula',
            'title' => 'Граф Дракула',
            'shortDescription' => 'Старый замок проснулся. У вас есть час, чтобы разгадать его тайны и выбраться — пока хозяин не нашёл вас первым.',
            'description' => "Атмосферный хоррор-квест с живым актёром по мотивам легенды о Графе Дракуле. Тёмные коридоры, загадки, спрятанные механизмы и актёр, который ведёт историю.\n\nТри уровня сложности и взаимодействия с актёром выбираются прямо перед игрой — от спокойного до хардкора.\n\nЦена: 3500 ₽ за команду до 5 человек, каждый следующий игрок +700 ₽ (максимум 7). Для записи — предоплата 500 ₽; возврат при отмене минимум за сутки. Приходите за 10 минут до игры, с собой — чистая сменная обувь.",
            'photoUrl'   => '/images/crypt.webp',
            'fearLevel'  => 4,
            'minPlayers' => 1,
            'maxPlayers' => 7,
            'durationMin'=> 60,
            'minAge'     => 12,
            'basePrice'  => 3500,
            'peakExtra'  => 0,
            'tags'       => ['живой актёр', '3 уровня сложности', '~1 час'],
            'roomNumber' => 1,
            'isActive'   => true,
            'sortOrder'  => 1,
            '_schedule'  => ['from' => '10:00', 'to' => '22:00', 'break' => 20],
        ],
    ],
];
