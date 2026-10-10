<?php
// HTTP-клиент на curl: JSON-запросы к Twitch, YouTube, DonationAlerts.

function http_request(string $method, string $url, array $headers = [], $body = null, int $timeout = 8): array {
    $ch = curl_init($url);
    $h = [];
    foreach ($headers as $k => $v) $h[] = $k . ': ' . $v;
    if (is_array($body)) {
        $isForm = isset($headers['Content-Type']) && str_contains($headers['Content-Type'], 'x-www-form-urlencoded');
        $body = $isForm ? http_build_query($body) : json_encode($body, JSON_UNESCAPED_UNICODE);
        if (!$isForm && !isset($headers['Content-Type'])) $h[] = 'Content-Type: application/json';
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $h,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_USERAGENT => 'StreOps/1.0 (+https://streops.ru)',
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        logline('http', "$method $url failed: $err");
        return ['code' => 0, 'json' => null, 'raw' => ''];
    }
    return ['code' => $code, 'json' => json_decode((string)$raw, true), 'raw' => (string)$raw];
}

function http_form(string $url, array $fields): array {
    return http_request('POST', $url, ['Content-Type' => 'application/x-www-form-urlencoded'], $fields);
}
