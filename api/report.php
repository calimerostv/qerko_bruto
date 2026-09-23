<?php
/* ------------------------------------------------------------------
   report.php — e-mail so štatistikami návštevnosti.

   1) Cron (týždenný/mesačný) — jeden súhrnný e-mail za všetky
      prevádzky (data/index.json), spúšťa sa na serveri:
        php api/report.php weekly
        php api/report.php monthly
      Ak panel hostingu vie spúšťať len URL (nie príkazový riadok), dá
      sa pridať tajný token do api/mailconfig.php (cron_token) a volať:
        https://qr.bruto.sk/api/report.php?period=weekly&token=...

   2) Jednorazové odoslanie z administrácie, za jednu prevádzku (JSON
      POST, prihlásenie rovnaké ako api/stats.php — token alebo master
      heslo, prevádzkový účet len pre svoj slug):
        { "action": "send", "slug": "…", "from": "YYYY-MM-DD",
          "to": "YYYY-MM-DD", "email": "…", "token" alebo "password": "…" }
        { "action": "default", "token" alebo "password": "…" }
          — vráti predvoleného príjemcu (mailconfig.php: 'to').
   ------------------------------------------------------------------ */

declare(strict_types=1);

define('QR_SAVE_ENTRY', true);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/smtp.php';
require_once __DIR__ . '/tokens.php';

const QR_REPORT_HOST = 'qr.bruto.sk';

$isCli = (PHP_SAPI === 'cli');

$mailConfigPath = __DIR__ . '/mailconfig.php';
if (!is_file($mailConfigPath)) {
    qrReportFail($isCli, "Chýba api/mailconfig.php (skopírujte z mailconfig.example.php).");
}
$mailCfg = require $mailConfigPath;

