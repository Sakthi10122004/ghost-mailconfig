# 👻 Ghost MailConfig Gateway

**MailConfig** is a powerful, non-destructive side-car plugin for Ghost CMS that elegantly injects a fully visual Email Transport configuration dashboard directly into the native Ghost Admin panel—without ever altering a single line of Ghost's core source code.

---

## ✨ Features

- **🛡️ 100% Core Safe**: Utilizing a clever "Ghost Adapter" architectural hook, MailConfig registers itself natively on Ghost boot. It never overwrites, hacks, or damages core application files, keeping your environment completely update-safe.
- **🎨 Premium Visual Interface**: Ditch manual JSON editing. Enjoy a breathtaking, SaaS-styled frosted glass dashboard built directly into the Ghost admin settings modal.
- **⚡ Zero Configuration Setup**: Just type `npm install` and Ghost is instantly hooked. A smart `postinstall` script strictly validates the Ghost installation directory and automatically modifies the Ghost routing layer for you.
- **🔄 Dynamic Data Sync**: Live two-way binding. The dashboard safely parses and writes directly to your `config.development.json` or `config.production.json` seamlessly.
- **🧠 Smart State Management**: Includes an auto-detecting status indicator (red/green dot in the sidebar), secure password visibility toggles, and state-aware "dirty-checking" buttons that only activate when modifications happen.

---

## 🚀 Installation & Usage

### 1. Install the Plugin
Navigate to your active Ghost installation root folder (where your `config.production.json` lives) and run:

```bash
npm install mailconfig
```

> **Note**: Our strict installer will verify that you are in a valid Ghost root folder. If you aren't, the installation will abort to protect your file system.

### 2. Restart Ghost
After a successful installation, gracefully restart your Ghost instance to allow the engine to mount the new MailConfig adapter:

```bash
ghost restart
```

### 3. Configure Your Mail Transport
- Open your browser and navigate to your Ghost Admin interface.
- Open your **Settings** sidebar.
- Click the newly injected **Mail Transport** option near the bottom of the navigation pane.
- The sleek modal will overlay. Select your provider (**Custom SMTP** or **Mailgun**), punch in your credentials, and hit **Save Configuration**.

That's it! Your Ghost environment is now configured for outgoing transactional mail.

---

## 🛠️ Architecture & Under the Hood

Ghost naturally hardcodes its mail management inside the server startup sequence. To bypass this, MailConfig operates in three distinct phases:

1. **The Post-Install Injector (`scripts/postinstall.js`)**: Runs during NPM install, locating your Ghost root folder and secretly appending `"scheduling": { "active": "mailconfig" }` into your active configuration.
2. **The Adapter Hook (`src/adapter.js`)**: When Ghost boots, it unknowingly invokes our Scheduling adapter. Our adapter hijacks the internal Express instance by walking the Node cache tree and mounts our custom API namespace `/ghost/mailconfig/`.
3. **The Frontend Injector (`src/frontend-inject.js`)**: By hooking `http.Server.prototype.emit`, the plugin intercepts the `index.html` payload being served to the Ghost Admin dashboard and dynamically injects a tiny JavaScript block. This script dynamically attaches the new Mail Transport button inside the Ghost frontend using DOM Mutation Observers.
