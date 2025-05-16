#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

const char* softAP_ssid = "TapyzeSetup";
const char* softAP_password = "12345678";
AsyncWebServer server(80);

// Use a flag to indicate we should attempt WiFi connection in the main loop
bool shouldAttemptConnection = false;
String newSSID;
String newPassword;

void setup() {
  Serial.begin(115200);
  
  // Start SoftAP
  WiFi.mode(WIFI_AP);
  WiFi.softAP(softAP_ssid, softAP_password);
  Serial.println("SoftAP started");
  Serial.print("Connect to WiFi SSID: ");
  Serial.println(softAP_ssid);
  Serial.print("SoftAP IP address: ");
  Serial.println(WiFi.softAPIP());
  Serial.println("Then open http://192.168.4.1 in your browser");
  
  // HTTP POST /wifi-setup endpoint to receive JSON {ssid, password}
  server.on("/wifi-setup", HTTP_POST, [](AsyncWebServerRequest *request) {
    request->send(200, "application/json", "{\"status\":\"processing\"}");
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, (const char*)data, len);
    
    if (error) {
      Serial.println("Failed to parse JSON");
      return;
    }
    
    // Store the credentials but don't connect yet
    newSSID = doc["ssid"].as<String>();
    newPassword = doc["password"].as<String>();
    
    Serial.println("Received WiFi credentials:");
    Serial.print("SSID: "); Serial.println(newSSID);
    Serial.print("Password: "); Serial.println(newPassword);
    
    // Set flag to attempt connection in main loop
    shouldAttemptConnection = true;
  });
  
  server.begin();
}

void connectToWiFi() {
  // First make sure the server is ended and SoftAP is disconnected
  server.end();
  delay(500);
  
  // Connect to the new Wi-Fi network
  WiFi.mode(WIFI_STA);
  WiFi.begin(newSSID.c_str(), newPassword.c_str());
  Serial.println("Connecting to new Wi-Fi...");
  
  int max_attempts = 20;
  int attempt = 0;
  
  while (WiFi.status() != WL_CONNECTED && attempt < max_attempts) {
    delay(500);
    Serial.print(".");
    attempt++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.print("Connected! IP address: ");
    Serial.println(WiFi.localIP());
    
  } else {
    Serial.println("");
    Serial.println("Failed to connect to Wi-Fi");
    
    // Restart SoftAP for retry
    WiFi.mode(WIFI_AP);
    WiFi.softAP(softAP_ssid, softAP_password);
    server.begin();
    Serial.println("SoftAP restarted for retry");
  }
  
  // Reset the flag
  shouldAttemptConnection = false;
}

void loop() {
  if (shouldAttemptConnection) {
    connectToWiFi();
  }
  
  delay(100);  // Small delay to prevent watchdog issues
}