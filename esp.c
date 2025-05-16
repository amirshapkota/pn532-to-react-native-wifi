#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_PN532.h>
#include <EEPROM.h>
#include <ESPmDNS.h>  // Add mDNS library

// NFC pins and object (I2C mode)
#define SDA_PIN 4
#define SCL_PIN 5
Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);

// EEPROM settings
#define EEPROM_SIZE 512
#define SSID_ADDR 0
#define PASS_ADDR 128
#define WIFI_FLAG_ADDR 256  // Flag to indicate valid stored credentials

// mDNS hostname
const char* mdnsHostname = "rfidreader";  // This will be accessible as rfidreader.local

// SoftAP credentials for initial setup
const char* softAP_ssid = "TapyzeSetup";
const char* softAP_password = "12345678";

// Web server instance
AsyncWebServer server(80);

// WiFi connection flags
bool shouldAttemptConnection = false;
bool isConnectedToWiFi = false;
String storedSSID = "";
String storedPassword = "";

// For RFID reading
String lastUID = "";
unsigned long lastScanTime = 0;

// Function to print WiFi status for debugging
void printWiFiStatus(int status) {
  switch (status) {
    case WL_IDLE_STATUS:
      Serial.println("WiFi status: IDLE");
      break;
    case WL_NO_SSID_AVAIL:
      Serial.println("WiFi status: NO SSID AVAILABLE - Check SSID spelling and that the network exists");
      break;
    case WL_SCAN_COMPLETED:
      Serial.println("WiFi status: SCAN COMPLETED");
      break;
    case WL_CONNECTED:
      Serial.println("WiFi status: CONNECTED");
      break;
    case WL_CONNECT_FAILED:
      Serial.println("WiFi status: CONNECTION FAILED - Check password");
      break;
    case WL_CONNECTION_LOST:
      Serial.println("WiFi status: CONNECTION LOST");
      break;
    case WL_DISCONNECTED:
      Serial.println("WiFi status: DISCONNECTED");
      break;
    default:
      Serial.print("WiFi status: UNKNOWN (");
      Serial.print(status);
      Serial.println(")");
      break;
  }
}

// EEPROM functions for storing WiFi credentials
String readStringFromEEPROM(int startAddr) {
  char data[128] = {0};  // Zero-initialize the buffer
  for (int i = 0; i < 127; i++) {  // Leave space for null terminator
    char c = EEPROM.read(startAddr + i);
    if (c == '\0' || c == 0xFF) {  // Stop at null or unprogrammed (0xFF) bytes
      break;
    }
    data[i] = c;
  }
  data[127] = '\0';  // Ensure null termination
  return String(data);
}

void writeStringToEEPROM(int startAddr, String data) {
  // Clear the area first by writing zeros
  for (int i = 0; i < 128; i++) {
    EEPROM.write(startAddr + i, 0);
  }
  
  // Now write the actual data
  for (int i = 0; i < data.length() && i < 127; i++) {  // Leave space for null terminator
    EEPROM.write(startAddr + i, data[i]);
  }
  
  // Fix for min() function type mismatch
  unsigned int dataLen = data.length();
  unsigned int maxLen = 127;
  unsigned int len = (dataLen < maxLen) ? dataLen : maxLen;
  
  EEPROM.write(startAddr + len, '\0');  // Add null terminator
  
  // Set the flag indicating we have valid credentials
  EEPROM.write(WIFI_FLAG_ADDR, 'Y');
  
  EEPROM.commit();
  Serial.println("Credentials saved to EEPROM");
}

// Function to start the SoftAP
void startSoftAP() {
  // Only start AP mode if not already in AP mode
  if (WiFi.getMode() != WIFI_AP && WiFi.getMode() != WIFI_AP_STA) {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(softAP_ssid, softAP_password);
    Serial.println("SoftAP started");
    Serial.print("Connect to WiFi SSID: ");
    Serial.println(softAP_ssid);
    Serial.print("SoftAP IP address: ");
    Serial.println(WiFi.softAPIP());
    Serial.println("Then open http://192.168.4.1 in your browser");
    
    // Start mDNS responder for AP mode
    if (MDNS.begin(mdnsHostname)) {
      Serial.println("mDNS responder started in AP mode");
      Serial.print("Device is now accessible at: http://");
      Serial.print(mdnsHostname);
      Serial.println(".local");
      
      // Add service to mDNS
      MDNS.addService("http", "tcp", 80);
    }
  }
}

