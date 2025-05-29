#ifndef data_h
#define data_h
#include <Arduino.h>

#define ESPECIAL "especial.jpg"
//Define the id of your device, it will be used to identify the device in the Firebase database
const char* id = "";
const char* ssid = "porta-retrato";
const char* password = "retratoretrato";
const char* customDomain = "portaretrato.local";
//Add your firebase URL here
String baseUrl = "";
String listUrl = baseUrl + "/getImages";
String getUrlBase = baseUrl + "/getImageUrl";
String deleteUrlBase = baseUrl + "/deleteImage";
String firebaseUrl = baseUrl + "/uploadStatus"; 
const char* token = "seu-token-secreto-aqui";
const char* ntpServer = "pool.ntp.org";

#endif  // data_h