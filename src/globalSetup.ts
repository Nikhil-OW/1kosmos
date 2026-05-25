import fs from 'fs';
import path from 'path';
import { Logger } from '@utils/logger';

async function globalSetup() {
    const targets = [
        path.join(process.cwd(), 'allure-results'),
        path.join(process.cwd(), 'allure-report')
    ];

    targets.forEach(dirPath => {
        const folderName = path.basename(dirPath);
        Logger.log('INFO', 'SETUP', `Checking path: ${dirPath}`);

        if (fs.existsSync(dirPath)) {
            try {
                fs.rmSync(dirPath, { recursive: true, force: true });
                Logger.log('SUCCESS', 'SETUP', `Old ${folderName} wiped out completely.`);
            } catch (err: any) {
                Logger.log('ERROR', 'SETUP', `Failed to delete ${folderName}: ${err.message}`);
            }
        } else {
            Logger.log('INFO', 'SETUP', `Clean Slate: ${folderName} folder was already empty/clean.`);
        }
    });
}

export default globalSetup;