---

# 🛑 STOP CONTENT DELETION IN GOOGLE AI STUDIO! 🛑

**RPStudio** is a powerful Userscript for Tampermonkey/Violentmonkey that provides a complete solution to the "Prohibited content" error. **It prevents Google's censorship filters from deleting partially generated responses**, ensuring you never lose your progress again.

This script is a full rework and fusion of the popular Chrome extensions [Studio.lab](https://github.com/dorimommy/Studio.lab) and [BTStudio](https://github.com/dorimommy/BTStudio), now optimized for a seamless userscript experience with native UI integration.

---

### 🚀 Key Features

#### 🛡️ Anti-Censorship & Content Bypass

* **Native Intercept:** Seamlessly captures the network stream. When a filter triggers, the model simply stops, but **all previously generated text remains visible**.
* **Legacy Restore:** An automated fallback that detects blocks and uses internal buffers to "Paste & Save" the lost content back into the chat.

#### ⚡ Chat Performance Optimizer

* **Smart Mode:** Automatically hides old chat messages from the DOM to eliminate UI lag while keeping them restorable via a "Restore Everything" button.
* **Hard Mode:** Permanently removes old messages from the current browser session's memory for maximum performance in extremely long chats.
* **Auto-Limit:** Keeps only the last 15 messages (adjustable) to ensure the site remains fast and responsive.

#### 🧰 Premium UI Modules (Enabled by Default)

* **★ Native Integration:** Adds a settings button (★) directly into the AI Studio top toolbar.
* **Native Media Grid:** Fixes the layout for uploaded images/files, displaying them in a compact, beautiful grid instead of a long vertical list.
* **Word & Char Counter:** Real-time statistics every user and model message.
* **Hide Banners & Disclaimers:** Removes intrusive "Upgrade" cards, quota warnings, and the "AI may make mistakes" disclaimer.
* **Scroll to Bottom Button:** A floating arrow to instantly jump back to the latest response.

---

### 🔧 Installation & Support

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey.
2. Create a new script and paste the **RPStudio** code.
3. Refresh Google AI Studio and look for the **★** icon in the top right corner.

*Based on original research and code by OurPrince (BTStudio/Studio.lab).*
