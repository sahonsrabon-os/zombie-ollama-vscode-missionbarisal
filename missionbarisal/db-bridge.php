<?php
// db-bridge.php - Mission Barisal real-world DB bridge (Code Guru - Monu, 2026-08-09)
// Usage: php db-bridge.php <driver:mysql|pgsql> <dbname> <mode:query|tables>
// Query comes from STDIN. Credentials from env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD.
$driver = isset($argv[1]) ? $argv[1] : 'mysql';
$dbname = isset($argv[2]) ? $argv[2] : '';
$mode = isset($argv[3]) ? $argv[3] : 'query';
$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: ($driver === 'pgsql' ? '5432' : '3306');
$user = getenv('DB_USER') ?: '';
$pass = getenv('DB_PASSWORD') ?: '';
$dsn = ($driver === 'pgsql')
    ? "pgsql:host=$host;port=$port;dbname=$dbname"
    : "mysql:host=$host;port=$port;dbname=$dbname";
try {
    $pdo = new PDO($dsn, $user, $pass, [PDO:: ATTR_ERRMODE => PDO:: ERRMODE_EXCEPTION]);
    if ($mode === 'tables') {
        if ($driver === 'pgsql') {
            $rows = $pdo -> query("SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY name") -> fetchAll(PDO:: FETCH_ASSOC);
        } else {
            $rows = $pdo -> query('SHOW TABLES') -> fetchAll(PDO:: FETCH_NUM);
            $rows = array_map(function ($r) { return array('name' => $r[0]); }, $rows);
        }
        $tables = array_map(function ($r) { return $r['name']; }, $rows);
    echo json_encode(array('ok' => true, 'tables' => $tables));
        exit(0);
    }
    $q = stream_get_contents(STDIN);
    if (preg_match('/^\s*(select|show|describe|explain|with)\b/i', $q)) {
        $st = $pdo -> query($q);
        $rows = $st -> fetchAll(PDO:: FETCH_ASSOC);
    echo json_encode(array('ok' => true, 'rowCount' => count($rows), 'rows' => $rows));
    } else {
        $c = $pdo -> exec($q);
    echo json_encode(array('ok' => true, 'changes' => $c));
    }
} catch (Throwable $e) {
  echo json_encode(array('ok' => false, 'error' => $e -> getMessage()));
    exit(1);
}