// Function to stop the SoftAP
void stopSoftAP() {
  if (WiFi.getMode() == WIFI_AP_STA || WiFi.getMode() == WIFI_AP) {
    Serial.println("Stopping SoftAP mode...");
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    Serial.println("SoftAP stopped");
    
    // Restart mDNS for station mode
    MDNS.end();
    if (MDNS.begin(mdnsHostname)) {
      Serial.println("mDNS responder restarted in station mode");
      Serial.print("Device is now accessible at: http://");
      Serial.print(mdnsHostname);
      Serial.println(".local");
      
      // Add service to mDNS
      MDNS.addService("http", "tcp", 80);
    }
  }
}

// Function to set up web server endpoints
void setupServerEndpoints() {
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
    
    // Store the credentials
    storedSSID = doc["ssid"].as<String>();
    storedPassword = doc["password"].as<String>();
    
    Serial.println("Received WiFi credentials:");
    Serial.print("SSID: "); Serial.println(storedSSID);
    Serial.print("Password length: "); Serial.println(storedPassword.length());
    
    // Save to EEPROM
    writeStringToEEPROM(SSID_ADDR, storedSSID);
    writeStringToEEPROM(PASS_ADDR, storedPassword);
    
    // Set flag to attempt connection in main loop
    shouldAttemptConnection = true;
  });

  // HTTP GET /status endpoint to check device status
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    StaticJsonDocument<200> doc;
    doc["isConnected"] = isConnectedToWiFi;
    doc["mdns"] = String(mdnsHostname) + ".local";
    
    if (isConnectedToWiFi) {
      doc["ip"] = WiFi.localIP().toString();
      doc["ssid"] = WiFi.SSID();
      doc["mode"] = "station";
    } else {
      doc["ip"] = WiFi.softAPIP().toString();
      doc["ssid"] = softAP_ssid;
      doc["mode"] = "ap";
    }
    
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  // HTTP GET /read-rfid endpoint to get the last scanned RFID card
  server.on("/read-rfid", HTTP_GET, [](AsyncWebServerRequest *request) {
    StaticJsonDocument<200> doc;
    doc["uid"] = lastUID;
    doc["timestamp"] = lastScanTime;
    
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  // HTTP GET /reset endpoint to clear WiFi settings and restart
  server.on("/reset", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "Resetting WiFi settings and restarting...");
    
    // Clear the EEPROM flag
    EEPROM.write(WIFI_FLAG_ADDR, 0);
    EEPROM.commit();
    
    // Small delay to allow the response to be sent
    delay(1000);
    
    // Restart the ESP32
    ESP.restart();
  });

  // Start the server
  server.begin();
}

void connectToWiFi() {
  // Disconnect from any previous WiFi to start clean
  WiFi.disconnect(true);
  delay(1000);
  
  Serial.println("Attempting to connect to WiFi...");
  Serial.print("SSID: ");
  Serial.println(storedSSID);
  Serial.print("Password length: ");
  Serial.println(storedPassword.length());
  
  // Switch to STA mode but keep AP running during connection attempt
  WiFi.mode(WIFI_AP_STA);
  
  // Set auto-reconnect
  WiFi.setAutoReconnect(true);
  
  // Start connection process
  WiFi.begin(storedSSID.c_str(), storedPassword.c_str());
  
  int max_attempts = 20;
  int attempt = 0;
  
  Serial.print("Waiting for WiFi connection");
  
  while (WiFi.status() != WL_CONNECTED && attempt < max_attempts) {
    delay(500);
    Serial.print(".");
    attempt++;
    
    if (attempt % 5 == 0) {
      printWiFiStatus(WiFi.status());
    }
    
    // Check for RFID during connection attempt
    checkForRFID();
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.print("Connected to WiFi network! IP address: ");
    Serial.println(WiFi.localIP());
    isConnectedToWiFi = true;
    
    // Start mDNS responder in station mode
    MDNS.end(); // End any previous instance
    if (MDNS.begin(mdnsHostname)) {
      Serial.println("mDNS responder started in station mode");
      Serial.print("Device is now accessible at: http://");
      Serial.print(mdnsHostname);
      Serial.println(".local");
      
      // Add service to mDNS
      MDNS.addService("http", "tcp", 80);
    } else {
      Serial.println("Error setting up mDNS responder");
    }
    
    // Now that we're connected to WiFi, we can stop the AP mode
    stopSoftAP();
  } else {
    Serial.println("");
    Serial.println("Failed to connect to WiFi:");
    printWiFiStatus(WiFi.status());
    Serial.println("Staying in AP mode for retry");
    isConnectedToWiFi = false;
  }
  
  // Reset the flag
  shouldAttemptConnection = false;
}

