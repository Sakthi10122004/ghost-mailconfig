FROM ghost:latest

# Step 1: Copy the local plugin package to the container
COPY . /var/lib/ghost/node_modules/@sakthi10122004/mailconfig

# Install any dependencies of the plugin
RUN cd /var/lib/ghost/node_modules/@sakthi10122004/mailconfig && npm install --only=production

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
