<?php
// OBS-виджет: https://streops.ru/w/?t=ТОКЕН&w=goal — источник «Браузер», 1920×1080.
require __DIR__ . '/../_app.php';
$w = preg_replace('/[^a-z0-9]/', '', (string)($_GET['w'] ?? ''));
?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>StreOps · виджет <?= htmlspecialchars($w) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&amp;family=JetBrains+Mono:wght@400;500;700&amp;display=swap" rel="stylesheet">
<style>
html,body{margin:0;background:transparent;overflow:hidden;width:1920px;height:1080px}
.wbox{box-sizing:border-box;padding:var(--w-pad);background:var(--w-bg);backdrop-filter:blur(var(--w-blur));-webkit-backdrop-filter:blur(var(--w-blur));border:var(--w-bd);border-radius:var(--w-rad);box-shadow:var(--w-shadow);color:var(--w-fg);font-family:var(--w-font);font-size:var(--w-size);font-weight:var(--w-weight);text-align:var(--w-align);letter-spacing:var(--w-ls);text-shadow:var(--w-tshadow);text-transform:var(--w-upper);line-height:1.35;overflow:hidden}
.w2{color:var(--w-fg2)}.wacc{color:var(--w-acc)}
.wov{font-size:.7em;letter-spacing:.08em;text-transform:uppercase;color:var(--w-fg2);font-weight:600}
.wnum{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
.wbar{border-radius:calc(var(--w-rad) / 3);background:var(--w-acc-soft);overflow:hidden}
.wrow{display:flex;justify-content:space-between;gap:.8em;align-items:baseline}
@keyframes wa-fade-0{from{opacity:0}to{opacity:1}}@keyframes wa-fade-1{from{opacity:0}to{opacity:1}}
@keyframes wa-up-0{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}@keyframes wa-up-1{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes wa-down-0{from{opacity:0;transform:translateY(-60px)}to{opacity:1;transform:none}}@keyframes wa-down-1{from{opacity:0;transform:translateY(-60px)}to{opacity:1;transform:none}}
@keyframes wa-side-0{from{opacity:0;transform:translateX(-140px)}to{opacity:1;transform:none}}@keyframes wa-side-1{from{opacity:0;transform:translateX(-140px)}to{opacity:1;transform:none}}
@keyframes wa-zoom-0{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}@keyframes wa-zoom-1{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:none}}
@keyframes wa-spring-0{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.08)}80%{transform:scale(.97)}100%{transform:none}}@keyframes wa-spring-1{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.08)}80%{transform:scale(.97)}100%{transform:none}}
@keyframes wa-blur-0{from{opacity:0;filter:blur(18px)}to{opacity:1;filter:none}}@keyframes wa-blur-1{from{opacity:0;filter:blur(18px)}to{opacity:1;filter:none}}
@keyframes wa-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
</style>
</head>
<body>
<div id="w"></div>
<script src="/assets/widgets-lib.js"></script>
<script src="/assets/widget-render.js"></script>
</body>
</html>