// Function to read RFID card
void checkForRFID() {
  uint8_t uid[] = { 0, 0, 0, 0, 0, 0, 0 };  // Buffer to store the returned UID
  uint8_t uidLength;                         // Length of the UID
  
  // Wait for an ISO14443A type card (Mifare, etc.)
  // Use a shorter timeout (50ms) to prevent blocking the main loop
  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50)) {
    // Card detected! Build the UID string
    String newUID = "";
    for (uint8_t i = 0; i < uidLength; i++) {
      if (uid[i] < 0x10) newUID += "0"; // Add leading zero if needed
      newUID += String(uid[i], HEX);
      if (i < uidLength - 1) newUID += ":";
    }
    
    newUID.toUpperCase();
    
    if (newUID != lastUID) {
      // Different card from last time
      lastUID = newUID;
      lastScanTime = millis();
      
      Serial.print("Card detected with UID: ");
      Serial.println(lastUID);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000); // Give time for serial to initialize
  
  Serial.println("\n\n=== ESP32 RFID Reader Starting ===");
  
  // Initialize EEPROM
  EEPROM.begin(EEPROM_SIZE);
  
  // Check if we have stored WiFi credentials
  bool hasStoredCredentials = (EEPROM.read(WIFI_FLAG_ADDR) == 'Y');
  
  if (hasStoredCredentials) {
    // Read stored credentials
    storedSSID = readStringFromEEPROM(SSID_ADDR);
    storedPassword = readStringFromEEPROM(PASS_ADDR);
    
    Serial.println("Found stored WiFi credentials");
    Serial.print("SSID: ");
    Serial.println(storedSSID);
    
    // Only try to connect if credentials look valid
    if (storedSSID.length() > 0 && storedPassword.length() > 0) {
      shouldAttemptConnection = true;
    } else {
      Serial.println("Stored credentials appear invalid");
      // Clear the invalid flag
      EEPROM.write(WIFI_FLAG_ADDR, 0);
      EEPROM.commit();
    }
  } else {
    Serial.println("No stored WiFi credentials found");
  }
  
  // Initialize I2C for NFC reader
  Wire.begin(SDA_PIN, SCL_PIN);
  
  // Initialize NFC reader
  nfc.begin();
  
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("Didn't find PN532 board. Check connections.");
    Serial.println("Continuing without NFC functionality.");
  } else {
    Serial.print("Found chip PN5"); Serial.println((versiondata>>24) & 0xFF, HEX); 
    Serial.print("Firmware ver. "); Serial.print((versiondata>>16) & 0xFF, DEC); 
    Serial.print('.'); Serial.println((versiondata>>8) & 0xFF, DEC);
    
    // Configure PN532 to communicate
    nfc.SAMConfig();
    
    Serial.println("Waiting for RFID/NFC card...");
  }
  
  // Start in AP mode initially
  startSoftAP();
  
  // Setup web server endpoints
  setupServerEndpoints();
  
  Serial.println("ESP32 setup complete");
}

void loop() {
  // Check if we should attempt WiFi connection
  if (shouldAttemptConnection) {
    connectToWiFi();
  }
  
  // Check for RFID cards
  checkForRFID();
  
  // Check if WiFi is still connected if we were previously connected
  static unsigned long lastWiFiCheck = 0;
  if (isConnectedToWiFi && millis() - lastWiFiCheck > 30000) {  // Check every 30 seconds
    lastWiFiCheck = millis();
    
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi connection lost. Attempting to reconnect...");
      
      // When connection is lost, start AP again
      startSoftAP();
      
      // Try to reconnect
      WiFi.reconnect();
      
      // Wait a bit for reconnection
      int reconnect_attempts = 10;
      int attempt = 0;
      while (WiFi.status() != WL_CONNECTED && attempt < reconnect_attempts) {
        delay(500);
        Serial.print(".");
        attempt++;
        
        // Continue checking for RFID cards during reconnection
        checkForRFID();
      }
      
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nReconnected to WiFi");
        // Stop AP mode again
        stopSoftAP();
      } else {
        Serial.println("\nFailed to reconnect to WiFi");
        printWiFiStatus(WiFi.status());
        isConnectedToWiFi = false;
        // Keep AP mode running for setup
      }
    }
  }
  
  // Small delay to prevent watchdog issues
  delay(100);
}