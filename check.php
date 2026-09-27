<?php

declare(strict_types=1);

$texto = $_POST['texto'] ?? '';

$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => 'http://localhost:8081/v2/check',
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POSTFIELDS => http_build_query([
        'text' => $texto,
        'language' => 'es'
    ])
]);

$response = curl_exec($ch);
curl_close($ch);

echo $response;