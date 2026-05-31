const router = require('./router');

exports.attach = function(app) {
    if (!app || typeof app.use !== 'function') {
        console.warn('[mailconfig] Could not resolve Express application routing stream.');
        return;
    }

    // Mount the panel routes seamlessly onto Ghost's Express engine pipeline
    app.use('/mailconfig', router);
    
    console.log('\n==================================================');
    console.log('mailconfig: Panel live at /mailconfig');
    console.log('==================================================\n');
};