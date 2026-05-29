import type { Reporter, FullConfig, Suite, FullResult } from '@playwright/test/reporter';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import AdmZip from 'adm-zip';
import { Logger } from './logger';

export class EmailReporter implements Reporter {
    private suite!: Suite;

    onBegin(config: FullConfig, suite: Suite) {
        this.suite = suite;
    }

    async onEnd(result: FullResult) {
        let smtpConfig: any = {};
        const configPath = path.resolve(process.cwd(), 'configs/smtp.json');

        try {
            if (fs.existsSync(configPath)) {
                smtpConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            } else {
                Logger.log('INFO', 'EmailReporter', 'Configuration file configs/smtp.json not found. Skipping report transmission.');
                return;
            }
        } catch (error: any) {
            Logger.log('ERROR', 'EmailReporter', `Failed to read or parse configs/smtp.json: ${error.message}`);
            return;
        }

        const sendReports = smtpConfig.SEND_EMAIL_REPORTS === true;
        if (!sendReports) {
            Logger.log('INFO', 'EmailReporter', 'Email reports are disabled (SEND_EMAIL_REPORTS is not true). Skipping report transmission.');
            return;
        }

        const allTests = this.suite.allTests();
        const passedTests = allTests.filter(t => t.outcome() === 'expected');
        const failedTests = allTests.filter(t => t.outcome() === 'unexpected');
        const skippedTests = allTests.filter(t => t.outcome() === 'skipped');
        const flakyTests = allTests.filter(t => t.outcome() === 'flaky');

        const totalCount = allTests.length;
        const passedCount = passedTests.length;
        const failedCount = failedTests.length;
        const skippedCount = skippedTests.length;
        const flakyCount = flakyTests.length;

        const hasFailures = failedCount > 0;

        // Respect Send Condition: always, on-failure, on-success
        const sendCondition = (smtpConfig.SEND_CONDITION || 'always').toLowerCase();
        let shouldSend = false;

        if (sendCondition === 'always') {
            shouldSend = true;
        } else if (sendCondition === 'on-failure' && hasFailures) {
            shouldSend = true;
        } else if (sendCondition === 'on-success' && !hasFailures) {
            shouldSend = true;
        }

        if (!shouldSend) {
            Logger.log('INFO', 'EmailReporter', `Report delivery skipped because SEND_CONDITION is set to "${sendCondition}" and suite execution status hasFailures is ${hasFailures}.`);
            return;
        }

        Logger.log('API', 'EmailReporter', 'Compiling test execution results for email report...');

        const durationMs = result.duration;
        const durationSec = (durationMs / 1000).toFixed(2);

        // Build HTML Report Body
        const statusText = hasFailures ? 'FAILED' : 'PASSED';
        const themeColor = hasFailures ? '#EF4444' : '#10B981'; // Crimson Red vs Emerald Green
        const headerGradient = hasFailures
            ? 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)'
            : 'linear-gradient(135deg, #059669 0%, #10B981 100%)';

        const emailAttachments: any[] = [];
        let attachmentCounter = 0;

        // 1. Build Passed Tests HTML
        let passedTestsHtml = '';
        if (passedCount > 0) {
            passedTestsHtml = `
                <h3 style="color: #065F46; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin-top: 30px; border-bottom: 2px solid #D1FAE5; padding-bottom: 8px;">Passed Test Cases (${passedCount})</h3>
                <div style="margin-top: 15px;">
            `;
            for (const test of passedTests) {
                const duration = ((test.results[0]?.duration || 0) / 1000).toFixed(2);
                passedTestsHtml += `
                    <div style="background-color: #F0FDF4; border-left: 4px solid #10B981; border-radius: 4px; padding: 12px; margin-bottom: 10px; font-family: 'Segoe UI', Roboto, sans-serif; font-size: 14px; overflow: hidden;">
                        <span style="color: #047857; font-weight: bold; margin-right: 8px;">✓</span>
                        <span style="color: #065F46; font-weight: 600;">${test.title}</span>
                        <span style="color: #6B7280; font-size: 12px; float: right;">${duration}s</span>
                    </div>
                `;
            }
            passedTestsHtml += `</div>`;
        }

