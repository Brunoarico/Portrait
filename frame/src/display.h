#ifndef display_h
#define display_h

#include <Arduino.h>

// SPI pins.
#define PIN_SPI_SCK 13
#define PIN_SPI_DIN 14
#define PIN_SPI_CS 15
#define PIN_SPI_BUSY 25
#define PIN_SPI_RST 26
#define PIN_SPI_DC 27

uint16_t width = 600;
uint16_t height = 448;

// Wakes up the display from sleep.
void resetDisplay() {
  digitalWrite(PIN_SPI_RST, LOW);
  delay(200);
  digitalWrite(PIN_SPI_RST, HIGH);
  delay(200);
}

// Sends one byte via SPI.
void sendSpi(byte data) {
  digitalWrite(PIN_SPI_CS, LOW);
  for (int i = 0; i < 8; i++) {
    if ((data & 0x80) == 0) {
      digitalWrite(PIN_SPI_DIN, LOW);
    } else {
      digitalWrite(PIN_SPI_DIN, HIGH);
    }
    data <<= 1;
    digitalWrite(PIN_SPI_SCK, HIGH);
    digitalWrite(PIN_SPI_SCK, LOW);
  }
  digitalWrite(PIN_SPI_CS, HIGH);
}

// Sends one byte as a command.
void sendCommand(byte command) {
  digitalWrite(PIN_SPI_DC, LOW);
  sendSpi(command);
}

// Sends one byte as data.
void sendData(byte data) {
  digitalWrite(PIN_SPI_DC, HIGH);
  sendSpi(data);
}

// Sends a 1-argument command.
void sendCommand1(byte command, byte data) {
  sendCommand(command);
  sendData(data);
}

// Sends a 2-argument command.
void sendCommand2(byte command, byte data1, byte data2) {
  sendCommand(command);
  sendData(data1);
  sendData(data2);
}

// Sends a 3-argument command.
void sendCommand3(byte command, byte data1, byte data2, byte data3) {
  sendCommand(command);
  sendData(data1);
  sendData(data2);
  sendData(data3);
}

// Sends a 4-argument command.
void sendCommand4(byte command, byte data1, byte data2, byte data3,
                  byte data4) {
  sendCommand(command);
  sendData(data1);
  sendData(data2);
  sendData(data3);
  sendData(data4);
}

// Waits until the display is ready.
void waitForIdle() {
  while (digitalRead(PIN_SPI_BUSY) == LOW /* busy */) {
    delay(100);
  }
}

// Returns whether the display is busy
bool isDisplayBusy() {
  return (digitalRead(PIN_SPI_BUSY) == LOW);
}

void bootSequence1(){
  sendCommand2(0x00, 0xEF, 0x08);              // PANEL_SETTING
  sendCommand2(0x01, 0x37, 0x00);              // POWER_SETTING
  sendCommand3(0x06, 0xC7, 0xCC, 0x28);        // BOOSTER_SOFT_START
  sendCommand(0x4);                            // POWER_ON
  waitForIdle();
  sendCommand1(0x30, 0x3C);                    // PLL_CONTROL
  sendCommand1(0x41, 0x00);                    // TEMPERATURE_CALIBRATION
  sendCommand1(0x50, 0x77);                    // VCOM_AND_DATA_INTERVAL_SETTING
  sendCommand1(0x60, 0x22);                    // TCON_SETTING
  sendCommand4(0x61, 0x02, 0x80, 0x01, 0x80);  // TCON_RESOLUTION
  sendCommand1(0x82, 0x1E);                    // VCM_DC_SETTING
  sendCommand1(0xE5, 0x03);                    // FLASH MODE
  sendCommand(0x10);                           // DATA_START_TRANSMISSION_1
}

void bootSequence2(){
  sendCommand2(0x00, 0xEF, 0x08);              // PANEL_SETTING
  sendCommand2(0x01, 0x37, 0x00);              // POWER_SETTING
  sendCommand3(0x06, 0xC7, 0xCC, 0x28);        // BOOSTER_SOFT_START
  sendCommand(0x4);                            // POWER_ON
  waitForIdle();
  sendCommand1(0x30, 0x3C);                    // PLL_CONTROL
  sendCommand1(0x41, 0x00);                    // TEMPERATURE_CALIBRATION
  sendCommand1(0x50, 0x77);                    // VCOM_AND_DATA_INTERVAL_SETTING
  sendCommand1(0x60, 0x22);                    // TCON_SETTING
  sendCommand4(0x61, 0x02, 0x58, 0x01, 0xC0);  // TCON_RESOLUTION
  sendCommand1(0x82, 0x1E);                    // VCM_DC_SETTING
  sendCommand1(0xE5, 0x03);                    // FLASH MODE
  sendCommand(0x10);                           // DATA_START_TRANSMISSION_1
}

