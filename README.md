# Portrait: The 🖼️ ESP32 E-Ink Digital Photo Frame

This project implements an **ultra-low power digital photo frame** based on an e-ink display and ESP32, powered by a Li-ion battery and remotely controlled via Firebase.

![e-ink display](https://alcom.be/uploads/Eink_AC057TC1_Specs-sheet.pdf)

---

## 📦 Components Used

- **E-Ink Display:** [Waveshare AC057TC1 (600x448)](https://alcom.be/uploads/Eink_AC057TC1_Specs-sheet.pdf)
- **Controller:** [ESP32 E-Paper Driver Board (Waveshare)](https://www.waveshare.com/wiki/E-Paper_ESP32_Driver_Board)
- **Battery:** Li-ion 3.7V 1800mAh
- **Battery Charger:** TP4056
- **Connectivity:** Wi-Fi + NTP time synchronization
- **Backend:** Firebase Realtime Database + Firebase Storage

---

## 🧠 Features

- 🔋 **Ultra-low power consumption** with deep sleep and battery level display on screen.
- 🖼️ **Remote image management** using Firebase's web interface (upload and remove).
- 🌟 A file named `especial.jpg` has **display priority** and is shown immediately.
- 🕛 **Automatic daily update at midnight**, or manually via button press.
- 📶 **Simplified Wi-Fi setup via QR Code**.
- ☁️ Firebase integration for synchronized and authenticated communication via token.

---