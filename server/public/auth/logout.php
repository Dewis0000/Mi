<?php
require __DIR__ . '/../_app.php';
session_boot();
$_SESSION = [];
session_destroy();
redirect('/');
