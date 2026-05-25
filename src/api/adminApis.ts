import { APIRequestContext } from '@playwright/test';
import { HttpClients } from './httpClients';
import type { RuntimeConfig } from '@config/runtimeConfig';
import { Logger } from '@utils/logger';
import crypto from 'crypto';
import { DataGenerator } from '@utils/dataGenerator';

export interface CommunityAuthInfoResponse {
    tenantId: string;
    communityId: string;
    [key: string]: unknown;
}

export interface EncryptedAdminAuthPayloads {
    encRequestId: string;
    encLicenseKey: string;
    encPayload: string;
}

export class AdminApis {
    constructor(
        private readonly request: APIRequestContext,
        private readonly config: RuntimeConfig
    ) { }

    async encryptOrDecryptUsingCaas(data: any, servicePublicKey: string, privateKey: string, action: 'encrypt' | 'decrypt' = 'encrypt'): Promise<any> {
        const endPoint = `${this.config.caasUrl}/ecdsa_helper/${action}`.replace(/([^:]\/)\/+/g, "$1");
        const payload = {
            dataStr: action === 'encrypt' ? (typeof data === 'string' ? data : JSON.stringify(data)) : data,
            publicKey: servicePublicKey,
            privateKey: privateKey
        };

        const client = new HttpClients(this.request);
        const response = await client.post<any>(endPoint, payload);

        if (response.status !== 200) {
            throw new Error(`${action.toUpperCase()} failed with status ${response.status}: ${response.data?.message || 'Unknown error'}`);
        }

        const result = response.data.data;

        if (action === 'decrypt') {
            try {
                return typeof result === 'string' ? JSON.parse(result) : result;
            } catch (e) {
                return result;
            }
        }
        return result;
    }

    async generateRequestId(): Promise<any> {
        return {
            ts: Math.floor(Date.now() / 1000),
            appid: "playwright-automation",
            uuid: crypto.randomUUID()
        };
    }

