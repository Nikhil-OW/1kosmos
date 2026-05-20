import { APIRequestContext } from '@playwright/test';
import { AdminApis } from './adminApis';
import { HttpClients, ApiResponse } from './httpClients';
import { RuntimeConfig } from '@config/runtimeConfig';
import { Logger } from '@utils/logger';

export type CreateUserResponse = {
    code?: number;
    status?: number;
    message?: string;
    data?: unknown;
    [key: string]: unknown;
};

export interface UserInfoResponse {
    tenantId: string;
    communityId: string;
    [key: string]: unknown;
}

export class UserMgmtApi {
    private readonly adminApis: AdminApis;

    constructor(private readonly request: APIRequestContext, private readonly config: RuntimeConfig) {
        this.adminApis = new AdminApis(this.request, this.config);
    }

    async createAutomationUser(username: string, password: string, firstName: string, lastName: string): Promise<ApiResponse<CreateUserResponse>> {
        const endPoint = `${this.config.userMgmtUrl}/tenant/${this.config.tenantId}/community/${this.config.communityId}/users/create`.replace(/([^:]\/)\/+/g, "$1");
        const servicePublicKey = await this.fetchServicePublicKeyUsingUserMgmt();
        const rawRequestId = await this.adminApis.generateRequestId();

        if (!servicePublicKey) {
            throw new Error("FAILED: Could not retrieve service public key. Encryption will fail.");
        }

        const payload = {
            "authModule": this.config.dbAuthModule,
            "users": [
                {
                    "username": username,
                    "password": password,
                    "status": "active",
                    "firstname": firstName,
                    "lastname": lastName,
                    "email1": `${username}@yopmail.com`,
                    "email1_verified": true,
                    "disabled": false
                }
            ]
        };

        const [encryptedReqId, encryptedLicenseKey] = await Promise.all([
            this.adminApis.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, this.config.privateKey),
            this.adminApis.encryptOrDecryptUsingCaas(this.config.licenseKey, servicePublicKey, this.config.privateKey)
        ]);

        const client = new HttpClients(this.request, {
            publickey: this.config.publicKey,
            requestid: encryptedReqId,
            licensekey: encryptedLicenseKey,
            'content-type': 'application/json'
        });

        return await client.put<CreateUserResponse>(endPoint, payload, {
            requestid: encryptedReqId
        });
    }

    async fetchServicePublicKeyUsingUserMgmt(tag?: string): Promise<string | undefined> {
        const baseEndpoint = this.config.userMgmtUrl;
        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };

            if (tag) {
                headers["X-TenantTag"] = tag;
            }

            // Verify health check route dynamically
            const healthzRes = await this.request.get(`${baseEndpoint}/healthz`.replace(/([^:]\/)\/+/g, "$1"), { headers });
            if (healthzRes.ok()) {
                const healthData = await healthzRes.json();
                Logger.log('INFO', 'SERVICE', `Service Version: ${healthData.version || 'unknown'}`);
            }

            // FIX: Resolved duplicate path nesting segment sequence
            const keyUrl = `${baseEndpoint}/publickeys`.replace(/([^:]\/)\/+/g, "$1");
            const response = await this.request.get(keyUrl, { headers });

            if (response.status() !== 200) {
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

    async fetchUserInfo(username: string): Promise<UserInfoResponse> {
        const endpoint = `${this.config.userMgmtUrl}/tenant/${this.config.tenantId}/community/${this.config.communityId}/user/fetch_single_user_by_username`;

        Logger.log('API', 'STEP', `Retrieving profile information context for user: ${username}`);

        const servicePublicKey = await this.fetchServicePublicKeyUsingUserMgmt();
        if (!servicePublicKey) {
            throw new Error("FAILED: Service public key missing for fetchUserInfo setup.");
        }

        const rawRequestId = await this.adminApis.generateRequestId();
        const clientLicense = this.config.licenseKey;
        const privateKey = this.config.privateKey;
        const userPayload = {
            'username': `${username}`
        };

        try {
            const [encRequestId, encLicenseKey, encPayload] = await Promise.all([
                this.adminApis.encryptOrDecryptUsingCaas(rawRequestId, servicePublicKey, privateKey, 'encrypt'),
                this.adminApis.encryptOrDecryptUsingCaas(clientLicense, servicePublicKey, privateKey, 'encrypt'),
                this.adminApis.encryptOrDecryptUsingCaas(userPayload, servicePublicKey, privateKey, 'encrypt')
            ]);

            const client = new HttpClients(this.request, {
                'Content-Type': 'application/json',
                'publickey': this.config.publicKey,
                'requestid': encRequestId,
                'licensekey': encLicenseKey
            });

            const response = await client.post<any>(endpoint, userPayload);
            if (response.status !== 200) {
                throw new Error(`fetchUserInfo endpoint returned an invalid status [${response.status}]: ${JSON.stringify(response.data)}`);
            }

            const lResp = response.data;
            if (lResp && lResp.data) {
                const u = lResp.data;

                this.config.userUid = u.uid;
                this.config.userModuleId = u.moduleId;
                this.config.userDguid = u.dguid || '';
                this.config.userUrn = u.urn || '';
                this.config.userUsername = u.username;
                this.config.userFirstname = u.firstname || '';
                this.config.userLastname = u.lastname || '';
                this.config.userEmail = u.email || '';

                Logger.log('SUCCESS', `User fetched and stored in context: ${u.username}`);
                return u as UserInfoResponse;
            }

            throw new Error("User mapping block context returned empty from target server application payload structure.");

        } catch (err: any) {
            Logger.log('ERROR', 'API', `fetchUserInfo execution cycle failed: ${err.message}`);
            throw err;
        }
    }


}