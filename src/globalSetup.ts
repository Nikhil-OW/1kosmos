import fs from 'fs';
import path from 'path';

async function globalSetup() {
    const targets = [
        path.join(process.cwd(), 'allure-results'),
        path.join(process.cwd(), 'allure-report')
    ];

    targets.forEach(dirPath => {
        const folderName = path.basename(dirPath);
        console.log(`🔍 Checking path: ${dirPath}`);

        if (fs.existsSync(dirPath)) {
            try {
                fs.rmSync(dirPath, { recursive: true, force: true });
                console.log(`✅ SUCCESS: Old ${folderName} wiped out completely.`);
            } catch (err: any) {
                console.log(`❌ FAILED to delete ${folderName}: ${err.message}`);
            }
        } else {
            console.log(`ℹ️ Clean Slate: ${folderName} folder was already empty/clean.`);
        }
    });
}

export default globalSetup;