        // 3. Build Skipped Tests HTML
        let skippedTestsHtml = '';
        if (skippedCount > 0) {
            skippedTestsHtml = `
                <h3 style="color: #4B5563; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin-top: 30px; border-bottom: 2px solid #E5E7EB; padding-bottom: 8px;">Skipped Test Cases (${skippedCount})</h3>
                <div style="margin-top: 15px;">
            `;
            for (const test of skippedTests) {
                skippedTestsHtml += `
                    <div style="background-color: #F3F4F6; border-left: 4px solid #9CA3AF; border-radius: 4px; padding: 12px; margin-bottom: 10px; font-family: 'Segoe UI', Roboto, sans-serif; font-size: 14px; overflow: hidden;">
                        <span style="color: #6B7280; font-weight: bold; margin-right: 8px;">↷</span>
                        <span style="color: #4B5563; font-weight: 600;">${test.title}</span>
                    </div>
                `;
            }
            skippedTestsHtml += `</div>`;
        }

        // 2. Build Failed Tests HTML with inline screenshots and attach videos
        let failedTestsHtml = '';
        if (hasFailures) {
            failedTestsHtml = `
                <h3 style="color: #DC2626; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin-top: 30px; border-bottom: 2px solid #FEE2E2; padding-bottom: 8px;">Failed Test Case Details (${failedCount})</h3>
                <div style="margin-top: 15px;">
            `;

            for (const test of failedTests) {
                // Get error message if available
                const errors = test.results.flatMap(r => r.errors).map(e => e.message || '').join('\n\n');
                const cleanErrors = errors
                    ? errors.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '') // strip ANSI color codes
                    : 'No detailed error message captured.';

                // Find screenshot & video attachments
                let screenshotPath = '';
                let videoPath = '';

                for (const res of test.results) {
                    for (const att of res.attachments) {
                        if (att.name === 'screenshot' && att.path && fs.existsSync(att.path)) {
                            screenshotPath = att.path;
                        }
                        if (att.name === 'video' && att.path && fs.existsSync(att.path)) {
                            videoPath = att.path;
                        }
                    }
                }

                let inlineScreenshotHtml = '';
                if (screenshotPath) {
                    attachmentCounter++;
                    const cid = `screenshot_${attachmentCounter}`;
                    emailAttachments.push({
                        filename: `screenshot_${attachmentCounter}.png`,
                        path: screenshotPath,
                        cid: cid
                    });
                    inlineScreenshotHtml = `
                        <div style="margin-top: 12px;">
                            <p style="margin: 0 0 6px 0; font-family: 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: bold; color: #4B5563;">Screenshot:</p>
                            <img src="cid:${cid}" alt="Failure Screenshot" style="max-width: 100%; border: 1px solid #E5E7EB; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" />
                        </div>
                    `;
                }

                let videoAttachmentNote = '';
                if (videoPath) {
                    videoAttachmentNote = `
                        <div style="margin-top: 8px; font-family: 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #4B5563; font-style: italic;">
                            🎬 Video recording is embedded in the attached <b>Allure-Test-Report.zip</b> file (extract and open Allure-Test-Report.html).
                        </div>
                    `;
                }

                failedTestsHtml += `
                    <div style="background-color: #FFF5F5; border-left: 4px solid #EF4444; border-radius: 4px; padding: 15px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #991B1B; font-family: 'Segoe UI', Roboto, sans-serif; font-size: 15px;">
                            ❌ ${test.title} <span style="font-weight: normal; color: #7F1D1D; font-size: 12px; margin-left: 10px;">(${test.location.file.split(/[/\\]/).pop()}:${test.location.line})</span>
                        </h4>
                        <pre style="margin: 0; background-color: #1F2937; color: #F9FAFB; padding: 12px; border-radius: 4px; font-family: 'Courier New', Courier, monospace; font-size: 12px; white-space: pre-wrap; overflow-x: auto;">${cleanErrors}</pre>
                        ${inlineScreenshotHtml}
                        ${videoAttachmentNote}
                    </div>
                `;
            }
            failedTestsHtml += `</div>`;
        }


        const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Test Execution Report</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #F3F4F6; -webkit-text-size-adjust: 100%;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F3F4F6; padding: 20px 0;">
                <tr>
                    <td align="center">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #FFFFFF; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); overflow: hidden;">
                            <!-- Header -->
                            <tr>
                                <td style="background: ${headerGradient}; padding: 30px 40px; text-align: center;">
                                    <h1 style="margin: 0; color: #FFFFFF; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">
                                        Test Suite Execution: ${statusText}
                                    </h1>
                                    <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-family: 'Segoe UI', Roboto, sans-serif; font-size: 14px;">
                                        1Kosmos Authentication Journey Automation Reports
                                    </p>
                                </td>
                            </tr>
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px 40px 30px 40px;">
                                    <!-- Stats Grid -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                                        <tr>
                                            <td width="30%" align="center" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 15px;">
                                                <div style="font-family: 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; color: #4B5563; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Total</div>
                                                <div style="font-family: 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #1F2937;">${totalCount}</div>
                                            </td>
                                            <td width="5%"></td>
                                            <td width="30%" align="center" style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 15px;">
                                                <div style="font-family: 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; color: #065F46; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Passed</div>
                                                <div style="font-family: 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: #047857;">${passedCount}</div>
                                            </td>
                                            <td width="5%"></td>
                                            <td width="30%" align="center" style="background-color: ${hasFailures ? '#FEF2F2' : '#F9FAFB'}; border: 1px solid ${hasFailures ? '#FCA5A5' : '#E5E7EB'}; border-radius: 6px; padding: 15px;">
                                                <div style="font-family: 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; color: ${hasFailures ? '#991B1B' : '#4B5563'}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px;">Failed</div>
                                                <div style="font-family: 'Segoe UI', Roboto, sans-serif; font-size: 24px; font-weight: 700; color: ${hasFailures ? '#B91C1C' : '#1F2937'};">${failedCount}</div>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Details List -->
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #374151; margin-bottom: 20px;">
                                        <tr>
                                            <td style="padding: 6px 0; font-weight: 600; color: #4B5563;" width="40%">Duration:</td>
                                            <td style="padding: 6px 0; color: #1F2937;">${durationSec} seconds</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 6px 0; font-weight: 600; color: #4B5563;">Flaky Tests:</td>
                                            <td style="padding: 6px 0; color: #1F2937;">${flakyCount}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 6px 0; font-weight: 600; color: #4B5563;">Skipped Tests:</td>
                                            <td style="padding: 6px 0; color: #1F2937;">${skippedCount}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 6px 0; font-weight: 600; color: #4B5563;">Overall Result Status:</td>
                                            <td style="padding: 6px 0; font-weight: bold; color: ${themeColor};">${result.status.toUpperCase()}</td>
                                        </tr>
                                    </table>

                                    <!-- Passed Test Details -->
                                    ${passedTestsHtml}

                                    <!-- Skipped Test Details -->
                                    ${skippedTestsHtml}

                                    <!-- Failed Test Blocks -->
                                    ${failedTestsHtml}
                                </td>
                            </tr>
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #F9FAFB; padding: 25px 40px; border-top: 1px solid #E5E7EB; text-align: center;">
                                    <p style="margin: 0; font-family: 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #9CA3AF;">
                                        This email report was automatically generated and sent by Playwright Test Runner.
                                    </p>
                                    <p style="margin: 5px 0 0 0; font-family: 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #D1D5DB;">
                                        SMTP configuration loaded from <code>configs/smtp.json</code>.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `;

        // Generate single-file Allure report programmatically
        try {
            Logger.log('API', 'EmailReporter', 'Compiling Allure report into a single standalone HTML file...');

            // Clean up large trace zip files from allure-results before generating report
            // to keep the base64-encoded single-file report within Gmail/SMTP limits (25MB).
            const allureResultsDir = path.resolve(process.cwd(), 'allure-results');
            if (fs.existsSync(allureResultsDir)) {
                const files = fs.readdirSync(allureResultsDir);
                let removedCount = 0;
                for (const file of files) {
                    if (file.endsWith('.zip')) {
                        try {
                            fs.unlinkSync(path.join(allureResultsDir, file));
                            removedCount++;
                        } catch (err: any) {
                            Logger.log('WARN', 'EmailReporter', `Failed to delete trace file ${file}: ${err.message}`);
                        }
                    }
                }
                if (removedCount > 0) {
                    Logger.log('INFO', 'EmailReporter', `Removed ${removedCount} trace .zip file(s) from allure-results to optimize report size.`);
                }
            }

            const targetDir = path.resolve(process.cwd(), 'test-results/allure-report-single');
            
            // Ensure target directory exists
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            Logger.log('INFO', 'EmailReporter', `Running Allure compiler to output folder: ${targetDir}`);
            execSync(`npx allure generate allure-results --single-file -o "${targetDir}" --clean`, { stdio: 'ignore' });
            Logger.log('SUCCESS', 'EmailReporter', 'Allure report compilation completed.');

            const allureReportPath = path.join(targetDir, 'index.html');
            if (fs.existsSync(allureReportPath)) {
                const originalSize = fs.statSync(allureReportPath).size;
                const originalSizeMB = (originalSize / (1024 * 1024)).toFixed(2);
                
                Logger.log('INFO', 'EmailReporter', `Raw report file size: ${originalSizeMB} MB`);
                Logger.log('INFO', 'EmailReporter', 'Compressing HTML report into a ZIP file...');

                const zip = new AdmZip();
                // Add the file index.html inside the zip and name it 'Allure-Test-Report.html'
                zip.addLocalFile(allureReportPath, '', 'Allure-Test-Report.html');
                
                const zipOutputPath = path.join(targetDir, 'Allure-Test-Report.zip');
                zip.writeZip(zipOutputPath);

                if (fs.existsSync(zipOutputPath)) {
                    const compressedSize = fs.statSync(zipOutputPath).size;
                    const compressedSizeMB = (compressedSize / (1024 * 1024)).toFixed(2);
                    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

                    Logger.log('SUCCESS', 'EmailReporter', `Successfully compressed report to ZIP: ${compressedSizeMB} MB (Reduced by ${reduction}%).`);
                    
                    emailAttachments.push({
                        filename: 'Allure-Test-Report.zip',
                        path: zipOutputPath
                    });
                } else {
                    Logger.log('WARN', 'EmailReporter', 'Compression completed but ZIP output file not found. Falling back to raw HTML.');
                    emailAttachments.push({
                        filename: 'Allure-Test-Report.html',
                        path: allureReportPath
                    });
                }
            } else {
                Logger.log('WARN', 'EmailReporter', 'Allure report file index.html not found after generation.');
            }
        } catch (err: any) {
            Logger.log('ERROR', 'EmailReporter', `Failed to programmatically compile and compress Allure report: ${err.message}`);
        }

        // Send Email using Nodemailer
        try {
            const host = smtpConfig.SMTP_HOST;
            const port = parseInt(smtpConfig.SMTP_PORT || '587', 10);
            const secure = smtpConfig.SMTP_SECURE === true;
            const user = smtpConfig.SMTP_USER;
            const pass = smtpConfig.SMTP_PASS;
            const from = smtpConfig.SMTP_FROM || '"Playwright Runner" <noreply@playwright.net>';
            let to = smtpConfig.SMTP_TO || 'admin@localhost.localdomain';

            // Support multiple recipients either as a comma-separated string or an array of strings
            if (Array.isArray(to)) {
                to = to.join(', ');
            }

            if (!host || !user || !pass) {
                Logger.log('WARN', 'EmailReporter', 'SMTP configuration details (host/user/pass) are missing in configs/smtp.json. Email sending skipped.');
                return;
            }

            Logger.log('INFO', 'EmailReporter', `Initializing SMTP transport client for ${host}:${port}...`);
            const transporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: {
                    user,
                    pass
                },
                connectionTimeout: 20000, // 20 seconds
                greetingTimeout: 20000,
                socketTimeout: 30000
            });

            const mailOptions = {
                from,
                to,
                subject: `[Playwright Report] 1Kosmos Auth Journey - Status: ${statusText}`,
                html: emailHtml,
                attachments: emailAttachments
            };

            Logger.log('INFO', 'EmailReporter', `Sending email report to: ${to}...`);
            Logger.log('INFO', 'EmailReporter', `Attachment details: ${JSON.stringify(emailAttachments.map(a => ({ filename: a.filename, path: a.path })))}`);
            
            const startTime = Date.now();
            const info = await transporter.sendMail(mailOptions);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            
            Logger.log('SUCCESS', 'EmailReporter', `Test execution report successfully sent via email in ${duration} seconds! Message ID: ${info.messageId}`);
        } catch (error: any) {
            Logger.log('ERROR', 'EmailReporter', `Failed to transmit email report: ${error.message}`);
        }
    }
}

export default EmailReporter;
