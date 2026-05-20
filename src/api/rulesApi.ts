import type { APIRequestContext } from '@playwright/test';
import type { RuntimeConfig } from '@config/runtimeConfig';
import { HttpClients, ApiResponse } from './httpClients';
import { Logger } from '@utils/logger';
import { AdminApis } from './adminApis';

export interface RuleCondition {
    factName: string;
    valueType: string;
    value: any[];
    operator: string;
}

export interface RuleCreateOptions {
    name?: string;
    category?: string;
    tags: string[];
    enabled?: boolean;
    createdBy?: string;
    criteria?: string;
    conditions: RuleCondition[];
    onMatch: { decision: string; params?: Record<string, unknown> };
}

export type RuleOptions = {
    username: string;
    conditions?: {
        fact: "username" | "authenticationMethods";
        value: string[];
        operator: "in" | "overlap" | "nooverlap"
    }[];
    decision?: "grant_access" | "deny_access" | "mfa_needed";
    mfaFactors?: string[];
    tags?: string[];
};

export type CreateRuleResponse = {
    _id?: string;
    code?: number;
    status?: number;
    message?: string;
    [key: string]: unknown
};

export class RulesApi {
    private createdRuleIds: string[] = [];

    constructor(private readonly request: APIRequestContext, private readonly config: RuntimeConfig) { }

    async initConfig(): Promise<void> {
        const adminApi = new AdminApis(this.request, this.config);
        Logger.log('INFO', 'Initializing Dynamic Configuration...');
        const { tenantId, communityId, publicKey } = await adminApi.communityAuthInfo(
            this.config.dns,
            this.config.communityName
        );

        Logger.log('SUCCESS', `Config Updated: Tenant=${tenantId}, Community=${communityId}`);
    }

    createDynamicBodyRule(options: RuleOptions): RuleCreateOptions {
        const { username, conditions = [], decision = "grant_access", mfaFactors, tags = [] } = options;

        Logger.log('INFO', `Generating "${decision}" body for ${username}`);

        const finalConditions: RuleCondition[] = conditions.length > 0
            ? conditions.map(c => ({ factName: c.fact, valueType: "ARRAY", value: c.value, operator: c.operator }))
            : [{ factName: "username", valueType: "ARRAY", value: [username], operator: "in" }];

        const onMatch: RuleCreateOptions['onMatch'] = { decision };
        if (decision === "mfa_needed" && mfaFactors)
            onMatch.params = { allowed_factors: mfaFactors };

        return {
            name: "-",
            category: "adaptive_auth_policy",
            tags: [`rule_${username}`, ...tags],
            enabled: true,
            createdBy: "automation",
            criteria: "all",
            conditions: finalConditions,
            onMatch
        };
    }

    async createRule(body: RuleCreateOptions): Promise<ApiResponse<CreateRuleResponse>> {
        const tId = this.config.tenantId;
        const cId = this.config.communityId;
        const endpoint = `${this.config.rulesEngineUrl}/tenant/${tId}/community/${cId}/rule`;

        Logger.log('API', `PUT -> Rules Engine (Tenant: ${tId})`);

        const client = new HttpClients(this.request, {
            'licensekey': this.config.licenseKey,
            'publickey': this.config.publicKey,
            'content-type': 'application/json'
        });

        try {
            const start = Date.now();
            const res = await client.put<CreateRuleResponse>(endpoint, body);
            const ruleId = res.data?._id;
            Logger.log('SUCCESS', `Rule Created in ${Date.now() - start}ms | ID: ${ruleId}`);

            if (ruleId) this.createdRuleIds.push(ruleId);
            return res;
        } catch (err: any) {
            Logger.log('ERROR', `Creation Failed: ${err.message}`);
            throw err;
        }
    }

    async deleteRule(ruleIds: string | string[]): Promise<any> {
        const idsToDelete = Array.isArray(ruleIds) ? ruleIds : [ruleIds];
        const tId = this.config.tenantId;
        const cId = this.config.communityId;
        const results: any[] = [];

        const client = new HttpClients(this.request, {
            'licensekey': this.config.licenseKey,
            'publickey': this.config.publicKey
        });

        for (const ruleId of idsToDelete) {
            const endpoint = `${this.config.rulesEngineUrl}/tenant/${tId}/community/${cId}/rule/${ruleId}`;
            Logger.log('API', `DELETE -> Rule: ${ruleId}`);

            try {
                const start = Date.now();
                const res = await client.delete<any>(endpoint);

                Logger.log('SUCCESS', `Rule ${ruleId} Deleted in ${Date.now() - start}ms`);

                this.createdRuleIds = this.createdRuleIds.filter(id => id !== ruleId);
                results.push(res);
            } catch (err: any) {
                Logger.log('ERROR', `Delete Failed [${ruleId}]: ${err.message}`);
                results.push({ ruleId, error: err.message });
            }
        }
        return results;
    }
}