    async fetchServicePublicKeyUsingAdminApi(tag?: string): Promise<string | undefined> {
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (tag) headers["X-TenantTag"] = tag;

            const keyUrl = `${this.config.adminApiUrl}/publickeys`.replace(/([^:]\/)\/+/g, "$1");
            Logger.log('INFO', 'SUCCESS', `Generating request to fetch service public key from Admin API at ${keyUrl}`);
            const response = await this.request.get(keyUrl, { headers });

            if (!response.ok()) {
                Logger.log('ERROR', 'SERVICE', `❌ Failed to fetch server public key: ${response.status()}`);
                return undefined;
            }

            const result = await response.json();
            return result.publicKey;
        } catch (error) {
            Logger.log('ERROR', 'SERVICE', `❌ Error fetching server public key: ${error}`);
            return undefined;
        }
    }

    async communityAuthInfo(dns: string, communityName: string): Promise<CommunityAuthInfoResponse> {
        const endpoint = `${this.config.adminApiUrl}/community_auth_info/fetch`.replace(/([^:]\/)\/+/g, "$1");

        const privateKey = this.config.privateKey;
        const servicePublicKey = await this.fetchServicePublicKeyUsingAdminApi();
        if (!servicePublicKey) throw new Error("FAILED: Service public key missing.");

        const rawRequestId = await this.generateRequestId();
        const payload = { dns, communityName };

        const [enc_request_id, enc_data] = await Promise.all([
            this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey),
            this.encryptOrDecryptUsingCaas(payload, servicePublicKey, privateKey)
        ]);

        const client = new HttpClients(this.request, {
            'Content-Type': 'application/json',
            'publickey': this.config.publicKey,
            'requestid': enc_request_id
        });

        Logger.log('API', `FETCH_AUTH_INFO -> DNS: ${dns} | Community: ${communityName}`);

        try {
            const response = await client.post<any>(endpoint, { data: enc_data });

            if (response.status !== 200) {
                throw new Error(`AdminAPI Error ${response.status}: ${JSON.stringify(response.data)}`);
            }

            const decryptedJson = await this.encryptOrDecryptUsingCaas(response.data.data, servicePublicKey, privateKey, 'decrypt');
            const tenantId = decryptedJson.tenant?.id;
            const communityId = decryptedJson.community?.id;

            if (!tenantId || !communityId) {
                throw new Error("IDs missing in decrypted response structure.");
            }

            this.config.tenantId = tenantId;
            this.config.communityId = communityId;
            this.config.communityPublicKey = decryptedJson.community?.publicKey;
            Logger.log('SUCCESS', `Global Config Updated | Tenant: ${tenantId} | Community: ${communityId} | CommunityPubKey: ${this.config.communityPublicKey}`);

            return { tenantId, communityId };

        } catch (err: any) {
            Logger.log('ERROR', `communityAuthInfo Failed: ${err.message}`);
            throw err;
        }
    }

    async generateAndCaptureOtp(username: string, previousOtp?: string): Promise<string> {
        const servicePublicKey = await this.fetchAdminConsoleServicePublicKey();
        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for OTP generation.");
        }

        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;
        const rawRequestId = await this.generateRequestId();

        const [encRequestId, encLicenseKey] = await Promise.all([
            this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
            this.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt')
        ]);

        const endpoint = `https://${this.config.dns}/api/r2/otp/generate`.replace(/([^:]\/)\/+/g, "$1");

        const client = new HttpClients(this.request, {
            'Content-Type': 'application/json',
            'publickey': this.config.publicKey,
            'requestid': encRequestId,
            'licensekey': encLicenseKey
        });

        const requestBody = {
            userId: username,
            isCycleTimeRequired: true,
            communityId: this.config.communityId,
            tenantId: this.config.tenantId,
            trace: true
        };

        Logger.log('API', `GENERATE_OTP -> User: ${username} | Tenant: ${this.config.tenantId}`);

        try {
            const response = await client.post<any>(endpoint, requestBody);

            if (response.status === 429) {
                const backoff = response.data?.retryAfterSeconds || 5;
                Logger.log('ERROR', `OTP_RATE_LIMIT -> Sleeping for fallback period: ${backoff}s`);
                await new Promise(resolve => setTimeout(resolve, backoff * 1000));
                return this.generateAndCaptureOtp(username, previousOtp);
            }

            if (response.status !== 202 && response.status !== 200) {
                throw new Error(`OTP API Error ${response.status}: ${JSON.stringify(response.data)}`);
            }

            const encryptedEnvelope = response.data?.data;
            if (!encryptedEnvelope) {
                throw new Error("Response envelope missing target 'data' signature block.");
            }

            const decryptedResponse = await this.encryptOrDecryptUsingCaas(encryptedEnvelope, servicePublicKey, privateKey, 'decrypt');
            const otpCode = decryptedResponse?.code;
            const secondsRemaining = decryptedResponse?.secondsRemaining || 0;

            if (!otpCode) {
                throw new Error("OTP text code missing from decrypted service data stream.");
            }

            if (previousOtp && otpCode === previousOtp && secondsRemaining > 0) {
                Logger.log('WARN', `Interceptors picked up an identical active OTP: ${otpCode}. Waiting ${secondsRemaining}s before recycling generation steps.`);
                await new Promise(resolve => setTimeout(resolve, secondsRemaining * 1000));
                return this.generateAndCaptureOtp(username, previousOtp);
            }

            Logger.log('SUCCESS', `OTP Intercepted Successfully: ${otpCode} (Valid for ${secondsRemaining}s)`);
            return otpCode;

        } catch (err: any) {
            Logger.log('ERROR', `generate And Capture Otp Operation Flow Failure: ${err.message}`);
            throw err;
        }
    }

    async prepareAdminAuthEncryptedPayloadsAndKeys(username: string, userPassword?: string): Promise<EncryptedAdminAuthPayloads> {
        Logger.log('INFO', 'SUCCESS', `Starting encryption setup for User: ${username}`);
        const servicePublicKey = await this.fetchServicePublicKeyUsingAdminApi();
        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for admin authentication setup.");
        }

        const rawRequestId = await this.generateRequestId();
        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;

        const authPayload = {
            tenantId: this.config.tenantId,
            communityId: this.config.communityId,
            username: username,
            password: userPassword || "1Kosmos123$"
        };

        try {
            const [encRequestId, encLicenseKey, encPayload] = await Promise.all([
                this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(authPayload, servicePublicKey, privateKey, 'encrypt')
            ]);

            Logger.log('SUCCESS', `Successfully encrypted requestId, license key, and authentication payload.`);

            return {
                encRequestId,
                encLicenseKey,
                encPayload
            };

        } catch (error: any) {
            Logger.log('ERROR', `prepareAdminAuthPayloads failed executing CaaS cycles: ${error.message}`);
            throw error;
        }
    }

    async authenticateWithPasswordForInitialJWT(username: string, userPassword?: string): Promise<{ jwt: string; refreshToken?: string }> {
        const endpoint = `${this.config.adminApiUrl}/v2/request_access`;

        Logger.log('API', `AUTH_PASSWORD -> User: ${username} | Tenant: ${this.config.tenantId}`);

        const { encRequestId, encLicenseKey, encPayload } = await this.prepareAdminAuthEncryptedPayloadsAndKeys(username, userPassword);

        const servicePublicKey = await this.fetchServicePublicKeyUsingAdminApi();
        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for password authentication decryption.");
        }

        const client = new HttpClients(this.request, {
            'Content-Type': 'application/json',
            'publickey': this.config.publicKey,
            'requestid': encRequestId,
            'licensekey': encLicenseKey
        });

        try {
            const response = await client.post<any>(endpoint, { data: encPayload });

            if (response.status !== 200) {
                throw new Error(`authenticateWithPasswordForInitialJWT Failed with status ${response.status}: ${JSON.stringify(response.data)}`);
            }

            const encryptedDataResponse = response.data?.data;
            if (!encryptedDataResponse) {
                throw new Error("Invalid payload structure: data block missing in password auth response.");
            }

            const privateKey = this.config.privateKey;
            Logger.log('INFO', 'SUCCESS', `Decrypting Phase 1 tokens via CaaS...`);
            const decryptedResponse = await this.encryptOrDecryptUsingCaas(encryptedDataResponse, servicePublicKey, privateKey, 'decrypt');

            const jwt = decryptedResponse?.jwt;
            const refreshToken = decryptedResponse?.refreshToken;

            if (!jwt) {
                throw new Error("Failed to extract initial JWT from decrypted password auth payload.");
            }

            Logger.log('SUCCESS', `Phase 1 Authentication Successful. Initial JWT obtained.`);

            return { jwt, refreshToken };

        } catch (err: any) {
            Logger.log('ERROR', `authenticateWithPasswordForInitialJWT Execution Failed: ${err.message}`);
            throw err;
        }
    }

    async fetchAdminConsoleServicePublicKey(tag?: string): Promise<string | undefined> {
        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "X-TenantTag": this.config.clientTenantTag || "1kosmos"
            };
            const keyUrl = `https://${this.config.dns}/api/r1/community/${this.config.communityName}/publickeys`.replace(/([^:]\/)\/+/g, "$1");

            Logger.log('INFO', 'SUCCESS', `Generating request to fetch console service public key at ${keyUrl}`);
            const response = await this.request.get(keyUrl, { headers });

            if (!response.ok()) {
                const errorText = await response.text();
                Logger.log('ERROR', 'SERVICE', `❌ Failed to fetch OTP server public key: ${response.status()} - ${errorText}`);
                return undefined;
            }

            const result = await response.json();
            return result.publicKey;
        } catch (error) {
            Logger.log('ERROR', 'SERVICE', `❌ Error fetching OTP server public key: ${error}`);
            return undefined;
        }
    }

    async authenticateJwtWithOtp(username: string, initialJwt: string, otp: string): Promise<string> {
        const endpoint = `${this.config.adminApiUrl}/v2/request_access`;
        Logger.log('API', 'STEP', `Finalizing authentication for user: ${username}`);
        const servicePublicKey = await this.fetchServicePublicKeyUsingAdminApi();
        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for final authentication step.");
        }

        const rawRequestId = await this.generateRequestId();
        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;

        const otpPayload = {
            tenantId: this.config.tenantId,
            communityId: this.config.communityId,
            username: String(username),
            web_otp: otp
        };

        try {
            const [encRequestId, encLicenseKey, encPayload, encJwt] = await Promise.all([
                this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(otpPayload, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(initialJwt, servicePublicKey, privateKey, 'encrypt')
            ]);

            const client = new HttpClients(this.request, {
                'Content-Type': 'application/json',
                'publickey': this.config.publicKey,
                'requestid': encRequestId,
                'licensekey': encLicenseKey,
                'Authorization': `Bearer ${encJwt}`
            });

            const response = await client.post<any>(endpoint, { data: encPayload });

            if (response.status !== 200) {
                throw new Error(`authenticateJwtWithOtp Failed [${response.status}]: ${JSON.stringify(response.data)}`);
            }

            const encryptedData = response.data?.data;
            if (!encryptedData) {
                throw new Error("Data block missing in final authentication response.");
            }

            Logger.log('INFO', 'SUCCESS', `Decrypting final authenticated JWT...`);
            const decrypted = await this.encryptOrDecryptUsingCaas(encryptedData, servicePublicKey, privateKey, 'decrypt');

            const finalJwt = decrypted?.jwt;
            if (!finalJwt) {
                throw new Error("Final authenticated JWT could not be extracted from decrypted response.");
            }

            Logger.log('SUCCESS', `Authentication complete! Final JWT obtained.`);
            return finalJwt;

        } catch (err: any) {
            Logger.log('ERROR', 'API', `authenticateJwtWithOtp Execution Failed: ${err.message}`);
            throw err;
        }
    }

    async createAccessCode(): Promise<string> {
        Logger.log('API', 'STEP', 'Starting encryption setup for access code generation.');

        const endpoint = `https://${this.config.dns}/api/r2/acr/community/${this.config.communityName}/code`;

        const servicePublicKey = await this.fetchAdminConsoleServicePublicKey();
        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for final authentication step.");
        }

        const rawRequestId = await this.generateRequestId();
        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;

        const accessCodePayload = {
            userId: this.config.userUsername,
            firstname: this.config.userFirstname || '',
            lastname: this.config.userLastname || '',
            emailTo: this.config.userEmail || '',
            smsTo: this.config.userEmail || '',
            uid: this.config.userUid,
            createdby: 'cadmin',
            createdbyemail: 'nikhil_yop@yopmail.com',
            authModuleId: this.config.userModuleId,
            dns: this.config.dns
        };

        try {
            const [encRequestId, encLicenseKey, encPayload] = await Promise.all([
                this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(accessCodePayload, servicePublicKey, privateKey, 'encrypt')
            ]);

            Logger.log('SUCCESS', 'Successfully generated encrypted request credentials for access code creation.');

            const client = new HttpClients(this.request, {
                'Content-Type': 'application/json',
                'publickey': this.config.publicKey,
                'requestid': encRequestId,
                'licensekey': encLicenseKey,
                'X-TenantTag': this.config.clientTenantTag
            });

            const response = await client.put<any>(endpoint, { data: encPayload });

            if (response.status !== 200 && response.status !== 201) {
                throw new Error(`Access Code API call returned invalid status [${response.status}]: ${JSON.stringify(response.data)}`);
            }

            const jsonData = response.data;
            const actualData = jsonData.data ? jsonData.data : jsonData;

            if (!actualData || !actualData.code) {
                throw new Error(`Access Code text missing from response body. Received: ${JSON.stringify(jsonData)}`);
            }

            const accessCode = actualData.code;
            this.config.accessCode = accessCode;
            Logger.log('SUCCESS', `Access code created: ${accessCode}`);
            return accessCode;
        } catch (error: any) {
            Logger.log('ERROR', 'API', `prepareAccessCode workflow cycle failed: ${error.message}`);
            throw error;
        }
    }

    async redeemAccessCode(username: string, accessCode: string): Promise<any> {
        const endpoint = `https://${this.config.dns}/api/r1/acr/community/${this.config.communityName}/${accessCode}/redeem`;

        const device = DataGenerator.getVirtualDeviceDetails();

        Logger.log('API', 'STEP', `Redeeming Access Code: ${accessCode} for Device: ${device.did}`);

        const servicePublicKey = await this.fetchAdminConsoleServicePublicKey();
        if (!servicePublicKey)
            throw new Error("FAILED: Admin Console service public key missing.");

        const rawRequestId = await this.generateRequestId();
        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;

        const redeemPayload = {
            code: accessCode,
            userPublicKey: device.publicKey,
            password: '',
            userId: username
        };

        const eventData = {
            authenticator_id: 'com.onekosmos.kernel.blockid',
            authenticator_name: 'BlockID',
            authenticator_os: 'iOS',
            authenticator_version: '1.10.93.67AC471E',
            device_id: device.device_id,
            device_make: device.device_name,
            device_model: device.device_name,
            device_name: device.device_name,
            license_hash: '485a4592896616e3f422a7ded89a3e381f6ad2943f3302571a53282ef14c6ff7',
            os: 'iOS',
            os_version: '17',
            person_ial: 'IAL1',
            person_id: device.did,
            person_publickey: device.publicKey,
            user_agent: 'Playwright Automation',
            user_ial: '',
            user_lat: '0.0',
            user_lon: '0.0'
        };

        try {
            const [encReqId, encLicense, encData, encEvent] = await Promise.all([
                this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(redeemPayload, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(eventData, servicePublicKey, privateKey, 'encrypt')
            ]);

            const client = new HttpClients(this.request, {
                'Content-Type': 'application/json',
                'publickey': this.config.publicKey,
                'requestid': encReqId,
                'licensekey': encLicense,
                'X-TenantTag': this.config.clientTenantTag
            });

            const requestBody = {
                data: encData,
                eventData: encEvent,
                did: device.did,
                os: "ios",
                provider: "apple",
                pushid: device.pushId || '',
                ial: "IAL1"
            };

            const response = await client.post<any>(endpoint, requestBody);
            if (response.status !== 200) {
                throw new Error(`Redeem Access Code failed [${response.status}]: ${JSON.stringify(response.data)}`);
            }

            Logger.log('SUCCESS', 'Device linked successfully via access code redeem');
            return response.data;

        } catch (err: any) {
            Logger.log('ERROR', 'API', `redeemAccessCode failed: ${err.message}`);
            throw err;
        }
    }

    async createAuthenticationSession(username: string, authMode: 'push' | 'qr'): Promise<string> {
        const jwt = this.authenticateWithPasswordForInitialJWT(username);
        const endpoint = `${this.config.adminApiUrl}/session/new`;
        const servicePublicKey = await this.fetchServicePublicKeyUsingAdminApi();

        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for authentication step.");
        }

        Logger.log('API', 'STEP', `Starting ${authMode.toUpperCase()} session creation pipeline.`);

        const rawRequestId = await this.generateRequestId();
        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;

        const payload = {
            tenantId: this.config.tenantId,
            communityId: this.config.communityId,
            tag: this.config.clientTenantTag || this.config.communityName,
            url: `https://${this.config.dns}`,
            communityName: this.config.communityName,
            authPage: 'blockid://authenticate',
            scopes: 'firstname,lastname,device_info,location',
            authtype: 'Fingerprint/Face',
            metadata: {
                authVia: `${authMode}`,
                purpose: 'authentication',
                username: `${username}`
            }
        };

        try {
            const [encRequestId, encLicenseKey, encJWT, encPayload] = await Promise.all([
                this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(jwt, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(payload, servicePublicKey, privateKey, 'encrypt')
            ]);

            Logger.log('SUCCESS', `Successfully encrypted request credentials for ${authMode} session.`);

            const client = new HttpClients(this.request, {
                'Content-Type': 'application/json',
                'publickey': this.config.publicKey,
                'requestid': encRequestId,
                'licensekey': encLicenseKey,
                'Authorization': `Bearer ${encJWT}`
            });

            const response = await client.put<any>(endpoint, { data: encPayload });

            if (response.status !== 200 && response.status !== 201) {
                throw new Error(`${authMode.toUpperCase()} Session API returned status [${response.status}]: ${JSON.stringify(response.data)}`);
            }

            const responseData = response.data;
            let decryptedData: any = null;

            if (responseData && responseData.data) {
                const decryptionResult = await this.encryptOrDecryptUsingCaas(responseData.data, servicePublicKey, privateKey, 'decrypt');
                decryptedData = typeof decryptionResult === 'string' ? JSON.parse(decryptionResult) : decryptionResult;
            } else {
                decryptedData = responseData;
            }

            if (!decryptedData || (!decryptedData.sessionId && !responseData.sessionId)) {
                throw new Error(`Session metadata properties missing from response. Received: ${JSON.stringify(responseData)}`);
            }

            const sessionId = decryptedData.sessionId || responseData.sessionId || '';
            const sessionUrl = decryptedData.sessionUrl || responseData.sessionUrl || '';
            const sessionPublicKey = decryptedData.publicKey || responseData.publicKey || servicePublicKey;

            this.config.sessionId = sessionId;
            this.config.sessionUrl = sessionUrl;
            this.config.sessionPublicKey = sessionPublicKey;

            Logger.log('SUCCESS', `${authMode.toUpperCase()} session created. ID: ${sessionId}`);
            return sessionId;

        } catch (error: any) {
            Logger.log('ERROR', 'API', `createAuthSession workflow failed for ${authMode}: ${error.message}`);
            throw error;
        }
    }

    async authenticateSession(username: string, authMode: 'push' | 'qr' = 'push'): Promise<any> {
        Logger.log('API', 'STEP', `Starting ${authMode} session authentication setup.`);

        const device = DataGenerator.getVirtualDeviceDetails() || this.config.device1;
        if (!device) {
            throw new Error("ERROR: Valid device properties not found in execution context.");
        }

        this.config.deviceDid = device.did;
        this.config.devicePublicKey = device.publicKey;

        const sessionPublicKey = this.config.sessionPublicKey;
        const sessionId = this.config.sessionId;

        if (!sessionId || !sessionPublicKey) {
            throw new Error("FAILED: Active sessionId or sessionPublicKey missing from context configuration.");
        }

        const endpoint = `https://${this.config.dns}/sessions/session/${sessionId}/authenticate`;

        const authPayload = {
            userid: `${username}`,
            account: {
                authModuleId: this.config.userModuleId,
                communityId: this.config.communityId,
                tenantId: this.config.tenantId,
                source: 'athena',
                username: `${username}`,
                uid: this.config.userUid,
                dguid: this.config.userDguid || '',
                urn: this.config.userUrn || ''
            },
            location: { lat: 17.53286, lon: 78.2979741 },
            device_info: {
                device_name: device.device_name,
                device_os: '13',
                deviceid: device.device_id,
                user_agent: `Playwright ${authMode === 'push' ? 'Push' : 'QR'} Automation`
            },
            did: device.did
        };

        const eventData = {
            authenticator_id: 'com.onekosmos.kernel.blockid',
            authenticator_name: 'BlockID',
            authenticator_os: device.os || 'ios',
            authenticator_version: '1.10.93.67AC471E',
            device_id: device.device_id,
            device_name: device.device_name,
            license_hash: '485a4592896616e3f422a7ded89a3e381f6ad2943f3302571a53282ef14c6ff7',
            person_ial: 'IAL1',
            person_id: device.did,
            person_publickey: device.publicKey,
            user_agent: `Playwright ${authMode === 'push' ? 'Push' : 'QR'} Automation`,
            user_ial: '',
            user_lat: '17.5323605',
            user_lon: '78.3020806'
        };

        try {
            Logger.log('API', 'INFO', `Encrypting ${authMode} authentication payloads...`);

            const [encAuthPayload, encEventData] = await Promise.all([
                this.encryptOrDecryptUsingCaas(authPayload, sessionPublicKey, device.privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(eventData, sessionPublicKey, device.privateKey, 'encrypt')
            ]);

            const finalRequestPayload = {
                data: encAuthPayload,
                eventData: encEventData,
                did: device.did,
                publicKey: device.publicKey,
                ial: 'IAL1',
                lat: '17.532372',
                lon: '78.3020333',
                appid: 'com.onekosmos.kernel.blockid'
            };

            const client = new HttpClients(this.request, {
                'Content-Type': 'application/json',
                'X-TenantTag': this.config.clientTenantTag || ''
            });

            const response = await client.post<any>(endpoint, finalRequestPayload);

            if (response.status !== 200 && response.status !== 201) {
                throw new Error(`${authMode.toUpperCase()} Authentication API call returned invalid status [${response.status}]: ${JSON.stringify(response.data)}`);
            }

            const jsonData = response.data;
            const actualData = jsonData.data ? jsonData.data : jsonData;

            Logger.log('SUCCESS', `${authMode.toUpperCase()} session successfully authenticated. Response ID: ${actualData.id || actualData.sessionId}`);
            return actualData;

        } catch (error: any) {
            Logger.log('ERROR', 'API', `authenticateSession workflow cycle aborted for ${authMode}: ${error.message}`);
            throw error;
        }
    }

    async pollRequestAccess(maxAttempts = 10, initialJwt: string): Promise<string> {
        Logger.log('API', 'STEP', 'Starting request access polling workflow loop.');

        let baseUrl = this.config.adminApiUrl;
        const endpoint = `${baseUrl}/v2/request_access`;
        const servicePublicKey = await this.fetchServicePublicKeyUsingAdminApi();

        const privateKey = this.config.privateKey;
        const rawRequestId = await this.generateRequestId();

        if (!servicePublicKey || !privateKey) {
            throw new Error("FAILED: Required keys (servicePublicKey or privateKey) missing from context config.");
        }

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const waitMs = attempt === 1 ? 3000 : 2000;
            Logger.log('API', 'INFO', `Poll attempt ${attempt}/${maxAttempts} - sleeping for ${waitMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));

            const accessPayload = {
                tenantId: this.config.tenantId,
                communityId: this.config.communityId,
                uwlSessionId: this.config.sessionId
            };

            try {
                const [encRequestId, encLicenseKey, encPayload, encJWT] = await Promise.all([
                    this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                    this.encryptOrDecryptUsingCaas(this.config.licenseKey, servicePublicKey, privateKey, 'encrypt'),
                    this.encryptOrDecryptUsingCaas(accessPayload, servicePublicKey, privateKey, 'encrypt'),
                    this.encryptOrDecryptUsingCaas(initialJwt, servicePublicKey, privateKey, 'encrypt')
                ]);

                const client = new HttpClients(this.request, {
                    'Content-Type': 'application/json',
                    'publickey': this.config.publicKey,
                    'requestid': encRequestId,
                    'licensekey': encLicenseKey,
                    'Authorization': `Bearer ${encJWT}`
                });

                const response = await client.post<any>(endpoint, { data: encPayload });
                const responseData = response.data;

                if (response.status === 500 || (responseData && responseData.code === 500) || responseData?.recommendation === 'continue polling') {
                    Logger.log('API', 'WARN', `Session processing or not ready yet on attempt ${attempt}/10. Status: 500. Retrying next cycle...`);
                    continue;
                }

                if (response.status !== 200 && response.status !== 201) {
                    throw new Error(`Unexpected endpoint response status [${response.status}]: ${JSON.stringify(responseData)}`);
                }

                let decryptedData: any = null;
                if (responseData && responseData.data) {
                    Logger.log('API', 'INFO', 'Encrypted data detected in polling payload. Invoking decryption...');
                    const decryptionResult = await this.encryptOrDecryptUsingCaas(responseData.data, servicePublicKey, privateKey, 'decrypt');
                    decryptedData = typeof decryptionResult === 'string' ? JSON.parse(decryptionResult) : decryptionResult;
                } else {
                    decryptedData = responseData;
                }

                const authenticatedJwt = decryptedData?.jwt || decryptedData?.access_token || decryptedData?.data?.jwt;
                if (!authenticatedJwt) {
                    throw new Error(`Target token fields missing from decrypted payload context: ${JSON.stringify(decryptedData)}`);
                }

                this.config.authenticatedJwt = authenticatedJwt;
                Logger.log('SUCCESS', 'Push Authentication complete! Final authenticated JWT captured.');
                return authenticatedJwt;

            } catch (error: any) {
                Logger.log('ERROR', 'API', `Polling pipeline exception thrown on attempt ${attempt}: ${error.message}`);
                if (attempt === maxAttempts) throw error;
            }
        }
        throw new Error(`Session authorization timeout context: Push authentication failed after ${maxAttempts} execution cycles.`);
    }

    async unlinkUserDevice(username: string, jwtToken: string): Promise<any> {
        Logger.log('API', 'UNLINK', `Requesting authentication method login options unlink device for user: ${username}`);

        const endpoint = `${this.config.adminApiUrl}/users/unlinkuser`;
        const servicePublicKey = await this.fetchServicePublicKeyUsingAdminApi();

        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for authentication step.");
        }

        const rawRequestId = await this.generateRequestId();
        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;

        const device = DataGenerator.getVirtualDeviceDetails() || this.config.device1;
        const deviceDid = this.config.deviceDid || device?.did;

        const payload = {
            "user": {
                "uid": this.config.userUid,
                "username": `${username}`,
                "authModuleId": this.config.userModuleId || this.config.dbAuthModule
            },
            "community": {
                "id": this.config.communityId,
                "name": this.config.communityName,
                "publicKey": this.config.communityPublicKey || servicePublicKey
            },
            "did": deviceDid
        };

        try {
            const [encRequestId, encLicenseKey, encPayload, encJwt] = await Promise.all([
                this.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(payload, servicePublicKey, privateKey, 'encrypt'),
                this.encryptOrDecryptUsingCaas(jwtToken, servicePublicKey, privateKey, 'encrypt')
            ]);

            const client = new HttpClients(this.request, {
                'Content-Type': 'application/json',
                'requestid': encRequestId,
                'publickey': this.config.publicKey,
                'licensekey': encLicenseKey,
                'Authorization': `Bearer ${encJwt}`
            });

            const response = await client.patch<any>(endpoint, { data: encPayload });

            if (response.status !== 200) {
                Logger.log('ERROR', 'UNLINK_FAILED', `❌ Unlink failed with status ${response.status}`);
                throw new Error(`Unlink user device pipeline thrown an exception. Status code: ${response.status}`);
            }

            const responseData = response.data;
            let decryptedData = responseData;
            if (responseData && responseData.data) {
                try {
                    const decryptionResult = await this.encryptOrDecryptUsingCaas(responseData.data, servicePublicKey, privateKey, 'decrypt');
                    decryptedData = typeof decryptionResult === 'string' ? JSON.parse(decryptionResult) : decryptionResult;
                } catch (e: any) {
                    Logger.log('WARN', 'API', `Failed to decrypt unlink response data: ${e.message}`);
                }
            }

            Logger.log('SUCCESS', 'UNLINK_COMPLETE', `Server response verified: ${JSON.stringify(decryptedData)}`);
            response.data = decryptedData;

            return response;

        } catch (error: any) {
            Logger.log('ERROR', 'API', `❌ Unlink login option workflow failed for user ${username}: ${error.message}`);
            throw error;
        }
    }

    async interceptAndGetUiSessionId(page: any): Promise<string> {
        let interceptedResponse: any = null;
        const maxAttempts = 4;
        const sendPushLocator = page.locator(`//*[text()='Send push']`);
        const cdpSession = await page.context().newCDPSession(page);

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (attempt > 1) {
                    await cdpSession.send('Network.clearBrowserCache').catch(() => { });
                    await cdpSession.send('Network.disable').catch(() => { });
                    await cdpSession.send('Network.enable').catch(() => { });

                    const [, response] = await Promise.all([
                        sendPushLocator.click(),
                        page.waitForResponse((res: any) =>
                            res.url().includes('/adminapi/sessions/session/new') &&
                            res.request().method() === 'PUT' &&
                            (res.status() === 200 || res.status() === 201),
                            { timeout: 15000 })
                    ]);
                    interceptedResponse = response;
                } else {
                    interceptedResponse = await page.waitForResponse((res: any) =>
                        res.url().includes('/adminapi/sessions/session/new') &&
                        res.request().method() === 'PUT' &&
                        (res.status() === 200 || res.status() === 201),
                        { timeout: 15000 });
                }

                if (interceptedResponse) break;
            } catch (err) {
                if (attempt === maxAttempts) {
                    await cdpSession.detach().catch(() => { });
                    throw new Error(`FAILED: Network listener timed out after ${maxAttempts} retry click cycles.`);
                }
            }
        }
        await cdpSession.detach().catch(() => { });

        const responseData = await interceptedResponse.json();
        const sessionPublicKey = responseData?.publicKey || '';
        if (!sessionPublicKey)
            throw new Error("FAILED: sessionPublicKey missing from intercepted envelope.");

        this.config.sessionPublicKey = sessionPublicKey;

        let sessionId = '';
        try {
            sessionId = await page.evaluate(() => {
                const rootEl = document.getElementById('root') || document.querySelector('body > div');
                if (!rootEl) return '';
                const reactKey = Object.keys(rootEl).find(k => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
                if (!reactKey) return '';

                const seen = new Set();
                function searchFiber(node: any): any {
                    if (!node || seen.has(node)) return null;
                    seen.add(node);

                    if (node.memoizedState) {
                        let state = node.memoizedState;
                        while (state) {
                            if (state.memoizedState && typeof state.memoizedState === 'object') {
                                const result = searchObj(state.memoizedState);
                                if (result) return result;
                            }
                            state = state.next;
                        }
                    }

                    if (node.stateNode) {
                        const result = searchObj(node.stateNode);
                        if (result) return result;
                    }

                    if (node.child) {
                        const result = searchFiber(node.child);
                        if (result) return result;
                    }
                    if (node.sibling) {
                        const result = searchFiber(node.sibling);
                        if (result) return result;
                    }
                    return null;
                }

                function searchObj(obj: any): any {
                    if (!obj || typeof obj !== 'object') return null;
                    if (obj instanceof Element || obj === window) return null;

                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

                    for (const key in obj) {
                        try {
                            const val = obj[key];
                            if (typeof val === 'string' && uuidRegex.test(val)) {
                                if (key.toLowerCase().includes('session')) {
                                    return val;
                                }
                            }
                            if (val && typeof val === 'object' && !seen.has(val)) {
                                seen.add(val);
                                const res = searchObj(val);
                                if (res) return res;
                            }
                        } catch (e) { }
                    }
                    return null;
                }

                return searchFiber((rootEl as any)[reactKey]) || '';
            });
        } catch (e: any) {
            console.log(`[DEBUG] Failed to evaluate React tree: ${e.message}`);
        }

        if (!sessionId) {
            throw new Error("FAILED: Session Tracking Identifiers missing from transaction parameters.");
        }
        this.config.sessionId = sessionId;
        return sessionId;
    }
}