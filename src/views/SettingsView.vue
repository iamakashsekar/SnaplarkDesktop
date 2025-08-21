<template>
  <div class="settings-window">
    <div class="settings-header">
      <h1>Settings</h1>
      <button @click="closeWindow" class="close-btn">×</button>
    </div>

    <div class="settings-content">
      <div class="settings-section">
        <h2>General</h2>
        <div class="setting-item">
          <label class="setting-label">
            <input type="checkbox" v-model="settings.autoStart" />
            Start with system
          </label>
        </div>
        <div class="setting-item">
          <label class="setting-label">
            <input type="checkbox" v-model="settings.showNotifications" />
            Show notifications
          </label>
        </div>
      </div>

      <div class="settings-section">
        <h2>Appearance</h2>
        <div class="setting-item">
          <label class="setting-label">
            <input type="checkbox" v-model="settings.darkMode" />
            Dark mode
          </label>
        </div>
        <div class="setting-item">
          <label>Theme</label>
          <select v-model="settings.theme" class="setting-select">
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <div class="settings-section">
        <h2>Screenshots</h2>
        <div class="setting-item">
          <label>Default format</label>
          <select v-model="settings.defaultFormat" class="setting-select">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="gif">GIF</option>
          </select>
        </div>
        <div class="setting-item">
          <label>Save location</label>
          <div class="file-input">
            <input type="text" v-model="settings.saveLocation" readonly />
            <button @click="browseSaveLocation" class="browse-btn">
              Browse
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-footer">
      <button @click="resetSettings" class="secondary-btn">
        Reset to Defaults
      </button>
      <div class="footer-actions">
        <button @click="cancelChanges" class="secondary-btn">Cancel</button>
        <button @click="saveSettings" class="primary-btn">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { useStore } from "@/store";

const store = useStore();

const settings = reactive({
  autoStart: false,
  showNotifications: true,
  darkMode: false,
  theme: "auto",
  defaultFormat: "png",
  saveLocation: "~/Pictures/Snaplark",
});

onMounted(() => {
  loadSettings();
});

const closeWindow = () => {
  if (window.electronWindows) {
    window.electronWindows.closeWindow("settings");
  }
};

const loadSettings = () => {
  // Load settings from store or electron store
  try {
    const savedSettings = window.electronStore?.get("settings");
    if (savedSettings) {
      Object.assign(settings, savedSettings);
    }
  } catch (error) {
    console.error("Error loading settings:", error);
  }
};

const saveSettings = () => {
  try {
    window.electronStore?.set("settings", settings);
    console.log("Settings saved successfully");
    closeWindow();
  } catch (error) {
    console.error("Error saving settings:", error);
  }
};

const cancelChanges = () => {
  loadSettings(); // Reload original settings
  closeWindow();
};

const resetSettings = () => {
  if (confirm("Are you sure you want to reset all settings to defaults?")) {
    Object.assign(settings, {
      autoStart: false,
      showNotifications: true,
      darkMode: false,
      theme: "auto",
      defaultFormat: "png",
      saveLocation: "~/Pictures/Snaplark",
    });
  }
};

const browseSaveLocation = () => {
  // In a real implementation, you'd use electron's dialog API
  console.log("Browse for save location");
};
</script>

<style scoped>
.settings-window {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: white;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e5e5;
  background: #f8f9fa;
}

.settings-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  color: #666;
}

.close-btn:hover {
  background: #e5e5e5;
}

.settings-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section h2 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.setting-item {
  margin-bottom: 16px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.setting-label input[type="checkbox"] {
  margin: 0;
}

.setting-select {
  width: 200px;
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.file-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.file-input input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.browse-btn {
  padding: 6px 12px;
  background: #f1f3f4;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.browse-btn:hover {
  background: #e8eaed;
}

.settings-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid #e5e5e5;
  background: #f8f9fa;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.primary-btn {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.primary-btn:hover {
  background: #0056b3;
}

.secondary-btn {
  padding: 8px 16px;
  background: #f1f3f4;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.secondary-btn:hover {
  background: #e8eaed;
}
</style>
