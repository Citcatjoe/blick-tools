<?php
/**
 * Endpoint oEmbed des Blick Tools (spec : https://oembed.com/).
 *
 * Reçoit l'URL publique d'un widget et renvoie le JSON oEmbed (type "rich")
 * contenant l'iframe à afficher. Couvre tous les widgets clients, dont les URLs
 * suivent le format : .../bl-tools-client-<type>/?<type>Doc=<firestoreId>
 *
 * Déploiement : à côté des dossiers bl-tools-client-*, par ex.
 *   https://storytelling.blick.ch/fr/__is_embed_somewhere/bl-tools-oembed/oembed.php
 *
 * Appel : oembed.php?url=<URL du widget>[&format=json][&maxwidth=N][&maxheight=N]
 */

header('Access-Control-Allow-Origin: *');

// Hôtes autorisés : prod + environnement de test (cf. VITE_CLIENT_BASE_URL)
const ALLOWED_HOSTS = [
    'storytelling.blick.ch',
    'www.storytelling.blick.ch',
    'www.prod.storytelling.blick.ch',
];
const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 500;

function fail($code, $message) {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $message;
    exit;
}

// La spec impose 501 pour un format non supporté : seul JSON est servi.
$format = $_GET['format'] ?? 'json';
if ($format !== 'json') {
    fail(501, 'Only format=json is supported');
}

// La spec impose 404 quand l'URL ne correspond à aucun contenu du fournisseur.
// url[]=... arrive en tableau : parse_url planterait (TypeError).
$url = is_string($_GET['url'] ?? null) ? $_GET['url'] : '';
$parts = parse_url($url);
if (!$parts || ($parts['scheme'] ?? '') !== 'https' || !in_array($parts['host'] ?? '', ALLOWED_HOSTS, true)) {
    fail(404, 'Not a Blick Tools URL');
}
// Une URL avec identifiant (user@host) n'est jamais une URL de widget.
if (isset($parts['user']) || isset($parts['pass'])) {
    fail(404, 'Not a Blick Tools URL');
}
if (!preg_match('#/bl-tools-client-([a-z0-9]+)/(index\.html)?$#', $parts['path'] ?? '', $match)) {
    fail(404, 'Not a Blick Tools widget URL');
}
$type = $match[1];
parse_str($parts['query'] ?? '', $query);
$docId = $query[$type . 'Doc'] ?? '';
if (!is_string($docId) || !preg_match('/^[A-Za-z0-9_-]+$/', $docId)) {
    fail(404, "Missing or invalid {$type}Doc parameter");
}

$width = DEFAULT_WIDTH;
if (isset($_GET['maxwidth']) && ctype_digit($_GET['maxwidth'])) {
    $width = min($width, (int) $_GET['maxwidth']);
}
$height = DEFAULT_HEIGHT;
if (isset($_GET['maxheight']) && ctype_digit($_GET['maxheight'])) {
    $height = min($height, (int) $_GET['maxheight']);
}

// L'URL est reconstruite à partir des éléments validés plutôt que reprise telle quelle :
// les navigateurs ne lisent pas toujours une URL comme parse_url (ex. « https://evil.com\@storytelling.blick.ch/… »
// est vue par PHP sur storytelling.blick.ch, mais chargée par le navigateur depuis evil.com).
// Params comme &brand= et hash #theme=dark conservés.
$cleanUrl = 'https://' . $parts['host'] . $parts['path']
    . (isset($parts['query']) ? '?' . $parts['query'] : '')
    . (isset($parts['fragment']) ? '#' . $parts['fragment'] : '');
$src = htmlspecialchars($cleanUrl, ENT_QUOTES, 'UTF-8');
$html = '<iframe src="' . $src . '" width="100%" height="' . $height . '"'
    . ' style="width:100%;border:0;" frameborder="0" scrolling="no"'
    . ' title="Blick Tools ' . $type . '"></iframe>';

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'version' => '1.0',
    'type' => 'rich',
    'provider_name' => 'Blick Tools',
    'provider_url' => 'https://storytelling.blick.ch',
    'width' => $width,
    'height' => $height,
    'html' => $html,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
