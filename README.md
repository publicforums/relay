# Relay

Relay is a single-page messaging application (auth, onboarding, public chat,
groups, DMs) backed by Supabase. The repository is a static site: every file is
served directly by the host — no build step at deploy time.

## Layout

| Path                | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `index.html`        | Main application entry (auth, chat, DMs, groups).  |
| `landing.html`      | Marketing landing page.                            |
| `terms.html`        | Terms of Service.                                  |
| `privacy.html`      | Privacy Policy.                                    |
| `contact.html`      | Contact page.                                      |
| `assets/css/app.css`     | Source stylesheet for `index.html` (extracted from the original inline `<style>`). |
| `assets/css/app.min.css` | Minified stylesheet actually loaded by `index.html`. |
| `assets/js/app.js`       | Source script for `index.html` (extracted from the original inline `<script>`). |
| `assets/js/app.min.js`   | Minified + mangled script actually loaded by `index.html`. |

`index.html` references the minified assets only. The `.css` / `.js` sources
are committed alongside for maintainability — edit those, then re-run:

```bash
npx terser assets/js/app.js \
  --compress "drop_console=false,passes=2,ecma=2020" \
  --mangle \
  --format "ascii_only=true" \
  -o assets/js/app.min.js

npx cleancss -O2 assets/css/app.css -o assets/css/app.min.css
```

## Local preview

Open any file directly, or serve the directory:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080/index.html
```

The app connects to a public Supabase project; only the **anon** (publishable)
key ships to the browser — that is by design. No service-role or direct-DB
credentials are embedded anywhere.
