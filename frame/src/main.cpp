#include <Arduino.h>
#include <SPIFFS.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> 
#include <time.h>
#include <esp_sleep.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <WiFi.h>
#include "data.h"
#include "display.h"

#define WAKEUP_PIN GPIO_NUM_0
#define BATT_PIN 34
#define WAIT_TIME 10 * 60
#define MAX_VOLT 4.2
#define MIN_VOLT 3.0

const long gmtOffset_sec = -3 * 3600;
const int daylightOffset_sec = 0;
bool imageTransferInProgress = false;
unsigned int seconds_until_midnight = 0;
struct tm timeinfo;
bool especialSelected = false;
WiFiManager wm;
Preferences preferences;

float readBatteryVoltage();
int voltageToPercent(float voltage);
void startImageTransfer();
void loadOnDisplay();
bool loadImageFromFile(const char* filename);
bool fromStreamToDisplay(String imageName);
void fromFileToDisplay(const char* imageName);
void displayWifiAdvert(WiFiManager *myWiFiManager);
void displayNoImage();
void onClientConnected(WiFiEvent_t event, WiFiEventInfo_t info);
void wifiShutdown();
String sortImage(JsonDocument& doc);
String chooseRandomImage();
bool downloadImage(String name);
bool sendStatus();
bool configTimer();
void letsSleep(int seconds);
void wifiInit();
void secondsUntilMidnight();
void sleep12h();
bool deleteSpecialImage();

void secondsUntilMidnight() {
  time_t now;
  time(&now);
  struct tm *timeinfo = localtime(&now);
  seconds_until_midnight = (23 - timeinfo->tm_hour) * 3600 + (59 - timeinfo->tm_min) * 60 + (59 - timeinfo->tm_sec);
  Serial.printf("Second until midnight: %d\n", seconds_until_midnight);
}

void sleep12h() {
  seconds_until_midnight = 12 * 3600;
}

float readBatteryVoltage() {
  int raw = analogRead(BATT_PIN);
  return (raw / 4095.0) * 3.3;
}

int voltageToPercent(float voltage) {
  if (voltage >= MAX_VOLT) return 100;
  if (voltage <= MIN_VOLT) return 0;
  return (int)((voltage - MIN_VOLT) / (MAX_VOLT - MIN_VOLT) * 100);
}

void startImageTransfer() {
  imageTransferInProgress = true;
  Serial.println("Initializing the image transmission..");
}

void loadOnDisplay() {
  if (imageTransferInProgress) {
    updateDisplay();
    Serial.println("Image loaded on display.");
    imageTransferInProgress = false;
  }
}

bool loadImageFromFile(const char* filename) {
  if (!SPIFFS.begin(true)) {
    Serial.println("Error initializing SPIFFS");
    return false;
  }

  if (!SPIFFS.exists(filename)) {
    Serial.printf("File %s not found\n", filename);
    return false;
  }

  File file = SPIFFS.open(filename, "r");
  if (!file) {
    Serial.println("Error opening file");
    return false;
  }

  uint8_t buffer[1024];
  Serial.println("Loading image from file: " + String(filename));
  startImageTransfer();
  while (file.available()) {
    size_t bytesRead = file.read(buffer, sizeof(buffer));
    loadImage((const char*)buffer, bytesRead);
  }
  file.close();
  return true;
}

void fromFileToDisplay(const char* imageName) {
  initDisplay();
  delay(200);
  loadImageFromFile(imageName);
  Serial.println("Show "+ String(imageName));
  loadOnDisplay();
}

bool fromStreamToDisplay(String imageName) {
  initDisplay();
  delay(200);
  bool status = downloadImage(imageName);
  if (status) {
    delay(200);
    if(especialSelected){
      if( deleteSpecialImage()) {
        Serial.println("Special image deleted successfully.");
      } 
      else {
        Serial.println("Error in delet process of special image.");
      }
    }
    wifiShutdown();
    loadOnDisplay();
    return true;
  }
  else return false;
}

void displayWifiAdvert(WiFiManager *myWiFiManager) {
  fromFileToDisplay("/wifi.bin");
}

void displayNoImage() {
  fromFileToDisplay("/template.bin");
}

void onClientConnected(WiFiEvent_t event, WiFiEventInfo_t info) {
  fromFileToDisplay("/page.bin");
}


void wifiShutdown() {
  WiFi.disconnect();
  WiFi.mode(WIFI_OFF);
  Serial.println("WiFi disconected.");
}

String sortImage(JsonDocument& doc) {
  preferences.begin("image-store", false);
  String lastImage = preferences.getString("lastImage", "");
  JsonArray images = doc["images"];
  int total = images.size();

  if (total == 0) {
    Serial.println("None image found.");
    preferences.end();
    displayNoImage();
    return "Empty";
  }

  //Priority to special image
  for (int i = 0; i < total; i++) {
    String current = images[i].as<String>();
    if (current == ESPECIAL) {
      Serial.println("Imagem especial detectada: special.jpg");
      preferences.putString("lastImage", ESPECIAL);
      preferences.end();
      especialSelected = true;
      return ESPECIAL;
    }
  }


  String filtered[total];
  int count = 0;

  for (int i = 0; i < total; i++) {
    String current = images[i].as<String>();
    if (current == "") continue;  // Ignore empty strings
    if (total > 1 && current == lastImage) continue;
    filtered[count++] = current;
  }

  // If all images were filtered out, add the last image
  if (count == 0 && lastImage != "") {
    filtered[count++] = lastImage;
  }

  // Show images available
  Serial.println("Available images:");
  for (int i = 0; i < count; i++) Serial.println("-> " + filtered[i]);

  int index = random(0, count);
  String name = filtered[index];

  Serial.printf("Imagem chosed (%d): %s\n", index, name.c_str());

  preferences.putString("lastImage", name);
  preferences.end();
  return name;
}