// Initializes the display.
void initDisplay() {
  Serial.println("Initializing display");

  // Initialize SPI.
  pinMode(PIN_SPI_BUSY, INPUT);
  pinMode(PIN_SPI_RST, OUTPUT);
  pinMode(PIN_SPI_DC, OUTPUT);
  pinMode(PIN_SPI_SCK, OUTPUT);
  pinMode(PIN_SPI_DIN, OUTPUT);
  pinMode(PIN_SPI_CS, OUTPUT);
  digitalWrite(PIN_SPI_CS, HIGH);
  digitalWrite(PIN_SPI_SCK, LOW);

  // Initialize the display.
  resetDisplay();
  
  bootSequence2();
  delay(2);
}

void displayStartTransmission(){
  sendCommand(0x10);                           // DATA_START_TRANSMISSION_1
  delay(2);
}

byte convertPixel(byte input, byte mask, int shift) {
    byte value = (input & mask) >> shift;
    switch (value) {
        case 0b0000: return 0x0; // Black
        case 0b0001: return 0x1; // White
        case 0b0010: return 0x2; // Green
        case 0b0011: return 0x3; // Blue
        case 0b0100: return 0x4; // Red
        case 0b0101: return 0x5; // Yellow
        case 0b0110: return 0x6; // Orange
        case 0b0111: return 0x0; // Clean (interpreta como preto)
        default:
            Serial.printf("Unknown pixel value: 0x%02X\n", value);
            return 0x0;
    }
}

// Loads partial image data onto the display.
void loadImage(const char* image_data, size_t length) {
  Serial.printf("Loading image data: %d bytes\n", length);

  // Look at the image data one byte at a time, which is 4 input pixels.
  for (int i = 0; i < length; i++) {
    // 4 input pixels.
    const byte p1 = convertPixel(image_data[i], 0xF0, 4);
    const byte p2 = convertPixel(image_data[i], 0x0F, 0);


    // 2 output pixels.
    sendData((p1 << 4) | p2);
  }
}

// Shows the loaded image and sends the display to sleep.
void updateDisplay() {
  // Refresh.
  Serial.println("Refreshing image");
  sendCommand(0x12);  // DISPLAY_REFRESH
  delay(100);
  Serial.println("sendCommand: DISPLAY_REFRESH");
  waitForIdle();

  // Sleep.
  Serial.println("Suspending display");
  sendCommand(0x02);  // POWER_OFF
  waitForIdle();
  sendCommand1(0x07, 0xA5);  // DEEP_SLEEP
}

// Shows the loaded image
void updateDisplay_withoutIdle() {
  // Refresh.
  Serial.println("Refreshing image");
  sendCommand(0x12);  // DISPLAY_REFRESH
  delay(100);
  /*Serial.println("sendCommand: DISPLAY_REFRESH");
  waitForIdle();

  // Sleep.
  Serial.println("Suspending display");
  sendCommand(0x02);  // POWER_OFF
  waitForIdle();
  sendCommand1(0x07, 0xA5);  // DEEP_SLEEP*/
}

void setPartialWindow(uint16_t x, uint16_t y, uint16_t w, uint16_t h) {
  sendCommand(0x90); // PARTIAL_WINDOW
  sendData(x >> 8);
  sendData(x & 0xFF);
  sendData((x + w - 1) >> 8);
  sendData((x + w - 1) & 0xFF);
  sendData(y >> 8);
  sendData(y & 0xFF);
  sendData((y + h - 1) >> 8);
  sendData((y + h - 1) & 0xFF);
  sendData(0x01); // Enable partial
  sendCommand(0x91); // PARTIAL_IN
}

void partialOut() {
  sendCommand(0x92); // PARTIAL_OUT
}

#endif  // display_h