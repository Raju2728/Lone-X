# Lone X setup

Use Node.js 22 and npm on Windows. From the project directory:

- `npm install` installs the dependencies and Electron runtime.
- `npm run dev` starts the Vite landing page. Open the URL printed in the terminal.
- `npm run build` type-checks the renderer and builds the web assets.
- `npm run desktop` builds the assets and opens the desktop workspace.

Milestone 1 uses browser storage for theme and draft preferences. It has no database or provider prerequisites.

After building, run `npm run test:desktop` to check desktop navigation, theme switching, and renderer isolation.
