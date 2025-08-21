import { app, Tray, Menu } from "electron";
import path from "node:path";

class SystemTray {
  constructor(mainWindow) {
    const iconName = process.platform === "win32" ? "win-tray.ico" : "tray.png";
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, "icons", iconName)
      : path.join(__dirname, `../../resources/icons/${iconName}`);
    this.tray = new Tray(iconPath);
    this.mainWindow = mainWindow;
    this.tray.setToolTip("Snaplark");
    this.tray.on("click", this.onTrayClick.bind(this));
    this.tray.on("right-click", this.onTrayRightClick.bind(this));
  }

  onTrayClick(event, bounds) {
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      const { x, y } = bounds;
      const { width, height } = this.mainWindow.getBounds();

      // Calculate the center of the tray icon to determine which display it's on
      const trayCenter = {
        x: x + bounds.width / 2,
        y: y + bounds.height / 2,
      };

      this.mainWindow.setBounds({
        x: x - width / 2,
        y: process.platform === "darwin" ? y + bounds.height : y - height,
        width,
        height,
      });

      // Store the tray position for screenshot mode to use the correct display
      this.mainWindow.trayPosition = trayCenter;

      // Show the main window without stealing focus from current workspace
      this.mainWindow.showInactive();

      // For macOS, ensure it appears above other apps without changing workspace
      if (process.platform === "darwin") {
        this.mainWindow.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true,
        });
        this.mainWindow.setAlwaysOnTop(true, "screen-saver");
      }
    }
  }

  onTrayRightClick(event, bounds) {
    const menu = Menu.buildFromTemplate([
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.popUpContextMenu(menu);
  }
}

export default SystemTray;
