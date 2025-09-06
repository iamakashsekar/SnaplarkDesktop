import { app, Tray, Menu, screen } from "electron";
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

  onTrayClick(event, bounds, position) {
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      const { width, height } = this.mainWindow.getBounds();
      let nextX = 0;
      let nextY = 0;
      let trayCenter = { x: 0, y: 0 };

      if (process.platform === "darwin" && bounds) {
        const { x, y } = bounds;
        nextX = x + bounds.width / 2 - width / 2;
        nextY = y + bounds.height;
        trayCenter = { x: x + bounds.width / 2, y: y + bounds.height / 2 };
      } else {
        const clickPos = position || screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(clickPos);
        const db = display.bounds;
        const wa = display.workArea;

        // Determine taskbar edge by comparing workArea to full bounds
        let edge = "bottom";
        if (wa.y > db.y) edge = "top";
        else if (wa.x > db.x) edge = "left";
        else if (wa.width < db.width) edge = "right";

        const margin = 8;
        // Start by centering horizontally/vertically on the click position
        nextX = Math.round(clickPos.x - width / 2);
        nextY = Math.round(clickPos.y - height / 2);

        if (edge === "bottom") {
          nextY = Math.round(clickPos.y - height - margin);
        } else if (edge === "top") {
          nextY = Math.round(clickPos.y + margin);
        } else if (edge === "left") {
          nextX = Math.round(clickPos.x + margin);
        } else if (edge === "right") {
          nextX = Math.round(clickPos.x - width - margin);
        }

        // Clamp to the display work area so it remains fully visible
        nextX = Math.max(wa.x, Math.min(nextX, wa.x + wa.width - width));
        nextY = Math.max(wa.y, Math.min(nextY, wa.y + wa.height - height));

        trayCenter = { x: clickPos.x, y: clickPos.y };
      }

      this.mainWindow.setBounds({ x: nextX, y: nextY, width, height });

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
