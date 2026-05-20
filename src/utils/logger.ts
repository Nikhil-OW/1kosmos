export class Logger {
    private static icons = {
        UI: '🖥️ ',
        API: '📡',
        STEP: '🏁',
        SUCCESS: '✅',
        ERROR: '❌',
        INFO: '💡',
        DATA: '📊',
        WARN: '⚠️'
    };

    static log(category: keyof typeof Logger.icons, action: string, msg: string = '') {
        const timestamp = new Date().toLocaleTimeString();
        const icon = this.icons[category];
        console.log(`[${timestamp}] ${icon} ${action.toUpperCase()}${msg ? `: ${msg}` : ''}`);
    }
}