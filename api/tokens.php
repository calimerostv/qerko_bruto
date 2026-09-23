<?php
/* ------------------------------------------------------------------
   tokens.php — podpísané tokeny bez serverovej session.

   Payload je Base64Url JSON, podpis HMAC-SHA256 kľúčom odvodeným
   z master password_hash (ten je aj tak tajný, netreba vymýšľať
   ďalší samostatný secret v ďalšom súbore). Token nesie exp, takže
   master token sa overí bez úložiska; zmena master hesla ho zneplatní,
   lebo sa zmení aj podpisový kľúč.

   Token prevádzky navyše nesie `ver` = token_version účtu. Pri každom
   overení sa porovná s DB — zmena hesla verziu zvýši a zmazaný účet
   nemá žiadnu, takže starý token prestane platiť okamžite, nie až po
   14 dňoch.
   ------------------------------------------------------------------ */

declare(strict_types=1);

if (!defined('QR_SAVE_ENTRY')) {
    http_response_code(403);
    exit('Forbidden');
}

require_once __DIR__ . '/db.php';

/* Slugy, ktoré by kolidovali so súbormi alebo cestami inštalácie:
   index.json je spoločný zoznam, admin/ je administrácia, api/ a
   assets/ sú priečinky kódu. Platí pre účty aj pre názvy súborov. */
const QR_RESERVED_SLUGS = ['index', 'admin', 'api', 'assets', 'data', 'sw', 'og'];

/* Tvar slugu prevádzky — rovnaký filter na každom mieste. */
function qrIsValidSlug(string $slug): bool
{
    return preg_match('/^[a-z0-9][a-z0-9-]{0,47}$/', $slug) === 1
        && !in_array($slug, QR_RESERVED_SLUGS, true);
}

/* Integračný token smie zapisovať len sluby vo svojom vlastnom mennom
   priestore (napr. prefix "dc-"). Obmedzuje dosah ukradnutého tokenu
   na jeho vlastné stránky, nikdy na cudzie prevádzky/podujatia. */
function qrIsValidSlugForPrefix(string $slug, string $prefix): bool
{
    return $prefix !== ''
        && str_starts_with($slug, $prefix)
        && qrIsValidSlug($slug);
}

function qrMakeToken(array $claims, string $secret, int $ttlSeconds = 60 * 60 * 24 * 14): string
{
    $claims['exp'] = time() + $ttlSeconds;
    $payload = qrB64UrlEncode((string)json_encode($claims, JSON_UNESCAPED_UNICODE));
    $sig = qrB64UrlEncode(hash_hmac('sha256', $payload, $secret, true));
    return $payload . '.' . $sig;
}

/* Vráti claims pole pri platnom tokene, inak null. */
function qrVerifyToken(?string $token, string $secret): ?array
{
    if (!$token || !str_contains($token, '.')) {
        return null;
    }
    [$payload, $sig] = explode('.', $token, 2);
    $expected = qrB64UrlEncode(hash_hmac('sha256', $payload, $secret, true));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $claims = json_decode(qrB64UrlDecode($payload), true);
    if (!is_array($claims) || !isset($claims['exp']) || (int)$claims['exp'] < time()) {
        return null;
    }
    return $claims;
}

/* Spoločné overenie prihlásenia pre všetky chránené endpointy.
   Vráti ['scope' => 'master'|'venue', 'slug' => '…'] alebo null.
   Prijíma buď token z auth.php, alebo priamo master heslo. */
function qrVerifyLogin(string $token, string $password, array $config): ?array
{
    $secret = (string)$config['password_hash'];
    if ($token !== '') {
        $claims = qrVerifyToken($token, $secret);
        if (!$claims) {
            return null;
        }
        $scope = (string)($claims['scope'] ?? '');
        if ($scope === 'master') {
            return ['scope' => 'master', 'slug' => ''];
        }
        if ($scope === 'venue') {
            $slug = (string)($claims['slug'] ?? '');
            if ($slug === '' || !qrVenueTokenStillValid($slug, (int)($claims['ver'] ?? 0))) {
                return null;
            }
            return ['scope' => 'venue', 'slug' => $slug];
        }
        return null;
    }
    if ($password !== '' && password_verify($password, $secret)) {
        return ['scope' => 'master', 'slug' => ''];
    }
    return null;
}

/* Účet musí existovať a verzia v tokene sa musí zhodovať. Bez DB
   (chýba dbconfig) sa tokeny prevádzok nedajú overiť, tak neplatia. */
function qrVenueTokenStillValid(string $slug, int $ver): bool
{
    if (!function_exists('qrDb')) {
        return false;
    }
    $db = qrDb();
    if (!$db) {
        return false;
    }
    try {
        qrDbEnsureSchema($db);
        $stmt = $db->prepare('SELECT token_version FROM qr_venue_accounts WHERE slug = ?');
        $stmt->execute([$slug]);
        $row = $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
    return $row && (int)$row['token_version'] === $ver && $ver > 0;
}

function qrB64UrlEncode(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function qrB64UrlDecode(string $s): string
{
    return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
}
