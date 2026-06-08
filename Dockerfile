FROM ghost:latest

# Step 1: Install your plugin directly inside the image files
RUN npm install @sakthi10122004/mailconfig@latest --global-style

# Step 2: Inject the custom configuration trick into the production config file
RUN node -e " \
    const fs = require('fs'); \
    const p = '/var/lib/ghost/config.production.json'; \
    const c = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : {}; \
    if(!c.scheduling) c.scheduling = {}; \
    c.scheduling.active = '@sakthi10122004/mailconfig'; \
    c.scheduling['@sakthi10122004/mailconfig'] = {}; \
    fs.writeFileSync(p, JSON.stringify(c, null, 2)); \
"
