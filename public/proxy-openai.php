<?php
/**
 * proxy-openai.php
 * A simple proxy script to bypass CORS restrictions for OpenAI API calls.
 * 
 * Usage:
 * Send exactly the same POST request to this script as you would to https://api.openai.com/v1/chat/completions
 * Include the Authorization header with your Bearer token.
 */

// Allow CORS for the frontend domain
header('Access-Control-Allow-Origin: *'); // Restrict this to your domain in production if needed, e.g. https://ppbears.com
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
    echo json_encode(['error' => ['message' => 'Missing Authorization header.']]);
    exit();
}

// Get the raw POST body
$requestBody = file_get_contents('php://input');

// Initialize cURL session to forward the request to OpenAI
$ch = curl_init('https://api.openai.com/v1/chat/completions');

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: ' . $authHeader
]);

// Execute the cURL request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => ['message' => 'cURL Error: ' . curl_error($ch)]]);
} else {
    // Pass the HTTP status code and response back to the client
    http_response_code($httpCode);
    header('Content-Type: application/json');
    echo $response;
}

curl_close($ch);
?>
