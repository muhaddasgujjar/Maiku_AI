; ── Maiku AI — Custom NSIS Installer Additions ──────────────────────────
; Included by electron-builder. Keep this file minimal to avoid conflicts
; with electron-builder's auto-generated NSIS code.

; Override the MUI welcome page text
!define MUI_WELCOMEPAGE_TITLE "Welcome to Maiku AI"
!define MUI_WELCOMEPAGE_TEXT "Maiku AI is your invisible AI interview copilot.$\r$\n$\r$\nIt listens to your interview in real-time and surfaces instant AI suggestions — completely hidden from screen recording and video calls.$\r$\n$\r$\nClick Next to continue with the installation."

; Override the finish page
!define MUI_FINISHPAGE_TITLE "Maiku AI is ready!"
!define MUI_FINISHPAGE_TEXT "Installation complete.$\r$\n$\r$\nOn first launch, a setup wizard will guide you to add your free Groq API key — takes about 2 minutes.$\r$\n$\r$\nGet a free API key at: console.groq.com$\r$\n$\r$\nClick Finish to launch Maiku AI."
!define MUI_FINISHPAGE_LINK "Maiku AI on GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/muhaddasgujjar/Maiku_AI"

; Branding
BrandingText "Maiku AI — Invisible Interview Copilot"