function qrReportFail(bool $isCli, string $message, int $httpCode = 400): never
{
    if ($isCli) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function qrReportVenueName(string $slug): string
{
    $indexPath = __DIR__ . '/../data/index.json';
    if (is_file($indexPath)) {
        $idx = json_decode((string)file_get_contents($indexPath), true);
        foreach (($idx['venues'] ?? []) as $v) {
            if (($v['slug'] ?? '') === $slug) {
                return (string)($v['name'] ?? $slug);
            }
        }
    }
    return $slug;
}

/* Súčty za dané obdobie pre jednu prevádzku — vracia [views, clicks]. */
function qrReportVenueTotals(PDO $db, string $slug, string $from, string $to): array
{
    $stmt = $db->prepare(
        'SELECT metric, SUM(count) AS total FROM qr_stats_daily
         WHERE venue_slug = ? AND day >= ? AND day <= ?
         GROUP BY metric ORDER BY total DESC'
    );
    $stmt->execute([$slug, $from, $to]);
    $views = 0;
    $clicks = [];
    foreach ($stmt->fetchAll() as $r) {
        if ($r['metric'] === 'view') {
            $views = (int)$r['total'];
        } elseif (str_starts_with($r['metric'], 'tile:') || str_starts_with($r['metric'], 'primary:')) {
            $name = preg_replace('/^(tile|primary):/', '', $r['metric']);
            $clicks[$name] = ($clicks[$name] ?? 0) + (int)$r['total'];
        }
    }
    arsort($clicks);
    return [$views, $clicks];
}

function qrReportClicksTable(array $clicks): string
{
    if (!$clicks) {
        return '<p style="color:#666">Žiadne kliky na dlaždice za toto obdobie.</p>';
    }
    $html = '<table style="width:100%;border-collapse:collapse;margin-bottom:8px">';
    $html .= '<tr><th style="text-align:left;border-bottom:1px solid #ddd;padding:6px 0">Klik na</th>'
           . '<th style="text-align:right;border-bottom:1px solid #ddd;padding:6px 0">Počet</th></tr>';
    foreach ($clicks as $name => $count) {
        $html .= '<tr><td style="padding:3px 0;border-bottom:1px solid #f0f0f0">'
               . htmlspecialchars($name) . '</td><td style="padding:3px 0;text-align:right;'
               . 'border-bottom:1px solid #f0f0f0">' . $count . '</td></tr>';
    }
    return $html . '</table>';
}

/* ---------- HTTP: jednorazový report z administrácie, jedna prevádzka - */
if (!$isCli && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $req = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($req)) {
        qrReportFail(false, 'Telo požiadavky nie je platný JSON.');
    }
    $action = (string)($req['action'] ?? '');

    $configPath = __DIR__ . '/config.php';
    if (!is_file($configPath)) {
        qrReportFail(false, 'Chýba api/config.php.', 500);
    }
    $config = require $configPath;
    usleep(250000);
    $login = qrVerifyLogin((string)($req['token'] ?? ''), (string)($req['password'] ?? ''), $config);
    if (!$login) {
        qrReportFail(false, 'Nesprávne heslo alebo prihlásenie.', 401);
    }

    if ($action === 'default') {
        echo json_encode(['ok' => true, 'to' => (string)($mailCfg['to'] ?? '')]);
        exit;
    }

    if ($action === 'send') {
        $slug = (string)($req['slug'] ?? '');
        if (!qrIsValidSlug($slug)) {
            qrReportFail(false, 'Neplatná prevádzka.');
        }
        if ($login['scope'] === 'venue' && $login['slug'] !== $slug) {
            qrReportFail(false, 'Nesprávne prihlásenie pre túto prevádzku.', 401);
        }
        $from = (string)($req['from'] ?? '');
        $to = (string)($req['to'] ?? '');
        $email = (string)($req['email'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            qrReportFail(false, 'Neplatný dátumový rozsah.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            qrReportFail(false, 'Neplatný e-mail.');
        }
        $db = qrDb();
        if (!$db) {
            qrReportFail(false, 'Štatistiky nie sú nastavené (chýba api/dbconfig.php).', 501);
        }
        qrDbEnsureSchema($db);

        [$views, $clicks] = qrReportVenueTotals($db, $slug, $from, $to);
        $rangeFrom = (new DateTime($from))->format('d.m.Y');
        $rangeTo = (new DateTime($to))->format('d.m.Y');
        $name = qrReportVenueName($slug);

        $html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#131518">';
        $html .= '<h2 style="margin:0 0 4px">Report na požiadanie — ' . htmlspecialchars($name) . '</h2>';
        $html .= '<p style="color:#666;margin:0 0 20px">' . htmlspecialchars($rangeFrom . ' – ' . $rangeTo) . '</p>';
        $html .= '<p style="font-size:28px;margin:0 0 4px"><strong>' . $views . '</strong></p>';
        $html .= '<p style="color:#666;margin:0 0 24px">zobrazení rozcestníka</p>';
        $html .= qrReportClicksTable($clicks);
        $html .= '<p style="color:#999;font-size:12px;margin-top:24px">' . htmlspecialchars(QR_REPORT_HOST) . ' · report</p>';
        $html .= '</div>';

        $subject = 'Report na požiadanie — ' . $name . ' (' . $rangeFrom . '–' . $rangeTo . ')';
        $ok = qrSmtpSend($mailCfg, $email, $subject, $html);
        echo json_encode(['ok' => $ok, 'error' => $ok ? null : 'Odoslanie zlyhalo.']);
        exit;
    }

    qrReportFail(false, 'Neznáma akcia.');
}

/* ---------- Cron: weekly / monthly, súhrn za všetky prevádzky --------- */
if (!$isCli) {
    $token = (string)($_GET['token'] ?? '');
    $expected = (string)($mailCfg['cron_token'] ?? '');
    if ($expected === '' || !hash_equals($expected, $token)) {
        http_response_code(403);
        exit('Forbidden');
    }
}

$period = $isCli ? (string)($argv[1] ?? 'weekly') : (string)($_GET['period'] ?? 'weekly');
if (!in_array($period, ['weekly', 'monthly'], true)) {
    $period = 'weekly';
}
$days = $period === 'monthly' ? 30 : 7;
$label = $period === 'monthly' ? 'Mesačný' : 'Týždenný';

$indexPath = __DIR__ . '/../data/index.json';
$venues = [];
if (is_file($indexPath)) {
    $idx = json_decode((string)file_get_contents($indexPath), true);
    foreach (($idx['venues'] ?? []) as $v) {
        /* Skryté záznamy (napr. dc-* podujatia z Déčko integrácie, viď
           api/integration.php) majú vlastnú distribúciu, nie sú súčasťou
           verejného rozcestníka a nepatria ani do súhrnného reportu. */
        if (!empty($v['slug']) && empty($v['hidden'])) {
            $venues[] = ['slug' => (string)$v['slug'], 'name' => (string)($v['name'] ?? $v['slug'])];
        }
    }
}
if (!$venues) {
    qrReportFail($isCli, "data/index.json neobsahuje žiadne prevádzky.");
}

$db = qrDb();
if (!$db) {
    qrReportFail($isCli, 'Chýba api/dbconfig.php alebo sa nepodarilo pripojiť k DB.');
}
qrDbEnsureSchema($db);

$from = (new DateTime("-$days days"))->format('Y-m-d');
$to = (new DateTime())->format('Y-m-d');
$rangeFrom = (new DateTime($from))->format('d.m.Y');
$rangeTo = (new DateTime($to))->format('d.m.Y');

$sections = '';
$totalViews = 0;
foreach ($venues as $v) {
    [$views, $clicks] = qrReportVenueTotals($db, $v['slug'], $from, $to);
    $totalViews += $views;
    $sections .= '<h3 style="margin:20px 0 4px">' . htmlspecialchars($v['name']) . '</h3>';
    $sections .= '<p style="margin:0 0 8px"><strong>' . $views . '</strong> zobrazení</p>';
    $sections .= qrReportClicksTable($clicks);
}

$html = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#131518">';
$html .= '<h2 style="margin:0 0 4px">' . htmlspecialchars($label) . ' report — ' . htmlspecialchars(QR_REPORT_HOST) . '</h2>';
$html .= '<p style="color:#666;margin:0 0 4px">' . htmlspecialchars($rangeFrom . ' – ' . $rangeTo) . '</p>';
$html .= '<p style="color:#666;margin:0 0 16px">Spolu ' . $totalViews . ' zobrazení naprieč ' . count($venues) . ' prevádzkami.</p>';
$html .= $sections;
$html .= '<p style="color:#999;font-size:12px;margin-top:24px">' . htmlspecialchars(QR_REPORT_HOST) . ' · automatický report</p>';
$html .= '</div>';

$subject = $label . ' report — ' . QR_REPORT_HOST . ' (' . $rangeFrom . '–' . $rangeTo . ')';
$ok = qrSmtpSend($mailCfg, (string)$mailCfg['to'], $subject, $html);

if ($isCli) {
    echo $ok ? "Report odoslaný ($period).\n" : "Odoslanie zlyhalo ($period).\n";
    exit($ok ? 0 : 1);
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['ok' => $ok]);
