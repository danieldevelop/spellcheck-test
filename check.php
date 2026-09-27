<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const LT_URL = 'http://localhost:8081/v2/check';
const MAX_CARACTERES = 20000;
const MAX_SUGERENCIAS = 5;
const RUTA_DICCIONARIO = __DIR__ . '/diccionario-clinico.txt';

function responder(array $datos, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Carga el diccionario clínico como índice [termino_en_minusculas => true]
 * para búsquedas O(1).
 */
function cargarDiccionario(string $ruta): array
{
    if (!is_file($ruta)) {
        return [];
    }

    $diccionario = [];

    foreach (file($ruta, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $linea) {
        $linea = trim(preg_replace('/^\xEF\xBB\xBF/', '', $linea)); // quita BOM si existe

        if ($linea === '' || str_starts_with($linea, '#')) {
            continue;
        }

        $diccionario[mb_strtolower($linea, 'UTF-8')] = true;
    }

    return $diccionario;
}

/**
 * Extrae la palabra del error usando offsets UTF-16 (como los entrega
 * LanguageTool), evitando descuadres por tildes y ñ.
 */
function extraerPalabra(string $texto16, int $offset, int $length): string
{
    return mb_convert_encoding(
        substr($texto16, $offset * 2, $length * 2),
        'UTF-8',
        'UTF-16LE'
    );
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(['matches' => []], 405);
}

$texto = (string) ($_POST['texto'] ?? '');

if (trim($texto) === '') {
    responder(['matches' => []]);
}

if (mb_strlen($texto) > MAX_CARACTERES) {
    responder(['error' => 'Texto demasiado largo', 'matches' => []], 413);
}

$ch = curl_init(LT_URL);

curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 2,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_POSTFIELDS     => http_build_query([
        'text'     => $texto,
        'language' => 'es'
    ])
]);

$respuesta = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($respuesta === false || $status !== 200) {
    responder(['error' => 'LanguageTool no disponible', 'matches' => []], 502);
}

$datos = json_decode($respuesta, true);

$diccionario = cargarDiccionario(RUTA_DICCIONARIO);
$texto16 = mb_convert_encoding($texto, 'UTF-16LE', 'UTF-8');

// Descarta los errores cuya palabra está en el diccionario clínico
$filtrados = array_filter($datos['matches'] ?? [], static function (array $m) use ($diccionario, $texto16): bool {
    $palabra = extraerPalabra($texto16, (int) $m['offset'], (int) $m['length']);

    return !isset($diccionario[mb_strtolower(trim($palabra), 'UTF-8')]);
});

$matches = array_map(static function (array $m): array {
    return [
        'offset'       => (int) $m['offset'],
        'length'       => (int) $m['length'],
        'message'      => (string) ($m['message'] ?? ''),
        'replacements' => array_slice(
            array_column($m['replacements'] ?? [], 'value'),
            0,
            MAX_SUGERENCIAS
        )
    ];
}, array_values($filtrados));

responder(['matches' => $matches]);