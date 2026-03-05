<?php
/**
 * proxy-openai.php
 * A simple proxy script to bypass CORS restrictions for OpenAI API calls.
 * Also overrides PHP's post_max_size limit for large base64 image payloads.
 */

// Override PHP ini settings for large image base64 payloads (images can be 2-5MB after base64)
@ini_set('post_max_size', '20M');
@ini_set('upload_max_filesize', '20M');
@ini_set('memory_limit', '128M');
@ini_set('max_execution_time', '120');

// Allow CORS for the frontend domain
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => ['message' => 'Method not allowed. Use POST.']]);
    exit();
}

// Get the Authorization header from the incoming request
$headers = getallheaders();
$authHeader = '';
foreach ($headers as $name => $value) {
    if (strtolower($name) === 'authorization') {
        $authHeader = $value;
        break;
    }
}

if (empty($authHeader)) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => ['message' => 'Missing Authorization header.']]);
    exit();
}

// Get the raw POST body
$requestBody = file_get_contents('php://input');

if (empty($requestBody)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['error' => ['message' => 'Empty request body. Check PHP post_max_size setting. Body length: ' . (int)$_SERVER['CONTENT_LENGTH']]]);
    exit();
}

// Initialize cURL session to forward the request to OpenAI
$ch = curl_init('https://api.openai.com/v1/chat/completions');

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);
curl_setopt($ch, CURLOPT_TIMEOUT, 120);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: ' . $authHeader,
    'Content-Length: ' . strlen($requestBody)
]);

// Execute the cURL request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);

curl_close($ch);

header('Content-Type: application/json');

if ($curlError) {
    http_response_code(500);
    echo json_encode(['error' => ['message' => 'cURL Error: ' . $curlError]]);
} else {
    http_response_code($httpCode);
    echo $response;
}
?>