bool deleteSpecialImage() {
  HTTPClient http;

  http.begin(deleteUrlBase);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + String(token));
  especialSelected = false;

  // Corpo da requisição com o nome da imagem
  String requestBody = "{\"imageName\":\"" + String(ESPECIAL) + "\"}";

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("Response (%d): %s\n", httpResponseCode, response.c_str());
    http.end();
    return httpResponseCode == 200;
  } else {
    Serial.printf("Error in requisition: %s\n", http.errorToString(httpResponseCode).c_str());
    http.end();
    return false;
  }
}

String chooseRandomImage() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(listUrl);
    http.setTimeout(5000);
    http.addHeader("Authorization", "Bearer " + String(token));
    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      DynamicJsonDocument doc(4096);
      DeserializationError error = deserializeJson(doc, payload);
      if (error) {
        Serial.print("Error in JSON parser: ");
        Serial.println(error.c_str());
        return "";
      }

      return sortImage(doc);
    } else {
      Serial.printf("Erro in images request http error: %d\n", httpCode);
      return "None";
    }
    http.end();
  }
  Serial.println("WiFi not connected!");
  return "None";
}

bool downloadImage(String name) {
  if (name == "") return false;

  String imageUrl = String(getUrlBase) + "?name=" + name + "&id=" + id;
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(imageUrl);
  http.addHeader("Authorization", "Bearer " + String(token));
  int httpCode = http.GET();
  if (httpCode == HTTP_CODE_OK) {
    WiFiClient* stream = http.getStreamPtr();
    Serial.println("Download image by streaming...");

    uint8_t buffer[1024];
    startImageTransfer();
    while (http.connected() && stream->available()) {
      size_t bytesRead = stream->readBytes(buffer, sizeof(buffer));
      loadImage((const char*)buffer, bytesRead);
    }
    http.end();
    return true;
  } 
  else {
    Serial.printf("Error in http: %d\n", httpCode);
    http.end();
    return false;
  }
}

bool sendStatus() {
  float voltage = readBatteryVoltage();
  int percent = voltageToPercent(voltage);
  Serial.printf("Battery Voltage: %.2f V\n", voltage);
  Serial.printf("Battery Percent: %d%%\n", percent);
  HTTPClient http;
  http.begin(firebaseUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + token);

  StaticJsonDocument<200> doc;
  doc["deviceId"] = id;
  doc["voltage"] = voltage;
  doc["percent"] = percent;

  String jsonPayload;
  serializeJson(doc, jsonPayload);
  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("HTTP response: %d - %s\n", httpResponseCode, response.c_str());
  } else {
    Serial.printf("Error in request for set status HTTP: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  http.end();

  return httpResponseCode == 200;
}


bool configTimer() {
  char timeString[64];
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain time");
    return false;
  }
  else{
    strftime(timeString, sizeof(timeString), "%Y-%m-%d %H:%M:%S", &timeinfo);
    Serial.print("Actual time: ");
    Serial.println(timeString);
    return true;
  }
}

void letsSleep(int seconds) {
  Serial.println("Entering in deep sleep...");
  Serial.printf("Wake up in %d seconds\n", seconds);
  esp_sleep_enable_timer_wakeup((uint64_t)seconds* 1000000ULL);
  esp_sleep_enable_ext0_wakeup(WAKEUP_PIN, 0);
  pinMode((int)WAKEUP_PIN, INPUT_PULLUP);
  esp_deep_sleep_start();
}

void wifiInit() {
  wm.setCustomHeadElement(
    "<style>"
    "form:not(:first-of-type) { display:none !important; }"
    "h1 { display: none !important; }"
    "</style>"
    "<script>"
    "window.onload = function() {"
    "  var btn = document.querySelector('form:first-of-type button');"
    "  if(btn) btn.textContent = 'Conectar ao Wi-Fi...';"
    "};"
    "</script>"
  );
  wm.setAPCallback(displayWifiAdvert);
  WiFi.onEvent(onClientConnected, WiFiEvent_t::ARDUINO_EVENT_WIFI_AP_STACONNECTED);
  wm.setClass("invert");  
  wm.setHostname("portaretrato");
  Serial.println(wm.getConfigPortalSSID());
  if(wm.autoConnect(ssid, password)) {
    Serial.println("Wifi connected!");
  } else {
    Serial.println("Fail to connect to WiFi.");
  }
}

void setup() {
  Serial.begin(115200);
}

void loop() {
  wifiInit();
  delay(100);
  if (WiFi.status() == WL_CONNECTED) {
    if(configTimer()) secondsUntilMidnight();
    else sleep12h();
    sendStatus();
    String randomImage = chooseRandomImage();
    if(randomImage != "None") {
      if(randomImage != "Empty"){
        bool updated = fromStreamToDisplay(randomImage);
        if (updated) {

          letsSleep(seconds_until_midnight);
        }
        else {
          Serial.println("Problem loading image from stream. Waiting 10 minutes.");
          letsSleep(WAIT_TIME);
        }
      }
      else {
        Serial.println("Imagem vazia.");
        letsSleep(seconds_until_midnight);
      }
    }
    else {
      Serial.println("Problem to load image. Waiting 10 minutes.");
      letsSleep(WAIT_TIME);
    }
  }
  else{
    Serial.println("WiFi not connected. Waiting 10 minutes.");
    letsSleep(WAIT_TIME);
  }
}


