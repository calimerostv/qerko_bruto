<?php
/* ------------------------------------------------------------------
   smtp.php — minimálny SMTP klient bez závislostí (žiadny Composer/
   PHPMailer na zdieľanom hostingu). Robí presne to, čo report.php
   potrebuje: prihlásenie menom/heslom cez STARTTLS a odoslanie jednej
   HTML správy. Nie je to univerzálna knižnica.
   ------------------------------------------------------------------ */

declare(strict_types=1);

if (!defined('QR_SAVE_ENTRY')) {
    http_response_code(403);
    exit('Forbidden');
}

function qrSmtpSend(array $cfg, string $to, string $subject, string $html): bool
{
    $host = (string)$cfg['host'];
    $port = (int)$cfg['port'];
    $user = (string)$cfg['user'];
    $pass = (string)$cfg['pass'];
    $from = (string)($cfg['from'] ?? $user);
    $fromName = (string)($cfg['fromName'] ?? 'qr.bruto.sk');
    $ehlo = (string)($cfg['ehlo'] ?? 'qr.bruto.sk');

    $sock = @fsockopen($host, $port, $errno, $errstr, 15);
    if (!$sock) {
        error_log("qrSmtpSend: pripojenie zlyhalo ($errno) $errstr");
        return false;
    }
    stream_set_timeout($sock, 15);

    $read = function () use ($sock): string {
        $data = '';
        while (($line = fgets($sock, 515)) !== false) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        return $data;
    };
    $write = function (string $cmd) use ($sock): void {
        fwrite($sock, $cmd . "\r\n");
    };
    $expect = function (string $resp, string $code) use ($sock): bool {
        return str_starts_with($resp, $code);
    };

    $resp = $read();
    if (!$expect($resp, '220')) {
        fclose($sock);
        return false;
    }

    $write('EHLO ' . $ehlo);
    $resp = $read();
    if (!$expect($resp, '250')) {
        fclose($sock);
        return false;
    }

    if ($port !== 465) {
        // Port 587: EHLO -> STARTTLS -> EHLO znova cez šifrovaný kanál.
        $write('STARTTLS');
        $resp = $read();
        if (!$expect($resp, '220')) {
            fclose($sock);
            return false;
        }
        if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($sock);
            return false;
        }
        $write('EHLO ' . $ehlo);
        $resp = $read();
        if (!$expect($resp, '250')) {
            fclose($sock);
            return false;
        }
    }

    $write('AUTH LOGIN');
    $resp = $read();
    if (!$expect($resp, '334')) {
        fclose($sock);
        return false;
    }
    $write(base64_encode($user));
    $resp = $read();
    if (!$expect($resp, '334')) {
        fclose($sock);
        return false;
    }
    $write(base64_encode($pass));
    $resp = $read();
    if (!$expect($resp, '235')) {
        fclose($sock);
        error_log('qrSmtpSend: prihlásenie zlyhalo: ' . trim($resp));
        return false;
    }

    $write('MAIL FROM:<' . $from . '>');
    $resp = $read();
    if (!$expect($resp, '250')) {
        fclose($sock);
        return false;
    }
    $write('RCPT TO:<' . $to . '>');
    $resp = $read();
    if (!$expect($resp, '250') && !$expect($resp, '251')) {
        fclose($sock);
        return false;
    }
    $write('DATA');
    $resp = $read();
    if (!$expect($resp, '354')) {
        fclose($sock);
        return false;
    }

    $boundary = 'qr-' . bin2hex(random_bytes(8));
    $headers = [
        'From: ' . qrMailHeaderName($fromName) . ' <' . $from . '>',
        'To: <' . $to . '>',
        'Subject: ' . qrMailEncodeSubject($subject),
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'Date: ' . date('r'),
    ];
    $body = implode("\r\n", $headers) . "\r\n\r\n" . qrDotStuff($html) . "\r\n.";
    $write($body);
    $resp = $read();
    if (!$expect($resp, '250')) {
        fclose($sock);
        return false;
    }

    $write('QUIT');
    fclose($sock);
    return true;
}

function qrDotStuff(string $body): string
{
    // Riadok začínajúci samotnou bodkou by SMTP prijímač pochopil ako
    // koniec správy — zdvojí sa podľa RFC 5321.
    return preg_replace('/^\./m', '..', $body);
}

function qrMailEncodeSubject(string $subject): string
{
    return '=?UTF-8?B?' . base64_encode($subject) . '?=';
}

function qrMailHeaderName(string $name): string
{
    return '=?UTF-8?B?' . base64_encode($name) . '?=';
}
