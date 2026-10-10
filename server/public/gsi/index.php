<?php
// Game State Integration: CS2 и Dota 2 присылают сюда состояние матча (настраивается файлом в папке игры).
require __DIR__ . '/../_app.php';
$u = db_one('SELECT id, banned FROM users WHERE widget_token = ?', [(string)($_GET['t'] ?? '')]);
$game = (string)($_GET['g'] ?? '');
if (!$u || (int)$u['banned'] || !in_array($game, ['cs', 'dota'], true)) { http_response_code(404); exit; }
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) { http_response_code(400); exit; }
$keep = $game === 'cs'
    ? ['map' => $in['map'] ?? null, 'round' => $in['round'] ?? null, 'player' => ['team' => $in['player']['team'] ?? null, 'stats' => $in['player']['match_stats'] ?? null]]
    : ['map' => $in['map'] ?? null, 'player' => $in['player'] ?? null, 'hero' => ['name' => $in['hero']['name'] ?? null, 'level' => $in['hero']['level'] ?? null]];
db_exec('DELETE FROM gsi WHERE user_id = ? AND game = ?', [$u['id'], $game]);
db_insert('gsi', ['user_id' => $u['id'], 'game' => $game, 'data' => json_encode($keep, JSON_UNESCAPED_UNICODE), 'updated_at' => now()]);
http_response_code(200);
echo 'ok';
