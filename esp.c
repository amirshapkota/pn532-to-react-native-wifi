#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_PN532.h>
#include <ESPAsyncWebServer.h>

// NFC
#define SDA_PIN 4
#define SCL_PIN 5
Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);

// Wi-Fi credentials
const char* ssid = "SSID";
const char* password = "password";

// NFC UID buffer
String lastUID = "";

// Web server on port 80
AsyncWebServer server(80);

void setup() {
  Serial.begin(115200);

  // Start I2C
  Wire.begin(SDA_PIN, SCL_PIN);

  // Initialize NFC
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("Didn't find PN532");
    while (1);
  }

  nfc.SAMConfig();
  Serial.println("Waiting for NFC card...");

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected! IP: " + WiFi.localIP().toString());

  // Setup endpoint
  server.on("/uid", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(200, "application/json", "{\"uid\":\"" + lastUID + "\"}");
  });

  server.begin();
}

void loop() {
  uint8_t uid[7];
  uint8_t uidLength;

  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength)) {
    String newUID = "";
    for (uint8_t i = 0; i < uidLength; i++) {
      if (uid[i] < 0x10) newUID += "0";
      newUID += String(uid[i], HEX);
      if (i < uidLength - 1) newUID += ":";
    }
    newUID.toUpperCase();

    if (newUID != lastUID) {
      lastUID = newUID;
      Serial.println("Card detected: " + lastUID);
    }

    delay(2000); // debounce
  }
}
