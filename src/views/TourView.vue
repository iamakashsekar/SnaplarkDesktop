<template>
  <div class="tour-window">
    <div class="tour-header">
      <h1>Snaplark Tour</h1>
      <button @click="closeWindow" class="close-btn">×</button>
    </div>

    <div class="tour-content">
      <div class="step-content">
        <div class="step-icon">🎯</div>
        <h2>Welcome to the Snaplark Tour!</h2>
        <p>
          This is a quick tour of the key features. Use the buttons below to
          navigate through different sections.
        </p>

        <div class="tour-sections">
          <div class="section-card" @click="showHotkeys">
            <div class="card-icon">⌨️</div>
            <h3>Hotkeys</h3>
            <p>Learn keyboard shortcuts</p>
          </div>

          <div class="section-card" @click="showFeatures">
            <div class="card-icon">📸</div>
            <h3>Features</h3>
            <p>Discover what you can do</p>
          </div>

          <div class="section-card" @click="showSettings">
            <div class="card-icon">⚙️</div>
            <h3>Settings</h3>
            <p>Customize your experience</p>
          </div>
        </div>
      </div>
    </div>

    <div class="tour-footer">
      <button @click="finishTour" class="finish-btn">Finish Tour</button>
    </div>
  </div>
</template>

<script setup>
const closeWindow = () => {
  if (window.electronWindows) {
    window.electronWindows.closeWindow("tour");
  }
};

const showHotkeys = () => {
  alert(
    "Hotkeys:\n• Cmd+Shift+3: Full screen\n• Cmd+Shift+4: Region\n• Cmd+Shift+5: Recording"
  );
};

const showFeatures = () => {
  alert(
    "Features:\n• Screenshot capture\n• Screen recording\n• Cloud sync\n• Team sharing"
  );
};

const showSettings = async () => {
  if (window.electronWindows) {
    await window.electronWindows.createWindow("settings");
  }
};

const finishTour = () => {
  try {
    window.electronStore?.set("tourCompleted", true);
  } catch (error) {
    console.error("Error saving tour status:", error);
  }
  closeWindow();
};
</script>

<style scoped>
.tour-window {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: white;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.tour-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 32px;
  border-bottom: 1px solid #e5e5e5;
  background: #f8f9fa;
}

.tour-header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
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

.tour-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.step-content {
  width: 100%;
  max-width: 500px;
  text-align: center;
}

.step-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

h2 {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #333;
}

p {
  font-size: 16px;
  line-height: 1.6;
  color: #666;
  margin: 0 0 32px 0;
}

.tour-sections {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.section-card {
  padding: 24px;
  background: #f8f9fa;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid #e5e5e5;
}

.section-card:hover {
  background: #e9ecef;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.section-card h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.section-card p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.tour-footer {
  padding: 20px 32px;
  border-top: 1px solid #e5e5e5;
  background: #f8f9fa;
  text-align: center;
}

.finish-btn {
  padding: 12px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.finish-btn:hover {
  background: #0056b3;
  transform: translateY(-1px);
}
</style>
